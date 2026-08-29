package com.mariusschober.goalflow.nativeapp.data

import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.GoalflowHabit
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class GoalflowBackupTest {
    private val task = GoalflowTask(
        id = "task-1",
        title = "Keep the promise",
        notes = "Offline is enough.",
        schedulePrecision = SchedulePrecision.DAY,
        scheduledFor = "2026-08-26",
        createdAt = 1L,
        updatedAt = 2L
    )

    @Test
    fun `encrypted backup round trips`() {
        val payload = GoalflowBackupPayload(
            tasks = listOf(task),
            goals = emptyList(),
            plans = emptyList(),
            habits = listOf(GoalflowHabit(id = "habit-1", title = "Keep habit", createdAt = 3L)),
            outbox = listOf(
                SyncOutboxEntity(
                    mutationId = "00000000-0000-4000-8000-000000000001",
                    deviceId = "device-a",
                    entityType = "tasks",
                    entityId = task.id,
                    baseServerVersion = null,
                    version = 1,
                    payload = GoalflowJson.taskPayload(task).toString(),
                    updatedAt = "2026-08-27T00:00:00Z",
                    deletedAt = null
                )
            ),
            syncMeta = listOf(SyncMetaEntity("tasks:${task.id}", 0, 1, null, null)),
            conflicts = listOf(
                SyncConflictEntity(
                    id = "conflict-1",
                    entityType = "tasks",
                    entityId = task.id,
                    localPayload = GoalflowJson.taskPayload(task).toString(),
                    serverPayload = "{}",
                    serverVersion = 2,
                    createdAt = "2026-08-27T00:00:00Z"
                )
            ),
            ownerUserId = "00000000-0000-4000-8000-000000000001"
        )
        val restored = GoalflowBackup.decrypt(GoalflowBackup.encrypt(payload, PASSWORD), PASSWORD)

        assertEquals(payload, restored)
    }

    @Test
    fun `wrong password and modified ciphertext fail without a payload`() {
        val envelope = GoalflowBackup.encrypt(GoalflowBackupPayload(listOf(task), emptyList(), emptyList()), PASSWORD)
        assertThrows(BackupFormatException::class.java) { GoalflowBackup.decrypt(envelope, "wrong password") }

        val modified = JSONObject(envelope).apply {
            put("ciphertext", optString("ciphertext").dropLast(2) + "aa")
        }.toString()
        assertThrows(BackupFormatException::class.java) { GoalflowBackup.decrypt(modified, PASSWORD) }
    }

    private companion object {
        const val PASSWORD = "correct horse battery staple"
    }
}
