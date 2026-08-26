package com.mariusschober.goalflow.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material.icons.rounded.Timeline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.mariusschober.goalflow.nativeapp.GoalflowApplication
import com.mariusschober.goalflow.nativeapp.R
import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.PlanningGate
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import androidx.compose.foundation.layout.RowScope

private enum class RootDestination(val label: String) {
    CURRENT("Current"),
    PLANNING("Planning"),
    GOALS("Goals"),
    SETTINGS("Settings")
}

@Composable
fun GoalflowRoot() {
    val application = LocalContext.current.applicationContext as GoalflowApplication
    val goalflowViewModel: GoalflowViewModel = viewModel(
        factory = GoalflowViewModelFactory(application.repository)
    )
    val tasks by goalflowViewModel.tasks.collectAsStateWithLifecycle()
    val goals by goalflowViewModel.goals.collectAsStateWithLifecycle()
    val today by goalflowViewModel.today.collectAsStateWithLifecycle()
    val gate by goalflowViewModel.planningGate.collectAsStateWithLifecycle()
    val currentTask by goalflowViewModel.currentTask.collectAsStateWithLifecycle()
    val notice by goalflowViewModel.notice.collectAsStateWithLifecycle()
    val error by goalflowViewModel.error.collectAsStateWithLifecycle()
    var destination by rememberSaveable { mutableStateOf(RootDestination.CURRENT) }
    var captureOpen by rememberSaveable { mutableStateOf(false) }
    var goalOpen by rememberSaveable { mutableStateOf(false) }
    var datePickerForTask by remember { mutableStateOf<GoalflowTask?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(notice) {
        notice?.let {
            snackbarHostState.showSnackbar(it)
            goalflowViewModel.clearNotice()
        }
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
                        onCapture = { captureOpen = true },
                        onPlanning = { destination = RootDestination.PLANNING },
                        onComplete = goalflowViewModel::completeTask
                    )
                    RootDestination.PLANNING -> PlanningScreen(
                        today = today,
                        gate = gate,
                        tasks = tasks,
                        onCapture = { captureOpen = true },
                        onMove = goalflowViewModel::moveTask,
                        onConfirm = goalflowViewModel::confirmPlan,
                        onScheduleMonthTask = { datePickerForTask = it }
                    )
                    RootDestination.GOALS -> GoalsScreen(
                        goals = goals,
                        onAdd = { goalOpen = true }
                    )
                    RootDestination.SETTINGS -> SettingsScreen()
                }
            }
        }
    }

    if (captureOpen) {
        CaptureSheet(
            error = error,
            onDismiss = {
                goalflowViewModel.clearError()
                captureOpen = false
            },
            onSave = { title, notes, precision, scheduledFor, isFrog ->
                goalflowViewModel.createTask(
                    title = title,
                    notes = notes,
                    precision = precision,
                    scheduledFor = scheduledFor,
                    scheduledTime = null,
                    isFrog = isFrog,
                    onComplete = { captureOpen = false }
                )
            }
        )
    }

    if (goalOpen) {
        GoalSheet(
            error = error,
            onDismiss = {
                goalflowViewModel.clearError()
                goalOpen = false
            },
            onSave = { name, description ->
                goalflowViewModel.createGoal(name, description) { goalOpen = false }
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
}

@Composable
private fun GoalflowNavigationBar(
    selected: RootDestination,
    onSelect: (RootDestination) -> Unit
) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        RootDestination.entries.forEach { destination ->
            val icon = when (destination) {
                RootDestination.CURRENT -> Icons.Rounded.TaskAlt
                RootDestination.PLANNING -> Icons.Rounded.Timeline
                RootDestination.GOALS -> Icons.Rounded.Flag
                RootDestination.SETTINGS -> Icons.Rounded.Settings
            }
            NavigationBarItem(
                selected = selected == destination,
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
    onCapture: () -> Unit,
    onPlanning: () -> Unit,
    onComplete: (GoalflowTask) -> Unit
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
                is PlanningGate.Ready -> currentTask?.let { task ->
                    CurrentTaskCard(task, gate.queue.size, onComplete)
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
    onComplete: (GoalflowTask) -> Unit
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
            Button(
                onClick = { onComplete(task) },
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
    onScheduleMonthTask: (GoalflowTask) -> Unit
) {
    val queue = (gate as? PlanningGate.DailyPlanningRequired)?.taskIds
        ?.mapNotNull { id -> tasks.find { it.id == id } }
        ?: (gate as? PlanningGate.Ready)?.queue.orEmpty()
    val monthlyTasks = (gate as? PlanningGate.MonthlyPlanningRequired)?.taskIds
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
        } else if (queue.isNotEmpty()) {
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
                    onMove = { direction -> onMove(today, task.id, direction) }
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
        } else {
            item { EmptyPlanning(onCapture) }
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
private fun PlannedTaskRow(
    task: GoalflowTask,
    isFirst: Boolean,
    isLast: Boolean,
    onMove: (Int) -> Unit
) {
    Card(shape = RoundedCornerShape(20.dp)) {
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
private fun SettingsScreen() {
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
                body = "Optional. The native client is prepared for authenticated sync without making execution depend on it."
            )
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
private fun SettingsCard(title: String, body: String) {
    Card(shape = RoundedCornerShape(22.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CaptureSheet(
    error: String?,
    onDismiss: () -> Unit,
    onSave: (String, String, SchedulePrecision, String, Boolean) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var title by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var precision by rememberSaveable { mutableStateOf(SchedulePrecision.DAY) }
    var selectedDate by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var frog by rememberSaveable { mutableStateOf(false) }
    var showDatePicker by rememberSaveable { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
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
                    if (title.isNotBlank()) {
                        focusManager.clearFocus()
                        onSave(title, notes, precision, selectedDate, frog)
                    }
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
                PrecisionButton("Future month", precision == SchedulePrecision.MONTH) { precision = SchedulePrecision.MONTH }
            }
            OutlinedButton(onClick = { showDatePicker = true }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(Icons.Rounded.DateRange, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(if (precision == SchedulePrecision.DAY) formatDate(selectedDate) else formatMonth(selectedDate.substring(0, 7)))
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(checked = frog, onCheckedChange = { frog = it })
                Column(modifier = Modifier.weight(1f)) {
                    Text("Mark as frog", fontWeight = FontWeight.SemiBold)
                    Text("A commitment you refuse to quietly avoid.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            Button(
                onClick = {
                    focusManager.clearFocus()
                    onSave(title, notes, precision, if (precision == SchedulePrecision.DAY) selectedDate else selectedDate.substring(0, 7), frog)
                },
                enabled = title.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) { Text("Save commitment") }
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
