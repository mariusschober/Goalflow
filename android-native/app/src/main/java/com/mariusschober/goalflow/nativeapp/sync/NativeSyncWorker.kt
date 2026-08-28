package com.mariusschober.goalflow.nativeapp.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.ExistingPeriodicWorkPolicy
import com.mariusschober.goalflow.nativeapp.GoalflowApplication
import java.util.concurrent.TimeUnit

class NativeSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val application = applicationContext as GoalflowApplication
        if (!NativeConfig.canUseCloud) return Result.success()
        return runCatching {
            val session = NativeAuthClient(application.sessionStore).currentSession()
            if (session != null) application.syncEngine.synchronize()
        }.fold(
            onSuccess = { Result.success() },
            // Pending Room mutations are never discarded. WorkManager keeps an
            // exponential retry alive through network flapping and restarts.
            onFailure = { Result.retry() }
        )
    }
}

object NativeSyncScheduler {
    private const val WORK_NAME = "goalflow-native-sync"
    private const val PERIODIC_WORK_NAME = "goalflow-native-sync-periodic"

    fun schedule(context: Context) {
        if (!NativeConfig.canUseCloud) return
        val request = OneTimeWorkRequestBuilder<NativeSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
        val periodic = PeriodicWorkRequestBuilder<NativeSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            periodic
        )
    }
}
