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
    private val taskKnownKeys = setOf(
        "id", "cloudId", "title", "description", "notes", "completed", "isFrog", "beforeFrog",
        "frogFailures", "rescheduleCount", "createdAt", "updatedAt", "completedAt", "dateAssigned",
        "scheduledFor", "schedulePrecision", "scheduledTime", "plannedOrder", "goalId", "habitId",
        "parentTaskId", "lifecycleStatus", "wontDo", "source", "deletedAt"
    )
    private val goalKnownKeys = setOf(
        "id", "name", "description", "deadline", "completedTasks", "color", "createdAt", "excitement", "roi"
    )
    private val habitKnownKeys = setOf(
        "id", "title", "frequency", "specificDays", "streak", "bestStreak", "lastCompletedDate",
        "isHighPriority", "beforeFrog", "duration", "goalId", "createdAt"
    )

    fun tasksPayload(tasks: List<GoalflowTask>): JSONArray = JSONArray().apply {
        tasks.forEach { put(taskPayload(it)) }
    }

    fun taskPayload(task: GoalflowTask): JSONObject = extrasObject(task.extraJson).apply {
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
    }

    fun goalsPayload(goals: List<GoalflowGoal>): JSONArray = JSONArray().apply {
        goals.forEach { put(goalPayload(it)) }
    }

    fun goalPayload(goal: GoalflowGoal): JSONObject = extrasObject(goal.extraJson).apply {
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

    fun habitPayload(habit: GoalflowHabit): JSONObject = extrasObject(habit.extraJson).apply {
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
                    (!strict || rawSchedule.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$"))) && isRealLocalDay(schedule)
                } else {
                    (!strict || rawSchedule.matches(Regex("^\\d{4}-\\d{2}(-01)?$"))) && isRealLocalMonth(schedule)
                }
                if (!validSchedule) {
                    if (strict) throw IllegalArgumentException("Task payload contains an invalid schedule.")
                    continue
                }
                val scheduledTime = item.optNullableString("scheduledTime")
                if (strict && scheduledTime != null &&
                    runCatching { java.time.LocalTime.parse(scheduledTime, java.time.format.DateTimeFormatter.ofPattern("HH:mm")) }.isFailure
                ) throw IllegalArgumentException("Task payload contains an invalid time.")
                if (strict && precision == SchedulePrecision.MONTH && scheduledTime != null) {
                    throw IllegalArgumentException("A monthly task cannot contain a time.")
                }
                val deletedAt = item.optNullableInstantMillisStrict("deletedAt", strict)
                val completedAt = item.optNullableLongStrict("completedAt", strict)
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
                        scheduledTime = scheduledTime,
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
                        completedAt = completedAt,
                        deletedAt = deletedAt,
                        extraJson = extraFields(item, taskKnownKeys)
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
                val deadline = item.optNullableString("deadline")
                if (strict && deadline != null && !isRealLocalDay(deadline)) {
                    throw IllegalArgumentException("Goal payload contains an invalid deadline.")
                }
                add(
                    GoalflowGoal(
                        id = id,
                        name = name,
                        description = item.optString("description"),
                        deadline = deadline,
                        completedTasks = item.optInt("completedTasks", 0),
                        color = item.optString("color", "#315C4B"),
                        createdAt = item.optLong("createdAt", 0L),
                        excitement = item.optNullableInt("excitement"),
                        roi = item.optNullableInt("roi"),
                        extraJson = extraFields(item, goalKnownKeys)
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
        val frequencyValue = item.optString("frequency").lowercase()
        val frequency = when (frequencyValue) {
            "daily" -> HabitFrequency.DAILY
            "specific_days", "specificdays" -> HabitFrequency.SPECIFIC_DAYS
            else -> if (strict) throw IllegalArgumentException("Habit payload contains an invalid frequency.") else HabitFrequency.DAILY
        }
        val days = item.optJSONArray("specificDays")?.let { values ->
            buildSet {
                for (index in 0 until values.length()) {
                    val day = values.opt(index)
                    // Goalflow's shared contract follows Date#getDay(): Sunday=0
                    // through Saturday=6. Do not use java.time's 1..7 values here;
                    // this payload is exchanged with the web client.
                    if (day !is Number || day.toInt() !in 0..6 || day.toDouble() != day.toInt().toDouble()) {
                        if (strict) throw IllegalArgumentException("Habit payload contains an invalid weekday.")
                    } else add(day.toInt())
                }
            }
        }.orEmpty()
        val lastCompletedDate = item.optNullableString("lastCompletedDate")
        if (strict && lastCompletedDate != null && !isRealLocalDay(lastCompletedDate)) {
            throw IllegalArgumentException("Habit payload contains an invalid completion date.")
        }
        val duration = item.optNullableInt("duration")
        if (strict && duration != null && duration !in 1..1_440) {
            throw IllegalArgumentException("Habit payload contains an invalid duration.")
        }
        return GoalflowHabit(
            id = id,
            title = title,
            frequency = frequency,
            specificDays = days,
            streak = item.optInt("streak", 0).coerceAtLeast(0),
            bestStreak = item.optInt("bestStreak", 0).coerceAtLeast(0),
            lastCompletedDate = lastCompletedDate,
            isHighPriority = item.optBoolean("isHighPriority", false),
            beforeFrog = item.optBoolean("beforeFrog", false),
            duration = duration,
            goalId = item.optNullableString("goalId"),
            createdAt = item.optLong("createdAt", 0L),
            extraJson = extraFields(item, habitKnownKeys)
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

    private fun extrasObject(raw: String): JSONObject = runCatching { JSONObject(raw) }.getOrElse {
        throw IllegalArgumentException("A synchronized record contains damaged preserved fields.")
    }

    private fun extraFields(item: JSONObject, knownKeys: Set<String>): String = JSONObject().apply {
        val keys = item.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (key !in knownKeys) put(key, item.get(key))
        }
    }.toString()

    private fun JSONObject.optNullableLong(key: String): Long? =
        if (isNull(key) || !has(key)) null else optLong(key).takeIf { it > 0L }

    private fun JSONObject.optNullableLongStrict(key: String, strict: Boolean): Long? {
        if (isNull(key) || !has(key)) return null
        val value = opt(key)
        if (value is Number && value.toDouble() == value.toLong().toDouble() && value.toLong() > 0L) {
            return value.toLong()
        }
        if (value is String) {
            val parsed = runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
            if (parsed != null && parsed > 0L) return parsed
        }
        if (strict) throw IllegalArgumentException("Payload contains an invalid timestamp.")
        return null
    }

    private fun JSONObject.optNullableInt(key: String): Int? =
        if (isNull(key) || !has(key)) null else optInt(key)

    private fun JSONObject.optNullableInstantMillisStrict(key: String, strict: Boolean): Long? {
        val value = optNullableString(key) ?: return null
        return runCatching { Instant.parse(value).toEpochMilli() }.getOrElse {
            if (strict) throw IllegalArgumentException("Payload contains an invalid timestamp.")
            null
        }
    }
}
