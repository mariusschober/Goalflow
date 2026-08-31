package com.mariusschober.goalflow.nativeapp.data

import com.mariusschober.goalflow.nativeapp.domain.DailyPlan
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/** Immutable proof carried by a widget PendingIntent. */
data class NativeWidgetTarget(
    val taskId: String,
    val expectedUpdatedAt: Long,
    val localDate: String,
    val planFingerprint: String,
    /** The open-task version before completion, used to verify widget Undo. */
    val expectedPriorUpdatedAt: Long? = null
)

enum class NativeWidgetAction { COMPLETE, SKIP, UNDO }

class StaleWidgetActionException(message: String) : IllegalStateException(message)

/**
 * Binds the widget action to the queue the user actually saw. A task version
 * alone is insufficient because another task can move ahead without changing
 * the target row.
 */
fun widgetPlanFingerprint(
    localDate: String,
    plan: DailyPlan?,
    queue: List<GoalflowTask>
): String {
    val canonical = buildString {
        append(localDate)
        append('|')
        append(plan?.confirmedAt ?: 0L)
        append('|')
        append(plan?.taskIds?.joinToString(",").orEmpty())
        append('|')
        queue.joinToString(";") { task ->
            listOf(task.id, task.updatedAt, task.status.name, task.plannedOrder).joinToString(":")
        }
    }
    return MessageDigest.getInstance("SHA-256")
        .digest(canonical.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }
}
