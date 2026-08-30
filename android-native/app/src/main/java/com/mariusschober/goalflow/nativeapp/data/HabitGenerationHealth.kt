package com.mariusschober.goalflow.nativeapp.data

import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate

enum class HabitGenerationStatus { IN_PROGRESS, GENERATED, FAILED }

data class HabitGenerationHealth(
    val habitId: String,
    val scheduledFor: String,
    val status: HabitGenerationStatus,
    val taskId: String?,
    val attemptCount: Int,
    val errorMessage: String?,
    val updatedAt: String
)

const val HABIT_GENERATION_HEALTH_PREFIX = "__goalflow.habit-generation."

fun habitGenerationHealthKey(habitId: String, scheduledFor: String): String =
    "$HABIT_GENERATION_HEALTH_PREFIX$habitId.$scheduledFor"

fun HabitGenerationHealth.toRawPayload(): String = JSONObject().apply {
    put("version", 1)
    put("habitId", habitId)
    put("scheduledFor", scheduledFor)
    put("status", status.name)
    put("taskId", taskId ?: JSONObject.NULL)
    put("attemptCount", attemptCount)
    put("errorMessage", errorMessage ?: JSONObject.NULL)
    put("updatedAt", updatedAt)
}.toString()

fun parseHabitGenerationHealth(entityType: String, payload: String): HabitGenerationHealth? {
    if (!entityType.startsWith(HABIT_GENERATION_HEALTH_PREFIX)) return null
    return runCatching {
        val value = JSONObject(payload)
        val habitId = value.optString("habitId").trim()
        val scheduledFor = value.optString("scheduledFor").trim()
        val status = HabitGenerationStatus.valueOf(value.optString("status"))
        val updatedAt = value.optString("updatedAt").also { Instant.parse(it) }
        require(habitId.isNotBlank())
        LocalDate.parse(scheduledFor)
        val attempts = value.optInt("attemptCount", 0)
        require(attempts >= 0)
        HabitGenerationHealth(
            habitId = habitId,
            scheduledFor = scheduledFor,
            status = status,
            taskId = value.optString("taskId").takeIf(String::isNotBlank),
            attemptCount = attempts,
            errorMessage = value.optString("errorMessage").takeIf(String::isNotBlank),
            updatedAt = updatedAt
        )
    }.getOrNull()
}
