package com.mariusschober.goalflow.nativeapp.data

import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
import com.mariusschober.goalflow.nativeapp.domain.GoalflowHabit
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.HabitFrequency
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import com.mariusschober.goalflow.nativeapp.domain.TaskSource
import com.mariusschober.goalflow.nativeapp.domain.TaskStatus
import com.mariusschober.goalflow.nativeapp.domain.isRealLocalDay
import com.mariusschober.goalflow.nativeapp.domain.isRealLocalMonth
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * The native client deliberately serializes the same legacy-compatible field
 * names used by the web sync adapter. This keeps the server boundary explicit
 * without coupling Compose or Room to the browser implementation.
 */
object GoalflowJson {
    fun tasksPayload(tasks: List<GoalflowTask>): JSONArray = JSONArray().apply {
        tasks.forEach { put(taskPayload(it)) }
    }

    fun taskPayload(task: GoalflowTask): JSONObject = JSONObject().apply {
        put("id", task.id)
        put("cloudId", task.id)
        put("title", task.title)
        put("description", task.notes)
        put("completed", task.status == TaskStatus.COMPLETED || task.status == TaskStatus.BROKEN_DOWN)
        put("isFrog", task.isFrog)
        put("beforeFrog", task.beforeFrog)
        put("frogFailures", task.frogFailures)
        put("createdAt", task.createdAt)
        put("updatedAt", task.updatedAt)
        put("completedAt", task.completedAt ?: JSONObject.NULL)
        put("dateAssigned", task.scheduledFor)
        put("scheduledFor", task.scheduledFor)
        put("schedulePrecision", task.schedulePrecision.name.lowercase())
        put("scheduledTime", task.scheduledTime ?: JSONObject.NULL)
        put("plannedOrder", task.plannedOrder)
        put("goalId", task.goalId ?: JSONObject.NULL)
        put("habitId", task.habitId ?: JSONObject.NULL)
        put("parentTaskId", task.parentTaskId ?: JSONObject.NULL)
        put("lifecycleStatus", task.status.name.lowercase())
        put("wontDo", task.status == TaskStatus.DROPPED)
        put("source", task.source.name.lowercase())
        put("deletedAt", task.deletedAt?.let { Instant.ofEpochMilli(it).toString() } ?: JSONObject.NULL)
        put("hashtags", JSONArray())
    }

    fun goalsPayload(goals: List<GoalflowGoal>): JSONArray = JSONArray().apply {
        goals.forEach { put(goalPayload(it)) }
    }

    fun goalPayload(goal: GoalflowGoal): JSONObject = JSONObject().apply {
        put("id", goal.id)
        put("name", goal.name)
        put("description", goal.description)
        put("deadline", goal.deadline ?: JSONObject.NULL)
        put("completedTasks", goal.completedTasks)
        put("color", goal.color)
        put("createdAt", goal.createdAt)
        put("excitement", goal.excitement ?: JSONObject.NULL)
        put("roi", goal.roi ?: JSONObject.NULL)
    }

    fun habitPayload(habit: GoalflowHabit): JSONObject = JSONObject().apply {
        put("id", habit.id)
        put("title", habit.title)
        put("frequency", habit.frequency.name.lowercase())
        put("specificDays", JSONArray(habit.specificDays.sorted()))
        put("streak", habit.streak)
        put("bestStreak", habit.bestStreak)
        put("lastCompletedDate", habit.lastCompletedDate ?: JSONObject.NULL)
        put("isHighPriority", habit.isHighPriority)
        put("beforeFrog", habit.beforeFrog)
        put("duration", habit.duration ?: JSONObject.NULL)
        put("goalId", habit.goalId ?: JSONObject.NULL)
        put("createdAt", habit.createdAt)
    }

    fun habitsPayload(habits: List<GoalflowHabit>): JSONArray = JSONArray().apply {
        habits.forEach { put(habitPayload(it)) }
    }

    fun planPayload(plan: com.mariusschober.goalflow.nativeapp.domain.DailyPlan): JSONObject = JSONObject().apply {
        put("localDate", plan.localDate)
        put("confirmedAt", plan.confirmedAt)
        put("taskIds", JSONArray(plan.taskIds))
    }

    fun parseTask(payload: String, strict: Boolean = true): GoalflowTask =
        parseTasks(JSONArray().put(JSONObject(payload)).toString(), strict).single()

    fun parseGoal(payload: String, strict: Boolean = true): GoalflowGoal =
        parseGoals(JSONArray().put(JSONObject(payload)).toString(), strict).single()

