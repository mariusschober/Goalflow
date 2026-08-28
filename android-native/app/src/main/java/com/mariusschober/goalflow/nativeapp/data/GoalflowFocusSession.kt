package com.mariusschober.goalflow.nativeapp.data

import android.content.Context

data class NativeFocusSession(
    val taskId: String,
    val startedAtMillis: Long
)

/**
 * Keeps the one active focus session recoverable across backgrounding and
 * process death. The commitment itself remains authoritative in Room; this
 * store only remembers the timer anchor.
 */
class GoalflowFocusSessionStore(context: Context) {
    private val preferences = context.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun read(): NativeFocusSession? {
        val taskId = preferences.getString(KEY_TASK_ID, null)?.trim().orEmpty()
        val startedAt = preferences.getLong(KEY_STARTED_AT, 0L)
        return if (taskId.isNotBlank() && startedAt > 0L) {
            NativeFocusSession(taskId, startedAt)
        } else {
            null
        }
    }

    @Synchronized
    fun beginOrResume(taskId: String, now: Long = System.currentTimeMillis()): NativeFocusSession {
        require(taskId.isNotBlank()) { "A focus session needs a commitment." }
        val existing = read()
        if (existing?.taskId == taskId) return existing
        val session = NativeFocusSession(taskId, now.coerceAtLeast(1L))
        check(
            preferences.edit()
                .putString(KEY_TASK_ID, session.taskId)
                .putLong(KEY_STARTED_AT, session.startedAtMillis)
                .commit()
        ) { "The focus session could not be stored durably." }
        check(read() == session) { "The focus session failed read-back verification." }
        return session
    }

    @Synchronized
    fun clear() {
        check(preferences.edit().remove(KEY_TASK_ID).remove(KEY_STARTED_AT).commit()) {
            "The focus session could not be cleared durably."
        }
    }

    private companion object {
        const val STORE_NAME = "goalflow-native-focus"
        const val KEY_TASK_ID = "task_id"
        const val KEY_STARTED_AT = "started_at"
    }
}
