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
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

data class NativePushResult(
    val mutationId: String,
    val accepted: Boolean,
    val serverVersion: Long,
    val conflictId: String? = null,
    val replayMismatch: Boolean = false,
    val serverMissing: Boolean = false,
    val serverPayload: String = "",
    val serverDeletedAt: String? = null,
    val recordEntityType: String? = null,
    val recordEntityId: String? = null,
    val recordVersion: Long? = null,
    val recordServerVersion: Long? = null,
    val recordUpdatedAt: String? = null
)

data class NativeRemoteRecord(
    val entityType: String,
    val entityId: String,
    val version: Long,
    val serverVersion: Long,
    val deviceId: String,
    val payload: String,
    val updatedAt: String,
    val deletedAt: String?
)

data class NativeServerConflict(
    val id: String,
    val entityType: String,
    val entityId: String,
    val mutationId: String,
    val localPayload: String,
    val localDeletedAt: String?,
    val localVersion: Long,
    val localUpdatedAt: String,
    val serverPayload: String,
    val serverDeletedAt: String?,
    val serverVersion: Long,
    val serverMissing: Boolean,
    val createdAt: String
)

class NativeSyncAccountMismatch : IllegalStateException(
    "This local database is bound to a different Goalflow account. Its data was not synchronized or overwritten."
)

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
    private val accounts = database.localAccountDao()

    val taskStream: Flow<List<GoalflowTask>> = tasks.observeAll().map { rows -> rows.map(::toDomain) }
    val goalStream: Flow<List<GoalflowGoal>> = goals.observeAll().map { rows -> rows.map(::toDomain) }
    val habitStream: Flow<List<GoalflowHabit>> = habits.observeAll().map { rows -> rows.map(::toDomain) }
    val conflictStream: Flow<List<SyncConflictEntity>> = conflicts.observeAll()

    fun planStream(localDate: String): Flow<DailyPlan?> = plans.observe(localDate).map { row -> row?.let(::toDomain) }

    /** Binds an existing offline database once and refuses every cross-account sync thereafter. */
    suspend fun bindSyncAccount(userId: String) {
        val normalized = runCatching { UUID.fromString(userId).toString() }
            .getOrElse { throw NativeSyncAccountMismatch() }
        database.withTransaction {
            val current = accounts.get()
            if (current == null) accounts.insert(LocalAccountEntity(userId = normalized))
            else if (current.userId != normalized) throw NativeSyncAccountMismatch()
        }
    }

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
            require(tasks.get(id) == null) { "Generated task id already exists; no task was overwritten." }
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
            enqueueRecordInTransaction("tasks", task.id, GoalflowJson.taskPayload(task).toString())
            task
        }.also { onMutation() }
    }

    suspend fun completeTask(id: String) {
        val changed = database.withTransaction {
            val task = tasks.getAll().firstOrNull { it.id == id }
                ?: throw SchedulingException("Task not found.")
            if (task.status != TaskStatus.OPEN.name) return@withTransaction false
            val now = System.currentTimeMillis()
            val updated = task.copy(status = TaskStatus.COMPLETED.name, completedAt = now, updatedAt = now)
            tasks.update(updated)
            enqueueRecordInTransaction("tasks", id, GoalflowJson.taskPayload(toDomain(updated)).toString())
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
            val updated = task.copy(status = TaskStatus.DROPPED.name, updatedAt = System.currentTimeMillis())
            tasks.update(updated)
            enqueueRecordInTransaction("tasks", id, GoalflowJson.taskPayload(toDomain(updated)).toString())
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
            val updatedParent = parent.copy(status = TaskStatus.BROKEN_DOWN.name, updatedAt = now)
            require(created.map { it.id }.toSet().size == created.size) {
                "Generated task ids collided; no task was changed."
            }
            created.forEach { child ->
                require(tasks.get(child.id) == null) { "Generated task id already exists; no task was overwritten." }
            }
            tasks.update(updatedParent)
            tasks.insertAll(created.map(::toEntity))
            enqueueRecordInTransaction("tasks", parent.id, GoalflowJson.taskPayload(toDomain(updatedParent)).toString())
            created.forEach { child ->
                enqueueRecordInTransaction("tasks", child.id, GoalflowJson.taskPayload(child).toString())
            }
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
            val updated = current.copy(
                    schedulePrecision = SchedulePrecision.DAY.name,
                    scheduledFor = scheduledFor,
                    scheduledTime = null,
                    plannedOrder = 0,
                    frogFailures = failures,
                    isFrog = current.isFrog || failures >= 2,
                    updatedAt = now
                )
            tasks.update(updated)
            enqueueRecordInTransaction("tasks", id, GoalflowJson.taskPayload(toDomain(updated)).toString())
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
            val now = System.currentTimeMillis()
            val updated = orderedIds.mapIndexed { index, id ->
                byId.getValue(id).copy(plannedOrder = index, updatedAt = now)
            }
            tasks.updateAll(updated)
            updated.forEach { task ->
                enqueueRecordInTransaction("tasks", task.id, GoalflowJson.taskPayload(toDomain(task)).toString())
            }
            val previousPlan = plans.get(localDate)
            plans.delete(localDate)
            if (previousPlan != null) {
                enqueueRecordInTransaction(
                    "daily_plans",
                    localDate,
                    GoalflowJson.planPayload(toDomain(previousPlan)).toString(),
                    Instant.now().toString()
                )
            }
        }
        onMutation()
    }

    suspend fun confirmPlan(localDate: String, orderedIds: List<String>) {
        database.withTransaction {
            val queue = buildTodayQueue(tasks.getAll().map(::toDomain), localDate)
            if (queue.map { it.id } != orderedIds) {
                throw SchedulingException("The queue changed. Review the current order again.")
            }
            val plan = DailyPlan(localDate, System.currentTimeMillis(), orderedIds)
            plans.insert(toEntity(plan))
            enqueueRecordInTransaction("daily_plans", localDate, GoalflowJson.planPayload(plan).toString())
        }
        onMutation()
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
            require(goals.get(goal.id) == null) { "Generated goal id already exists; no goal was overwritten." }
            goals.insert(toEntity(goal))
            enqueueRecordInTransaction("goals", goal.id, GoalflowJson.goalPayload(goal).toString())
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
        database.withTransaction {
            require(habits.get(habit.id) == null) { "Generated habit id already exists; no habit was overwritten." }
            habits.insert(toEntity(habit))
            enqueueRecordInTransaction("habits", habit.id, GoalflowJson.habitPayload(habit).toString())
        }
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
                require(tasks.get(task.id) == null) { "Generated task id already exists; no task was overwritten." }
                tasks.insert(toEntity(task))
                enqueueRecordInTransaction("tasks", task.id, GoalflowJson.taskPayload(task).toString())
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
                plans = plans.getAll().map(::toDomain),
                habits = habits.getAll().map(::toDomain),
                outbox = outbox.getAll(),
                syncMeta = syncMeta.getAll(),
                conflicts = conflicts.getAll(),
                ownerUserId = accounts.get()?.userId
            ),
            password
        )
    }

    suspend fun restoreBackup(envelope: String, password: String, mode: BackupRestoreMode = BackupRestoreMode.REPLACE) {
        // Decrypt and validate completely before opening the destructive transaction.
        val payload = GoalflowBackup.decrypt(envelope, password)
        database.withTransaction {
            val currentOwner = accounts.get()
            if (payload.ownerUserId != null) {
                if (currentOwner == null) accounts.insert(LocalAccountEntity(userId = payload.ownerUserId))
                else if (currentOwner.userId != payload.ownerUserId) throw NativeSyncAccountMismatch()
            }
            val originalTasks = tasks.getAll().map(::toDomain)
            val originalGoals = goals.getAll().map(::toDomain)
            val originalHabits = habits.getAll().map(::toDomain)
            val originalPlans = plans.getAll().map(::toDomain)
            val preservedOutbox = mergeExactById(
                outbox.getAll(), payload.outbox, SyncOutboxEntity::mutationId, "pending mutation"
            )
            val preservedConflicts = mergeExactById(
                conflicts.getAll(), payload.conflicts, SyncConflictEntity::id, "conflict"
            )
            val mergedMeta = (syncMeta.getAll() + payload.syncMeta).groupBy { it.entityType }.map { (key, values) ->
                SyncMetaEntity(
                    entityType = key,
                    cursor = values.maxOfOrNull { it.cursor } ?: 0L,
                    localVersion = values.maxOfOrNull { it.localVersion } ?: 0L,
                    serverVersion = values.mapNotNull { it.serverVersion }.maxOrNull(),
                    lastSuccessfulSync = values.mapNotNull { it.lastSuccessfulSync }.maxOrNull()
                )
            }
            if (mode == BackupRestoreMode.REPLACE) {
                tasks.deleteAll()
                goals.deleteAll()
                plans.deleteAll()
                habits.deleteAll()
            }
            val incomingTasks = payload.tasks.map(::toEntity)
            val incomingGoals = payload.goals.map(::toEntity)
            val incomingHabits = payload.habits.map(::toEntity)
            val incomingPlans = payload.plans.map(::toEntity)
            if (mode == BackupRestoreMode.MERGE) {
                val mergedTasks = mergeExactById(tasks.getAll(), incomingTasks, TaskEntity::id, "task")
                val mergedGoals = mergeExactById(goals.getAll(), incomingGoals, GoalEntity::id, "goal")
                val mergedHabits = mergeExactById(habits.getAll(), incomingHabits, HabitEntity::id, "habit")
                val mergedPlans = mergeExactById(plans.getAll(), incomingPlans, DailyPlanEntity::localDate, "daily plan")
                tasks.deleteAll()
                goals.deleteAll()
                habits.deleteAll()
                plans.deleteAll()
                tasks.insertAll(mergedTasks)
                goals.insertAll(mergedGoals)
                habits.insertAll(mergedHabits)
                plans.insertAll(mergedPlans)
            } else {
                tasks.insertAll(incomingTasks)
                goals.insertAll(incomingGoals)
                habits.insertAll(incomingHabits)
                plans.insertAll(incomingPlans)
            }
            outbox.deleteAll()
            outbox.insertAll(preservedOutbox)
            syncMeta.insertAll(mergedMeta)
            conflicts.deleteAll()
            conflicts.insertAll(preservedConflicts)
            if (mode == BackupRestoreMode.REPLACE) {
                val deletedAt = Instant.now().toString()
                val restoredTaskIds = payload.tasks.mapTo(hashSetOf()) { it.id }
                val restoredGoalIds = payload.goals.mapTo(hashSetOf()) { it.id }
                val restoredHabitIds = payload.habits.mapTo(hashSetOf()) { it.id }
                val restoredPlanIds = payload.plans.mapTo(hashSetOf()) { it.localDate }
                originalTasks.filterNot { it.id in restoredTaskIds }.forEach {
                    enqueueRecordInTransaction("tasks", it.id, GoalflowJson.taskPayload(it).toString(), deletedAt)
                }
                originalGoals.filterNot { it.id in restoredGoalIds }.forEach {
                    enqueueRecordInTransaction("goals", it.id, GoalflowJson.goalPayload(it).toString(), deletedAt)
                }
                originalHabits.filterNot { it.id in restoredHabitIds }.forEach {
                    enqueueRecordInTransaction("habits", it.id, GoalflowJson.habitPayload(it).toString(), deletedAt)
                }
                originalPlans.filterNot { it.localDate in restoredPlanIds }.forEach {
                    enqueueRecordInTransaction("daily_plans", it.localDate, GoalflowJson.planPayload(it).toString(), deletedAt)
                }
            }
            payload.tasks.forEach { enqueueRecordInTransaction("tasks", it.id, GoalflowJson.taskPayload(it).toString()) }
            payload.goals.forEach { enqueueRecordInTransaction("goals", it.id, GoalflowJson.goalPayload(it).toString()) }
            payload.habits.forEach { enqueueRecordInTransaction("habits", it.id, GoalflowJson.habitPayload(it).toString()) }
            payload.plans.forEach { enqueueRecordInTransaction("daily_plans", it.localDate, GoalflowJson.planPayload(it).toString()) }
        }
        onMutation()
    }

    /** Only causally-ready mutations are sent. Later edits remain durable behind their predecessor. */
    suspend fun readySyncMutations(limit: Int = 50): List<SyncOutboxEntity> = database.withTransaction {
        migrateLegacyOutboxInTransaction()
        seedUnsynchronizedLocalDataInTransaction()
        outbox.getAll()
            .asSequence()
            .filter { it.dependsOnMutationId == null }
            .distinctBy { it.entityType to it.entityId }
            .take(limit)
            .toList()
    }

    suspend fun pendingSyncMutations(): List<SyncOutboxEntity> = outbox.getAll()

    suspend fun markSyncAttempted(mutationIds: List<String>, attemptedAt: String = Instant.now().toString()) {
        if (mutationIds.isNotEmpty()) outbox.markAttempted(mutationIds, attemptedAt)
    }

    /**
     * Applies server acknowledgements in one Room transaction. A rejection first
     * materializes the complete local chain as a conflict and only then removes
     * it from the outbox, so process death cannot create an acknowledgement gap.
     */
    suspend fun commitPushResults(
        batch: List<SyncOutboxEntity>,
        results: List<NativePushResult>
    ): Int {
        val expected = batch.map { it.mutationId }
        val actual = results.map { it.mutationId }
        require(actual.size == actual.toSet().size && actual.toSet() == expected.toSet()) {
            "The sync server returned an incomplete or mismatched acknowledgement set."
        }
        val submittedById = batch.associateBy { it.mutationId }
        results.forEach { result ->
            require(result.serverVersion >= 0L && (!result.accepted || result.serverVersion > 0L)) {
                "The sync server returned an invalid acknowledgement version."
            }
            if (result.accepted) {
                val submitted = submittedById.getValue(result.mutationId)
                require(!result.replayMismatch && !result.serverMissing && result.conflictId == null
                    && result.recordEntityType == submitted.entityType
                    && result.recordEntityId == submitted.entityId
                    && result.recordVersion == submitted.version
                    && result.recordServerVersion == result.serverVersion
                    && jsonEquivalent(result.serverPayload, submitted.payload)
                    && sameInstant(result.recordUpdatedAt, submitted.updatedAt)
                    && sameInstant(result.serverDeletedAt, submitted.deletedAt)
                ) {
                    "The sync server did not prove the exact accepted record; the pending mutation remains durable."
                }
            }
            require(result.accepted || result.serverMissing || result.serverPayload.isNotBlank()) {
                "The sync server rejected a mutation without preserving the server side."
            }
            if (!result.accepted && !result.serverMissing) {
                parseJson(result.serverPayload, "The sync server returned an invalid conflict payload.")
            }
        }
        return database.withTransaction {
            var conflictCount = 0
            val resultById = results.associateBy { it.mutationId }
            batch.forEach { sent ->
                val mutation = outbox.getForEntity(sent.entityType, sent.entityId)
                    .firstOrNull { it.mutationId == sent.mutationId }
                    ?: return@forEach // A duplicate response after a committed local transition.
                val result = resultById.getValue(mutation.mutationId)
                val metaKey = syncMetaKey(mutation.entityType, mutation.entityId)
                val currentMeta = syncMeta.get(metaKey)
                if (result.accepted && !result.replayMismatch) {
                    outbox.delete(mutation.mutationId)
                    mutation.resolvesConflictId?.let { conflicts.delete(it) }
                    val remaining = outbox.getForEntity(mutation.entityType, mutation.entityId)
                    val dependent = remaining.firstOrNull { it.dependsOnMutationId == mutation.mutationId }
                    if (dependent != null) {
                        outbox.insert(
                            dependent.copy(
                                baseServerVersion = result.serverVersion,
                                dependsOnMutationId = null,
                                attemptedAt = null
                            )
                        )
                    }
                    syncMeta.insert(
                        SyncMetaEntity(
                            entityType = metaKey,
                            cursor = currentMeta?.cursor ?: 0L,
                            localVersion = maxOf(currentMeta?.localVersion ?: 0L, mutation.version),
                            serverVersion = result.serverVersion,
                            lastSuccessfulSync = currentMeta?.lastSuccessfulSync
                        )
                    )
                } else {
                    val chain = outbox.getForEntity(mutation.entityType, mutation.entityId)
                    val latest = chain.lastOrNull() ?: mutation
                    val resolving = mutation.resolvesConflictId?.let { conflicts.get(it) }
                    val nextConflict = SyncConflictEntity(
                            id = result.conflictId ?: "push:${mutation.mutationId}:${result.serverVersion}",
                            entityType = mutation.entityType,
                            entityId = mutation.entityId,
                            mutationId = mutation.mutationId,
                            localPayload = latest.payload,
                            localDeletedAt = latest.deletedAt,
                            localHistory = mergeHistoryPayloads(resolving?.localHistory, historyPayload(chain)),
                            serverPayload = result.serverPayload,
                            serverDeletedAt = result.serverDeletedAt,
                            serverVersion = result.serverVersion,
                            createdAt = Instant.now().toString(),
                            status = if (result.replayMismatch) "replay_mismatch" else "unresolved"
                        )
                    if (resolving?.id == nextConflict.id) conflicts.update(nextConflict)
                    else {
                        conflicts.insert(nextConflict)
                        resolving?.let { conflicts.delete(it.id) }
                    }
                    outbox.deleteForEntity(mutation.entityType, mutation.entityId)
                    conflictCount += 1
                }
            }
            conflictCount
        }
    }

    suspend fun syncMetadata(entityType: String): SyncMetaEntity? = syncMeta.get(entityType)

    /**
     * Applies an entire pull page and its cursor atomically. Unsupported or
     * conflicting records are preserved as conflicts before the cursor moves.
     */
    suspend fun applyRemotePage(records: List<NativeRemoteRecord>, nextCursor: Long): Int {
        require(nextCursor >= 0L) { "The sync cursor is invalid." }
        records.forEach(::validateRemoteRecord)
        return database.withTransaction {
            val cursorMeta = syncMeta.get(SYNC_CURSOR_KEY)
            val currentCursor = cursorMeta?.cursor ?: 0L
            require(nextCursor >= currentCursor) { "The sync cursor moved backwards." }
            require(records.all { it.serverVersion > currentCursor }
                && records.map { it.serverVersion }.toSet().size == records.size) {
                "The remote page contains stale or duplicate information; the sync cursor was not advanced."
            }
            require(nextCursor == (records.maxOfOrNull { it.serverVersion } ?: currentCursor)) {
                "The sync cursor would advance beyond remote information that was durably represented."
            }
            var conflictCount = 0
            records.forEach recordLoop@ { record ->
                val legacyItems = legacySnapshotItems(record)
                if (legacyItems != null) {
                    legacyItems.forEach itemLoop@ { (entityId, payload) ->
                        val recordMetaKey = syncMetaKey(record.entityType, entityId)
                        val recordMeta = syncMeta.get(recordMetaKey)
                        if (record.serverVersion <= (recordMeta?.serverVersion ?: 0L)) return@itemLoop
                        val pending = outbox.getForEntity(record.entityType, entityId)
                        if (pending.isNotEmpty()) {
                            val latest = pending.maxWithOrNull(
                                compareBy<SyncOutboxEntity> { it.version }.thenBy { it.mutationId }
                            )!!
                            conflicts.insert(
                                SyncConflictEntity(
                                    id = "pull:${record.entityType}:$entityId:${record.serverVersion}",
                                    entityType = record.entityType,
                                    entityId = entityId,
                                    mutationId = latest.mutationId,
                                    localPayload = latest.payload,
                                    localDeletedAt = latest.deletedAt,
                                    localHistory = historyPayload(pending),
                                    serverPayload = payload,
                                    serverDeletedAt = record.deletedAt,
                                    serverVersion = record.serverVersion,
                                    createdAt = Instant.now().toString()
                                )
                            )
                            outbox.deleteForEntity(record.entityType, entityId)
                            conflictCount += 1
                        } else if (retainNewestRemoteConflictInTransaction(record, entityId, payload)) {
                            // Keep the current local UI side while updating the
                            // durable conflict to the newest remote side.
                        } else if (pending.isEmpty()) {
                            if (applyRemoteRecordInTransaction(record.copy(entityId = entityId, payload = payload))) {
                                conflictCount += 1
                            }
                        }
                        syncMeta.insert(
                            SyncMetaEntity(
                                entityType = recordMetaKey,
                                cursor = recordMeta?.cursor ?: 0L,
                                localVersion = maxOf(recordMeta?.localVersion ?: 0L, record.version),
                                serverVersion = record.serverVersion,
                                lastSuccessfulSync = recordMeta?.lastSuccessfulSync
                            )
                        )
                    }
                    val singletonKey = syncMetaKey(record.entityType, record.entityId)
                    val singletonMeta = syncMeta.get(singletonKey)
                    syncMeta.insert(
                        SyncMetaEntity(
                            entityType = singletonKey,
                            cursor = singletonMeta?.cursor ?: 0L,
                            localVersion = maxOf(singletonMeta?.localVersion ?: 0L, record.version),
                            serverVersion = maxOf(singletonMeta?.serverVersion ?: 0L, record.serverVersion),
                            lastSuccessfulSync = singletonMeta?.lastSuccessfulSync
                        )
                    )
                    return@recordLoop
                }
                val recordMetaKey = syncMetaKey(record.entityType, record.entityId)
                val recordMeta = syncMeta.get(recordMetaKey)
                if (record.serverVersion <= (recordMeta?.serverVersion ?: 0L)) return@recordLoop

                val pending = outbox.getForEntity(record.entityType, record.entityId)
                if (pending.isNotEmpty()) {
                    val latest = pending.maxWithOrNull(compareBy<SyncOutboxEntity> { it.version }.thenBy { it.mutationId })!!
                    val conflictId = "pull:${record.entityType}:${record.entityId}:${record.serverVersion}"
                    conflicts.insert(
                        SyncConflictEntity(
                            id = conflictId,
                            entityType = record.entityType,
                            entityId = record.entityId,
                            mutationId = latest.mutationId,
                            localPayload = latest.payload,
                            localDeletedAt = latest.deletedAt,
                            localHistory = historyPayload(pending),
                            serverPayload = record.payload,
                            serverDeletedAt = record.deletedAt,
                            serverVersion = record.serverVersion,
                            createdAt = Instant.now().toString()
                        )
                    )
                    outbox.deleteForEntity(record.entityType, record.entityId)
                    conflictCount += 1
                } else if (retainNewestRemoteConflictInTransaction(record, record.entityId, record.payload)) {
                    // Remote information is represented in the open conflict
                    // before the page cursor advances.
                } else if (pending.isEmpty()) {
                    if (applyRemoteRecordInTransaction(record)) conflictCount += 1
                }

                syncMeta.insert(
                    SyncMetaEntity(
                        entityType = recordMetaKey,
                        cursor = recordMeta?.cursor ?: 0L,
                        localVersion = maxOf(recordMeta?.localVersion ?: 0L, record.version),
                        serverVersion = record.serverVersion,
                        lastSuccessfulSync = recordMeta?.lastSuccessfulSync
                    )
                )
            }
            syncMeta.insert(
                SyncMetaEntity(
                    entityType = SYNC_CURSOR_KEY,
                    cursor = nextCursor,
                    localVersion = cursorMeta?.localVersion ?: 0L,
                    serverVersion = cursorMeta?.serverVersion,
                    lastSuccessfulSync = cursorMeta?.lastSuccessfulSync
                )
            )
            conflictCount
        }
    }

    suspend fun markSyncSuccessful(at: String = Instant.now().toString()) {
        database.withTransaction {
            syncMeta.getAll().forEach { syncMeta.insert(it.copy(lastSuccessfulSync = at)) }
        }
    }

    /** Makes PostgreSQL-only conflicts visible after a reinstall or restore. */
    suspend fun mergeServerConflicts(remote: List<NativeServerConflict>): Int {
        require(remote.map { it.id }.toSet().size == remote.size) {
            "The server returned duplicate conflict identities; existing conflicts were not changed."
        }
        remote.forEach { conflict ->
            require(runCatching { UUID.fromString(conflict.id) }.isSuccess
                && conflict.entityType.isNotBlank() && conflict.entityId.isNotBlank())
            require(runCatching { UUID.fromString(conflict.mutationId) }.isSuccess)
            require(conflict.localVersion > 0L && conflict.serverVersion >= 0L)
            Instant.parse(conflict.localUpdatedAt)
            Instant.parse(conflict.createdAt)
            conflict.localDeletedAt?.let(Instant::parse)
            conflict.serverDeletedAt?.let(Instant::parse)
            parseJson(conflict.localPayload, "A server conflict has an invalid local payload.")
            if (!conflict.serverMissing) {
                parseJson(conflict.serverPayload, "A server conflict has an invalid cloud payload.")
            }
        }
        return database.withTransaction {
            var inserted = 0
            remote.forEach { remoteConflict ->
                val existing = conflicts.get(remoteConflict.id)
                val serverPayload = if (remoteConflict.serverMissing) "" else remoteConflict.serverPayload
                if (existing != null) {
                    require(existing.entityType == remoteConflict.entityType
                        && existing.entityId == remoteConflict.entityId
                        && existing.mutationId == remoteConflict.mutationId) {
                        "A server conflict id refers to different records; existing conflicts were not changed."
                    }
                    require(remoteConflict.serverVersion != existing.serverVersion
                        || ((existing.serverPayload.isBlank() == remoteConflict.serverMissing)
                            && jsonEquivalent(existing.serverPayload.ifBlank { "null" }, serverPayload.ifBlank { "null" })
                            && sameInstant(existing.serverDeletedAt, remoteConflict.serverDeletedAt))) {
                        "A server conflict version refers to different cloud data; existing conflicts were not changed."
                    }
                    if (remoteConflict.serverVersion > existing.serverVersion) {
                        conflicts.update(existing.copy(
                            serverPayload = serverPayload,
                            serverDeletedAt = remoteConflict.serverDeletedAt,
                            serverVersion = remoteConflict.serverVersion
                        ))
                    }
                    val key = syncMetaKey(remoteConflict.entityType, remoteConflict.entityId)
                    val current = syncMeta.get(key)
                    syncMeta.insert(SyncMetaEntity(
                        entityType = key,
                        cursor = current?.cursor ?: 0L,
                        localVersion = maxOf(current?.localVersion ?: 0L, remoteConflict.localVersion),
                        serverVersion = maxOf(current?.serverVersion ?: 0L, remoteConflict.serverVersion),
                        lastSuccessfulSync = current?.lastSuccessfulSync
                    ))
                    return@forEach
                }
                requireMutationIdAvailableInTransaction(remoteConflict.mutationId)
                conflicts.insert(SyncConflictEntity(
                    id = remoteConflict.id,
                    entityType = remoteConflict.entityType,
                    entityId = remoteConflict.entityId,
                    mutationId = remoteConflict.mutationId,
                    localPayload = remoteConflict.localPayload,
                    localDeletedAt = remoteConflict.localDeletedAt,
                    localHistory = JSONArray().put(historyEntry(
                        remoteConflict.mutationId,
                        remoteConflict.localPayload,
                        remoteConflict.localDeletedAt,
                        remoteConflict.localUpdatedAt,
                        remoteConflict.localVersion
                    )).toString(),
                    serverPayload = serverPayload,
                    serverDeletedAt = remoteConflict.serverDeletedAt,
                    serverVersion = remoteConflict.serverVersion,
                    createdAt = remoteConflict.createdAt
                ))
                val key = syncMetaKey(remoteConflict.entityType, remoteConflict.entityId)
                val current = syncMeta.get(key)
                syncMeta.insert(SyncMetaEntity(
                    entityType = key,
                    cursor = current?.cursor ?: 0L,
                    localVersion = maxOf(current?.localVersion ?: 0L, remoteConflict.localVersion),
                    serverVersion = maxOf(current?.serverVersion ?: 0L, remoteConflict.serverVersion),
                    lastSuccessfulSync = current?.lastSuccessfulSync
                ))
                inserted += 1
            }
            inserted
        }
    }

    suspend fun resolveConflictLocally(conflictId: String) {
        database.withTransaction {
            val conflict = conflicts.get(conflictId) ?: return@withTransaction
            if (conflict.status == "resolving_local") return@withTransaction
            require(conflict.entityType in setOf("tasks", "goals", "habits", "daily_plans")
                && conflict.localPayload.isNotBlank()) {
                "This remote data type cannot be resolved locally by this app version. Both versions remain preserved."
            }
            val key = syncMetaKey(conflict.entityType, conflict.entityId)
            val current = syncMeta.get(key)
            val history = JSONArray(conflict.localHistory)
            val historyVersion = (0 until history.length()).maxOfOrNull { index ->
                val entry = history.optJSONObject(index)
                    ?: throw IllegalArgumentException("Conflict history is damaged; both versions remain preserved.")
                val mutationId = entry.optString("mutationId").trim()
                require(mutationId.isNotBlank() && entry.has("version")) {
                    "Conflict history is damaged; both versions remain preserved."
                }
                entry.getLong("version").also { require(it > 0L) }
            } ?: 0L
            val version = maxOf(current?.localVersion ?: 0L, historyVersion) + 1L
            val mutationId = UUID.randomUUID().toString()
            requireMutationIdAvailableInTransaction(mutationId)
            outbox.insert(
                SyncOutboxEntity(
                    mutationId = mutationId,
                    deviceId = deviceId,
                    entityType = conflict.entityType,
                    entityId = conflict.entityId,
                    baseServerVersion = conflict.serverVersion,
                    version = version,
                    payload = conflict.localPayload,
                    updatedAt = Instant.now().toString(),
                    deletedAt = conflict.localDeletedAt,
                    resolvesConflictId = conflict.id
                )
            )
            conflicts.update(conflict.copy(mutationId = mutationId, status = "resolving_local"))
            syncMeta.insert(
                SyncMetaEntity(
                    entityType = key,
                    cursor = current?.cursor ?: 0L,
                    localVersion = version,
                    serverVersion = conflict.serverVersion,
                    lastSuccessfulSync = current?.lastSuccessfulSync
                )
            )
        }
        onMutation()
    }

    suspend fun resolveConflictWithCloud(conflictId: String) {
        database.withTransaction {
            val conflict = conflicts.get(conflictId) ?: return@withTransaction
            if (conflict.status == "unsupported_remote") {
                // The user explicitly chose the canonical cloud copy. This app
                // version cannot materialize the entity locally, but the server
                // remains its durable owner, so only the local warning is removed.
            } else if (conflict.serverPayload.isBlank()) {
                deleteEntityInTransaction(conflict.entityType, conflict.entityId)
            } else {
                applyRemoteRecordInTransaction(
                    NativeRemoteRecord(
                        entityType = conflict.entityType,
                        entityId = conflict.entityId,
                        version = 0L,
                        serverVersion = conflict.serverVersion,
                        deviceId = "server-conflict-resolution",
                        payload = conflict.serverPayload,
                        updatedAt = conflict.createdAt,
                        deletedAt = conflict.serverDeletedAt
                    )
                )
            }
            outbox.deleteForEntity(conflict.entityType, conflict.entityId)
            conflicts.delete(conflict.id)
            val key = syncMetaKey(conflict.entityType, conflict.entityId)
            val current = syncMeta.get(key)
            syncMeta.insert(
                SyncMetaEntity(
                    entityType = key,
                    cursor = current?.cursor ?: 0L,
                    localVersion = current?.localVersion ?: 0L,
                    serverVersion = conflict.serverVersion,
                    lastSuccessfulSync = current?.lastSuccessfulSync
                )
            )
        }
    }

    private suspend fun deleteEntityInTransaction(entityType: String, entityId: String) {
        when (entityType) {
            "tasks" -> tasks.delete(entityId)
            "goals" -> goals.delete(entityId)
            "habits" -> habits.delete(entityId)
            "daily_plans" -> plans.delete(entityId)
            else -> throw IllegalArgumentException("This conflict type cannot be applied by the native client.")
        }
    }

    /**
     * Version-two clients queued whole-store snapshots. Expand non-empty legacy
     * snapshots transactionally into deterministic record mutations. Unknown
     * removals are deliberately not inferred; existing server records will be
     * pulled back or become explicit per-record conflicts.
     */
    private suspend fun migrateLegacyOutboxInTransaction() {
        outbox.getAll().forEach { mutation ->
            if (mutation.entityType !in setOf("tasks", "goals", "habits")
                || mutation.entityId != "singleton"
                || mutation.dependsOnMutationId != null
                || !mutation.payload.trimStart().startsWith("[")
            ) return@forEach
            val items = legacySnapshotItems(
                NativeRemoteRecord(
                    mutation.entityType,
                    mutation.entityId,
                    mutation.version,
                    mutation.baseServerVersion ?: 1L,
                    mutation.deviceId,
                    mutation.payload,
                    mutation.updatedAt,
                    mutation.deletedAt
                )
            ) ?: return@forEach
            if (items.isEmpty()) return@forEach
            val replacements = items.map { (entityId, payload) ->
                val derivedId = UUID.nameUUIDFromBytes(
                    "${mutation.mutationId}:$entityId".toByteArray(StandardCharsets.UTF_8)
                ).toString()
                requireMutationIdAvailableInTransaction(derivedId)
                val embeddedDeletedAt = runCatching {
                    JSONObject(payload).takeIf { it.has("deletedAt") && !it.isNull("deletedAt") }
                        ?.optString("deletedAt")?.takeIf(String::isNotBlank)
                }.getOrNull()
                mutation.copy(
                    mutationId = derivedId,
                    entityId = entityId,
                    baseServerVersion = syncMeta.get(syncMetaKey(mutation.entityType, entityId))?.serverVersion,
                    payload = payload,
                    deletedAt = embeddedDeletedAt ?: mutation.deletedAt,
                    dependsOnMutationId = null,
                    attemptedAt = null
                )
            }
            require(replacements.map { it.mutationId }.toSet().size == replacements.size) {
                "Legacy pending mutations could not be assigned unique identities."
            }
            outbox.delete(mutation.mutationId)
            outbox.insertAll(replacements)
        }
    }

    /**
     * Native v1 databases predate the Room outbox. Give every existing record a
     * first at-least-once mutation before pull is allowed to replace anything.
     */
    private suspend fun seedUnsynchronizedLocalDataInTransaction() {
        suspend fun missing(entityType: String, entityId: String): Boolean =
            syncMeta.get(syncMetaKey(entityType, entityId)) == null
                && outbox.getForEntity(entityType, entityId).isEmpty()
                && conflicts.getAll().none { it.entityType == entityType && it.entityId == entityId }

        tasks.getAll().forEach { task ->
            if (missing("tasks", task.id)) {
                enqueueRecordInTransaction(
                    "tasks",
                    task.id,
                    GoalflowJson.taskPayload(toDomain(task)).toString(),
                    task.deletedAt?.let { Instant.ofEpochMilli(it).toString() }
                )
            }
        }
        goals.getAll().forEach { goal ->
            if (missing("goals", goal.id)) {
                enqueueRecordInTransaction("goals", goal.id, GoalflowJson.goalPayload(toDomain(goal)).toString())
            }
        }
        habits.getAll().forEach { habit ->
            if (missing("habits", habit.id)) {
                enqueueRecordInTransaction("habits", habit.id, GoalflowJson.habitPayload(toDomain(habit)).toString())
            }
        }
        plans.getAll().forEach { plan ->
            if (missing("daily_plans", plan.localDate)) {
                enqueueRecordInTransaction("daily_plans", plan.localDate, GoalflowJson.planPayload(toDomain(plan)).toString())
            }
        }
    }

    private fun legacySnapshotItems(record: NativeRemoteRecord): List<Pair<String, String>>? {
        if (record.entityType !in setOf("tasks", "goals", "habits") || !record.payload.trimStart().startsWith("[")) {
            return null
        }
        val array = JSONArray(record.payload)
        return buildList(array.length()) {
            val ids = hashSetOf<String>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index)
                    ?: throw IllegalArgumentException("Legacy sync snapshot contains an invalid record.")
                val id = item.optString("id").trim()
                require(id.isNotBlank() && ids.add(id)) { "Legacy sync snapshot contains an invalid or duplicate identity." }
                add(id to item.toString())
            }
        }
    }

    private suspend fun enqueueRecordInTransaction(
        entityType: String,
        entityId: String,
        payload: String,
        deletedAt: String? = null
    ) {
        val metaKey = syncMetaKey(entityType, entityId)
        val current = syncMeta.get(metaKey)
        val existing = outbox.getForEntity(entityType, entityId)
        val nextVersion = maxOf(current?.localVersion ?: 0L, existing.maxOfOrNull { it.version } ?: 0L) + 1L
        val mutationId = UUID.randomUUID().toString()
        requireMutationIdAvailableInTransaction(mutationId)
        val updatedAt = Instant.now().toString()
        val unresolved = conflicts.getUnresolved(entityType, entityId)
        if (unresolved != null) {
            val history = JSONArray(unresolved.localHistory)
            for (index in 0 until history.length()) {
                require(history.optJSONObject(index)?.optString("mutationId")?.isNotBlank() == true) {
                    "Conflict history is damaged; the new local change was not applied."
                }
            }
            history.put(historyEntry(mutationId, payload, deletedAt, updatedAt, nextVersion))
            conflicts.update(
                unresolved.copy(
                    mutationId = mutationId,
                    localPayload = payload,
                    localDeletedAt = deletedAt,
                    localHistory = history.toString()
                )
            )
        } else {
            val predecessor = existing.lastOrNull()
            outbox.insert(
                SyncOutboxEntity(
                    mutationId = mutationId,
                    deviceId = deviceId,
                    entityType = entityType,
                    entityId = entityId,
                    baseServerVersion = current?.serverVersion,
                    version = nextVersion,
                    payload = payload,
                    updatedAt = updatedAt,
                    deletedAt = deletedAt,
                    dependsOnMutationId = predecessor?.mutationId
                )
            )
        }
        syncMeta.insert(
            SyncMetaEntity(
                entityType = metaKey,
                cursor = current?.cursor ?: 0L,
                localVersion = nextVersion,
                serverVersion = current?.serverVersion,
                lastSuccessfulSync = current?.lastSuccessfulSync
            )
        )
    }

    /** Returns true when a remote record was represented as a durable conflict. */
    private suspend fun retainNewestRemoteConflictInTransaction(
        record: NativeRemoteRecord,
        entityId: String,
        payload: String
    ): Boolean {
        val matching = conflicts.getAll().filter {
            it.entityType == record.entityType && it.entityId == entityId
        }
        if (matching.isEmpty()) return false
        matching.forEach { conflict ->
            if (record.serverVersion > conflict.serverVersion) {
                conflicts.update(
                    conflict.copy(
                        serverPayload = payload,
                        serverDeletedAt = record.deletedAt,
                        serverVersion = record.serverVersion
                    )
                )
            }
        }
        return true
    }

    /** Returns true when a remote record was represented as a durable conflict. */
    private suspend fun applyRemoteRecordInTransaction(record: NativeRemoteRecord): Boolean {
        val trimmed = record.payload.trimStart()
        when (record.entityType) {
            "tasks" -> {
                if (trimmed.startsWith("[")) {
                    tasks.insertAll(GoalflowJson.parseTasks(record.payload, strict = true).map(::toEntity))
                } else {
                    val remote = GoalflowJson.parseTask(record.payload, strict = true)
                    require(remote.id == record.entityId) { "Task sync identifier does not match its payload." }
                    val deletedMillis = record.deletedAt?.let { Instant.parse(it).toEpochMilli() }
                    tasks.insert(toEntity(if (deletedMillis == null) remote else remote.copy(deletedAt = deletedMillis)))
                }
            }
            "goals" -> {
                if (trimmed.startsWith("[")) {
                    goals.insertAll(GoalflowJson.parseGoals(record.payload, strict = true).map(::toEntity))
                } else if (record.deletedAt != null) {
                    goals.delete(record.entityId)
                } else {
                    val remote = GoalflowJson.parseGoal(record.payload, strict = true)
                    require(remote.id == record.entityId) { "Goal sync identifier does not match its payload." }
                    goals.insert(toEntity(remote))
                }
            }
            "habits" -> {
                if (trimmed.startsWith("[")) {
                    val array = JSONArray(record.payload)
                    for (index in 0 until array.length()) {
                        habits.insert(toEntity(GoalflowJson.parseHabit(array.getJSONObject(index).toString(), strict = true)))
                    }
                } else if (record.deletedAt != null) {
                    habits.delete(record.entityId)
                } else {
                    val remote = GoalflowJson.parseHabit(record.payload, strict = true)
                    require(remote.id == record.entityId) { "Habit sync identifier does not match its payload." }
                    habits.insert(toEntity(remote))
                }
            }
            "daily_plans" -> {
                if (record.deletedAt != null) plans.delete(record.entityId)
                else plans.insert(parsePlan(record.payload, record.entityId))
            }
            else -> {
                conflicts.insert(
                    SyncConflictEntity(
                        id = "unsupported:${record.entityType}:${record.entityId}:${record.serverVersion}",
                        entityType = record.entityType,
                        entityId = record.entityId,
                        localPayload = "",
                        serverPayload = record.payload,
                        serverDeletedAt = record.deletedAt,
                        serverVersion = record.serverVersion,
                        createdAt = Instant.now().toString(),
                        status = "unsupported_remote"
                    )
                )
                return true
            }
        }
        return false
    }

    private fun validateRemoteRecord(record: NativeRemoteRecord) {
        require(record.entityType.isNotBlank() && record.entityId.isNotBlank()) { "Remote sync record has no identity." }
        require(record.version >= 0L && record.serverVersion > 0L) { "Remote sync record has an invalid version." }
        require(record.payload.isNotBlank()) { "Remote sync record has no recoverable payload." }
        record.deletedAt?.let(Instant::parse)
        when (record.entityType) {
            "tasks" -> if (record.payload.trimStart().startsWith("[")) {
                GoalflowJson.parseTasks(record.payload, strict = true)
            } else GoalflowJson.parseTask(record.payload, strict = true)
            "goals" -> if (record.payload.trimStart().startsWith("[")) {
                GoalflowJson.parseGoals(record.payload, strict = true)
            } else if (record.deletedAt == null) GoalflowJson.parseGoal(record.payload, strict = true)
            "habits" -> if (record.payload.trimStart().startsWith("[")) {
                val array = JSONArray(record.payload)
                for (index in 0 until array.length()) GoalflowJson.parseHabit(array.getJSONObject(index).toString(), strict = true)
            } else if (record.deletedAt == null) GoalflowJson.parseHabit(record.payload, strict = true)
            "daily_plans" -> if (record.deletedAt == null) parsePlan(record.payload, record.entityId)
        }
    }

    private fun parsePlan(payload: String, entityId: String): DailyPlanEntity {
        val item = JSONObject(payload)
        val localDate = item.optString("localDate").ifBlank { entityId }
        require(localDate == entityId && localDate.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$"))) {
            "Planning sync identifier does not match its payload."
        }
        val ids = item.optJSONArray("taskIds") ?: throw IllegalArgumentException("Planning sync payload has no task list.")
        return DailyPlanEntity(
            localDate = localDate,
            confirmedAt = item.optLong("confirmedAt").takeIf { it > 0L }
                ?: throw IllegalArgumentException("Planning sync payload has no confirmation timestamp."),
            taskIds = buildList(ids.length()) {
                for (index in 0 until ids.length()) {
                    val id = ids.optString(index).trim()
                    require(id.isNotBlank()) { "Planning sync payload contains an invalid task id." }
                    add(id)
                }
            }.joinToString(",")
        )
    }

    private fun historyPayload(mutations: List<SyncOutboxEntity>): String = JSONArray().apply {
        mutations.sortedWith(compareBy<SyncOutboxEntity> { it.version }.thenBy { it.mutationId }).forEach { mutation ->
            put(historyEntry(mutation.mutationId, mutation.payload, mutation.deletedAt, mutation.updatedAt, mutation.version))
        }
    }.toString()

    private fun mergeHistoryPayloads(first: String?, second: String): String {
        val byId = linkedMapOf<String, JSONObject>()
        listOfNotNull(first, second).forEach { source ->
            val array = JSONArray(source)
            for (index in 0 until array.length()) {
                val entry = array.optJSONObject(index)
                    ?: throw IllegalArgumentException("Conflict history is damaged; no mutation was discarded.")
                val mutationId = entry.optString("mutationId").trim()
                require(mutationId.isNotBlank() && entry.optLong("version", 0L) > 0L) {
                    "Conflict history is damaged; no mutation was discarded."
                }
                val existing = byId[mutationId]
                require(existing == null || canonicalJson(existing) == canonicalJson(entry)) {
                    "A conflict mutation id refers to different local data; no mutation was discarded."
                }
                byId[mutationId] = entry
            }
        }
        return JSONArray(byId.values.sortedWith(
            compareBy<JSONObject> { it.optLong("version") }.thenBy { it.optString("mutationId") }
        )).toString()
    }

    private suspend fun requireMutationIdAvailableInTransaction(mutationId: String) {
        require(outbox.get(mutationId) == null) {
            "Generated mutation id already exists; no pending mutation was overwritten."
        }
        conflicts.getAll().forEach { conflict ->
            require(conflict.mutationId != mutationId) {
                "Generated mutation id already exists in a conflict; no data was overwritten."
            }
            val history = JSONArray(conflict.localHistory)
            for (index in 0 until history.length()) {
                require(history.optJSONObject(index)?.optString("mutationId") != mutationId) {
                    "Generated mutation id already exists in conflict history; no data was overwritten."
                }
            }
        }
    }

    private fun historyEntry(
        mutationId: String,
        payload: String,
        deletedAt: String?,
        updatedAt: String,
        version: Long
    ): JSONObject = JSONObject().apply {
        val parsedPayload = parseJson(payload, "A local mutation contains invalid JSON.")
        put("mutationId", mutationId)
        put("payload", parsedPayload)
        put("deletedAt", deletedAt ?: JSONObject.NULL)
        put("updatedAt", updatedAt)
        put("version", version)
    }

    private fun syncMetaKey(entityType: String, entityId: String): String = "$entityType:$entityId"

    private fun parseJson(value: String, message: String): Any = runCatching {
        val token = JSONTokener(value)
        val parsed = token.nextValue()
        if (token.nextClean().code != 0) throw IllegalArgumentException("trailing JSON")
        parsed
    }.getOrElse { throw IllegalArgumentException(message) }

    private fun canonicalJson(value: Any?): String = when (value) {
        null, JSONObject.NULL -> "null"
        is JSONObject -> {
            val keys = buildList {
                val iterator = value.keys()
                while (iterator.hasNext()) add(iterator.next())
            }.sorted()
            keys.joinToString(prefix = "{", postfix = "}") { key ->
                "${JSONObject.quote(key)}:${canonicalJson(value.get(key))}"
            }
        }
        is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") { index ->
            canonicalJson(value.get(index))
        }
        is String -> JSONObject.quote(value)
        is Boolean, is Number -> value.toString()
        else -> throw IllegalArgumentException("A synchronization payload is not valid JSON.")
    }

    private fun jsonEquivalent(left: String, right: String): Boolean = runCatching {
        canonicalJson(parseJson(left, "Invalid JSON")) == canonicalJson(parseJson(right, "Invalid JSON"))
    }.getOrDefault(false)

    private fun sameInstant(left: String?, right: String?): Boolean {
        if (left == null || right == null) return left == null && right == null
        return runCatching { Instant.parse(left) == Instant.parse(right) }.getOrDefault(false)
    }

    private fun <T> mergeExactById(
        current: List<T>,
        incoming: List<T>,
        id: (T) -> String,
        kind: String
    ): List<T> {
        val merged = linkedMapOf<String, T>()
        (current + incoming).forEach { value ->
            val key = id(value)
            val existing = merged[key]
            if (existing != null && existing != value) {
                throw BackupFormatException("Backup $kind identity is reused for different data.")
            }
            merged[key] = value
        }
        return merged.values.toList()
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

    private companion object {
        const val SYNC_CURSOR_KEY = "_cursor"
    }
}
