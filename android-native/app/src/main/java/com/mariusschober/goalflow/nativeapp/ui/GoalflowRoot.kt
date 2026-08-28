package com.mariusschober.goalflow.nativeapp.ui

import android.net.Uri
import android.view.HapticFeedbackConstants
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material.icons.rounded.Timeline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mariusschober.goalflow.nativeapp.GoalflowApplication
import com.mariusschober.goalflow.nativeapp.R
import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
import com.mariusschober.goalflow.nativeapp.domain.GoalflowCircadianState
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.BreakdownChild
import com.mariusschober.goalflow.nativeapp.domain.PlanningGate
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import com.mariusschober.goalflow.nativeapp.data.BackupFormatException
import com.mariusschober.goalflow.nativeapp.data.NATIVE_RAW_COLLECTION_TYPES
import com.mariusschober.goalflow.nativeapp.sync.NativeAuthClient
import com.mariusschober.goalflow.nativeapp.sync.NativeConfig
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlin.math.ceil
import androidx.compose.foundation.layout.RowScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private enum class RootDestination(val label: String) {
    CURRENT("Current"),
    PLANNING("Planning"),
    HABITS("Habits"),
    GOALS("Goals"),
    INSIGHTS("Insights"),
    SETTINGS("Settings")
}

private val primaryDestinations = listOf(
    RootDestination.CURRENT,
    RootDestination.PLANNING,
    RootDestination.HABITS,
    RootDestination.GOALS,
    RootDestination.SETTINGS
)