    fun parseTasks(payload: String, strict: Boolean = false): List<GoalflowTask> {
        val array = JSONArray(payload)
        return buildList(array.length()) {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: if (strict) {
                    throw IllegalArgumentException("Task payload contains a non-object record.")
                } else continue
                val id = item.optString("id").trim()
                val title = item.optString("title").trim()
                if (id.isBlank() || title.isBlank()) {
                    if (strict) throw IllegalArgumentException("Task payload contains an invalid record.")
                    continue
                }
                val precision = when (item.optString("schedulePrecision").lowercase()) {
                    "month" -> SchedulePrecision.MONTH
                    else -> SchedulePrecision.DAY
                }
                val rawSchedule = item.optString("scheduledFor").ifBlank {
                    item.optString("dateAssigned")
                }
                val schedule = if (precision == SchedulePrecision.MONTH) rawSchedule.take(7) else rawSchedule.take(10)
                if (schedule.isBlank()) {
                    if (strict) throw IllegalArgumentException("Task payload contains an unscheduled record.")
                    continue
                }
                val validSchedule = if (precision == SchedulePrecision.DAY) {
                    isRealLocalDay(schedule)
                } else {
                    isRealLocalMonth(schedule)
                }
                if (!validSchedule) {
                    if (strict) throw IllegalArgumentException("Task payload contains an invalid schedule.")
                    continue
                }
                val status = when {
                    item.optString("lifecycleStatus").lowercase() == "broken_down" -> TaskStatus.BROKEN_DOWN
                    item.optString("lifecycleStatus").lowercase() == "archived" -> TaskStatus.ARCHIVED
                    item.optBoolean("wontDo", false) -> TaskStatus.DROPPED
                    item.optBoolean("completed", false) -> TaskStatus.COMPLETED
                    else -> TaskStatus.OPEN
                }
                add(
                    GoalflowTask(
                        id = id,
                        title = title,
                        notes = item.optString("description", item.optString("notes")),
                        schedulePrecision = precision,
                        scheduledFor = schedule,
                        scheduledTime = item.optNullableString("scheduledTime"),
                        plannedOrder = item.optInt("plannedOrder", 0),
                        status = status,
                        isFrog = item.optBoolean("isFrog", false),
                        beforeFrog = item.optBoolean("beforeFrog", false),
                        frogFailures = item.optInt("frogFailures", item.optInt("rescheduleCount", 0)).coerceAtLeast(0),
                        source = parseSource(item.optString("source")),
                        goalId = item.optNullableString("goalId"),
                        parentTaskId = item.optNullableString("parentTaskId"),
                        habitId = item.optNullableString("habitId"),
                        createdAt = item.optLong("createdAt", 0L),
                        updatedAt = item.optLong("updatedAt", item.optLong("createdAt", 0L)),
                        completedAt = item.optNullableLong("completedAt"),
                        deletedAt = item.optNullableInstantMillis("deletedAt")
                    )
                )
            }
        }
    }

    fun parseGoals(payload: String, strict: Boolean = false): List<GoalflowGoal> {
        val array = JSONArray(payload)
        return buildList(array.length()) {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: if (strict) {
                    throw IllegalArgumentException("Goal payload contains a non-object record.")
                } else continue
                val id = item.optString("id").trim()
                val name = item.optString("name").trim()
                if (id.isBlank() || name.isBlank()) {
                    if (strict) throw IllegalArgumentException("Goal payload contains an invalid record.")
                    continue
                }
                add(
                    GoalflowGoal(
                        id = id,
                        name = name,
                        description = item.optString("description"),
                        deadline = item.optNullableString("deadline"),
                        completedTasks = item.optInt("completedTasks", 0),
                        color = item.optString("color", "#315C4B"),
                        createdAt = item.optLong("createdAt", 0L),
                        excitement = item.optNullableInt("excitement"),
                        roi = item.optNullableInt("roi")
                    )
                )
            }
        }
    }

    fun parseHabit(payload: String, strict: Boolean = true): GoalflowHabit {
        val item = JSONObject(payload)
        val id = item.optString("id").trim()
        val title = item.optString("title").trim()
        if (id.isBlank() || title.isBlank()) throw IllegalArgumentException("Habit payload contains an invalid record.")
        val days = item.optJSONArray("specificDays")?.let { values ->
            buildSet { for (index in 0 until values.length()) values.optInt(index).takeIf { it in 1..7 }?.let(::add) }
        }.orEmpty()
        val frequency = when (item.optString("frequency").lowercase()) {
            "specific_days", "specificdays" -> HabitFrequency.SPECIFIC_DAYS
            else -> HabitFrequency.DAILY
        }
        return GoalflowHabit(
            id = id,
            title = title,
            frequency = frequency,
            specificDays = days,
            streak = item.optInt("streak", 0).coerceAtLeast(0),
            bestStreak = item.optInt("bestStreak", 0).coerceAtLeast(0),
            lastCompletedDate = item.optNullableString("lastCompletedDate"),
            isHighPriority = item.optBoolean("isHighPriority", false),
            beforeFrog = item.optBoolean("beforeFrog", false),
            duration = item.optNullableInt("duration"),
            goalId = item.optNullableString("goalId"),
            createdAt = item.optLong("createdAt", 0L)
        )
    }

    private fun parseSource(value: String): TaskSource = when (value.lowercase()) {
        "habit" -> TaskSource.HABIT
        "telegram" -> TaskSource.TELEGRAM
        "share" -> TaskSource.SHARE
        "ai" -> TaskSource.AI
        "migration" -> TaskSource.MIGRATION
        else -> TaskSource.MANUAL
    }

    private fun JSONObject.optNullableString(key: String): String? =
        if (isNull(key)) null else optString(key).takeIf(String::isNotBlank)

    private fun JSONObject.optNullableLong(key: String): Long? =
        if (isNull(key) || !has(key)) null else optLong(key).takeIf { it > 0L }

    private fun JSONObject.optNullableInt(key: String): Int? =
        if (isNull(key) || !has(key)) null else optInt(key)

    private fun JSONObject.optNullableInstantMillis(key: String): Long? {
        val value = optNullableString(key) ?: return null
        return runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
    }
}
