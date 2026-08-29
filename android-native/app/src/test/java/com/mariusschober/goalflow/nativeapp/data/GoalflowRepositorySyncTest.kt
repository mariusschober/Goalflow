package com.mariusschober.goalflow.nativeapp.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import com.mariusschober.goalflow.nativeapp.domain.HabitFrequency
import com.mariusschober.goalflow.nativeapp.domain.GoalflowCircadianState
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
class GoalflowRepositorySyncTest {
    private lateinit var database: GoalflowDatabase
    private lateinit var repository: GoalflowRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, GoalflowDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = GoalflowRepository(database, deviceId = "device-a")
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun `task write and outbox insertion share one transaction`() = runTest {
        val task = repository.createTask(
            title = "Never lose this",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )

        assertNotNull(database.taskDao().get(task.id))
        val pending = repository.pendingSyncMutations().filter { it.entityType == "tasks" }
        assertEquals(1, pending.size)
        assertEquals(task.id, pending.single().entityId)
        assertEquals("Never lose this", org.json.JSONObject(pending.single().payload).getString("title"))
    }

    @Test
    fun `capture keeps duration and goal linkage in the local and sync records`() = runTest {
        val goal = repository.createGoal("A real direction", "")
        val task = repository.createTask(
            title = "Make the next move",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false,
            goalId = goal.id,
            duration = 45
        )

        assertEquals(goal.id, database.taskDao().get(task.id)?.goalId)
        assertEquals(45, org.json.JSONObject(database.taskDao().get(task.id)!!.extraJson).getInt("duration"))
        val payload = org.json.JSONObject(repository.pendingSyncMutations().first { it.entityId == task.id }.payload)
        assertEquals(goal.id, payload.getString("goalId"))
        assertEquals(45, payload.getInt("duration"))
    }

    @Test
    fun `goal creation keeps deadline and priority fields in local and sync records`() = runTest {
        val goal = repository.createGoal(
            name = "Ship the next chapter",
            description = "One clear direction.",
            deadline = "2026-09-15",
            excitement = 8,
            roi = 7
        )

        val stored = database.goalDao().get(goal.id)
        assertEquals("2026-09-15", stored?.deadline)
        assertEquals(8, stored?.excitement)
        assertEquals(7, stored?.roi)
        val payload = org.json.JSONObject(repository.pendingSyncMutations().single().payload)
        assertEquals("2026-09-15", payload.getString("deadline"))
        assertEquals(8, payload.getInt("excitement"))
        assertEquals(7, payload.getInt("roi"))
    }

    @Test
    fun `habit instances use shared weekday convention and deterministic identity`() = runTest {
        val habit = repository.createHabit(
            title = "Sunday reset",
            frequency = HabitFrequency.SPECIFIC_DAYS,
            specificDays = setOf(0)
        )

        val first = repository.generateHabitInstance(habit.id, "2026-08-23")
        val second = repository.generateHabitInstance(habit.id, "2026-08-23")

        assertEquals(uuidV5("${habit.id}:2026-08-23"), first?.id)
        assertEquals(first?.id, second?.id)
        assertEquals(1, database.taskDao().getAll().size)
        val pending = repository.pendingSyncMutations().filter { it.entityType != "task_events" }
        assertEquals(3, pending.size)
        assertEquals(
            mapOf("habits" to 1, "progress" to 1, "tasks" to 1),
            pending.groupingBy { it.entityType }.eachCount()
        )
        assertEquals(1, repository.pendingSyncMutations().count { it.entityType == "task_events" })
    }

    @Test
    fun `completion updates linked goal and habit atomically`() = runTest {
        val goal = repository.createGoal("Ship the work", "One deliberate step.")
        val habit = repository.createHabit("Daily anchor", goalId = goal.id)
        val task = repository.generateHabitInstance(habit.id, LocalDate.now().toString())
            ?: error("A daily habit should generate an instance")

        repository.completeTask(task.id)

        assertEquals(1, database.goalDao().get(goal.id)?.completedTasks)
        assertEquals(1, database.habitDao().get(habit.id)?.streak)
        assertEquals(LocalDate.now().toString(), database.habitDao().get(habit.id)?.lastCompletedDate)
        assertEquals(9, repository.pendingSyncMutations().size)
        assertEquals(
            mapOf("goals" to 2, "habits" to 2, "tasks" to 2, "progress" to 2, "stats" to 1, "task_events" to 2),
            repository.pendingSyncMutations().groupingBy { it.entityType }.eachCount()
        )
        val stats = org.json.JSONObject(database.rawCollectionDao().get("stats")!!.payload)
            .getJSONObject(LocalDate.now().toString())
        assertEquals(1, stats.getInt("tasksCompleted"))
        assertEquals(25, stats.getInt("timeFocused"))
        val progress = org.json.JSONObject(database.rawCollectionDao().get("progress")!!.payload)
        assertEquals(2, progress.getInt("level"))
        assertEquals(27, progress.getInt("xp"))
    }