@Composable
fun GoalflowRoot(
    externalCaptureText: String? = null,
    externalCaptureRequest: Int = 0,
    onExternalCaptureConsumed: () -> Unit = {}
) {
    val application = LocalContext.current.applicationContext as GoalflowApplication
    val context = LocalContext.current
    val localView = LocalView.current
    val scope = rememberCoroutineScope()
    val goalflowViewModel: GoalflowViewModel = viewModel(
        factory = GoalflowViewModelFactory(application.repository, application.syncEngine)
    )
    val tasks by goalflowViewModel.tasks.collectAsStateWithLifecycle()
    val goals by goalflowViewModel.goals.collectAsStateWithLifecycle()
    val habits by goalflowViewModel.habits.collectAsStateWithLifecycle()
    val stats by goalflowViewModel.stats.collectAsStateWithLifecycle()
    val progress by goalflowViewModel.progress.collectAsStateWithLifecycle()
    val circadian by goalflowViewModel.circadian.collectAsStateWithLifecycle()
    val trueNorth by goalflowViewModel.trueNorth.collectAsStateWithLifecycle()
    val amalgam by goalflowViewModel.amalgam.collectAsStateWithLifecycle()
    val today by goalflowViewModel.today.collectAsStateWithLifecycle()
    val gate by goalflowViewModel.planningGate.collectAsStateWithLifecycle()
    val currentTask by goalflowViewModel.currentTask.collectAsStateWithLifecycle()
    val notice by goalflowViewModel.notice.collectAsStateWithLifecycle()
    val error by goalflowViewModel.error.collectAsStateWithLifecycle()
    val conflicts by goalflowViewModel.conflicts.collectAsStateWithLifecycle()
    val undoTaskId by goalflowViewModel.undoTaskId.collectAsStateWithLifecycle()
    val reorderUndo by goalflowViewModel.reorderUndo.collectAsStateWithLifecycle()
    val capturePromptSeen by application.preferences.capturePromptSeen.collectAsStateWithLifecycle(
        initialValue = null
    )
    val sandboxAccessGranted by application.preferences.sandboxAccessGranted.collectAsStateWithLifecycle(
        initialValue = !NativeConfig.isSandboxBuild
    )

    if (NativeConfig.isSandboxBuild && !sandboxAccessGranted) {
        GoalflowTheme {
            GoalflowSandboxGate(
                onGranted = {
                    scope.launch { application.preferences.markSandboxAccessGranted() }
                }
            )
        }
        return
    }

    var destination by rememberSaveable { mutableStateOf(RootDestination.CURRENT) }
    var captureOpen by rememberSaveable { mutableStateOf(false) }
    var captureSeed by rememberSaveable { mutableStateOf("") }
    var captureFormKey by rememberSaveable { mutableStateOf(0) }
    var capturePromptLoaded by rememberSaveable { mutableStateOf(false) }
    var datePickerForTask by remember { mutableStateOf<GoalflowTask?>(null) }
    var editTask by remember { mutableStateOf<GoalflowTask?>(null) }
    var backupAction by rememberSaveable { mutableStateOf<String?>(null) }
    var backupError by rememberSaveable { mutableStateOf<String?>(null) }
    var signInOpen by rememberSaveable { mutableStateOf(false) }
    var circadianOpen by rememberSaveable { mutableStateOf(false) }
    var focusTask by remember { mutableStateOf<GoalflowTask?>(null) }
    var focusStartedAt by remember { mutableStateOf<Long?>(null) }
    var sessionActive by remember { mutableStateOf(application.sessionStore.read() != null) }
    var breakdownTask by remember { mutableStateOf<GoalflowTask?>(null) }
    var pendingExportPassword by remember { mutableStateOf<String?>(null) }
    var pendingImportUri by remember { mutableStateOf<Uri?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(tasks) {
        val storedFocus = application.focusSessionStore.read() ?: return@LaunchedEffect
        val storedTask = tasks.firstOrNull { it.id == storedFocus.taskId }
        if (storedTask == null || storedTask.status.name != "OPEN" || storedTask.deletedAt != null) {
            application.focusSessionStore.clear()
            if (focusTask?.id == storedFocus.taskId) {
                focusTask = null
                focusStartedAt = null
            }
        } else if (focusTask == null) {
            focusStartedAt = storedFocus.startedAtMillis
            focusTask = storedTask
        }
    }

    fun closeCapture() {
        scope.launch { application.preferences.markCapturePromptSeen() }
        captureSeed = ""
        captureOpen = false
    }

    fun openCapture(initialTitle: String = "") {
        captureSeed = initialTitle
        captureFormKey += 1
        captureOpen = true
    }

    LaunchedEffect(externalCaptureRequest) {
        if (externalCaptureRequest > 0) {
            openCapture(externalCaptureText.orEmpty())
            onExternalCaptureConsumed()
        }
    }

    LaunchedEffect(capturePromptSeen) {
        if (!capturePromptLoaded && capturePromptSeen != null) {
            if (capturePromptSeen == false && externalCaptureRequest == 0) openCapture()
            capturePromptLoaded = true
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                sessionActive = application.sessionStore.read() != null
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    BackHandler(enabled = destination != RootDestination.CURRENT && !captureOpen && editTask == null &&
        datePickerForTask == null && breakdownTask == null && backupAction == null && !signInOpen) {
        destination = if (destination == RootDestination.INSIGHTS) RootDestination.GOALS else RootDestination.CURRENT
    }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val password = pendingExportPassword
        pendingExportPassword = null
        if (uri != null && password != null) {
            scope.launch {
                try {
                    val backup = application.repository.exportBackup(password)
                    context.contentResolver.openOutputStream(uri)?.use { stream ->
                        stream.write(backup.toByteArray(Charsets.UTF_8))
                    } ?: throw IllegalStateException("The backup file could not be opened.")
                    snackbarHostState.showSnackbar("Encrypted backup exported")
                } catch (error: Exception) {
                    snackbarHostState.showSnackbar(error.message ?: "Backup export failed")
                }
            }
        }
    }

    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            pendingImportUri = uri
            backupError = null
            backupAction = "import"
        }
    }

    LaunchedEffect(notice) {
        notice?.let {
            snackbarHostState.showSnackbar(it)
            goalflowViewModel.clearNotice()
        }
    }

    // Operations from Current/Planning do not have an inline form error
    // surface. Keep failures visible without leaving a stale error in a
    // later capture or editor sheet.
    val errorSurfaceOpen = captureOpen || circadianOpen || editTask != null ||
        breakdownTask != null || backupAction != null || signInOpen || focusTask != null
    LaunchedEffect(error, errorSurfaceOpen) {
        val message = error
        if (message != null && !errorSurfaceOpen) {
            snackbarHostState.showSnackbar(message)
            goalflowViewModel.clearError()
        }
    }

    LaunchedEffect(undoTaskId) {
        val taskId = undoTaskId ?: return@LaunchedEffect
        val result = snackbarHostState.showSnackbar(
            message = "Done. Keep going.",
            actionLabel = "Undo",
            withDismissAction = true,
            duration = SnackbarDuration.Short
        )
        if (result == SnackbarResult.ActionPerformed) goalflowViewModel.undoCompletion(taskId)
        goalflowViewModel.clearUndo()
    }

    LaunchedEffect(reorderUndo) {
        val change = reorderUndo ?: return@LaunchedEffect
        val result = snackbarHostState.showSnackbar(
            message = "Order updated locally",
            actionLabel = "Undo",
            withDismissAction = true,
            duration = SnackbarDuration.Short
        )
        if (result == SnackbarResult.ActionPerformed) goalflowViewModel.undoReorder(change)
        goalflowViewModel.clearReorderUndo()
    }

    GoalflowTheme {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            snackbarHost = { SnackbarHost(snackbarHostState) },
            bottomBar = {
                GoalflowNavigationBar(destination) { destination = it }
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .safeDrawingPadding()
            ) {
                when (destination) {
                    RootDestination.CURRENT -> CurrentScreen(
                        today = today,
                        gate = gate,
                        currentTask = currentTask,
                        circadian = circadian,
                        onCapture = { openCapture() },
                        onPlanning = { destination = RootDestination.PLANNING },
                        onCheckIn = { circadianOpen = true },
                        onResetCircadian = goalflowViewModel::resetCircadian,
                        onFocus = {
                            localView.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
                            focusStartedAt = application.focusSessionStore.beginOrResume(it.id).startedAtMillis
                            focusTask = it
                        },
                        onComplete = { task ->
                            goalflowViewModel.completeTask(task) {
                                localView.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                            }
                        },
                        onBreakDown = { breakdownTask = it },
                        onEdit = { editTask = it },
                        onDrop = { task ->
                            localView.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                            goalflowViewModel.dropTask(task)
                        }
                    )
                    RootDestination.PLANNING -> PlanningScreen(
                        today = today,
                        gate = gate,
                        tasks = tasks,
                        onCapture = { openCapture() },
                        onMove = { date, taskId, direction ->
                            localView.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                            goalflowViewModel.moveTask(date, taskId, direction)
                        },
                        onConfirm = { date, ids ->
                            localView.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                            goalflowViewModel.confirmPlan(date, ids)
                        },
                        onScheduleMonthTask = { datePickerForTask = it },
                        onReschedule = { task, date -> goalflowViewModel.rescheduleTask(task, date) },
                        onComplete = { task ->
                            goalflowViewModel.completeTask(task) {
                                localView.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                            }
                        },
                        onBreakDown = { breakdownTask = it },
                        onDrop = { task -> goalflowViewModel.dropTask(task) },
                        onEdit = { editTask = it }
                    )
                    RootDestination.HABITS -> NativeHabitsScreen(
                        habits = habits,
                        goals = goals,
                        error = error,
                        onCreate = { draft ->
                            goalflowViewModel.createHabit(
                                draft.title,
                                draft.frequency,
                                draft.specificDays,
                                draft.isHighPriority,
                                draft.beforeFrog,
                                draft.duration,
                                draft.goalId
                            ) { }
                        },
                        onUpdate = { habit, draft ->
                            goalflowViewModel.updateHabit(
                                habit.copy(
                                    title = draft.title,
                                    frequency = draft.frequency,
                                    specificDays = draft.specificDays,
                                    isHighPriority = draft.isHighPriority,
                                    beforeFrog = draft.beforeFrog,
                                    duration = draft.duration,
                                    goalId = draft.goalId
                                )
                            )
                        },
                        onDelete = goalflowViewModel::deleteHabit
                    )
                    RootDestination.GOALS -> NativeGoalsScreen(
                        goals = goals,
                        trueNorth = trueNorth,
                        amalgam = amalgam,
                        error = error,
                        onCreateGoal = { draft -> goalflowViewModel.createGoal(draft.name, draft.description) { } },
                        onUpdateGoal = { goal, draft ->
                            goalflowViewModel.updateGoal(
                                goal.copy(
                                    name = draft.name,
                                    description = draft.description,
                                    deadline = draft.deadline,
                                    excitement = draft.excitement,
                                    roi = draft.roi
                                )
                            )
                        },
                        onDeleteGoal = goalflowViewModel::deleteGoal,
                        onCreateTrueNorth = { draft ->
                            goalflowViewModel.createTrueNorth(
                                com.mariusschober.goalflow.nativeapp.domain.GoalflowTrueNorth(
                                    id = "",
                                    vision = draft.vision,
                                    isMoneyGoal = draft.isMoneyGoal,
                                    tangibleReality = draft.tangibleReality,
                                    sensoryDetails = draft.sensoryDetails,
                                    planB = draft.planB,
                                    importance = draft.importance,
                                    anchorHabit = draft.anchorHabit,
                                    anchorTask = draft.anchorTask,
                                    anchorHabitDuration = draft.anchorHabitDuration,
                                    createdAt = System.currentTimeMillis()
                                )
                            ) { }
                        },
                        onUpdateTrueNorth = { goal, draft ->
                            goalflowViewModel.updateTrueNorth(
                                goal.copy(
                                    vision = draft.vision,
                                    isMoneyGoal = draft.isMoneyGoal,
                                    tangibleReality = draft.tangibleReality,
                                    sensoryDetails = draft.sensoryDetails,
                                    planB = draft.planB,
                                    importance = draft.importance,
                                    anchorHabit = draft.anchorHabit,
                                    anchorTask = draft.anchorTask,
                                    anchorHabitDuration = draft.anchorHabitDuration
                                )
                            )
                        },
                        onDeleteTrueNorth = goalflowViewModel::deleteTrueNorth,
                        onUpdateAmalgam = goalflowViewModel::updateAmalgam,
                        onOpenInsights = { destination = RootDestination.INSIGHTS }
                    )
                    RootDestination.INSIGHTS -> NativeInsightsScreen(
                        tasks = tasks,
                        habits = habits,
                        stats = stats,
                        progress = progress,
                        onBack = { destination = RootDestination.GOALS }
                    )
                    RootDestination.SETTINGS -> SettingsScreen(
                        signedIn = sessionActive,
                        canUseAuthentication = NativeConfig.canUseAuthentication,
                        canUseCloud = NativeConfig.canUseCloud,
                        onSignIn = { signInOpen = true },
                        onSignOut = {
                            application.sessionStore.clear()
                            sessionActive = false
                            scope.launch { snackbarHostState.showSnackbar("Signed out. Local commitments stay here.") }
                        },
                        onExport = {
                            backupError = null
                            backupAction = "export"
                        },
                        onImport = {
                            importLauncher.launch(arrayOf("application/json", "text/plain"))
                        }
                    )
                }
            }
        }
    }

    conflicts.firstOrNull { it.status !in setOf("resolved", "resolving_local") }?.let { conflict ->
        val supportedLocally = conflict.entityType in setOf("tasks", "goals", "habits", "daily_plans") ||
            (conflict.entityType in NATIVE_RAW_COLLECTION_TYPES && conflict.localPayload.isNotBlank())
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Sync conflict — both versions are safe") },
            text = {
                Text(if (supportedLocally) {
                    "This ${conflict.entityType.removeSuffix("s")} was changed in two places. " +
                        "Choose explicitly; Goalflow will not overwrite either version silently."
                } else {
                    "A cloud ${conflict.entityType} change cannot be displayed by this app version. " +
                        "Its complete payload remains preserved until you explicitly keep the canonical cloud copy."
                })
            },
            confirmButton = {
                if (supportedLocally) {
                    Button(onClick = { goalflowViewModel.resolveConflict(conflict, keepLocal = true) }) {
                        Text("Keep this device")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { goalflowViewModel.resolveConflict(conflict, keepLocal = false) }) {
                    Text(if (supportedLocally) "Use cloud version" else "Keep canonical cloud copy")
                }
            }
        )
    }

    if (captureOpen) {
        CaptureSheet(
            formKey = captureFormKey,
            initialTitle = captureSeed,
            goals = goals,
            error = error,
            onDismiss = {
                goalflowViewModel.clearError()
                closeCapture()
            },
            onSave = { title, notes, precision, scheduledFor, scheduledTime, isFrog, goalId, duration ->
                goalflowViewModel.createTask(
                    title = title,
                    notes = notes,
                    precision = precision,
                    scheduledFor = scheduledFor,
                    scheduledTime = scheduledTime,
                    isFrog = isFrog,
                    goalId = goalId,
                    duration = duration,
                    onComplete = {
                        localView.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                        closeCapture()
                    }
                )
            }
        )
    }

    if (circadianOpen) {
        CircadianCheckInSheet(
            initial = circadian,
            error = error,
            onDismiss = {
                goalflowViewModel.clearError()
                circadianOpen = false
            },
            onSave = { state ->
                goalflowViewModel.updateCircadian(state) { circadianOpen = false }
            }
        )
    }

    focusTask?.let { task ->
        FocusTimerSheet(
            task = task,
            startedAtMillis = focusStartedAt
                ?: application.focusSessionStore.read()?.startedAtMillis
                ?: System.currentTimeMillis(),
            error = error,
            onDismiss = { focusTask = null },
            onComplete = { actualDuration, flowState ->
                goalflowViewModel.completeTask(task, actualDuration, flowState) {
                    // Keep the timer anchor until the task transaction has
                    // succeeded. A storage failure must remain recoverable.
                    application.focusSessionStore.clear()
                    focusTask = null
                    focusStartedAt = null
                    localView.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                }
            }
        )
    }

    editTask?.let { task ->
        NativeTaskEditorSheet(
            task = task,
            goals = goals,
            error = error,
            onDismiss = {
                goalflowViewModel.clearError()
                editTask = null
            },
            onSave = { title, notes, precision, scheduledFor, scheduledTime, isFrog, goalId, duration ->
                goalflowViewModel.updateTask(
                    task = task,
                    title = title,
                    notes = notes,
                    precision = precision,
                    scheduledFor = scheduledFor,
                    scheduledTime = scheduledTime,
                    isFrog = isFrog,
                    goalId = goalId,
                    duration = duration
                ) { editTask = null }
            }
        )
    }

    datePickerForTask?.let { task ->
        GoalflowDatePickerDialog(
            initialDate = today,
            onDismiss = { datePickerForTask = null },
            onConfirm = { date ->
                goalflowViewModel.rescheduleTask(task, date)
                datePickerForTask = null
            }
        )
    }

    breakdownTask?.let { task ->
        BreakdownDialog(
            task = task,
            error = error,
            onDismiss = {
                goalflowViewModel.clearError()
                breakdownTask = null
            },
            onConfirm = { titles ->
                val todayForChildren = today
                goalflowViewModel.breakDownTask(
                    task,
                    titles.map { title -> BreakdownChild(title = title, scheduledFor = todayForChildren) }
                ) { breakdownTask = null }
            }
        )
    }

    if (backupAction == "export" || backupAction == "import") {
        BackupPasswordDialog(
            action = backupAction!!,
            error = backupError,
            onDismiss = {
                backupAction = null
                backupError = null
                pendingImportUri = null
            },
            onConfirm = { password ->
                if (password.length < 12) {
                    backupError = "Use at least 12 characters."
                } else if (backupAction == "export") {
                    backupAction = null
                    pendingExportPassword = password
                    exportLauncher.launch("Goalflow-backup.json")
                } else {
                    val uri = pendingImportUri
                    if (uri == null) {
                        backupError = "Choose a backup file first."
                    } else {
                        backupAction = null
                        scope.launch {
                            runCatching {
                                val contents = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                                    ?: throw IllegalStateException("The backup file could not be opened.")
                                application.repository.restoreBackup(contents, password)
                            }.onSuccess {
                                pendingImportUri = null
                                snackbarHostState.showSnackbar("Backup restored safely")
                            }.onFailure {
                                backupError = it.message ?: "Backup restore failed"
                                backupAction = "import"
                            }
                        }
                    }
                }
            }
        )
    }

    if (signInOpen) {
        SignInDialog(
            error = backupError,
            onDismiss = {
                signInOpen = false
                backupError = null
            },
            onConfirm = { email ->
                scope.launch {
                    runCatching { NativeAuthClient(application.sessionStore).requestMagicLink(email) }
                        .onSuccess {
                            signInOpen = false
                            snackbarHostState.showSnackbar("Sign-in link sent")
                        }
                        .onFailure { backupError = it.message ?: "Sign-in failed" }
                }
            }
        )
    }
}

