package com.mariusschober.goalflow.nativeapp.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

private val Context.goalflowUiDataStore by preferencesDataStore(name = "goalflow-native-ui")

/** Durable, non-product UI preferences. Product state remains in Room. */
class GoalflowPreferences(private val context: Context) {
    val capturePromptSeen: Flow<Boolean> = context.goalflowUiDataStore.data
        .catch { emit(emptyPreferences()) }
        .map { preferences -> preferences[CAPTURE_PROMPT_SEEN] ?: false }
        .distinctUntilChanged()

    suspend fun markCapturePromptSeen() {
        context.goalflowUiDataStore.edit { preferences ->
            preferences[CAPTURE_PROMPT_SEEN] = true
        }
    }

    private companion object {
        val CAPTURE_PROMPT_SEEN = booleanPreferencesKey("capture_prompt_seen")
    }
}