    @Test
    fun `blank completion note does not erase the existing task notes`() = runTest {
        val task = repository.createTask(
            title = "Keep the context",
            notes = "Important context",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )

        repository.completeTask(task.id, finalDescription = "   ")

        assertEquals("Important context", database.taskDao().get(task.id)?.notes)
    }

    @Test
    fun `malformed optional stats does not block local completion`() = runTest {
        val task = repository.createTask(
            title = "Complete despite old projection",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        database.rawCollectionDao().insert(
            RawCollectionEntity(
                entityType = "stats",
                payload = "not-json",
                updatedAt = Instant.now().toString(),
                deletedAt = null
            )
        )

        repository.completeTask(task.id)

        assertEquals("COMPLETED", database.taskDao().get(task.id)?.status)
        assertEquals("not-json", database.rawCollectionDao().get("stats")?.payload)
        assertEquals(60, org.json.JSONObject(database.rawCollectionDao().get("progress")!!.payload).getInt("xp"))
    }

    @Test
    fun `completion undo restores task and linked projections atomically`() = runTest {
        val goal = repository.createGoal("Undoable direction", "")
        val habit = repository.createHabit("Undoable habit", goalId = goal.id)
        val task = repository.generateHabitInstance(habit.id, LocalDate.now().toString())
            ?: error("A daily habit should generate an instance")

        repository.completeTask(task.id, actualDuration = 12, flowState = "flow")
        repository.undoCompletion(task.id)

        assertEquals("OPEN", database.taskDao().get(task.id)?.status)
        assertEquals(null, database.taskDao().get(task.id)?.completedAt)
        assertEquals(0, database.goalDao().get(goal.id)?.completedTasks)
        assertEquals(0, database.habitDao().get(habit.id)?.streak)
        assertEquals(null, database.habitDao().get(habit.id)?.lastCompletedDate)
        assertEquals(null, database.rawCollectionDao().get("stats"))
        val progress = org.json.JSONObject(database.rawCollectionDao().get("progress")!!.payload)
        assertEquals(1, progress.getInt("level"))
        assertEquals(50, progress.getInt("xp"))
        assertTrue(!org.json.JSONObject(database.taskDao().get(task.id)!!.extraJson).has("__goalflowCompletionUndo"))
    }

    @Test
    fun `circadian check in preserves state and records today's stats atomically`() = runTest {
        repository.updateCircadian(
            GoalflowCircadianState(
                lastCheckIn = LocalDate.now().toString(),
                score = 90,
                mode = "apex",
                sunriseTime = "06:12",
                sunsetTime = "20:31",
                solarNoonTime = "13:21",
                sunrise = true,
                sleepHours = 8,
                energy = 9,
                clarity = 8,
                interest = 7,
                wakeTime = "07:00",
                eatingWindow = 10,
                firstMealTime = "08:00"
            )
        )

        val circadian = org.json.JSONObject(database.rawCollectionDao().get("circadian")!!.payload)
        assertEquals("apex", circadian.getString("mode"))
        assertEquals("07:00", circadian.getJSONObject("metrics").getString("wakeTime"))
        val stats = org.json.JSONObject(database.rawCollectionDao().get("stats")!!.payload)
            .getJSONObject(LocalDate.now().toString())
        assertEquals(90, stats.getInt("circadianScore"))
        assertEquals(true, stats.getJSONObject("bioLog").getBoolean("sunrise"))

        repository.resetCircadian()
        assertEquals("", org.json.JSONObject(database.rawCollectionDao().get("circadian")!!.payload).getString("lastCheckIn"))
    }

    @Test
    fun `invalid circadian input leaves the existing record untouched`() = runTest {
        val original = """
            {"lastCheckIn":"2026-08-28","score":70,"mode":"maintenance","metrics":{"energy":7,"custom":"keep"}}
        """.trimIndent()
        database.rawCollectionDao().insert(
            RawCollectionEntity(
                entityType = "circadian",
                payload = original,
                updatedAt = Instant.now().toString(),
                deletedAt = null
            )
        )

        try {
            repository.updateCircadian(
                GoalflowCircadianState(
                    lastCheckIn = LocalDate.now().toString(),
                    score = 70,
                    mode = "maintenance",
                    energy = 7,
                    clarity = 7,
                    interest = 7,
                    wakeTime = "25:90"
                )
            )
            fail("Invalid clock input must be rejected")
        } catch (_: IllegalArgumentException) {
            // The record remains authoritative.
        }

        assertEquals(original, database.rawCollectionDao().get("circadian")?.payload)
    }

    @Test
    fun `room-backed move uses the latest order and invalidates a confirmed plan`() = runTest {
        val today = LocalDate.now().toString()
        val first = repository.createTask("First", "", SchedulePrecision.DAY, today, null, false)
        val second = repository.createTask("Second", "", SchedulePrecision.DAY, today, null, false)
        repository.confirmPlan(today, listOf(first.id, second.id))

        val moved = repository.moveToday(today, second.id, -1)
        val movedAgain = repository.moveToday(today, second.id, 1)

        assertEquals(
            "first move previousIds=${moved?.previousIds}",
            listOf(first.id, second.id),
            moved?.previousIds
        )
        assertEquals(
            "first move orderedIds=${moved?.orderedIds}",
            listOf(second.id, first.id),
            moved?.orderedIds
        )
        assertTrue("first move hadConfirmedPlan=${moved?.hadConfirmedPlan}", moved?.hadConfirmedPlan == true)
        assertEquals(
            "second move previousIds=${movedAgain?.previousIds}",
            listOf(second.id, first.id),
            movedAgain?.previousIds
        )
        assertEquals("daily plan after move=${database.dailyPlanDao().get(today)}", null, database.dailyPlanDao().get(today))
        assertEquals(listOf(first.id, second.id), database.taskDao().getAll()
            .filter { it.scheduledFor == today }
            .sortedBy { it.plannedOrder }
            .map { it.id })
    }

    private fun uuidV5(name: String): String {
        val namespace = UUID.fromString("c3e4bcbb-9f56-4ff5-a3a8-9f7478284169")
        val namespaceBytes = ByteBuffer.allocate(16)
            .putLong(namespace.mostSignificantBits)
            .putLong(namespace.leastSignificantBits)
            .array()
        val digest = MessageDigest.getInstance("SHA-1")
            .digest(namespaceBytes + name.toByteArray(StandardCharsets.UTF_8))
        digest[6] = ((digest[6].toInt() and 0x0f) or 0x50).toByte()
        digest[8] = ((digest[8].toInt() and 0x3f) or 0x80).toByte()
        val bytes = ByteBuffer.wrap(digest)
        return UUID(bytes.long, bytes.long).toString()
    }

    @Test
    fun `accepted creation promotes completion and rejection preserves completion conflict`() = runTest {
        val task = repository.createTask(
            title = "Complete once",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        repository.completeTask(task.id)
        val create = repository.readySyncMutations().single { it.entityType == "tasks" }
        repository.commitPushResults(
            listOf(create),
            listOf(accepted(create, 10))
        )

        val completion = repository.readySyncMutations().single { it.entityType == "tasks" }
        assertEquals(10L, completion.baseServerVersion)
        repository.commitPushResults(
            listOf(completion),
            listOf(
                NativePushResult(
                    completion.mutationId,
                    accepted = false,
                    serverVersion = 11,
                    conflictId = "conflict-1",
                    serverPayload = create.payload
                )
            )
        )

        assertTrue(repository.pendingSyncMutations().none { it.entityType == "tasks" && it.entityId == task.id })
        val conflict = database.syncConflictDao().getAll().single()
        assertEquals(task.id, conflict.entityId)
        assertEquals(1, JSONArray(conflict.localHistory).length())
        assertTrue(org.json.JSONObject(conflict.localPayload).getBoolean("completed"))
    }

    @Test
    fun `pull conflict is stored before cursor advances`() = runTest {
        val local = repository.createTask(
            title = "Local version",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val remote = local.copy(title = "Remote version", updatedAt = local.updatedAt + 1)
        val conflicts = repository.applyRemotePage(
            listOf(
                NativeRemoteRecord(
                    entityType = "tasks",
                    entityId = local.id,
                    version = 2,
                    serverVersion = 20,
                    deviceId = "device-b",
                    payload = GoalflowJson.taskPayload(remote).toString(),
                    updatedAt = Instant.now().toString(),
                    deletedAt = null
                )
            ),
            nextCursor = 20
        )

        assertEquals(1, conflicts)
        assertTrue(repository.pendingSyncMutations().isEmpty())
        assertEquals(20L, repository.syncMetadata("_cursor")?.cursor)
        val stored = database.syncConflictDao().getAll().single()
        assertEquals("Local version", org.json.JSONObject(stored.localPayload).getString("title"))
        assertEquals("Remote version", org.json.JSONObject(stored.serverPayload).getString("title"))
    }

    @Test
    fun `same-device pending mutation is preserved before pull cursor advances`() = runTest {
        val local = repository.createTask(
            title = "Pending on this installation",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val remote = local.copy(title = "Earlier server state", updatedAt = local.updatedAt + 1)

        repository.applyRemotePage(
            listOf(
                NativeRemoteRecord(
                    "tasks", local.id, 1, 22, "device-a",
                    GoalflowJson.taskPayload(remote).toString(), Instant.now().toString(), null
                )
            ),
            22
        )

        assertTrue(repository.pendingSyncMutations().isEmpty())
        val conflict = database.syncConflictDao().getAll().single()
        assertEquals("Pending on this installation", org.json.JSONObject(conflict.localPayload).getString("title"))
        assertEquals("Earlier server state", org.json.JSONObject(conflict.serverPayload).getString("title"))
        assertEquals(22L, repository.syncMetadata("_cursor")?.cursor)
    }

    @Test
    fun `open conflict retains the newest remote side without replacing local data`() = runTest {
        val local = repository.createTask(
            title = "Local side",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        fun remote(title: String, version: Long) = NativeRemoteRecord(
            "tasks", local.id, version, version, "device-b",
            GoalflowJson.taskPayload(local.copy(title = title, updatedAt = local.updatedAt + version)).toString(),
            Instant.now().toString(), null
        )

        repository.applyRemotePage(listOf(remote("Cloud one", 30)), 30)
        repository.applyRemotePage(listOf(remote("Cloud two", 31)), 31)

        assertEquals("Local side", database.taskDao().get(local.id)?.title)
        val conflict = database.syncConflictDao().getAll().single()
        assertEquals("Cloud two", org.json.JSONObject(conflict.serverPayload).getString("title"))
        assertEquals(31L, conflict.serverVersion)
        assertEquals(31L, repository.syncMetadata("_cursor")?.cursor)
    }

    @Test
    fun `stale pull page and invalid acceptance cannot consume durable state`() = runTest {
        val task = repository.createTask(
            title = "Still pending",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val mutation = repository.readySyncMutations().single { it.entityType == "tasks" }
        try {
            repository.commitPushResults(
                listOf(mutation),
                listOf(NativePushResult(mutation.mutationId, accepted = true, serverVersion = 0))
            )
            fail("An invalid acceptance must not be committed")
        } catch (_: IllegalArgumentException) {
            // Pending state remains authoritative.
        }
        assertEquals(
            mutation.mutationId,
            repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId
        )

        val remote = task.copy(title = "Remote", updatedAt = task.updatedAt + 1)
        repository.applyRemotePage(
            listOf(NativeRemoteRecord(
                "tasks", "another-task", 1, 40, "device-b",
                GoalflowJson.taskPayload(remote.copy(id = "another-task")).toString(), Instant.now().toString(), null
            )),
            40
        )
        try {
            repository.applyRemotePage(
                listOf(NativeRemoteRecord(
                    "tasks", "stale-task", 1, 40, "device-b",
                    GoalflowJson.taskPayload(remote.copy(id = "stale-task")).toString(), Instant.now().toString(), null
                )),
                40
            )
            fail("A stale remote page must not be applied")
        } catch (_: IllegalArgumentException) {
            // Cursor and canonical data remain unchanged.
        }
        assertEquals(40L, repository.syncMetadata("_cursor")?.cursor)
        assertEquals(null, database.taskDao().get("stale-task"))
    }

    @Test
    fun `different-task pull applies without disturbing local pending task`() = runTest {
        repository.createTask(
            title = "Offline A",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val remote = com.mariusschober.goalflow.nativeapp.domain.GoalflowTask(
            id = "00000000-0000-4000-8000-000000000002",
            title = "Device B",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            createdAt = 1,
            updatedAt = 2
        )

        val conflicts = repository.applyRemotePage(
            listOf(
                NativeRemoteRecord(
                    "tasks", remote.id, 1, 21, "device-b",
                    GoalflowJson.taskPayload(remote).toString(), Instant.now().toString(), null
                )
            ),
            21
        )

        assertEquals(0, conflicts)
        assertEquals(1, repository.pendingSyncMutations().count { it.entityType == "tasks" })
        assertEquals("Device B", database.taskDao().get(remote.id)?.title)
    }

    @Test
    fun `conflict id collision rolls back every acknowledgement`() = runTest {
        repeat(2) { index ->
            repository.createTask(
                title = "Collision $index",
                notes = "",
                schedulePrecision = SchedulePrecision.DAY,
                scheduledFor = LocalDate.now().toString(),
                scheduledTime = null,
                isFrog = false
            )
        }
        val batch = repository.readySyncMutations()

        try {
            repository.commitPushResults(
                batch,
                batch.mapIndexed { index, mutation ->
                    NativePushResult(
                        mutationId = mutation.mutationId,
                        accepted = false,
                        serverVersion = index + 1L,
                        conflictId = "same-conflict-id",
                        serverPayload = mutation.payload
                    )
                }
            )
            fail("Expected the conflict identity collision to abort")
        } catch (_: Exception) {
            // Room must roll the complete transaction back.
        }

        assertEquals(2, repository.pendingSyncMutations().count { it.entityType == "tasks" })
        assertTrue(database.syncConflictDao().getAll().isEmpty())
    }

    @Test
    fun `legacy snapshot outbox expands deterministically into record mutations`() = runTest {
        val legacyId = "5a09cfb8-d178-49ee-8aab-ed8e04c51527"
        database.syncOutboxDao().insert(
            SyncOutboxEntity(
                mutationId = legacyId,
                deviceId = "old-device",
                entityType = "tasks",
                entityId = "singleton",
                baseServerVersion = 3,
                version = 4,
                payload = """[{"id":"a","title":"A"},{"id":"b","title":"B"}]""",
                updatedAt = Instant.now().toString(),
                deletedAt = null
            )
        )

        val first = repository.readySyncMutations()
        val second = repository.readySyncMutations()
        assertEquals(listOf("a", "b"), first.map { it.entityId }.sorted())
        assertEquals(first.map { it.mutationId }.sorted(), second.map { it.mutationId }.sorted())
        assertTrue(first.all { it.baseServerVersion == null })
    }

    @Test
    fun `merge restore aborts instead of choosing between same-id task versions`() = runTest {
        val task = repository.createTask(
            title = "Local version",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val envelope = GoalflowBackup.encrypt(
            GoalflowBackupPayload(
                tasks = listOf(task.copy(title = "Backup version")),
                goals = emptyList(),
                plans = emptyList()
            ),
            "strong-password"
        )

        try {
            repository.restoreBackup(envelope, "strong-password", BackupRestoreMode.MERGE)
            fail("Expected a visible merge conflict")
        } catch (expected: BackupFormatException) {
            assertTrue(expected.message.orEmpty().contains("identity"))
        }
        assertEquals("Local version", database.taskDao().get(task.id)?.title)
    }

    @Test
    fun `restore preserves a future collection without inventing a native sync mutation`() = runTest {
        val envelope = GoalflowBackup.encrypt(
            GoalflowBackupPayload(
                tasks = emptyList(),
                goals = emptyList(),
                plans = emptyList(),
                rawCollections = mapOf("future_feature" to "{\"enabled\":true}")
            ),
            "strong-password"
        )

        repository.restoreBackup(envelope, "strong-password")

        assertEquals("{\"enabled\":true}", database.rawCollectionDao().get("future_feature")?.payload)
        assertTrue(repository.pendingSyncMutations().isEmpty())
    }

    private fun accepted(mutation: SyncOutboxEntity, serverVersion: Long): NativePushResult =
        NativePushResult(
            mutationId = mutation.mutationId,
            accepted = true,
            serverVersion = serverVersion,
            recordEntityType = mutation.entityType,
            recordEntityId = mutation.entityId,
            recordVersion = mutation.version,
            recordServerVersion = serverVersion,
            recordPayload = mutation.payload,
            recordUpdatedAt = mutation.updatedAt,
            recordDeletedAt = mutation.deletedAt
        )
}
