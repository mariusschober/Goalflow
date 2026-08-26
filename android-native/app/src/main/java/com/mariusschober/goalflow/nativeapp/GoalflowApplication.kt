package com.mariusschober.goalflow.nativeapp

import android.app.Application
import com.mariusschober.goalflow.nativeapp.data.GoalflowDatabase
import com.mariusschober.goalflow.nativeapp.data.GoalflowRepository
import com.mariusschober.goalflow.nativeapp.sync.NativeSyncScheduler
import com.mariusschober.goalflow.nativeapp.sync.SecureSessionStore
import java.util.UUID

class GoalflowApplication : Application() {
    val database: GoalflowDatabase by lazy { GoalflowDatabase.create(this) }
    private val preferences by lazy { getSharedPreferences("goalflow-native", MODE_PRIVATE) }
    val deviceId: String by lazy {
        preferences.getString("device_id", null) ?: UUID.randomUUID().toString().also { created ->
            preferences.edit().putString("device_id", created).apply()
        }
    }
    val sessionStore: SecureSessionStore by lazy { SecureSessionStore(this) }
    val repository: GoalflowRepository by lazy {
        GoalflowRepository(database, deviceId) {
            runCatching { NativeSyncScheduler.schedule(this) }
        }
    }
}
