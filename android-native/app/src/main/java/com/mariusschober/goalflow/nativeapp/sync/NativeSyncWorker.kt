package com.mariusschober.goalflow.nativeapp.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.mariusschober.goalflow.nativeapp.GoalflowApplication
import java.util.concurrent.TimeUnit

class NativeSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val application = applicationContext as GoalflowApplication
        if (!NativeConfig.canUseCloud) return Result.success()
        return runCatching {
            NativeAuthClient(application.sessionStore).currentSession()
            NativeSyncEngine(application.repository, application.sessionStore).synchronize()
        }.fold(
            onSuccess = { Result.success() },
            onFailure = { if (runAttemptCount < 5) Result.retry() else Result.failure() }
        )
    }
}

object NativeSyncScheduler {
    private const val WORK_NAME = "goalflow-native-sync"

    fun schedule(context: Context) {
        if (!NativeConfig.canUseCloud) return
        val request = OneTimeWorkRequestBuilder<NativeSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }
}
