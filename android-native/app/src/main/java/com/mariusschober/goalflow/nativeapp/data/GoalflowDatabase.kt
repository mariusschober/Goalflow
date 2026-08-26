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
}

@Dao
interface GoalDao {
    @Query("SELECT * FROM goals ORDER BY createdAt ASC, id ASC")
    fun observeAll(): Flow<List<GoalEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(goal: GoalEntity)
}

@Dao
interface DailyPlanDao {
    @Query("SELECT * FROM daily_plans WHERE localDate = :localDate LIMIT 1")
    fun observe(localDate: String): Flow<DailyPlanEntity?>

    @Query("SELECT * FROM daily_plans WHERE localDate = :localDate LIMIT 1")
    suspend fun get(localDate: String): DailyPlanEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(plan: DailyPlanEntity)

    @Query("DELETE FROM daily_plans WHERE localDate = :localDate")
    suspend fun delete(localDate: String)
}

@Database(
    entities = [TaskEntity::class, GoalEntity::class, DailyPlanEntity::class],
    version = 1,
    exportSchema = false
)
abstract class GoalflowDatabase : RoomDatabase() {
    abstract fun taskDao(): TaskDao
    abstract fun goalDao(): GoalDao
    abstract fun dailyPlanDao(): DailyPlanDao

    companion object {
        fun create(context: Context): GoalflowDatabase = Room.databaseBuilder(
            context,
            GoalflowDatabase::class.java,
            "goalflow-native.db"
        ).build()
    }
}
