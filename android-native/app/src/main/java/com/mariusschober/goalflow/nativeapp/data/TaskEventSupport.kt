package com.mariusschober.goalflow.nativeapp.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate

@Entity(
    tableName = "task_events",
    indices = [Index(value = ["taskId", "createdAt"])]
)
data class TaskEventEntity(
    @PrimaryKey val id: String,
    val taskId: String,
    val eventType: String,
    val localDate: String,
    val metadata: String,
    val createdAt: Long
)

object GoalflowTaskEventJson {
    val KNOWN_EVENT_TYPES: Set<String> = setOf(
        "created", "completed", "skipped", "rescheduled", "promoted_to_frog",
        "broken_down", "dropped", "restored"
    )

    fun eventPayload(event: TaskEventEntity): JSONObject = JSONObject().apply {
        put("id", event.id)
        put("taskId", event.taskId)
        put("eventType", event.eventType)
        put("localDate", event.localDate)
        put("metadata", parseMetadata(event.metadata))
        put("createdAt", event.createdAt)
    }

    fun eventsPayload(events: List<TaskEventEntity>): JSONArray = JSONArray().apply {
        events.forEach { put(eventPayload(it)) }
    }

    fun parseEvents(payload: String, strict: Boolean = true): List<TaskEventEntity> {
        val array = JSONArray(payload)
        return buildList(array.length()) {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index)
                    ?: fail("Task event collection contains an invalid record.")
                add(parseEvent(item.toString(), strict))
            }
        }
    }

    fun parseEvent(payload: String, strict: Boolean = true): TaskEventEntity {
        val item = runCatching { JSONObject(payload) }
            .getOrElse { fail("Task event payload is not an object.") }
        val id = readString(item, "id")
        val taskId = readString(item, "taskId", "task_id")
        val eventType = readString(item, "eventType", "event_type")
        val localDate = readString(item, "localDate", "local_date")
        val createdAt = readTimestamp(item, strict)
        val metadata = readMetadata(item, strict)
        if (strict) {
            require(id.isNotBlank() && taskId.isNotBlank()) { "Task event payload has no identity." }
            require(eventType in KNOWN_EVENT_TYPES) { "Task event payload has an unsupported event type." }
            require(runCatching { LocalDate.parse(localDate) }.isSuccess) { "Task event payload has an invalid local date." }
            require(createdAt > 0L) { "Task event payload has an invalid timestamp." }
        }
        return TaskEventEntity(id, taskId, eventType, localDate, metadata, createdAt)
    }

    private fun readString(item: JSONObject, vararg keys: String): String =
        keys.firstNotNullOfOrNull { key ->
            if (!item.has(key) || item.isNull(key)) null else item.optString(key).trim()
        }.orEmpty()

    private fun readTimestamp(item: JSONObject, strict: Boolean): Long {
        val raw = listOf("createdAt", "created_at").firstNotNullOfOrNull { key ->
            if (!item.has(key) || item.isNull(key)) null else item.opt(key)
        }
        val value = when (raw) {
            is Number -> raw.toLong()
            is String -> raw.toLongOrNull() ?: runCatching { Instant.parse(raw).toEpochMilli() }.getOrNull()
            else -> null
        }
        if (strict && (value == null || value <= 0L)) fail("Task event payload has an invalid timestamp.")
        return value ?: 0L
    }

    private fun readMetadata(item: JSONObject, strict: Boolean): String {
        val raw = listOf("metadata", "metadata_json").firstNotNullOfOrNull { key ->
            if (!item.has(key) || item.isNull(key)) null else item.opt(key)
        } ?: return "{}"
        return when (raw) {
            is JSONObject, is JSONArray -> raw.toString()
            is Number, is Boolean -> raw.toString()
            is String -> {
                val trimmed = raw.trim()
                if (trimmed.isBlank()) "{}" else runCatching {
                    when {
                        trimmed.startsWith("{") -> JSONObject(trimmed).toString()
                        trimmed.startsWith("[") -> JSONArray(trimmed).toString()
                        trimmed == "true" || trimmed == "false" || trimmed.matches(Regex("^-?\\d+(?:\\.\\d+)?$")) -> trimmed
                        else -> throw IllegalArgumentException()
                    }
                }.getOrElse { if (strict) fail("Task event metadata is not valid JSON.") else "{}" }
            }
            else -> if (strict) fail("Task event metadata is invalid.") else "{}"
        }
    }

    private fun parseMetadata(value: String): Any {
        val trimmed = value.trim()
        return when {
            trimmed.startsWith("{") -> JSONObject(trimmed)
            trimmed.startsWith("[") -> JSONArray(trimmed)
            trimmed == "true" || trimmed == "false" -> trimmed.toBoolean()
            trimmed.matches(Regex("^-?\\d+(?:\\.\\d+)?$")) -> trimmed.toDoubleOrNull() ?: 0
            else -> JSONObject()
        }
    }

    private fun fail(message: String): Nothing = throw IllegalArgumentException(message)
}
