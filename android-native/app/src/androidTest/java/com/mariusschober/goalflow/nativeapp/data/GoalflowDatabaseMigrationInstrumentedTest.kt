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
        for (startVersion in 1..6) {
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
                version = startVersion
                close()
            }

            val migrated = Room.databaseBuilder(context, GoalflowDatabase::class.java, databaseName)
                .addMigrations(*GoalflowDatabase.migrations())
                .build()
            try {
                migrated.openHelper.writableDatabase
                assertEquals("Keep this task", migrated.taskDao().get("task-$startVersion")?.title)
                assertNotNull(migrated.dailyPlanDao().get("2026-08-27"))
                if (startVersion >= 2) {
                    assertEquals(1, migrated.syncOutboxDao().getAll().size)
                    assertEquals(1, migrated.syncConflictDao().getAll().size)
                }
                if (startVersion >= 5) assertEquals("{}", migrated.rawCollectionDao().get("stats")?.payload)
                assertEquals(0, migrated.taskEventDao().getAll().size)
                assertEquals(null, migrated.localAccountDao().get())
            } finally {
                migrated.close()
                context.deleteDatabase(databaseName)
            }
        }
    }
}