@Composable
private fun GoalflowSandboxGate(onGranted: () -> Unit) {
    var code by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var checking by rememberSaveable { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
        keyboardController?.show()
    }

    fun submit() {
        if (checking) return
        checking = true
        if (code == NativeConfig.sandboxAccessCode) {
            onGranted()
        } else {
            checking = false
            error = "That test code is not valid."
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .imePadding()
                .padding(28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                Icons.Rounded.TaskAlt,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(58.dp)
            )
            Spacer(Modifier.height(20.dp))
            Text("Goalflow Test", style = MaterialTheme.typography.headlineLarge, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text(
                "This is the isolated native test build. Enter the test code to continue.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = code,
                onValueChange = { code = it.filter(Char::isDigit).take(12); error = null },
                modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                label = { Text("Test code") },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Done
                ),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { submit() }),
                isError = error != null
            )
            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = ::submit,
                enabled = code.isNotBlank() && !checking,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) { Text("Enter test app") }
        }
    }
}

@Composable
internal fun GoalPicker(
    goals: List<GoalflowGoal>,
    selectedGoalId: String?,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSelect: (String?) -> Unit
) {
    val selectedName = goals.firstOrNull { it.id == selectedGoalId }?.name ?: "No linked goal"
    Box {
        OutlinedButton(
            onClick = { onExpandedChange(true) },
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) {
            Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.Start) {
                Text("Direction", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(selectedName, maxLines = 1)
            }
            Icon(Icons.Rounded.MoreHoriz, contentDescription = "Choose linked goal")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { onExpandedChange(false) }) {
            DropdownMenuItem(text = { Text("No linked goal") }, onClick = { onSelect(null) })
            goals.forEach { goal ->
                DropdownMenuItem(
                    text = { Text(goal.name, maxLines = 1) },
                    onClick = { onSelect(goal.id) }
                )
            }
        }
    }
}

