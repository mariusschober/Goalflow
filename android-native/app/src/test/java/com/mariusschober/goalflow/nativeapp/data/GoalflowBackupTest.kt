package com.mariusschober.goalflow.nativeapp.data

import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
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
        val payload = GoalflowBackupPayload(listOf(task), emptyList(), emptyList())
        val restored = GoalflowBackup.decrypt(GoalflowBackup.encrypt(payload, PASSWORD), PASSWORD)

        assertEquals(payload.tasks, restored.tasks)
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
