package com.mariusschober.goalflow.nativeapp.data

import androidx.room.withTransaction
import com.mariusschober.goalflow.nativeapp.domain.DailyPlan
import com.mariusschober.goalflow.nativeapp.domain.BreakdownChild
import com.mariusschober.goalflow.nativeapp.domain.GoalflowHabit
import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.HabitFrequency
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import com.mariusschober.goalflow.nativeapp.domain.SchedulingException
import com.mariusschober.goalflow.nativeapp.domain.TaskSource
import com.mariusschober.goalflow.nativeapp.domain.TaskStatus
import com.mariusschober.goalflow.nativeapp.domain.assertSchedule
import com.mariusschober.goalflow.nativeapp.domain.buildTodayQueue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.time.LocalDate
import java.util.UUID

class GoalflowRepository(
    private val database: GoalflowDatabase,
    private val deviceId: String = UUID.randomUUID().toString(),
    private val onMutation: () -> Unit = {}
) {
    private val tasks = database.taskDao()
    private val goals = database.goalDao()
    private val plans = database.dailyPlanDao()
    private val habits = database.habitDao()
    private val outbox = database.syncOutboxDao()
    private val syncMeta = database.syncMetaDao()
    private val conflicts = database.syncConflictDao()

    val taskStream: Flow<List<GoalflowTask>> = tasks.observeAll().map { rows -> rows.map(::toDomain) }
    val goalStream: Flow<List<GoalflowGoal>> = goals.observeAll().map { rows -> rows.map(::toDomain) }
    val habitStream: Flow<List<GoalflowHabit>> = habits.observeAll().map { rows -> rows.map(::toDomain) }
    val conflictStream: Flow<List<SyncConflictEntity>> = conflicts.observeAll()

    fun planStream(localDate: String): Flow<DailyPlan?> = plans.observe(localDate).map { row -> row?.let(::toDomain) }

    suspend fun createTask(
        title: String,
        notes: String,
        schedulePrecision: SchedulePrecision,
        scheduledFor: String,
        scheduledTime: String?,
        isFrog: Boolean,
        goalId: String? = null
    ): GoalflowTask {
        val cleanTitle = title.trim()
        if (cleanTitle.isBlank()) throw SchedulingException("A task needs an actionable title.")
        val today = LocalDate.now().toString()
        assertSchedule(schedulePrecision, scheduledFor, today, scheduledTime)
        val now = System.currentTimeMillis()
        val id = UUID.randomUUID().toString()
        return database.withTransaction {
            val order = tasks.maxOrder(scheduledFor, schedulePrecision.name) + 1
            val task = GoalflowTask(
                id = id,
                title = cleanTitle,
                notes = notes.trim(),
                schedulePrecision = schedulePrecision,
                scheduledFor = scheduledFor,
                scheduledTime = scheduledTime,
                plannedOrder = order,
                status = TaskStatus.OPEN,
                isFrog = isFrog,
                source = TaskSource.MANUAL,
                goalId = goalId,
                createdAt = now,
                updatedAt = now
            )
            tasks.insert(toEntity(task))
            enqueueSnapshotInTransaction("tasks", GoalflowJson.tasksPayload(tasks.getAll().map(::toDomain)).toString())
            task
        }.also { onMutation() }
    }

    suspend fun completeTask(id: String) {
        val changed = database.withTransaction {
            val task = tasks.getAll().firstOrNull { it.id == id }
                ?: throw SchedulingException("Task not found.")
            if (task.status != TaskStatus.OPEN.name) return@withTransaction false
            val now = System.currentTimeMillis()
            tasks.update(task.copy(status = TaskStatus.COMPLETED.name, completedAt = now, updatedAt = now))
            enqueueSnapshotInTransaction("tasks", GoalflowJson.tasksPayload(tasks.getAll().map(::toDomain)).toString())
            true
        }
        if (changed) onMutation()
    }

    /** Explicitly closes an open commitment without pretending it was completed. */
    suspend fun dropTask(id: String) {
        val changed = database.withTransaction {
            val task = tasks.getAll().firstOrNull { it.id == id }
                ?: throw SchedulingException("Task not found.")
            if (task.status != TaskStatus.OPEN.name) return@withTransaction false
            tasks.update(
                task.copy(
                    status = TaskStatus.DROPPED.name,
                    updatedAt = System.currentTimeMillis()
                )
            )
            enqueueSnapshotInTransaction("tasks", GoalflowJson.tasksPayload(tasks.getAll().map(::toDomain)).toString())
            true
        }
        if (changed) onMutation()
    }

    /** Closes the parent and creates every next action atomically. */
    suspend fun breakDownTask(id: String, children: List<BreakdownChild>) {
        if (children.isEmpty()) throw SchedulingException("Add at least one scheduled next action.")
        if (children.size > 50) throw SchedulingException("A breakdown can contain at most 50 actions.")
        val today = LocalDate.now().toString()
        database.withTransaction {
            val parent = tasks.getAll().firstOrNull { it.id == id }
                ?: throw SchedulingException("Task not found.")
            if (parent.status != TaskStatus.OPEN.name) throw SchedulingException("Only an open task can be broken down.")
            val now = System.currentTimeMillis()
            val created = children.mapIndexed { index, child ->
                val title = child.title.trim()
                if (title.isBlank()) throw SchedulingException("Each next action needs a title.")
                assertSchedule(child.schedulePrecision, child.scheduledFor, today, child.scheduledTime)
                GoalflowTask(
                    id = UUID.randomUUID().toString(),
                    title = title,
                    notes = child.notes.trim(),
                    schedulePrecision = child.schedulePrecision,
                    scheduledFor = child.scheduledFor,
                    scheduledTime = child.scheduledTime,
                    plannedOrder = parent.plannedOrder + index,
                    status = TaskStatus.OPEN,
                    isFrog = false,
                    beforeFrog = false,
                    source = TaskSource.MANUAL,
                    goalId = parent.goalId,
                    parentTaskId = parent.id,
                    createdAt = now,
                    updatedAt = now
                )
            }
            tasks.update(parent.copy(status = TaskStatus.BROKEN_DOWN.name, updatedAt = now))
            tasks.insertAll(created.map(::toEntity))
            enqueueSnapshotInTransaction("tasks", GoalflowJson.tasksPayload(tasks.getAll().map(::toDomain)).toString())
        }
        onMutation()
    }

    suspend fun rescheduleTask(id: String, scheduledFor: String) {
        val today = LocalDate.now().toString()
        assertSchedule(SchedulePrecision.DAY, scheduledFor, today, null)
        database.withTransaction {
            val current = tasks.getAll().firstOrNull { it.id == id }
                ?: throw SchedulingException("Task not found.")
            if (current.status != TaskStatus.OPEN.name) throw SchedulingException("Only an open task can be changed.")
            if (current.habitId != null && tasks.getAll().any { other ->
                    other.id != current.id &&
                        other.status == TaskStatus.OPEN.name &&
                        other.deletedAt == null &&
                        other.habitId == current.habitId &&
                        other.schedulePrecision == SchedulePrecision.DAY.name &&
                        other.scheduledFor == scheduledFor
                }) {
                throw SchedulingException("A habit instance already exists on that day.")
            }
            val currentDay = if (current.schedulePrecision == SchedulePrecision.MONTH.name) {
                "${current.scheduledFor}-01"
            } else current.scheduledFor
            if (current.isFrog && scheduledFor > currentDay) throw SchedulingException("A frog cannot be moved forward.")
            val now = System.currentTimeMillis()
            val failures = current.frogFailures + if (scheduledFor > currentDay) 1 else 0
            tasks.update(
                current.copy(
                    schedulePrecision = SchedulePrecision.DAY.name,
                    scheduledFor = scheduledFor,
                    scheduledTime = null,
                    plannedOrder = 0,
                    frogFailures = failures,
                    isFrog = current.isFrog || failures >= 2,
                    updatedAt = now
                )
            )
            enqueueSnapshotInTransaction("tasks", GoalflowJson.tasksPayload(tasks.getAll().map(::toDomain)).toString())
        }
        onMutation()
    }

    suspend fun reorderToday(localDate: String, orderedIds: List<String>) {
        database.withTransaction {
            val queue = buildTodayQueue(tasks.getAll().map(::toDomain), localDate)
            val expected = queue.map { it.id }
            if (expected.toSet() != orderedIds.toSet() || expected.size != orderedIds.size) {
                throw SchedulingException("The queue changed. Review the current order again.")
            }
            val byId = tasks.getAll().associateBy { it.id }
            tasks.updateAll(orderedIds.mapIndexed { index, id -> byId.getValue(id).copy(plannedOrder = index) })
            plans.delete(localDate)
            enqueueSnapshotInTransaction("tasks", GoalflowJson.tasksPayload(tasks.getAll().map(::toDomain)).toString())
        }
        onMutation()
    }

    suspend fun confirmPlan(localDate: String, orderedIds: List<String>) {
        database.withTransaction {
            val queue = buildTodayQueue(tasks.getAll().map(::toDomain), localDate)
            if (queue.map { it.id } != orderedIds) {
                throw SchedulingException("The queue changed. Review the current order again.")
            }
            plans.insert(
                DailyPlanEntity(
                    localDate = localDate,
                    confirmedAt = System.currentTimeMillis(),
                    taskIds = orderedIds.joinToString(",")
                )
            )
        }
    }

    suspend fun createGoal(name: String, description: String): GoalflowGoal {
        val cleanName = name.trim()
        if (cleanName.isBlank()) throw SchedulingException("A goal needs a name.")
        val goal = GoalflowGoal(
            id = UUID.randomUUID().toString(),
            name = cleanName,
            description = description.trim(),
            createdAt = System.currentTimeMillis()
        )
        database.withTransaction {
            goals.insert(toEntity(goal))
            enqueueSnapshotInTransaction("goals", GoalflowJson.goalsPayload(goals.getAll().map(::toDomain)).toString())
        }
        onMutation()
        return goal
    }

    suspend fun createHabit(
        title: String,
        frequency: HabitFrequency = HabitFrequency.DAILY,
        specificDays: Set<Int> = emptySet(),
        isHighPriority: Boolean = false,
        beforeFrog: Boolean = false,
        duration: Int? = null,
        goalId: String? = null
    ): GoalflowHabit {
        val cleanTitle = title.trim()
        if (cleanTitle.isBlank()) throw SchedulingException("A habit needs an actionable title.")
        if (specificDays.any { it !in 1..7 }) throw SchedulingException("Habit days are invalid.")
        val habit = GoalflowHabit(
            id = UUID.randomUUID().toString(),
            title = cleanTitle,
            frequency = frequency,
            specificDays = specificDays,
            isHighPriority = isHighPriority,
            beforeFrog = beforeFrog,
            duration = duration?.coerceIn(1, 1_440),
            goalId = goalId,
            createdAt = System.currentTimeMillis()
        )
        habits.insert(toEntity(habit))
        onMutation()
        return habit
    }

    /** Creates at most one instance for a habit/day, including after reload. */
    suspend fun generateHabitInstance(habitId: String, localDate: String): GoalflowTask? {
        val habit = habits.getAll().firstOrNull { it.id == habitId }
            ?: throw SchedulingException("Habit not found.")
        assertSchedule(SchedulePrecision.DAY, localDate, LocalDate.now().toString(), null)
        val date = LocalDate.parse(localDate)
        val allowed = habit.frequency == HabitFrequency.DAILY.name ||
            date.dayOfWeek.value in habit.specificDays.split(",").mapNotNull(String::toIntOrNull)
        if (!allowed) return null
        val result = database.withTransaction {
            val existing = tasks.getAll().firstOrNull {
                it.habitId == habitId && it.scheduledFor == localDate && it.deletedAt == null
            }
            if (existing != null) {
                toDomain(existing) to false
            } else {
                val now = System.currentTimeMillis()
                val task = GoalflowTask(
                    id = UUID.randomUUID().toString(),
                    title = habit.title,
                    schedulePrecision = SchedulePrecision.DAY,
                    scheduledFor = localDate,
                    plannedOrder = tasks.maxOrder(localDate, SchedulePrecision.DAY.name) + 1,
                    isFrog = false,
                    beforeFrog = habit.beforeFrog,
                    source = TaskSource.HABIT,
                    goalId = habit.goalId,
                    habitId = habit.id,
                    createdAt = now,
                    updatedAt = now
                )
                tasks.insert(toEntity(task))
                enqueueSnapshotInTransaction("tasks", GoalflowJson.tasksPayload(tasks.getAll().map(::toDomain)).toString())
                task to true
            }
        }
        if (result.second) onMutation()
        return result.first
    }

    suspend fun exportBackup(password: String): String = database.withTransaction {
        GoalflowBackup.encrypt(
            GoalflowBackupPayload(
                tasks = tasks.getAll().map(::toDomain),
                goals = goals.getAll().map(::toDomain),
                plans = plans.getAll().map(::toDomain)
            ),
            password
        )
    }

    suspend fun restoreBackup(envelope: String, password: String, mode: BackupRestoreMode = BackupRestoreMode.REPLACE) {
        // Decrypt and validate completely before opening the destructive transaction.
        val payload = GoalflowBackup.decrypt(envelope, password)
        database.withTransaction {
            if (mode == BackupRestoreMode.REPLACE) {
                tasks.deleteAll()
                goals.deleteAll()
                plans.deleteAll()
            }
            val incomingTasks = payload.tasks.map(::toEntity)
            val incomingGoals = payload.goals.map(::toEntity)
            if (mode == BackupRestoreMode.MERGE) {
                val mergedTasks = (tasks.getAll().associateBy { it.id } + incomingTasks.associateBy { it.id }).values.toList()
                val mergedGoals = (goals.getAll().associateBy { it.id } + incomingGoals.associateBy { it.id }).values.toList()
                tasks.deleteAll()
                goals.deleteAll()
                tasks.insertAll(mergedTasks)
                goals.insertAll(mergedGoals)
            } else {
                tasks.insertAll(incomingTasks)
                goals.insertAll(incomingGoals)
            }
            plans.insertAll(payload.plans.map(::toEntity))
            enqueueSnapshotInTransaction("tasks", GoalflowJson.tasksPayload(tasks.getAll().map(::toDomain)).toString())
            enqueueSnapshotInTransaction("goals", GoalflowJson.goalsPayload(goals.getAll().map(::toDomain)).toString())
        }
        onMutation()
    }

    suspend fun pendingSyncMutations(): List<SyncOutboxEntity> = outbox.getAll()

    suspend fun acknowledgeSyncMutation(mutationId: String) {
        database.withTransaction { outbox.delete(mutationId) }
    }

    suspend fun syncMetadata(entityType: String): SyncMetaEntity? = syncMeta.get(entityType)

    suspend fun saveSyncMetadata(meta: SyncMetaEntity) {
        syncMeta.insert(meta)
    }

    suspend fun recordSyncConflict(conflict: SyncConflictEntity) {
        conflicts.insert(conflict)
    }

    suspend fun applyRemoteTaskSnapshot(payload: String) {
        val remoteTasks = GoalflowJson.parseTasks(payload, strict = true)
        database.withTransaction {
            tasks.deleteAll()
            tasks.insertAll(remoteTasks.map(::toEntity))
            plans.deleteAll()
        }
    }

    suspend fun applyRemoteGoalSnapshot(payload: String) {
        val remoteGoals = GoalflowJson.parseGoals(payload, strict = true)
        database.withTransaction {
            goals.deleteAll()
            goals.insertAll(remoteGoals.map(::toEntity))
        }
    }

    private suspend fun enqueueSnapshotInTransaction(entityType: String, payload: String) {
        val current = syncMeta.get(entityType)
        val nextVersion = (current?.localVersion ?: 0L) + 1L
        outbox.deleteForEntity(entityType)
        outbox.insert(
            SyncOutboxEntity(
                mutationId = UUID.randomUUID().toString(),
                deviceId = deviceId,
                entityType = entityType,
                entityId = "singleton",
                baseServerVersion = current?.serverVersion,
                version = nextVersion,
                payload = payload,
                updatedAt = java.time.Instant.now().toString(),
                deletedAt = null
            )
        )
        syncMeta.insert(
            SyncMetaEntity(
                entityType = entityType,
                cursor = current?.cursor ?: 0L,
                localVersion = nextVersion,
                serverVersion = current?.serverVersion,
                lastSuccessfulSync = current?.lastSuccessfulSync
            )
        )
    }

    private fun toEntity(task: GoalflowTask) = TaskEntity(
        id = task.id,
        title = task.title,
        notes = task.notes,
        schedulePrecision = task.schedulePrecision.name,
        scheduledFor = task.scheduledFor,
        scheduledTime = task.scheduledTime,
        plannedOrder = task.plannedOrder,
        status = task.status.name,
        isFrog = task.isFrog,
        beforeFrog = task.beforeFrog,
        frogFailures = task.frogFailures,
        source = task.source.name,
        goalId = task.goalId,
        parentTaskId = task.parentTaskId,
        habitId = task.habitId,
        createdAt = task.createdAt,
        updatedAt = task.updatedAt,
        completedAt = task.completedAt,
        deletedAt = task.deletedAt
    )

    private fun toDomain(row: TaskEntity) = GoalflowTask(
        id = row.id,
        title = row.title,
        notes = row.notes,
        schedulePrecision = SchedulePrecision.valueOf(row.schedulePrecision),
        scheduledFor = row.scheduledFor,
        scheduledTime = row.scheduledTime,
        plannedOrder = row.plannedOrder,
        status = TaskStatus.valueOf(row.status),
        isFrog = row.isFrog,
        beforeFrog = row.beforeFrog,
        frogFailures = row.frogFailures,
        source = TaskSource.valueOf(row.source),
        goalId = row.goalId,
        parentTaskId = row.parentTaskId,
        habitId = row.habitId,
        createdAt = row.createdAt,
        updatedAt = row.updatedAt,
        completedAt = row.completedAt,
        deletedAt = row.deletedAt
    )

    private fun toEntity(goal: GoalflowGoal) = GoalEntity(
        id = goal.id,
        name = goal.name,
        description = goal.description,
        deadline = goal.deadline,
        completedTasks = goal.completedTasks,
        color = goal.color,
        createdAt = goal.createdAt,
        excitement = goal.excitement,
        roi = goal.roi
    )

    private fun toDomain(row: GoalEntity) = GoalflowGoal(
        id = row.id,
        name = row.name,
        description = row.description,
        deadline = row.deadline,
        completedTasks = row.completedTasks,
        color = row.color,
        createdAt = row.createdAt,
        excitement = row.excitement,
        roi = row.roi
    )

    private fun toDomain(row: DailyPlanEntity) = DailyPlan(
        localDate = row.localDate,
        confirmedAt = row.confirmedAt,
        taskIds = row.taskIds.split(",").filter(String::isNotBlank)
    )

    private fun toEntity(habit: GoalflowHabit) = HabitEntity(
        id = habit.id,
        title = habit.title,
        frequency = habit.frequency.name,
        specificDays = habit.specificDays.sorted().joinToString(","),
        streak = habit.streak,
        bestStreak = habit.bestStreak,
        lastCompletedDate = habit.lastCompletedDate,
        isHighPriority = habit.isHighPriority,
        beforeFrog = habit.beforeFrog,
        duration = habit.duration,
        goalId = habit.goalId,
        createdAt = habit.createdAt
    )

    private fun toDomain(row: HabitEntity) = GoalflowHabit(
        id = row.id,
        title = row.title,
        frequency = runCatching { HabitFrequency.valueOf(row.frequency) }.getOrDefault(HabitFrequency.DAILY),
        specificDays = row.specificDays.split(",").mapNotNull(String::toIntOrNull).toSet(),
        streak = row.streak,
        bestStreak = row.bestStreak,
        lastCompletedDate = row.lastCompletedDate,
        isHighPriority = row.isHighPriority,
        beforeFrog = row.beforeFrog,
        duration = row.duration,
        goalId = row.goalId,
        createdAt = row.createdAt
    )

    private fun toEntity(plan: DailyPlan) = DailyPlanEntity(
        localDate = plan.localDate,
        confirmedAt = plan.confirmedAt,
        taskIds = plan.taskIds.joinToString(",")
    )
}
