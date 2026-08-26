package com.mariusschober.goalflow.nativeapp.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val notes: String,
    val schedulePrecision: String,
    val scheduledFor: String,
    val scheduledTime: String?,
    val plannedOrder: Int,
    val status: String,
    val isFrog: Boolean,
    val beforeFrog: Boolean,
    val frogFailures: Int,
    val source: String,
    val goalId: String?,
    val parentTaskId: String?,
    val habitId: String?,
    val createdAt: Long,
    val updatedAt: Long,
    val completedAt: Long?,
    val deletedAt: Long?
)

@Entity(tableName = "goals")
data class GoalEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String,
    val deadline: String?,
    val completedTasks: Int,
    val color: String,
    val createdAt: Long,
    val excitement: Int?,
    val roi: Int?
)

@Entity(tableName = "daily_plans")
data class DailyPlanEntity(
    @PrimaryKey val localDate: String,
    val confirmedAt: Long,
    val taskIds: String
)

@Entity(tableName = "habits")
data class HabitEntity(
    @PrimaryKey val id: String,
    val title: String,
    val frequency: String,
    val specificDays: String,
    val streak: Int,
    val bestStreak: Int,
    val lastCompletedDate: String?,
    val isHighPriority: Boolean,
    val beforeFrog: Boolean,
    val duration: Int?,
    val goalId: String?,
    val createdAt: Long
)

@Entity(tableName = "sync_outbox")
data class SyncOutboxEntity(
    @PrimaryKey val mutationId: String,
    val deviceId: String,
    val entityType: String,
    val entityId: String,
    val baseServerVersion: Long?,
    val version: Long,
    val payload: String,
    val updatedAt: String,
    val deletedAt: String?
)

@Entity(tableName = "sync_meta")
data class SyncMetaEntity(
    @PrimaryKey val entityType: String,
    val cursor: Long,
    val localVersion: Long,
    val serverVersion: Long?,
    val lastSuccessfulSync: String?
)

@Entity(tableName = "sync_conflicts")
data class SyncConflictEntity(
    @PrimaryKey val id: String,
    val entityType: String,
    val localPayload: String,
    val serverPayload: String,
    val serverVersion: Long,
    val createdAt: String
)

@Dao
interface TaskDao {
    @Query("SELECT * FROM tasks ORDER BY scheduledFor ASC, plannedOrder ASC, createdAt ASC, id ASC")
    fun observeAll(): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks")
    suspend fun getAll(): List<TaskEntity>

    @Query("SELECT COALESCE(MAX(plannedOrder), -1) FROM tasks WHERE scheduledFor = :scheduledFor AND schedulePrecision = :precision")
    suspend fun maxOrder(scheduledFor: String, precision: String): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(task: TaskEntity)

    @Update
    suspend fun update(task: TaskEntity)

    @Update
    suspend fun updateAll(tasks: List<TaskEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(tasks: List<TaskEntity>)

    @Query("DELETE FROM tasks")
    suspend fun deleteAll()
}

@Dao
interface GoalDao {
    @Query("SELECT * FROM goals ORDER BY createdAt ASC, id ASC")
    fun observeAll(): Flow<List<GoalEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(goal: GoalEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(goals: List<GoalEntity>)

    @Query("SELECT * FROM goals")
    suspend fun getAll(): List<GoalEntity>

    @Query("DELETE FROM goals")
    suspend fun deleteAll()
}

@Dao
interface DailyPlanDao {
    @Query("SELECT * FROM daily_plans WHERE localDate = :localDate LIMIT 1")
    fun observe(localDate: String): Flow<DailyPlanEntity?>

    @Query("SELECT * FROM daily_plans WHERE localDate = :localDate LIMIT 1")
    suspend fun get(localDate: String): DailyPlanEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(plan: DailyPlanEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(plans: List<DailyPlanEntity>)

    @Query("SELECT * FROM daily_plans")
    suspend fun getAll(): List<DailyPlanEntity>

    @Query("DELETE FROM daily_plans WHERE localDate = :localDate")
    suspend fun delete(localDate: String)

    @Query("DELETE FROM daily_plans")
    suspend fun deleteAll()
}

@Dao
interface HabitDao {
    @Query("SELECT * FROM habits ORDER BY createdAt ASC, id ASC")
    fun observeAll(): Flow<List<HabitEntity>>

