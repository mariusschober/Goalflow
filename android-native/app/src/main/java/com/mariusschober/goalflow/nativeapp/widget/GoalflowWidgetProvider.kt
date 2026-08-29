package com.mariusschober.goalflow.nativeapp.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.mariusschober.goalflow.nativeapp.GOALFLOW_CAPTURE_ACTION
import com.mariusschober.goalflow.nativeapp.GoalflowApplication
import com.mariusschober.goalflow.nativeapp.MainActivity
import com.mariusschober.goalflow.nativeapp.R
import com.mariusschober.goalflow.nativeapp.data.NativeWidgetSnapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

private const val WIDGET_ACTION = "com.mariusschober.goalflow.WIDGET_ACTION"
private const val EXTRA_ACTION = "goalflow_widget_action"
private const val ACTION_COMPLETE = "complete"
private const val ACTION_DROP = "drop"
private const val ACTION_SKIP = "skip"
private const val ACTION_ADD = "add"

class GoalflowWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        GoalflowWidgetUpdater.refresh(context)
    }

    override fun onReceive(context: Context, intent: Intent?) {
        super.onReceive(context, intent)
        if (intent?.action != WIDGET_ACTION) return
        val pendingResult = goAsync()
        val action = intent.getStringExtra(EXTRA_ACTION)
        widgetScope.launch {
            try {
                val application = context.applicationContext as GoalflowApplication
                val snapshot = application.repository.widgetSnapshot()
                val task = snapshot.currentTask
                when (action) {
                    ACTION_COMPLETE -> task?.let {
                        application.repository.completeTask(it.id)
                        application.soundController.playCompletion(it.isFrog)
                    }
                    ACTION_DROP -> task?.let { application.repository.dropTask(it.id) }
                    ACTION_SKIP -> task?.let { application.repository.skipTask(it.id) }
                }
            } catch (_: Exception) {
                // The local app remains authoritative. A failed widget action
                // is intentionally not reported as success; the next refresh
                // restores the actual Room state.
            } finally {
                GoalflowWidgetUpdater.refresh(context)
                pendingResult.finish()
            }
        }
    }

    companion object {
        internal fun actionPendingIntent(context: Context, action: String): PendingIntent {
            val intent = Intent(context, GoalflowWidgetProvider::class.java)
                .setAction(WIDGET_ACTION)
                .putExtra(EXTRA_ACTION, action)
            return PendingIntent.getBroadcast(
                context,
                action.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        internal fun addPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, MainActivity::class.java)
                .setAction(GOALFLOW_CAPTURE_ACTION)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            return PendingIntent.getActivity(
                context,
                ACTION_ADD.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }
}

object GoalflowWidgetUpdater {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun refresh(context: Context) {
        val appContext = context.applicationContext
        val manager = AppWidgetManager.getInstance(appContext)
        val component = ComponentName(appContext, GoalflowWidgetProvider::class.java)
        val ids = manager.getAppWidgetIds(component)
        if (ids.isEmpty()) return
        scope.launch {
            val application = appContext as GoalflowApplication
            render(manager, ids, appContext, application.repository.widgetSnapshot())
        }
    }

    private fun render(
        manager: AppWidgetManager,
        ids: IntArray,
        context: Context,
        snapshot: NativeWidgetSnapshot
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_goalflow)
        val total = snapshot.plannedCount
        val completed = snapshot.completedCount.coerceIn(0, total.coerceAtLeast(1))
        views.setTextViewText(R.id.widget_done_count, completed.toString())
        views.setTextViewText(R.id.widget_total_count, total.toString())
        views.setProgressBar(
            R.id.widget_progress,
            total.coerceAtLeast(1),
            completed,
            false
        )
        views.setTextViewText(
            R.id.widget_current_task,
            snapshot.currentTask?.title ?: "Nothing scheduled right now"
        )
        views.setContentDescription(
            R.id.widget_current_task,
            snapshot.currentTask?.title ?: "Nothing scheduled right now"
        )
        views.setOnClickPendingIntent(
            R.id.widget_complete,
            GoalflowWidgetProvider.actionPendingIntent(context, ACTION_COMPLETE)
        )
        views.setOnClickPendingIntent(
            R.id.widget_drop,
            GoalflowWidgetProvider.actionPendingIntent(context, ACTION_DROP)
        )
        views.setOnClickPendingIntent(
            R.id.widget_skip,
            GoalflowWidgetProvider.actionPendingIntent(context, ACTION_SKIP)
        )
        views.setOnClickPendingIntent(
            R.id.widget_add,
            GoalflowWidgetProvider.addPendingIntent(context)
        )
        manager.updateAppWidget(ids, views)
    }
}

private val widgetScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
