package com.mariusschober.goalflow.nativeapp.ui

import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import org.json.JSONObject

data class GoalflowTimelineBlock(
    val taskId: String,
    val start: LocalTime,
    val end: LocalTime,
    val durationMinutes: Int,
    val hasExplicitStart: Boolean,
    val overlapsPrevious: Boolean
)

private val timelineTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

fun taskDurationMinutes(task: GoalflowTask): Int = runCatching {
    JSONObject(task.extraJson).optInt("duration", 25)
}.getOrDefault(25).coerceIn(1, 1_440)

private fun roundedTimelineStart(now: LocalTime): LocalTime {
    val seconds = now.toSecondOfDay()
    val rounded = ((seconds + 299) / 300) * 300
    return LocalTime.ofSecondOfDay((rounded % (24 * 60 * 60)).toLong())
}

/**
 * Mirrors the web PlanningView projection: a five-minute rounded start and a
 * cumulative block for each commitment, while respecting explicit time anchors.
 */
fun buildGoalflowTimeline(
    tasks: List<GoalflowTask>,
    now: LocalTime = LocalTime.now()
): List<GoalflowTimelineBlock> {
    var cursor = roundedTimelineStart(now)
    return tasks.map { task ->
        val explicitStart = task.scheduledTime?.let { raw ->
            runCatching { LocalTime.parse(raw, timelineTimeFormatter) }.getOrNull()
        }
        val start = explicitStart ?: cursor
        val overlap = explicitStart != null && explicitStart.isBefore(cursor)
        val duration = taskDurationMinutes(task)
        val end = start.plusMinutes(duration.toLong())
        if (end.isAfter(cursor)) cursor = end
        GoalflowTimelineBlock(task.id, start, end, duration, explicitStart != null, overlap)
    }
}

fun formatTimelineTime(time: LocalTime): String = time.format(timelineTimeFormatter)

fun GoalflowTask.isExplicitFrogName(): Boolean = title.trim().equals("frog", ignoreCase = true)