@Composable
private fun GoalflowNavigationBar(
    selected: RootDestination,
    onSelect: (RootDestination) -> Unit
) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        primaryDestinations.forEach { destination ->
            val icon = when (destination) {
                RootDestination.CURRENT -> Icons.Rounded.TaskAlt
                RootDestination.PLANNING -> Icons.Rounded.Timeline
                RootDestination.HABITS -> Icons.Rounded.Repeat
                RootDestination.GOALS -> Icons.Rounded.Flag
                RootDestination.SETTINGS -> Icons.Rounded.Settings
                RootDestination.INSIGHTS -> Icons.Rounded.Timeline
            }
            NavigationBarItem(
                selected = selected == destination || (selected == RootDestination.INSIGHTS && destination == RootDestination.GOALS),
                onClick = { onSelect(destination) },
                icon = { Icon(icon, contentDescription = destination.label) },
                label = { Text(destination.label) }
            )
        }
    }
}

@Composable
private fun CurrentScreen(
    today: String,
    gate: PlanningGate,
    currentTask: GoalflowTask?,
    circadian: GoalflowCircadianState,
    onCapture: () -> Unit,
    onPlanning: () -> Unit,
    onCheckIn: () -> Unit,
    onResetCircadian: () -> Unit,
    onFocus: (GoalflowTask) -> Unit,
    onComplete: (GoalflowTask) -> Unit,
    onBreakDown: (GoalflowTask) -> Unit,
    onEdit: (GoalflowTask) -> Unit,
    onDrop: (GoalflowTask) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Current", style = MaterialTheme.typography.headlineLarge)
                Text(
                    formatDate(today),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            CircadianStatusCard(
                today = today,
                state = circadian,
                onCheckIn = onCheckIn,
                onReset = onResetCircadian
            )
        }
        item {
            when (gate) {
                PlanningGate.Empty -> EmptyCurrent(onCapture)
                is PlanningGate.MonthlyPlanningRequired -> PlanningRequiredCard(
                    title = "A month needs a day",
                    body = "Turn each open monthly commitment into an exact day before executing it.",
                    onClick = onPlanning
                )
                is PlanningGate.DailyPlanningRequired -> PlanningRequiredCard(
                    title = if (gate.overdueTaskIds.isNotEmpty()) "Overdue commitments need attention" else "Plan today before executing",
                    body = if (gate.overdueTaskIds.isNotEmpty()) {
                        "Nothing disappears because it became inconvenient. Review the order and decide deliberately."
                    } else {
                        "Planning is where you decide. Current is where you do."
                    },
                    onClick = onPlanning
                )
                is PlanningGate.Ready -> AnimatedContent(
                    targetState = currentTask,
                    label = "current-commitment"
                ) { task ->
                    task?.let {
                        CurrentTaskCard(it, gate.queue.size, onFocus, onComplete, onBreakDown, onEdit, onDrop)
                    }
                }
            }
        }
        item {
            OutlinedButton(
                onClick = onCapture,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .semantics { contentDescription = "Capture a scheduled commitment" }
            ) {
                Icon(Icons.Rounded.Add, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Capture commitment")
            }
        }
    }
}

