package com.mariusschober.goalflow.nativeapp.ui

import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GoalflowTimelineTest {
    private fun task(
        id: String,
        duration: Int,
        scheduledTime: String? = null
    ) = GoalflowTask(
        id = id,
        title = id,
        schedulePrecision = SchedulePrecision.DAY,
        scheduledFor = "2026-08-29",
        scheduledTime = scheduledTime,
        createdAt = 1L,
        updatedAt = 1L,
        extraJson = """{"duration":$duration}"""
    )

    @Test
    fun projectsWebCompatibleCumulativeBlocks() {
        val timeline = buildGoalflowTimeline(
            listOf(task("one", 25), task("two", 45)),
            now = java.time.LocalTime.of(9, 1)
        )
        assertEquals("09:05", formatTimelineTime(timeline[0].start))
        assertEquals("09:30", formatTimelineTime(timeline[0].end))
        assertEquals("09:30", formatTimelineTime(timeline[1].start))
        assertEquals("10:15", formatTimelineTime(timeline[1].end))
    }

    @Test
    fun explicitTimeIsKeptAndOverlapIsVisible() {
        val timeline = buildGoalflowTimeline(
            listOf(task("one", 60), task("anchored", 25, "09:30")),
            now = java.time.LocalTime.of(9, 0)
        )
        assertEquals("09:30", formatTimelineTime(timeline[1].start))
        assertTrue(timeline[1].overlapsPrevious)
    }

    @Test
    fun exactFrogNameGetsFrogPresentation() {
        assertTrue(task("Frog", 25).isExplicitFrogName())
    }
}