    @Query("SELECT * FROM habits")
    suspend fun getAll(): List<HabitEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(habit: HabitEntity)
}

@Dao
interface SyncOutboxDao {
    @Query("SELECT * FROM sync_outbox ORDER BY version ASC, mutationId ASC")
    suspend fun getAll(): List<SyncOutboxEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(mutation: SyncOutboxEntity)

    @Query("DELETE FROM sync_outbox WHERE mutationId = :mutationId")
    suspend fun delete(mutationId: String)

    @Query("DELETE FROM sync_outbox WHERE entityType = :entityType")
    suspend fun deleteForEntity(entityType: String)
}

@Dao
interface SyncMetaDao {
    @Query("SELECT * FROM sync_meta WHERE entityType = :entityType LIMIT 1")
    suspend fun get(entityType: String): SyncMetaEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(meta: SyncMetaEntity)
}

@Dao
interface SyncConflictDao {
    @Query("SELECT * FROM sync_conflicts ORDER BY createdAt ASC, id ASC")
    fun observeAll(): Flow<List<SyncConflictEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(conflict: SyncConflictEntity)

    @Query("DELETE FROM sync_conflicts WHERE id = :id")
    suspend fun delete(id: String)
}

@Database(
    entities = [
        TaskEntity::class,
        GoalEntity::class,
        DailyPlanEntity::class,
        HabitEntity::class,
        SyncOutboxEntity::class,
        SyncMetaEntity::class,
        SyncConflictEntity::class
    ],
    version = 2,
    exportSchema = false
)
abstract class GoalflowDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun goalDao(): GoalDao
    abstract fun dailyPlanDao(): DailyPlanDao
    abstract fun habitDao(): HabitDao
    abstract fun syncOutboxDao(): SyncOutboxDao
    abstract fun syncMetaDao(): SyncMetaDao
    abstract fun syncConflictDao(): SyncConflictDao

    companion object {
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("CREATE TABLE IF NOT EXISTS habits (id TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, frequency TEXT NOT NULL, specificDays TEXT NOT NULL, streak INTEGER NOT NULL, bestStreak INTEGER NOT NULL, lastCompletedDate TEXT, isHighPriority INTEGER NOT NULL, beforeFrog INTEGER NOT NULL, duration INTEGER, goalId TEXT, createdAt INTEGER NOT NULL)")
                database.execSQL("CREATE TABLE IF NOT EXISTS sync_outbox (mutationId TEXT NOT NULL PRIMARY KEY, deviceId TEXT NOT NULL, entityType TEXT NOT NULL, entityId TEXT NOT NULL, baseServerVersion INTEGER, version INTEGER NOT NULL, payload TEXT NOT NULL, updatedAt TEXT NOT NULL, deletedAt TEXT)")
                database.execSQL("CREATE TABLE IF NOT EXISTS sync_meta (entityType TEXT NOT NULL PRIMARY KEY, cursor INTEGER NOT NULL, localVersion INTEGER NOT NULL, serverVersion INTEGER, lastSuccessfulSync TEXT)")
                database.execSQL("CREATE TABLE IF NOT EXISTS sync_conflicts (id TEXT NOT NULL PRIMARY KEY, entityType TEXT NOT NULL, localPayload TEXT NOT NULL, serverPayload TEXT NOT NULL, serverVersion INTEGER NOT NULL, createdAt TEXT NOT NULL)")
            }
        }

        fun create(context: Context): GoalflowDatabase = Room.databaseBuilder(
            context,
            GoalflowDatabase::class.java,
            "goalflow-native.db"
        ).addMigrations(MIGRATION_1_2).build()
    }
}
