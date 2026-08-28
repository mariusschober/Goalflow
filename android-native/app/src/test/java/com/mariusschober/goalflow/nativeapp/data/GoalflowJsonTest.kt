package com.mariusschober.goalflow.nativeapp.data

import com.mariusschober.goalflow.nativeapp.domain.HabitFrequency
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class GoalflowJsonTest {
    @Test
    fun `habit weekday payload follows web Sunday zero convention`() {
        val habit = GoalflowJson.parseHabit(
            """{"id":"habit-1","title":"Sunday reset","frequency":"specific_days","specificDays":[0,6]}""",
            strict = true
        )

        assertEquals(HabitFrequency.SPECIFIC_DAYS, habit.frequency)
        assertEquals(setOf(0, 6), habit.specificDays)
    }

    @Test
    fun `habit weekday seven is rejected instead of silently shifting a schedule`() {
        assertThrows(IllegalArgumentException::class.java) {
            GoalflowJson.parseHabit(
                """{"id":"habit-1","title":"Invalid","frequency":"specific_days","specificDays":[7]}""",
                strict = true
            )
        }
    }

    @Test
    fun `native edits preserve fields owned by newer clients`() {
        val task = GoalflowJson.parseTask(
            """{"id":"task-1","title":"Keep context","dateAssigned":"2026-08-28","duration":45,"hashtags":["deep"],"actualDuration":32}""",
            strict = true
        )
        val goal = GoalflowJson.parseGoal(
            """{"id":"goal-1","name":"Direction","targetTasks":12}""",
            strict = true
        )

        val taskRoundTrip = GoalflowJson.taskPayload(task)
        val goalRoundTrip = GoalflowJson.goalPayload(goal)
        assertEquals(45, taskRoundTrip.getInt("duration"))
        assertEquals(32, taskRoundTrip.getInt("actualDuration"))
        assertEquals("deep", taskRoundTrip.getJSONArray("hashtags").getString(0))
        assertEquals(12, goalRoundTrip.getInt("targetTasks"))
    }
}
