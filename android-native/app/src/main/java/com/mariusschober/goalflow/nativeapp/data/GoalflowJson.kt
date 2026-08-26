package com.mariusschober.goalflow.nativeapp.data

import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import com.mariusschober.goalflow.nativeapp.domain.TaskSource
import com.mariusschober.goalflow.nativeapp.domain.TaskStatus
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
        tasks.forEach { task ->
            put(JSONObject().apply {
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
            })
        }
    }

    fun goalsPayload(goals: List<GoalflowGoal>): JSONArray = JSONArray().apply {
        goals.forEach { goal ->
            put(JSONObject().apply {
                put("id", goal.id)
                put("name", goal.name)
                put("description", goal.description)
                put("deadline", goal.deadline ?: JSONObject.NULL)
                put("completedTasks", goal.completedTasks)
                put("color", goal.color)
                put("createdAt", goal.createdAt)
                put("excitement", goal.excitement ?: JSONObject.NULL)
                put("roi", goal.roi ?: JSONObject.NULL)
            })
        }
    }

    fun parseTasks(payload: String): List<GoalflowTask> {
        val array = JSONArray(payload)
        return buildList(array.length()) {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id").trim()
                val title = item.optString("title").trim()
                if (id.isBlank() || title.isBlank()) continue
                val precision = when (item.optString("schedulePrecision").lowercase()) {
                    "month" -> SchedulePrecision.MONTH
                    else -> SchedulePrecision.DAY
                }
                val schedule = item.optString("scheduledFor").ifBlank {
                    item.optString("dateAssigned")
                }
                if (schedule.isBlank()) continue
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

    fun parseGoals(payload: String): List<GoalflowGoal> {
        val array = JSONArray(payload)
        return buildList(array.length()) {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id").trim()
                val name = item.optString("name").trim()
                if (id.isBlank() || name.isBlank()) continue
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
