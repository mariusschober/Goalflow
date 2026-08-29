package com.mariusschober.goalflow.nativeapp.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import com.mariusschober.goalflow.nativeapp.domain.SchedulingException
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.time.LocalDate

@RunWith(RobolectricTestRunner::class)
class GoalflowTaskEventTest {
    private lateinit var database: GoalflowDatabase
    private lateinit var repository: GoalflowRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, GoalflowDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = GoalflowRepository(database, deviceId = "device-events")
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun eventPayloadRoundTripsWithSnakeCaseAndMetadata() {
        val parsed = GoalflowTaskEventJson.parseEvent(
            """{"id":"event-1","task_id":"task-1","event_type":"rescheduled","local_date":"2026-08-29","metadata":{"schedulePrecision":"DAY","custom":true},"created_at":"2026-08-29T00:00:00Z"}"""
        )
        assertEquals("event-1", parsed.id)
        assertEquals("task-1", parsed.taskId)
        assertEquals("rescheduled", parsed.eventType)
        assertEquals("2026-08-29", parsed.localDate)
        assertEquals("""{"schedulePrecision":"DAY","custom":true}""", parsed.metadata)
        assertTrue(parsed.createdAt > 0L)
    }

    @Test
    fun skipMovesNormalTaskToEndAndRecordsEvent() = runTest {
        val today = LocalDate.now().toString()
        val first = repository.createTask("First", "", SchedulePrecision.DAY, today, null, false)
        repository.createTask("Second", "", SchedulePrecision.DAY, today, null, false)

        repository.skipTask(first.id)

        val stored = database.taskDao().get(first.id)!!
        assertEquals(2, stored.plannedOrder)
        val events = database.taskEventDao().getAll().filter { it.taskId == first.id }
        assertEquals(setOf("created", "skipped"), events.map { it.eventType }.toSet())
        val taskMutations = repository.pendingSyncMutations().filter { it.entityType == "tasks" && it.entityId == first.id }
        val skipEvent = repository.pendingSyncMutations().first { it.entityType == "task_events" && it.payload.contains("skipped") }
        assertEquals(taskMutations.last().mutationId, skipEvent.dependsOnMutationId)
    }

    @Test
    fun frogsCannotBeSkipped() = runTest {
        val frog = repository.createTask("Frog", "", SchedulePrecision.DAY, LocalDate.now().toString(), null, true)
        try {
            repository.skipTask(frog.id)
            assertTrue(false)
        } catch (_: SchedulingException) {
            assertTrue(true)
        }
    }
}
