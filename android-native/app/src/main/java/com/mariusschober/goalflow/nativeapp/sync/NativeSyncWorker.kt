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
import com.mariusschober.goalflow.nativeapp.widget.GoalflowWidgetUpdater
import java.io.IOException
import java.util.concurrent.TimeUnit

internal enum class NativeSyncFailureDisposition { RETRY, STOP }

internal fun nativeSyncFailureDisposition(error: Throwable, runAttemptCount: Int): NativeSyncFailureDisposition =
    if (error is IOException && runAttemptCount < 5) NativeSyncFailureDisposition.RETRY
    else NativeSyncFailureDisposition.STOP

class NativeSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val application = applicationContext as GoalflowApplication
        if (!NativeConfig.canUseCloud) return Result.success()
        return runCatching {
            val session = NativeAuthClient(application.sessionStore).currentSession()
            if (session != null) application.syncEngine.synchronize()
        }.fold(
            onSuccess = {
                // A pull can change the current task without any foreground
                // activity. Keep the home-screen surface truthful as well.
                GoalflowWidgetUpdater.refresh(application)
                Result.success()
            },
            // Pending Room mutations are never discarded. Transient failures
            // have a finite WorkManager budget; periodic work can resume later.
            onFailure = { error ->
                GoalflowWidgetUpdater.refresh(application)
                if (error is AuthenticationExpiredDuringSync) {
                    // A revoked/disabled session is permanent until the user
                    // authenticates again. Local Room state and outbox remain.
                    runCatching { application.sessionStore.clear() }
                }
                when (nativeSyncFailureDisposition(error, runAttemptCount)) {
                    NativeSyncFailureDisposition.RETRY -> Result.retry()
                    NativeSyncFailureDisposition.STOP -> Result.failure()
                }
            }
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
