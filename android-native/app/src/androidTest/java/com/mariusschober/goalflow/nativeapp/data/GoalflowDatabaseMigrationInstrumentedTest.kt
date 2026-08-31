package com.mariusschober.goalflow.nativeapp.data

import android.content.Context
import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GoalflowDatabaseMigrationInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = instrumentation.targetContext

    @get:Rule
    val migrationHelper = MigrationTestHelper(
        instrumentation,
        GoalflowDatabase::class.java
    )

    @Test
    fun migrateEverySupportedVersionWithoutDestructiveFallback() = runBlocking {
        for (startVersion in 1..7) {
            val databaseName = "goalflow-migration-$startVersion.db"
            context.deleteDatabase(databaseName)
            migrationHelper.createDatabase(databaseName, startVersion).apply {
                execSQL(
                    "INSERT INTO tasks (id,title,notes,schedulePrecision,scheduledFor,scheduledTime,plannedOrder,status,isFrog,beforeFrog,frogFailures,source,goalId,parentTaskId,habitId,createdAt,updatedAt,completedAt,deletedAt" +
                        if (startVersion >= 4) ",extraJson)" else ")" +
                        " VALUES ('task-$startVersion','Keep this task','','DAY','2026-08-27',NULL,0,'OPEN',0,0,0,'MANUAL',NULL,NULL,NULL,1,1,NULL,NULL" +
                        if (startVersion >= 4) ",'{}')" else ")"
                )
                execSQL("INSERT INTO daily_plans (localDate,confirmedAt,taskIds) VALUES ('2026-08-27',1,'task-$startVersion')")
                if (startVersion >= 2) {
                    execSQL(
                        "INSERT INTO sync_outbox (mutationId,deviceId,entityType,entityId,baseServerVersion,version,payload,updatedAt,deletedAt" +
                            if (startVersion >= 3) ",dependsOnMutationId,resolvesConflictId,attemptedAt)" else ")" +
                            " VALUES ('00000000-0000-4000-8000-00000000000$startVersion','device-a','tasks','task-$startVersion',NULL,1,'{}','2026-08-27T00:00:00Z',NULL" +
                            if (startVersion >= 3) ",NULL,NULL,NULL)" else ")"
                    )
                    execSQL("INSERT INTO sync_meta (entityType,cursor,localVersion,serverVersion,lastSuccessfulSync) VALUES ('tasks:task-$startVersion',0,1,NULL,NULL)")
                    execSQL(
                        "INSERT INTO sync_conflicts (id,entityType,localPayload,serverPayload,serverVersion,createdAt" +
                            if (startVersion >= 3) ",entityId,mutationId,localDeletedAt,localHistory,serverDeletedAt,status)" else ")" +
                            " VALUES ('conflict-$startVersion','tasks','{}','{}',2,'2026-08-27T00:00:00Z'" +
                            if (startVersion >= 3) ",'task-$startVersion',NULL,NULL,'[]',NULL,'unresolved')" else ")"
                    )
                }
                if (startVersion >= 5) {
                    execSQL("INSERT INTO raw_collections (entityType,payload,updatedAt,deletedAt) VALUES ('stats','{}','2026-08-27T00:00:00Z',NULL)")
                }
                if (startVersion >= 6) {
                    execSQL("INSERT INTO task_events (id,taskId,eventType,localDate,metadata,createdAt) VALUES ('event-$startVersion','task-$startVersion','completed','2026-08-27','{}',1000)")
                    execSQL("INSERT INTO local_account (bindingKey,userId) VALUES ('singleton','00000000-0000-4000-8000-0000000000$startVersion')")
                }
                version = startVersion
                close()
            }

            val migrated = Room.databaseBuilder(context, GoalflowDatabase::class.java, databaseName)
                .addMigrations(*GoalflowDatabase.migrations())
                .build()
            try {
                migrated.openHelper.writableDatabase
                // Valuable rows
                assertEquals("Keep this task", migrated.taskDao().get("task-$startVersion")?.title)
                assertNotNull(migrated.dailyPlanDao().get("2026-08-27"))
                // Outbox
                if (startVersion >= 2) {
                    val outbox = migrated.syncOutboxDao().getAll()
                    assertEquals(1, outbox.size)
                    assertEquals("00000000-0000-4000-8000-0000000000$startVersion", outbox.single().mutationId)
                } else {
                    assertEquals(0, migrated.syncOutboxDao().getAll().size)
                }
                // Conflicts
                if (startVersion >= 2) {
                    val conflicts = migrated.syncConflictDao().getAll()
                    assertEquals(1, conflicts.size)
                    assertEquals("task-$startVersion", conflicts.single().entityId)
                    assertEquals("unresolved", conflicts.single().status)
                } else {
                    assertEquals(0, migrated.syncConflictDao().getAll().size)
                }
                // Events
                if (startVersion >= 6) {
                    assertEquals(1, migrated.taskEventDao().getAll().size)
                    assertEquals("event-$startVersion", migrated.taskEventDao().getAll().single().id)
                } else {
                    assertEquals(0, migrated.taskEventDao().getAll().size)
                    // Verify table is writable post-migration
                    migrated.taskEventDao().insert(
                        TaskEventEntity("event-$startVersion-new", "task-$startVersion", "completed", "2026-08-27", "{}", 2000)
                    )
                    assertEquals(1, migrated.taskEventDao().getAll().size)
                }
                // Account binding
                if (startVersion >= 6) {
                    val account = migrated.localAccountDao().get()
                    assertNotNull(account)
                    assertEquals("00000000-0000-4000-8000-0000000000$startVersion", account!!.userId)
                } else {
                    assertEquals(null, migrated.localAccountDao().get())
                    migrated.localAccountDao().insert(LocalAccountEntity(userId = "00000000-0000-4000-8000-000000000001"))
                    assertEquals("00000000-0000-4000-8000-000000000001", migrated.localAccountDao().get()?.userId)
                    migrated.localAccountDao().clear()
                }
                if (startVersion >= 5) assertEquals("{}", migrated.rawCollectionDao().get("stats")?.payload)
                // Verify 7->8 indices exist
                migrated.openHelper.readableDatabase.query("SELECT name FROM sqlite_master WHERE type='index' AND name='index_tasks_scheduledFor_schedulePrecision_status_deletedAt'").use { c ->
                    assertEquals(true, c.count > 0)
                }
            } finally {
                migrated.close()
                context.deleteDatabase(databaseName)
            }
        }
    }
}
