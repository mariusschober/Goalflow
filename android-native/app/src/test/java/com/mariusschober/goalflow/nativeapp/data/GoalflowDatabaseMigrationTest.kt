package com.mariusschober.goalflow.nativeapp.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GoalflowDatabaseMigrationTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Before
    fun createVersionTwoDatabase() {
        context.deleteDatabase(DATABASE_NAME)
        context.openOrCreateDatabase(DATABASE_NAME, Context.MODE_PRIVATE, null).use { database ->
            versionTwoSchema.forEach(database::execSQL)
            database.execSQL(
                "INSERT INTO tasks (id,title,notes,schedulePrecision,scheduledFor,scheduledTime,plannedOrder,status,isFrog,beforeFrog,frogFailures,source,goalId,parentTaskId,habitId,createdAt,updatedAt,completedAt,deletedAt) " +
                    "VALUES ('task-1','Preserve me','','DAY','2026-08-27',NULL,0,'OPEN',0,0,0,'MANUAL',NULL,NULL,NULL,1,1,NULL,NULL)"
            )
            database.execSQL(
                "INSERT INTO sync_outbox (mutationId,deviceId,entityType,entityId,baseServerVersion,version,payload,updatedAt,deletedAt) " +
                    "VALUES ('mutation-1','device-a','tasks','task-1',NULL,1,'{\"id\":\"task-1\"}','2026-08-27T00:00:00Z',NULL)"
            )
            database.execSQL(
                "INSERT INTO sync_conflicts (id,entityType,localPayload,serverPayload,serverVersion,createdAt) " +
                    "VALUES ('conflict-1','tasks','{}','{}',2,'2026-08-27T00:00:00Z')"
            )
            database.version = 2
        }
    }

    @After
    fun cleanUp() {
        context.deleteDatabase(DATABASE_NAME)
    }

    @Test
    fun `migration 2 to 4 is additive and preserves tasks and pending mutations`() = runTest {
        val database = GoalflowDatabase.create(context)
        try {
            assertEquals("Preserve me", database.taskDao().get("task-1")?.title)
            val pending = database.syncOutboxDao().getAll().single()
            assertEquals("mutation-1", pending.mutationId)
            assertNull(pending.dependsOnMutationId)
            assertNull(pending.attemptedAt)
            val conflict = database.syncConflictDao().getAll().single()
            assertEquals("singleton", conflict.entityId)
            assertEquals("[]", conflict.localHistory)
            assertEquals("unresolved", conflict.status)
            assertNull(database.localAccountDao().get())
        } finally {
            database.close()
        }
    }

    private companion object {
        const val DATABASE_NAME = "goalflow-native.db"

        val versionTwoSchema = listOf(
            "CREATE TABLE tasks (id TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL, schedulePrecision TEXT NOT NULL, scheduledFor TEXT NOT NULL, scheduledTime TEXT, plannedOrder INTEGER NOT NULL, status TEXT NOT NULL, isFrog INTEGER NOT NULL, beforeFrog INTEGER NOT NULL, frogFailures INTEGER NOT NULL, source TEXT NOT NULL, goalId TEXT, parentTaskId TEXT, habitId TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, completedAt INTEGER, deletedAt INTEGER)",
            "CREATE TABLE goals (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, deadline TEXT, completedTasks INTEGER NOT NULL, color TEXT NOT NULL, createdAt INTEGER NOT NULL, excitement INTEGER, roi INTEGER)",
            "CREATE TABLE daily_plans (localDate TEXT NOT NULL PRIMARY KEY, confirmedAt INTEGER NOT NULL, taskIds TEXT NOT NULL)",
            "CREATE TABLE habits (id TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, frequency TEXT NOT NULL, specificDays TEXT NOT NULL, streak INTEGER NOT NULL, bestStreak INTEGER NOT NULL, lastCompletedDate TEXT, isHighPriority INTEGER NOT NULL, beforeFrog INTEGER NOT NULL, duration INTEGER, goalId TEXT, createdAt INTEGER NOT NULL)",
            "CREATE TABLE sync_outbox (mutationId TEXT NOT NULL PRIMARY KEY, deviceId TEXT NOT NULL, entityType TEXT NOT NULL, entityId TEXT NOT NULL, baseServerVersion INTEGER, version INTEGER NOT NULL, payload TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT)",
            "CREATE TABLE sync_meta (entityType TEXT NOT NULL PRIMARY KEY, cursor INTEGER NOT NULL, localVersion INTEGER NOT NULL, serverVersion INTEGER, lastSuccessfulSync TEXT)",
            "CREATE TABLE sync_conflicts (id TEXT NOT NULL PRIMARY KEY, entityType TEXT NOT NULL, localPayload TEXT NOT NULL, serverPayload TEXT NOT NULL, serverVersion INTEGER NOT NULL, createdAt TEXT NOT NULL)"
        )
    }
}