@Composable
private fun CircadianStatusCard(
    today: String,
    state: GoalflowCircadianState,
    onCheckIn: () -> Unit,
    onReset: () -> Unit
) {
    val active = state.lastCheckIn == today
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (active) MaterialTheme.colorScheme.tertiaryContainer
            else MaterialTheme.colorScheme.surfaceVariant
        ),
        shape = RoundedCornerShape(22.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    if (active) "${state.mode.replaceFirstChar { it.uppercase(Locale.getDefault()) }} rhythm · ${state.score}%"
                    else "Daily rhythm",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    if (active) "Your plan can follow the energy you checked in with."
                    else "A 30-second check-in can tune today's plan.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (active) {
                TextButton(onClick = onCheckIn) { Text("Update") }
                TextButton(onClick = onReset) { Text("Reset") }
            } else {
                Button(onClick = onCheckIn) { Text("Check in") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FocusTimerSheet(
    task: GoalflowTask,
    startedAtMillis: Long,
    error: String?,
    onDismiss: () -> Unit,
    onComplete: (actualDurationMinutes: Int, flowState: String?) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val startedAt = rememberSaveable(task.id, startedAtMillis) { startedAtMillis }
    var now by remember(task.id) { mutableStateOf(System.currentTimeMillis()) }
    var flowState by rememberSaveable(task.id) { mutableStateOf("") }
    var completing by rememberSaveable(task.id) { mutableStateOf(false) }
    val plannedMinutes = runCatching {
        org.json.JSONObject(task.extraJson).optInt("duration", 25)
    }.getOrDefault(25).coerceIn(1, 1_440)
    val elapsedSeconds = ((now - startedAt) / 1_000L).coerceAtLeast(0L)
    val plannedSeconds = plannedMinutes * 60L
    val progress = (elapsedSeconds.toFloat() / plannedSeconds.toFloat()).coerceIn(0f, 1f)
    val minutes = elapsedSeconds / 60L
    val seconds = elapsedSeconds % 60L

    LaunchedEffect(task.id, startedAt) {
        while (isActive) {
            now = System.currentTimeMillis()
            delay(1_000L)
        }
    }

    LaunchedEffect(error) {
        if (error != null) completing = false
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier.imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Focus", style = MaterialTheme.typography.headlineMedium)
            Text(task.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(
                String.format(Locale.ROOT, "%02d:%02d", minutes, seconds),
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
            LinearProgressIndicator(
                progress = progress,
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                if (elapsedSeconds >= plannedSeconds) "Planned focus reached. Finish when the commitment is truly done."
                else "$plannedMinutes minute target · keep the next action small and visible.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
            Text("How did the session feel?", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                listOf("distracted" to "Distracted", "good" to "Good", "flow" to "Flow").forEach { (value, label) ->
                    if (flowState == value) {
                        Button(onClick = { flowState = value }, modifier = Modifier.weight(1f)) { Text(label) }
                    } else {
                        OutlinedButton(onClick = { flowState = value }, modifier = Modifier.weight(1f)) { Text(label) }
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    if (!completing) {
                        completing = true
                        onComplete(ceil(elapsedSeconds / 60.0).toInt().coerceAtLeast(1), flowState.takeIf(String::isNotBlank))
                    }
                },
                enabled = !completing,
                modifier = Modifier.fillMaxWidth().height(58.dp)
            ) {
                Icon(Icons.Rounded.Check, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(if (completing) "Saving…" else "Complete commitment")
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Keep working") }
        }
    }
}

@Composable
private fun EmptyCurrent(onCapture: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                Icons.Rounded.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(46.dp)
            )
            Text("Nothing is scheduled for now", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
            Text(
                "Capture one real commitment and give it a day. Then leave the app and do it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Button(onClick = onCapture) { Text("Add the first one") }
        }
    }
}

@Composable
private fun PlanningRequiredCard(title: String, body: String, onClick: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        shape = RoundedCornerShape(28.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(title, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(body, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Button(onClick = onClick) {
                Text("Open Planning")
                Spacer(Modifier.width(8.dp))
                Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null)
            }
        }
    }
}

@Composable
private fun CurrentTaskCard(
    task: GoalflowTask,
    remaining: Int,
    onFocus: (GoalflowTask) -> Unit,
    onComplete: (GoalflowTask) -> Unit,
    onBreakDown: (GoalflowTask) -> Unit,
    onEdit: (GoalflowTask) -> Unit,
    onDrop: (GoalflowTask) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (task.isFrog) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)),
        shape = RoundedCornerShape(30.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(26.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (task.isFrog) {
                    Icon(Icons.Rounded.Flag, contentDescription = "Frog", tint = MaterialTheme.colorScheme.secondary)
                    Text("FROG", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
                } else {
                    Text("DO THIS NOW", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
                Spacer(Modifier.weight(1f))
                Text("$remaining remaining", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(task.title, style = MaterialTheme.typography.headlineMedium)
            if (task.notes.isNotBlank()) {
                Text(task.notes, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(onClick = { onEdit(task) }, modifier = Modifier.fillMaxWidth().height(50.dp)) {
                Icon(Icons.Rounded.MoreHoriz, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Adjust commitment")
            }
            OutlinedButton(onClick = { onFocus(task) }, modifier = Modifier.fillMaxWidth().height(50.dp)) {
                Icon(Icons.Rounded.Timeline, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Start focus session")
            }
            Button(
                onClick = {
                    onComplete(task)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(58.dp)
                    .semantics { contentDescription = "Complete ${task.title}" },
                shape = RoundedCornerShape(18.dp)
            ) {
                Icon(Icons.Rounded.Check, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Complete")
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                TextButton(onClick = { onBreakDown(task) }) { Text("Break down") }
                TextButton(onClick = { onDrop(task) }) { Text("Drop explicitly") }
            }
        }
    }
}

@Composable
private fun PlanningScreen(
    today: String,
    gate: PlanningGate,
    tasks: List<GoalflowTask>,
    onCapture: () -> Unit,
    onMove: (String, String, Int) -> Unit,
    onConfirm: (String, List<String>) -> Unit,
    onScheduleMonthTask: (GoalflowTask) -> Unit,
    onReschedule: (GoalflowTask, String) -> Unit,
    onComplete: (GoalflowTask) -> Unit,
    onBreakDown: (GoalflowTask) -> Unit,
    onEdit: (GoalflowTask) -> Unit,
    onDrop: (GoalflowTask) -> Unit
) {
    val queue = (gate as? PlanningGate.DailyPlanningRequired)?.taskIds
        ?.mapNotNull { id -> tasks.find { it.id == id } }
        ?: (gate as? PlanningGate.Ready)?.queue.orEmpty()
    val monthlyTasks = (gate as? PlanningGate.MonthlyPlanningRequired)?.taskIds
        ?.mapNotNull { id -> tasks.find { it.id == id } }
        .orEmpty()
    val overdueTasks = (gate as? PlanningGate.DailyPlanningRequired)?.overdueTaskIds
        ?.mapNotNull { id -> tasks.find { it.id == id } }
        .orEmpty()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Planning", style = MaterialTheme.typography.headlineLarge)
                    Text(formatDate(today), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                FloatingActionButton(onClick = onCapture, modifier = Modifier.size(52.dp)) {
                    Icon(Icons.Rounded.Add, contentDescription = "Capture commitment")
                }
            }
        }
        if (monthlyTasks.isNotEmpty()) {
            item {
                PlanningHeaderCard(
                    title = "Convert monthly commitments",
                    body = "A month is a direction, not a place to hide. Give each task an exact day."
                )
            }
            items(monthlyTasks, key = { it.id }) { task ->
                MonthTaskRow(task, onScheduleMonthTask)
            }
        } else {
            if (overdueTasks.isNotEmpty()) {
                item {
                    PlanningHeaderCard(
                        title = "Resolve overdue commitments",
                        body = "Nothing disappears because it became inconvenient. Move ordinary work to today, complete it, break it down, or drop it explicitly."
                    )
                }
                items(overdueTasks, key = { it.id }) { task ->
                    OverdueTaskRow(
                        task = task,
                        today = today,
                        onReschedule = onReschedule,
                        onComplete = onComplete,
                        onBreakDown = onBreakDown,
                        onDrop = onDrop
                    )
                }
            }
            if (queue.isNotEmpty()) {
                item {
                    PlanningHeaderCard(
                        title = if (gate is PlanningGate.Ready) "Today's order is confirmed" else "Decide the order",
                        body = if (gate is PlanningGate.Ready) "Current will show one task at a time, beginning with this order." else "Move the commitments into the order you are willing to execute."
                    )
                }
                items(queue, key = { it.id }) { task ->
                    PlannedTaskRow(
                        task = task,
                        isFirst = queue.firstOrNull()?.id == task.id,
                        isLast = queue.lastOrNull()?.id == task.id,
                        onMove = { direction -> onMove(today, task.id, direction) },
                        onEdit = { onEdit(task) }
                    )
                }
                if (gate is PlanningGate.DailyPlanningRequired) {
                    item {
                        Button(
                            onClick = { onConfirm(today, queue.map { it.id }) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp)
                        ) { Text("Confirm this order") }
                    }
                }
            } else if (overdueTasks.isEmpty()) {
                item { EmptyPlanning(onCapture) }
            }
        }
    }
}

@Composable
private fun PlanningHeaderCard(title: String, body: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(24.dp)) {
        Column(modifier = Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}

@Composable
private fun OverdueTaskRow(
    task: GoalflowTask,
    today: String,
    onReschedule: (GoalflowTask, String) -> Unit,
    onComplete: (GoalflowTask) -> Unit,
    onBreakDown: (GoalflowTask) -> Unit,
    onDrop: (GoalflowTask) -> Unit
) {
    Card(shape = RoundedCornerShape(20.dp)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (task.isFrog) {
                    Icon(Icons.Rounded.Flag, contentDescription = "Frog", tint = MaterialTheme.colorScheme.secondary)
                    Text("FROG", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary)
                } else {
                    Text("OVERDUE", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error)
                }
                Spacer(Modifier.weight(1f))
                Text(task.scheduledFor, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(task.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (task.isFrog) {
                Text(
                    "This frog cannot be moved forward. Complete it, break it down, or drop it explicitly.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                OutlinedButton(
                    onClick = { onReschedule(task, today) },
                    modifier = Modifier.fillMaxWidth().height(50.dp)
                ) { Text("Move to today") }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                TextButton(onClick = { onComplete(task) }) { Text("Complete") }
                TextButton(onClick = { onBreakDown(task) }) { Text("Break down") }
                TextButton(onClick = { onDrop(task) }) { Text("Drop") }
            }
        }
    }
}

@Composable
private fun PlannedTaskRow(
    task: GoalflowTask,
    isFirst: Boolean,
    isLast: Boolean,
    onMove: (Int) -> Unit,
    onEdit: () -> Unit
) {
    val localView = LocalView.current
    var dragging by remember(task.id) { mutableStateOf(false) }
    var dragDistance by remember(task.id) { mutableStateOf(0f) }
    Card(
        modifier = Modifier.pointerInput(task.id) {
            detectDragGesturesAfterLongPress(
                onDragStart = {
                    dragging = true
                    dragDistance = 0f
                    localView.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                },
                onDragCancel = {
                    dragging = false
                    dragDistance = 0f
                },
                onDragEnd = {
                    dragging = false
                    dragDistance = 0f
                },
                onDrag = { change, dragAmount ->
                    change.consume()
                    dragDistance += dragAmount.y
                    while (dragDistance >= 48f) {
                        onMove(1)
                        dragDistance -= 48f
                    }
                    while (dragDistance <= -48f) {
                        onMove(-1)
                        dragDistance += 48f
                    }
                }
            )
        },
        border = if (dragging) androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
        colors = CardDefaults.cardColors(
            containerColor = if (dragging) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(20.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 18.dp, top = 12.dp, bottom = 12.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("${task.plannedOrder + 1}", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(task.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                if (task.isFrog) Text("Frog", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.secondary)
            }
            IconButton(onClick = onEdit) { Icon(Icons.Rounded.MoreHoriz, contentDescription = "Edit ${task.title}") }
            IconButton(onClick = { onMove(-1) }, enabled = !isFirst, modifier = Modifier.semantics { contentDescription = "Move ${task.title} up" }) {
                Icon(Icons.Rounded.ArrowUpward, contentDescription = null)
            }
            IconButton(onClick = { onMove(1) }, enabled = !isLast, modifier = Modifier.semantics { contentDescription = "Move ${task.title} down" }) {
                Icon(Icons.Rounded.ArrowDownward, contentDescription = null)
            }
        }
    }
}

@Composable
private fun MonthTaskRow(task: GoalflowTask, onSchedule: (GoalflowTask) -> Unit) {
    Card(shape = RoundedCornerShape(20.dp)) {
        Row(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.DateRange, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(task.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Text(task.scheduledFor, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            TextButton(onClick = { onSchedule(task) }) { Text("Choose day") }
        }
    }
}

@Composable
private fun EmptyPlanning(onCapture: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 80.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Icon(Icons.Rounded.Timeline, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
        Text("Nothing needs planning", style = MaterialTheme.typography.titleLarge)
        Text("Capture a scheduled commitment to give today a deliberate shape.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = onCapture) { Text("Capture commitment") }
    }
}

@Composable
private fun GoalsScreen(goals: List<GoalflowGoal>, onAdd: () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Goals", style = MaterialTheme.typography.headlineLarge)
                    Text("Direction that becomes action", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                FloatingActionButton(onClick = onAdd, modifier = Modifier.size(52.dp)) { Icon(Icons.Rounded.Add, contentDescription = "Add goal") }
            }
        }
        if (goals.isEmpty()) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(26.dp)) {
                    Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("A goal should pull action forward", style = MaterialTheme.typography.titleLarge)
                        Text("Keep it concrete. Then put the next commitment on a day.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = onAdd) { Text("Add a goal") }
                    }
                }
            }
        } else {
            items(goals, key = { it.id }) { goal -> GoalRow(goal) }
        }
    }
}

@Composable
private fun GoalRow(goal: GoalflowGoal) {
    Card(shape = RoundedCornerShape(22.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(modifier = Modifier.size(12.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                Text(goal.name, style = MaterialTheme.typography.titleLarge)
            }
            if (goal.description.isNotBlank()) Text(goal.description, color = MaterialTheme.colorScheme.onSurfaceVariant)
            goal.deadline?.let { Text("By $it", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary) }
        }
    }
}

@Composable
private fun SettingsScreen(
    signedIn: Boolean,
    canUseAuthentication: Boolean,
    canUseCloud: Boolean,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    onExport: () -> Unit,
    onImport: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item { Text("Settings", style = MaterialTheme.typography.headlineLarge) }
        item {
            SettingsCard(
                title = "Local-first",
                body = "Your commitments remain usable without Wi-Fi. Local actions never wait for a server."
            )
        }
        item {
            SettingsCard(
                title = "Cloud sync",
                body = when {
                    signedIn && canUseCloud -> "Connected. Local actions stay immediate; queued changes sync when the network returns."
                    canUseCloud -> "Optional. Sign in to sync across devices. Local execution never waits for it."
                    else -> "Not configured in this build. Local execution is complete without a backend."
                },
                actionLabel = when {
                    signedIn -> "Sign out"
                    canUseAuthentication -> "Sign in"
                    else -> null
                },
                onAction = if (signedIn) onSignOut else onSignIn
            )
        }
        item {
            SettingsCard(
                title = "Backup and recovery",
                body = "Export an encrypted copy or restore one atomically. A wrong password or damaged file leaves current data untouched.",
                actionLabel = "Export backup",
                onAction = onExport
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onImport, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Text("Import backup")
            }
        }
        item {
            SettingsCard(
                title = "Goalflow native",
                body = "A focused Android client with the existing Goalflow rules intact."
            )
        }
    }
}

@Composable
private fun SettingsCard(title: String, body: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Card(shape = RoundedCornerShape(22.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (actionLabel != null && onAction != null) {
                TextButton(onClick = onAction) { Text(actionLabel) }
            }
        }
    }
}

@Composable
private fun BackupPasswordDialog(
    action: String,
    error: String?,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var password by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (action == "export") "Protect backup" else "Unlock backup") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    if (action == "export") "Use a password you can recover later. Goalflow cannot reset it."
                    else "The restore is validated before it changes local data.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Backup password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Password)
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(password) }, enabled = password.isNotBlank()) {
                Text(if (action == "export") "Continue" else "Restore")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun SignInDialog(
    error: String?,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var email by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sign in to sync") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Goalflow will send a magic link. Your local commitments stay available either way.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Email") },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Done
                    )
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = { onConfirm(email) }, enabled = email.isNotBlank()) { Text("Send link") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CaptureSheet(
    formKey: Int,
    initialTitle: String,
    goals: List<GoalflowGoal>,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (String, String, SchedulePrecision, String, String?, Boolean, String?, Int) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var title by rememberSaveable(formKey) { mutableStateOf(initialTitle) }
    var notes by rememberSaveable(formKey) { mutableStateOf("") }
    var precision by rememberSaveable(formKey) { mutableStateOf(SchedulePrecision.DAY) }
    var selectedDate by rememberSaveable(formKey) { mutableStateOf(LocalDate.now().toString()) }
    var scheduledTime by rememberSaveable(formKey) { mutableStateOf("") }
    var frog by rememberSaveable(formKey) { mutableStateOf(false) }
    var selectedGoalId by rememberSaveable(formKey) { mutableStateOf<String?>(null) }
    var duration by rememberSaveable(formKey) { mutableStateOf("25") }
    var showDatePicker by rememberSaveable(formKey) { mutableStateOf(false) }
    var goalMenuOpen by rememberSaveable(formKey) { mutableStateOf(false) }
    var saving by rememberSaveable(formKey) { mutableStateOf(false) }
    var localError by rememberSaveable(formKey) { mutableStateOf<String?>(null) }
    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
        keyboardController?.show()
    }
    LaunchedEffect(error) {
        if (error != null) saving = false
    }

    fun submit() {
        if (saving || title.isBlank()) return
        val minutes = duration.toIntOrNull()
        if (minutes == null || minutes !in 1..1_440) {
            localError = "Duration must be between 1 and 1,440 minutes."
            return
        }
        saving = true
        localError = null
        focusManager.clearFocus()
        onSave(
            title,
            notes,
            precision,
            if (precision == SchedulePrecision.DAY) selectedDate else selectedDate.substring(0, 7),
            scheduledTime.trim().takeIf { precision == SchedulePrecision.DAY && it.isNotBlank() },
            frog,
            selectedGoalId,
            minutes
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier.imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("Capture", style = MaterialTheme.typography.headlineMedium)
            Text("Give it a day. Keep moving.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester),
                label = { Text("What needs to happen?") },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = {
                    submit()
                })
            )
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Notes (optional)") },
                minLines = 2,
                maxLines = 4
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrecisionButton("Exact day", precision == SchedulePrecision.DAY) { precision = SchedulePrecision.DAY }
                PrecisionButton("Future month", precision == SchedulePrecision.MONTH) {
                    precision = SchedulePrecision.MONTH
                    if (selectedDate.substring(0, 7) <= YearMonth.now().toString()) {
                        selectedDate = YearMonth.now().plusMonths(1).atDay(1).toString()
                    }
                }
            }
            OutlinedButton(onClick = { showDatePicker = true }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(Icons.Rounded.DateRange, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(if (precision == SchedulePrecision.DAY) formatDate(selectedDate) else formatMonth(selectedDate.substring(0, 7)))
            }
            if (precision == SchedulePrecision.DAY) {
                OutlinedTextField(
                    value = scheduledTime,
                    onValueChange = { scheduledTime = it.filter { char -> char.isDigit() || char == ':' }.take(5) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Time (optional, HH:mm)") },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next)
                )
            }
            OutlinedTextField(
                value = duration,
                onValueChange = { duration = it.filter(Char::isDigit).take(4); localError = null },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Estimated minutes") },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Next
                )
            )
            if (goals.isNotEmpty()) {
                GoalPicker(
                    goals = goals,
                    selectedGoalId = selectedGoalId,
                    expanded = goalMenuOpen,
                    onExpandedChange = { goalMenuOpen = it },
                    onSelect = { selectedGoalId = it; goalMenuOpen = false }
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(checked = frog, onCheckedChange = { frog = it })
                Column(modifier = Modifier.weight(1f)) {
                    Text("Mark as frog", fontWeight = FontWeight.SemiBold)
                    Text("A commitment you refuse to quietly avoid.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            (error ?: localError)?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            Button(
                onClick = {
                    submit()
                },
                enabled = title.isNotBlank() && !saving,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) { Text(if (saving) "Saving…" else "Save commitment") }
        }
    }

    if (showDatePicker) {
        GoalflowDatePickerDialog(
            initialDate = selectedDate,
            onDismiss = { showDatePicker = false },
            onConfirm = { date -> selectedDate = date; showDatePicker = false }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CircadianCheckInSheet(
    initial: GoalflowCircadianState,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (GoalflowCircadianState) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val today = LocalDate.now().toString()
    var wakeTime by rememberSaveable { mutableStateOf(initial.wakeTime ?: "07:00") }
    var firstMealTime by rememberSaveable { mutableStateOf(initial.firstMealTime ?: "08:00") }
    var morningLight by rememberSaveable { mutableStateOf(initial.sunrise) }
    var eatingWindow by rememberSaveable { mutableStateOf((initial.eatingWindow ?: 10).toFloat()) }
    var sleepHours by rememberSaveable { mutableStateOf(initial.sleepHours.coerceIn(0, 24).toFloat()) }
    var currentState by rememberSaveable { mutableStateOf(initial.energy.coerceIn(1, 10).toFloat()) }
    var saving by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(error) {
        if (error != null) saving = false
    }

    fun score(): Int {
        val windowScore = when {
            eatingWindow <= 10f -> 30
            eatingWindow <= 12f -> 20
            else -> 10
        }
        return ((if (morningLight) 30 else 0) + windowScore + currentState.toInt() * 4).coerceIn(0, 100)
    }

    fun modeFor(score: Int): String = when {
        score < 50 -> "recovery"
        score >= 80 -> "apex"
        else -> "maintenance"
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier.imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("Daily rhythm", style = MaterialTheme.typography.headlineMedium)
            Text(
                "A quick check-in tunes the order around the person who has to do it. It is saved locally first.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            OutlinedTextField(
                value = wakeTime,
                onValueChange = { wakeTime = it.filter { char -> char.isDigit() || char == ':' }.take(5) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Wake time (HH:mm)") },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = KeyboardType.Ascii,
                    imeAction = ImeAction.Next
                )
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(checked = morningLight, onCheckedChange = { morningLight = it })
                Column(modifier = Modifier.weight(1f)) {
                    Text("Morning light", fontWeight = FontWeight.SemiBold)
                    Text(
                        "Bright light within two hours of waking",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Text("Eating window: ${eatingWindow.toInt()} hours", fontWeight = FontWeight.SemiBold)
            Slider(
                value = eatingWindow,
                onValueChange = { eatingWindow = it },
                valueRange = 6f..16f,
                steps = 9,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = firstMealTime,
                onValueChange = { firstMealTime = it.filter { char -> char.isDigit() || char == ':' }.take(5) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("First meal (HH:mm)") },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = KeyboardType.Ascii,
                    imeAction = ImeAction.Next
                )
            )
            Text("Sleep: ${sleepHours.toInt()} hours", fontWeight = FontWeight.SemiBold)
            Slider(
                value = sleepHours,
                onValueChange = { sleepHours = it },
                valueRange = 0f..12f,
                steps = 11,
                modifier = Modifier.fillMaxWidth()
            )
            Text("Current energy and clarity: ${currentState.toInt()}/10", fontWeight = FontWeight.SemiBold)
            Slider(
                value = currentState,
                onValueChange = { currentState = it },
                valueRange = 1f..10f,
                steps = 8,
                modifier = Modifier.fillMaxWidth()
            )
            val calculatedScore = score()
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                shape = RoundedCornerShape(18.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Today's mode", style = MaterialTheme.typography.labelLarge)
                        Text(
                            modeFor(calculatedScore).replaceFirstChar { it.titlecase(Locale.ROOT) },
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Text("$calculatedScore%", style = MaterialTheme.typography.headlineMedium)
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    if (!saving) {
                        saving = true
                        val calculatedScore = score()
                        onSave(
                            GoalflowCircadianState(
                                lastCheckIn = today,
                                score = calculatedScore,
                                mode = modeFor(calculatedScore),
                                sunriseTime = initial.sunriseTime,
                                sunsetTime = initial.sunsetTime,
                                solarNoonTime = initial.solarNoonTime,
                                sunrise = morningLight,
                                sleepHours = sleepHours.toInt(),
                                energy = currentState.toInt(),
                                clarity = currentState.toInt(),
                                interest = initial.interest.coerceIn(1, 10),
                                wakeTime = wakeTime.trim(),
                                eatingWindow = eatingWindow.toInt(),
                                firstMealTime = firstMealTime.trim()
                            )
                        )
                    }
                },
                enabled = !saving,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) { Text(if (saving) "Saving…" else "Save today's rhythm") }
        }
    }
}

@Composable
private fun RowScope.PrecisionButton(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) Button(onClick = onClick, modifier = Modifier.weight(1f)) { Text(label) }
    else OutlinedButton(onClick = onClick, modifier = Modifier.weight(1f)) { Text(label) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalSheet(error: String?, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var name by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, modifier = Modifier.imePadding()) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("New goal", style = MaterialTheme.typography.headlineMedium)
            OutlinedTextField(value = name, onValueChange = { name = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Direction") }, singleLine = true)
            OutlinedTextField(value = description, onValueChange = { description = it }, modifier = Modifier.fillMaxWidth(), label = { Text("What would make it real?") }, minLines = 3, maxLines = 5)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = { onSave(name, description) }, enabled = name.isNotBlank(), modifier = Modifier.fillMaxWidth().height(56.dp)) { Text("Save goal") }
        }
    }
}

@Composable
private fun BreakdownDialog(
    task: GoalflowTask,
    error: String?,
    onDismiss: () -> Unit,
    onConfirm: (List<String>) -> Unit
) {
    var titles by rememberSaveable(task.id) { mutableStateOf(listOf("")) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Break down commitment") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Close “${task.title}” by naming the next executable actions. Each one is scheduled for today.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                titles.forEachIndexed { index, title ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = title,
                            onValueChange = { value ->
                                titles = titles.toMutableList().also { it[index] = value }
                            },
                            modifier = Modifier.weight(1f),
                            label = { Text("Next action ${index + 1}") },
                            singleLine = true,
                            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = ImeAction.Next)
                        )
                        if (titles.size > 1) {
                            TextButton(onClick = { titles = titles.filterIndexed { itemIndex, _ -> itemIndex != index } }) {
                                Text("Remove")
                            }
                        }
                    }
                }
                if (titles.size < 5) {
                    TextButton(onClick = { titles = titles + "" }) { Text("Add another action") }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(titles.map(String::trim).filter(String::isNotBlank)) },
                enabled = titles.any { it.isNotBlank() }
            ) { Text("Create next actions") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalflowDatePickerDialog(initialDate: String, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    val initialMillis = runCatching {
        LocalDate.parse(initialDate.take(10)).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    }.getOrDefault(System.currentTimeMillis())
    val state = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                val selected = state.selectedDateMillis ?: initialMillis
                onConfirm(Instant.ofEpochMilli(selected).atZone(ZoneId.systemDefault()).toLocalDate().toString())
            }) { Text("Use date") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    ) { DatePicker(state = state) }
}

private fun formatDate(value: String): String = runCatching {
    LocalDate.parse(value).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL).withLocale(Locale.getDefault()))
}.getOrDefault(value)

private fun formatMonth(value: String): String = runCatching {
    YearMonth.parse(value).format(DateTimeFormatter.ofPattern("LLLL yyyy", Locale.getDefault()))
}.getOrDefault(value)
