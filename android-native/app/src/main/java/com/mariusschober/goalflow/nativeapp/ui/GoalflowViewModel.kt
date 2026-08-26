package com.mariusschober.goalflow.nativeapp.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.mariusschober.goalflow.nativeapp.data.GoalflowRepository
import com.mariusschober.goalflow.nativeapp.domain.BreakdownChild
import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.PlanningGate
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDate

class GoalflowViewModel(private val repository: GoalflowRepository) : ViewModel() {
    private val _today = MutableStateFlow(LocalDate.now().toString())
    val today: StateFlow<String> = _today.asStateFlow()

    val tasks: StateFlow<List<GoalflowTask>> = repository.taskStream.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList()
    )

    val goals: StateFlow<List<GoalflowGoal>> = repository.goalStream.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        emptyList()
    )

    val planningGate: StateFlow<PlanningGate> = today.flatMapLatest { date ->
        combine(tasks, repository.planStream(date)) { allTasks, plan ->
            com.mariusschober.goalflow.nativeapp.domain.planningGate(allTasks, date, plan)
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PlanningGate.Empty)

    val currentTask: StateFlow<GoalflowTask?> = planningGate.map { gate ->
        (gate as? PlanningGate.Ready)?.queue?.firstOrNull()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val completing = mutableSetOf<String>()

    init {
        viewModelScope.launch {
            while (isActive) {
                delay(60_000)
                _today.value = LocalDate.now().toString()
            }
        }
    }

    fun createTask(
        title: String,
        notes: String,
        precision: SchedulePrecision,
        scheduledFor: String,
        scheduledTime: String?,
        isFrog: Boolean,
        onComplete: () -> Unit
    ) {
        viewModelScope.launch {
            clearError()
            runCatching {
                repository.createTask(title, notes, precision, scheduledFor, scheduledTime, isFrog)
            }.onSuccess {
                _notice.value = "Commitment captured locally"
                onComplete()
            }.onFailure { failure ->
                _error.value = failure.message ?: "The task could not be saved."
            }
        }
    }

    fun completeTask(task: GoalflowTask) {
        if (!completing.add(task.id)) return
        viewModelScope.launch {
            clearError()
            runCatching { repository.completeTask(task.id) }
                .onSuccess { _notice.value = "Done. Keep going." }
                .onFailure { failure -> _error.value = failure.message ?: "The task could not be completed." }
            completing.remove(task.id)
        }
    }

    fun dropTask(task: GoalflowTask) {
        viewModelScope.launch {
            clearError()
            runCatching { repository.dropTask(task.id) }
                .onSuccess { _notice.value = "Commitment dropped explicitly" }
                .onFailure { failure -> _error.value = failure.message ?: "The commitment could not be dropped." }
        }
    }

    fun breakDownTask(task: GoalflowTask, children: List<BreakdownChild>, onComplete: () -> Unit) {
        viewModelScope.launch {
            clearError()
            runCatching { repository.breakDownTask(task.id, children) }
                .onSuccess {
                    _notice.value = "Broken down into next actions"
                    onComplete()
                }
                .onFailure { failure -> _error.value = failure.message ?: "The commitment could not be broken down." }
        }
    }

    fun rescheduleTask(task: GoalflowTask, scheduledFor: String) {
        viewModelScope.launch {
            clearError()
            runCatching { repository.rescheduleTask(task.id, scheduledFor) }
                .onSuccess { _notice.value = "Day saved locally" }
                .onFailure { failure -> _error.value = failure.message ?: "The task could not be rescheduled." }
        }
    }

    fun moveTask(localDate: String, taskId: String, direction: Int) {
        viewModelScope.launch {
            clearError()
            val queue = com.mariusschober.goalflow.nativeapp.domain.buildTodayQueue(tasks.value, localDate)
            val currentIndex = queue.indexOfFirst { it.id == taskId }
            val targetIndex = currentIndex + direction
            if (currentIndex < 0 || targetIndex !in queue.indices) return@launch
            val ordered = queue.map { it.id }.toMutableList()
            val moved = ordered.removeAt(currentIndex)
            ordered.add(targetIndex, moved)
            runCatching { repository.reorderToday(localDate, ordered) }
                .onSuccess { _notice.value = "Order saved locally" }
                .onFailure { failure -> _error.value = failure.message ?: "The order could not be saved." }
        }
    }

    fun confirmPlan(localDate: String, orderedIds: List<String>) {
        viewModelScope.launch {
            clearError()
            runCatching { repository.confirmPlan(localDate, orderedIds) }
                .onSuccess { _notice.value = "Plan confirmed" }
                .onFailure { failure -> _error.value = failure.message ?: "The plan changed. Review it again." }
        }
    }

    fun createGoal(name: String, description: String, onComplete: () -> Unit) {
        viewModelScope.launch {
            clearError()
            runCatching { repository.createGoal(name, description) }
                .onSuccess {
                    _notice.value = "Direction saved locally"
                    onComplete()
                }
                .onFailure { failure -> _error.value = failure.message ?: "The goal could not be saved." }
        }
    }

    fun clearNotice() { _notice.value = null }
    fun clearError() { _error.value = null }
}

class GoalflowViewModelFactory(private val repository: GoalflowRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(GoalflowViewModel::class.java))
        return GoalflowViewModel(repository) as T
    }
}
