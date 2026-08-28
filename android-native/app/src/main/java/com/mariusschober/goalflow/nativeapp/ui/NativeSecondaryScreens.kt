package com.mariusschober.goalflow.nativeapp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Timeline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
import com.mariusschober.goalflow.nativeapp.domain.GoalflowHabit
import com.mariusschober.goalflow.nativeapp.domain.GoalflowProgress
import com.mariusschober.goalflow.nativeapp.domain.GoalflowStats
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTrueNorth
import com.mariusschober.goalflow.nativeapp.domain.HabitFrequency
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision

data class NativeHabitDraft(
    val title: String,
    val frequency: HabitFrequency,
    val specificDays: Set<Int>,
    val isHighPriority: Boolean,
    val beforeFrog: Boolean,
    val duration: Int?,
    val goalId: String?
)

data class NativeGoalDraft(
    val name: String,
    val description: String,
    val deadline: String?,
    val excitement: Int?,
    val roi: Int?
)

data class NativeTrueNorthDraft(
    val vision: String,
    val isMoneyGoal: Boolean,
    val tangibleReality: String?,
    val sensoryDetails: String,
    val planB: String,
    val importance: Int,
    val anchorHabit: String?,
    val anchorTask: String?,
    val anchorHabitDuration: Int?
)

@Composable
fun NativeHabitsScreen(
    habits: List<GoalflowHabit>,
    goals: List<GoalflowGoal>,
    error: String?,
    onCreate: (NativeHabitDraft) -> Unit,
    onUpdate: (GoalflowHabit, NativeHabitDraft) -> Unit,
    onDelete: (GoalflowHabit) -> Unit
) {
    var editor by remember { mutableStateOf<GoalflowHabit?>(null) }
    var editorOpen by rememberSaveable { mutableStateOf(false) }
    var deleteCandidate by remember { mutableStateOf<GoalflowHabit?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Habits", style = MaterialTheme.typography.headlineLarge)
                    Text("Small promises that keep moving", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                FloatingActionButton(
                    onClick = { editor = null; editorOpen = true },
                    modifier = Modifier.size(52.dp)
                ) { Icon(Icons.Rounded.Add, contentDescription = "Add habit") }
            }
        }
        if (habits.isEmpty()) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(26.dp)) {
                    Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Rounded.Repeat, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(36.dp))
                        Text("Make consistency easier", style = MaterialTheme.typography.titleLarge)
                        Text("A habit becomes a scheduled commitment for the days you choose.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = { editor = null; editorOpen = true }) { Text("Add your first habit") }
                    }
                }
            }
        } else {
            items(habits, key = { it.id }) { habit ->
                HabitCard(
                    habit = habit,
                    goalName = goals.firstOrNull { it.id == habit.goalId }?.name,
                    onEdit = { editor = habit; editorOpen = true },
                    onDelete = { deleteCandidate = habit }
                )
            }
        }
    }

    if (editorOpen) {
        HabitEditorSheet(
            initial = editor,
            goals = goals,
            error = error,
            onDismiss = { editorOpen = false },
            onSave = { draft ->
                if (editor == null) onCreate(draft) else onUpdate(editor!!, draft)
                editorOpen = false
            }
        )
    }
    deleteCandidate?.let { habit ->
        AlertDialog(
            onDismissRequest = { deleteCandidate = null },
            title = { Text("Remove habit?") },
            text = { Text("Its completed history stays safe. Existing instances become ordinary commitments.") },
            confirmButton = {
                Button(onClick = { onDelete(habit); deleteCandidate = null }) { Text("Remove") }
            },
            dismissButton = { TextButton(onClick = { deleteCandidate = null }) { Text("Keep") } },
            properties = DialogProperties(dismissOnBackPress = true, dismissOnClickOutside = true)
        )
    }
}

@Composable
private fun HabitCard(
    habit: GoalflowHabit,
    goalName: String?,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    Card(shape = RoundedCornerShape(22.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Repeat, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Text(habit.title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                IconButton(onClick = onEdit) { Icon(Icons.Rounded.Edit, contentDescription = "Edit ${habit.title}") }
                IconButton(onClick = onDelete) { Icon(Icons.Rounded.Delete, contentDescription = "Remove ${habit.title}") }
            }
            Text(
                if (habit.frequency == HabitFrequency.DAILY) "Every day" else "Selected weekdays",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                HabitMetric("Streak", "${habit.streak} days")
                HabitMetric("Best", "${habit.bestStreak} days")
                habit.duration?.let { HabitMetric("Focus", "$it min") }
            }
            if (habit.beforeFrog || habit.isHighPriority) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (habit.isHighPriority) LabelPill("Priority", MaterialTheme.colorScheme.secondaryContainer)
                    if (habit.beforeFrog) LabelPill("Before frog", MaterialTheme.colorScheme.primaryContainer)
                }
            }
            goalName?.let { Text("Linked to $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun HabitMetric(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun LabelPill(text: String, color: Color) {
    Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(color).padding(horizontal = 10.dp, vertical = 5.dp)) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HabitEditorSheet(
    initial: GoalflowHabit?,
    goals: List<GoalflowGoal>,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (NativeHabitDraft) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val key = initial?.id ?: "new"
    var title by rememberSaveable(key) { mutableStateOf(initial?.title.orEmpty()) }
    var frequencyName by rememberSaveable(key) { mutableStateOf((initial?.frequency ?: HabitFrequency.DAILY).name) }
    var selectedDays by rememberSaveable(key) { mutableStateOf(initial?.specificDays?.sorted().orEmpty()) }
    var highPriority by rememberSaveable(key) { mutableStateOf(initial?.isHighPriority ?: false) }
    var beforeFrog by rememberSaveable(key) { mutableStateOf(initial?.beforeFrog ?: false) }
    var duration by rememberSaveable(key) { mutableStateOf(initial?.duration?.toString().orEmpty()) }
    var goalId by rememberSaveable(key) { mutableStateOf(initial?.goalId.orEmpty()) }
    var goalMenuOpen by remember { mutableStateOf(false) }
    var saving by rememberSaveable(key) { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }
    val weekdays = listOf("S", "M", "T", "W", "T", "F", "S")

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, modifier = Modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(if (initial == null) "New habit" else "Edit habit", style = MaterialTheme.typography.headlineMedium)
            Text("Make the next repetition obvious and easy.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(value = title, onValueChange = { title = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Habit") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HabitFrequencyButton("Every day", frequencyName == HabitFrequency.DAILY.name) { frequencyName = HabitFrequency.DAILY.name }
                HabitFrequencyButton("Specific days", frequencyName == HabitFrequency.SPECIFIC_DAYS.name) { frequencyName = HabitFrequency.SPECIFIC_DAYS.name }
            }
            if (frequencyName == HabitFrequency.SPECIFIC_DAYS.name) {
                Text("Choose weekdays", style = MaterialTheme.typography.labelLarge)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    weekdays.forEachIndexed { index, label ->
                        OutlinedButton(
                            onClick = {
                                selectedDays = if (index in selectedDays) selectedDays - index else (selectedDays + index).sorted()
                            },
                            modifier = Modifier.size(42.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) { Text(label, color = if (index in selectedDays) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface) }
                    }
                }
            }
            OutlinedTextField(
                value = duration,
                onValueChange = { duration = it.filter(Char::isDigit).take(4) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Focus minutes (optional)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done)
            )
            Box {
                OutlinedButton(onClick = { goalMenuOpen = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(goals.firstOrNull { it.id == goalId }?.name ?: "No linked goal")
                }
                DropdownMenu(expanded = goalMenuOpen, onDismissRequest = { goalMenuOpen = false }) {
                    DropdownMenuItem(text = { Text("No linked goal") }, onClick = { goalId = ""; goalMenuOpen = false })
                    goals.forEach { goal ->
                        DropdownMenuItem(text = { Text(goal.name) }, onClick = { goalId = goal.id; goalMenuOpen = false })
                    }
                }
            }
            CheckRow("High priority", highPriority, "Bring this habit forward in the day") { highPriority = it }
            CheckRow("Before the frog", beforeFrog, "Keep this anchor ahead of ordinary work") { beforeFrog = it }
            (error ?: localError)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    if (!saving) {
                        val cleanTitle = title.trim()
                        val parsedDuration = duration.toIntOrNull()
                        when {
                            cleanTitle.isBlank() -> localError = "A habit needs a clear title."
                            frequencyName == HabitFrequency.SPECIFIC_DAYS.name && selectedDays.isEmpty() -> localError = "Choose at least one weekday."
                            parsedDuration != null && parsedDuration !in 1..1_440 -> localError = "Focus minutes must be between 1 and 1,440."
                            else -> {
                                saving = true
                                onSave(NativeHabitDraft(cleanTitle, HabitFrequency.valueOf(frequencyName), selectedDays.toSet(), highPriority, beforeFrog, parsedDuration, goalId.takeIf(String::isNotBlank)))
                            }
                        }
                    }
                },
                enabled = !saving,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) { Text(if (saving) "Saving…" else if (initial == null) "Create habit" else "Save changes") }
        }
    }
}

@Composable
private fun RowScope.HabitFrequencyButton(label: String, selected: Boolean, onClick: () -> Unit) {
    if (selected) Button(onClick = onClick, modifier = Modifier.weight(1f)) { Text(label) }
    else OutlinedButton(onClick = onClick, modifier = Modifier.weight(1f)) { Text(label) }
}

@Composable
private fun CheckRow(label: String, checked: Boolean, body: String, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Checkbox(checked = checked, onCheckedChange = onChange)
        Column(modifier = Modifier.weight(1f)) {
            Text(label, fontWeight = FontWeight.SemiBold)
            Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun NativeGoalsScreen(
    goals: List<GoalflowGoal>,
    trueNorth: List<GoalflowTrueNorth>,
    amalgam: String,
    error: String?,
    onCreateGoal: (NativeGoalDraft) -> Unit,
    onUpdateGoal: (GoalflowGoal, NativeGoalDraft) -> Unit,
    onDeleteGoal: (GoalflowGoal) -> Unit,
    onCreateTrueNorth: (NativeTrueNorthDraft) -> Unit,
    onUpdateTrueNorth: (GoalflowTrueNorth, NativeTrueNorthDraft) -> Unit,
    onDeleteTrueNorth: (GoalflowTrueNorth) -> Unit,
    onUpdateAmalgam: (String) -> Unit,
    onOpenInsights: () -> Unit
) {
    var goalEditor by remember { mutableStateOf<GoalflowGoal?>(null) }
    var goalEditorOpen by rememberSaveable { mutableStateOf(false) }
    var trueNorthEditor by remember { mutableStateOf<GoalflowTrueNorth?>(null) }
    var trueNorthEditorOpen by rememberSaveable { mutableStateOf(false) }
    var deleteGoalCandidate by remember { mutableStateOf<GoalflowGoal?>(null) }
    var deleteTrueNorthCandidate by remember { mutableStateOf<GoalflowTrueNorth?>(null) }
    var amalgamEditing by rememberSaveable { mutableStateOf(false) }
    var amalgamDraft by rememberSaveable(amalgam) { mutableStateOf(amalgam) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Goals", style = MaterialTheme.typography.headlineLarge)
                    Text("Direction that becomes action", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onOpenInsights) { Icon(Icons.Rounded.Timeline, contentDescription = "Open Insights") }
                FloatingActionButton(onClick = { goalEditor = null; goalEditorOpen = true }, modifier = Modifier.size(52.dp)) {
                    Icon(Icons.Rounded.Add, contentDescription = "Add goal")
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(24.dp)) {
                Column(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Star, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                        Spacer(Modifier.width(8.dp))
                        Text("True North", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                        TextButton(onClick = { trueNorthEditor = null; trueNorthEditorOpen = true }) { Text("Add vision") }
                    }
                    Text("The destination chosen by your heart—not another list to maintain.", color = MaterialTheme.colorScheme.onPrimaryContainer)
                    if (trueNorth.isEmpty()) {
                        Text("Define one clear outcome, then anchor it with one small action.", color = MaterialTheme.colorScheme.onPrimaryContainer)
                    } else {
                        trueNorth.forEach { goal ->
                            TrueNorthCard(goal, onEdit = { trueNorthEditor = goal; trueNorthEditorOpen = true }, onDelete = { deleteTrueNorthCandidate = goal })
                        }
                    }
                }
            }
        }
        item {
            AmalgamCard(
                value = amalgam,
                editing = amalgamEditing,
                draft = amalgamDraft,
                onStartEdit = { amalgamDraft = amalgam; amalgamEditing = true },
                onDraftChange = { amalgamDraft = it },
                onSave = { onUpdateAmalgam(amalgamDraft); amalgamEditing = false },
                onCancel = { amalgamEditing = false }
            )
        }
        item { Text("Tactical goals", style = MaterialTheme.typography.titleLarge) }
        if (goals.isEmpty()) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(22.dp)) {
                    Column(modifier = Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Put a real direction on the calendar.", style = MaterialTheme.typography.titleMedium)
                        Text("A goal is useful when it creates the next commitment.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = { goalEditor = null; goalEditorOpen = true }) { Text("Create a goal") }
                    }
                }
            }
        } else {
            items(goals, key = { it.id }) { goal ->
                GoalCard(goal, onEdit = { goalEditor = goal; goalEditorOpen = true }, onDelete = { deleteGoalCandidate = goal })
            }
        }
    }

    if (goalEditorOpen) {
        GoalEditorSheet(
            initial = goalEditor,
            error = error,
            onDismiss = { goalEditorOpen = false },
            onSave = { draft ->
                if (goalEditor == null) onCreateGoal(draft) else onUpdateGoal(goalEditor!!, draft)
                goalEditorOpen = false
            }
        )
    }
    if (trueNorthEditorOpen) {
        TrueNorthEditorSheet(
            initial = trueNorthEditor,
            error = error,
            onDismiss = { trueNorthEditorOpen = false },
            onSave = { draft ->
                if (trueNorthEditor == null) onCreateTrueNorth(draft) else onUpdateTrueNorth(trueNorthEditor!!, draft)
                trueNorthEditorOpen = false
            }
        )
    }
    deleteGoalCandidate?.let { goal ->
        ConfirmDeleteDialog(
            title = "Remove goal?",
            body = "Linked commitments stay safe but will no longer point at this goal.",
            onConfirm = { onDeleteGoal(goal); deleteGoalCandidate = null },
            onDismiss = { deleteGoalCandidate = null }
        )
    }
    deleteTrueNorthCandidate?.let { goal ->
        ConfirmDeleteDialog(
            title = "Remove vision?",
            body = "Linked commitments stay safe but will no longer point at this vision.",
            onConfirm = { onDeleteTrueNorth(goal); deleteTrueNorthCandidate = null },
            onDismiss = { deleteTrueNorthCandidate = null }
        )
    }
}

@Composable
private fun TrueNorthCard(goal: GoalflowTrueNorth, onEdit: () -> Unit, onDelete: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f)), shape = RoundedCornerShape(18.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(goal.vision, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                IconButton(onClick = onEdit) { Icon(Icons.Rounded.Edit, contentDescription = "Edit vision") }
                IconButton(onClick = onDelete) { Icon(Icons.Rounded.Delete, contentDescription = "Remove vision") }
            }
            if (goal.sensoryDetails.isNotBlank()) Text(goal.sensoryDetails, color = MaterialTheme.colorScheme.onSurfaceVariant)
            goal.tangibleReality?.let {
                Text("Reality: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (goal.planB.isNotBlank()) {
                Text("Safety net: ${goal.planB}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LabelPill("Importance ${goal.importance}/10", MaterialTheme.colorScheme.secondaryContainer)
                goal.anchorHabit?.let { LabelPill("Anchor: $it", MaterialTheme.colorScheme.primaryContainer) }
            }
            goal.anchorTask?.let {
                Text("First milestone: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun AmalgamCard(
    value: String,
    editing: Boolean,
    draft: String,
    onStartEdit: () -> Unit,
    onDraftChange: (String) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.inverseSurface), shape = RoundedCornerShape(22.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Background thought", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.inverseOnSurface, modifier = Modifier.weight(1f))
                if (!editing) IconButton(onClick = onStartEdit) { Icon(Icons.Rounded.Edit, contentDescription = "Edit background thought", tint = MaterialTheme.colorScheme.inverseOnSurface) }
            }
            if (editing) {
                OutlinedTextField(value = draft, onValueChange = onDraftChange, modifier = Modifier.fillMaxWidth(), singleLine = true, label = { Text("Thought") })
                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                    TextButton(onClick = onCancel) { Text("Cancel", color = MaterialTheme.colorScheme.inverseOnSurface) }
                    TextButton(onClick = onSave) { Text("Save", color = MaterialTheme.colorScheme.inverseOnSurface) }
                }
            } else {
                Text("\"$value\"", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.inverseOnSurface)
            }
        }
    }
}

@Composable
private fun GoalCard(goal: GoalflowGoal, onEdit: () -> Unit, onDelete: () -> Unit) {
    Card(shape = RoundedCornerShape(22.dp)) {
        Column(modifier = Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Flag, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Text(goal.name, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                IconButton(onClick = onEdit) { Icon(Icons.Rounded.Edit, contentDescription = "Edit ${goal.name}") }
                IconButton(onClick = onDelete) { Icon(Icons.Rounded.Delete, contentDescription = "Remove ${goal.name}") }
            }
            if (goal.description.isNotBlank()) Text(goal.description, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                HabitMetric("Completed", goal.completedTasks.toString())
                goal.excitement?.let { HabitMetric("Excitement", "$it/10") }
                goal.roi?.let { HabitMetric("ROI", "$it/10") }
            }
            goal.deadline?.let { Text("By $it", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.secondary) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalEditorSheet(initial: GoalflowGoal?, error: String?, onDismiss: () -> Unit, onSave: (NativeGoalDraft) -> Unit) {
    val key = initial?.id ?: "new"
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var name by rememberSaveable(key) { mutableStateOf(initial?.name.orEmpty()) }
    var description by rememberSaveable(key) { mutableStateOf(initial?.description.orEmpty()) }
    var deadline by rememberSaveable(key) { mutableStateOf(initial?.deadline.orEmpty()) }
    var excitement by rememberSaveable(key) { mutableStateOf(initial?.excitement?.toString().orEmpty()) }
    var roi by rememberSaveable(key) { mutableStateOf(initial?.roi?.toString().orEmpty()) }
    var saving by rememberSaveable(key) { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(if (initial == null) "New goal" else "Edit goal", style = MaterialTheme.typography.headlineMedium)
            OutlinedTextField(value = name, onValueChange = { name = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Direction") }, singleLine = true)
            OutlinedTextField(value = description, onValueChange = { description = it }, modifier = Modifier.fillMaxWidth(), label = { Text("What would make it real?") }, minLines = 3, maxLines = 5)
            OutlinedTextField(value = deadline, onValueChange = { deadline = it.filter { char -> char.isDigit() || char == '-' }.take(10) }, modifier = Modifier.fillMaxWidth(), label = { Text("Deadline (YYYY-MM-DD, optional)") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(value = excitement, onValueChange = { excitement = it.filter(Char::isDigit).take(2) }, modifier = Modifier.weight(1f), label = { Text("Excitement /10") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                OutlinedTextField(value = roi, onValueChange = { roi = it.filter(Char::isDigit).take(2) }, modifier = Modifier.weight(1f), label = { Text("ROI /10") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            }
            (error ?: localError)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = {
                if (!saving) {
                    when {
                        name.trim().isBlank() -> localError = "A goal needs a clear name."
                        deadline.isNotBlank() && !deadline.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) -> localError = "Deadline must use YYYY-MM-DD."
                        else -> {
                            saving = true
                            onSave(NativeGoalDraft(name.trim(), description.trim(), deadline.takeIf(String::isNotBlank), excitement.toIntOrNull()?.coerceIn(0, 10), roi.toIntOrNull()?.coerceIn(0, 10)))
                        }
                    }
                }
            }, enabled = !saving, modifier = Modifier.fillMaxWidth().height(56.dp)) { Text(if (saving) "Saving…" else if (initial == null) "Create goal" else "Save changes") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TrueNorthEditorSheet(initial: GoalflowTrueNorth?, error: String?, onDismiss: () -> Unit, onSave: (NativeTrueNorthDraft) -> Unit) {
    val key = initial?.id ?: "new"
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var vision by rememberSaveable(key) { mutableStateOf(initial?.vision.orEmpty()) }
    var moneyGoal by rememberSaveable(key) { mutableStateOf(initial?.isMoneyGoal ?: false) }
    var tangible by rememberSaveable(key) { mutableStateOf(initial?.tangibleReality.orEmpty()) }
    var sensory by rememberSaveable(key) { mutableStateOf(initial?.sensoryDetails.orEmpty()) }
    var planB by rememberSaveable(key) { mutableStateOf(initial?.planB.orEmpty()) }
    var importance by rememberSaveable(key) { mutableStateOf(initial?.importance?.toFloat() ?: 5f) }
    var anchorHabit by rememberSaveable(key) { mutableStateOf(initial?.anchorHabit.orEmpty()) }
    var anchorTask by rememberSaveable(key) { mutableStateOf(initial?.anchorTask.orEmpty()) }
    var duration by rememberSaveable(key) { mutableStateOf(initial?.anchorHabitDuration?.toString() ?: "15") }
    var saving by rememberSaveable(key) { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            Text(if (initial == null) "True North" else "Edit True North", style = MaterialTheme.typography.headlineMedium)
            Text("Describe the reality you are choosing, then make it executable.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(value = vision, onValueChange = { vision = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Vision") }, minLines = 2, maxLines = 4)
            CheckRow("Money goal", moneyGoal, "Add the tangible reality that makes it meaningful") { moneyGoal = it }
            if (moneyGoal) OutlinedTextField(value = tangible, onValueChange = { tangible = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Tangible reality") }, minLines = 2, maxLines = 3)
            OutlinedTextField(value = sensory, onValueChange = { sensory = it }, modifier = Modifier.fillMaxWidth(), label = { Text("How will it feel when real?") }, minLines = 3, maxLines = 5)
            OutlinedTextField(value = planB, onValueChange = { planB = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Safety net / Plan B") }, minLines = 2, maxLines = 4)
            Text("Importance: ${importance.toInt()}/10", style = MaterialTheme.typography.labelLarge)
            Slider(value = importance, onValueChange = { importance = it }, valueRange = 1f..10f, steps = 8)
            OutlinedTextField(value = anchorHabit, onValueChange = { anchorHabit = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Anchor habit (optional)") }, singleLine = true)
            if (anchorHabit.isNotBlank()) OutlinedTextField(value = duration, onValueChange = { duration = it.filter(Char::isDigit).take(4) }, modifier = Modifier.fillMaxWidth(), label = { Text("Anchor habit minutes") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            OutlinedTextField(value = anchorTask, onValueChange = { anchorTask = it }, modifier = Modifier.fillMaxWidth(), label = { Text("First milestone (optional)") }, singleLine = true)
            (error ?: localError)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = {
                if (!saving) {
                    when {
                        vision.trim().isBlank() -> localError = "A vision needs a clear outcome."
                        anchorHabit.isNotBlank() && (duration.toIntOrNull() ?: 0) !in 1..1_440 -> localError = "Anchor duration must be between 1 and 1,440 minutes."
                        else -> {
                            saving = true
                            onSave(NativeTrueNorthDraft(vision.trim(), moneyGoal, tangible.trim().takeIf(String::isNotBlank), sensory.trim(), planB.trim(), importance.toInt().coerceIn(1, 10), anchorHabit.trim().takeIf(String::isNotBlank), anchorTask.trim().takeIf(String::isNotBlank), duration.toIntOrNull()?.coerceIn(1, 1_440)))
                        }
                    }
                }
            }, enabled = !saving, modifier = Modifier.fillMaxWidth().height(56.dp)) { Text(if (saving) "Saving…" else if (initial == null) "Choose this reality" else "Save vision") }
        }
    }
}

@Composable
private fun ConfirmDeleteDialog(title: String, body: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, text = { Text(body) }, confirmButton = { Button(onClick = onConfirm) { Text("Remove") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Keep") } })
}

@Composable
fun NativeInsightsScreen(
    tasks: List<GoalflowTask>,
    habits: List<GoalflowHabit>,
    stats: GoalflowStats,
    progress: GoalflowProgress,
    onBack: () -> Unit
) {
    val today = java.time.LocalDate.now().toString()
    val completedTasks = tasks
        .filter { it.status.name == "COMPLETED" && it.deletedAt == null }
        .sortedWith(compareByDescending<GoalflowTask> { it.completedAt ?: 0L }.thenBy { it.id })
    val completed = completedTasks.size
    val completedToday = completedTasks.count { it.scheduledFor == today }
    val openToday = tasks.count { it.status.name == "OPEN" && it.scheduledFor == today && it.deletedAt == null }
    val frogsEaten = completedTasks.count { it.isFrog }
    val focusMinutes = completedTasks.sumOf { task ->
        runCatching {
            val extras = org.json.JSONObject(task.extraJson)
            extras.optInt("actualDuration", extras.optInt("duration", 0)).coerceAtLeast(0)
        }.getOrDefault(0)
    }
    val flowRated = completedTasks.count { task ->
        runCatching { org.json.JSONObject(task.extraJson).optString("flowState").isNotBlank() }.getOrDefault(false)
    }
    val progressFraction = (progress.xp.toFloat() / progress.xpToNextLevel.coerceAtLeast(1)).coerceIn(0f, 1f)
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back to goals") }
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Insights", style = MaterialTheme.typography.headlineLarge)
                    Text("See the evidence of keeping promises", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(26.dp)) {
                Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Star, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(32.dp))
                        Spacer(Modifier.width(10.dp))
                        Text("Level ${progress.level}", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                        Text("${progress.xp} / ${progress.xpToNextLevel} XP", style = MaterialTheme.typography.labelLarge)
                    }
                    LinearProgressIndicator(progress = progressFraction, modifier = Modifier.fillMaxWidth().height(9.dp).clip(RoundedCornerShape(50)))
                    Text("Progress is a quiet record of deliberate action.", color = MaterialTheme.colorScheme.onPrimaryContainer)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                InsightMetric("Today", completedToday.toString(), Modifier.weight(1f))
                InsightMetric("Open", openToday.toString(), Modifier.weight(1f))
                InsightMetric("All time", completed.toString(), Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                InsightMetric("Frogs", frogsEaten.toString(), Modifier.weight(1f))
                InsightMetric("Focus", "$focusMinutes min", Modifier.weight(1f))
                InsightMetric("Habits", habits.count { it.streak > 0 }.toString(), Modifier.weight(1f))
            }
        }
        item {
            Card(shape = RoundedCornerShape(22.dp)) {
                Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("What the record says", style = MaterialTheme.typography.titleLarge)
                    Text(
                        if (flowRated == 0) {
                            "Complete a focus session and rate it once. The pattern will stay on this device with your commitments."
                        } else {
                            "$flowRated completed session${if (flowRated == 1) "" else "s"} has a focus note. Use it as a signal, not a score."
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        item {
            Card(shape = RoundedCornerShape(22.dp)) {
                Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("A useful reading", style = MaterialTheme.typography.titleLarge)
                    Text(
                        when {
                            openToday == 0 && completedToday > 0 -> "Today has a clean edge. Leave the app and enjoy the space you made."
                            completedToday > 0 -> "You have moved ${completedToday} commitment${if (completedToday == 1) "" else "s"} forward today. Continue with the next honest action."
                            openToday > 0 -> "There is work waiting, not a verdict. Open Planning and choose the order you will execute."
                            else -> "Capture one scheduled commitment to give today a deliberate shape."
                        },
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        item { Text("Recent completions", style = MaterialTheme.typography.titleLarge) }
        if (completedTasks.isEmpty()) {
            item {
                Text(
                    "Completed commitments will appear here. Keep the next action small and honest.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            items(completedTasks.take(8), key = { it.id }) { task ->
                CompletedTaskRow(task)
            }
        }
    }
}

@Composable
private fun CompletedTaskRow(task: GoalflowTask) {
    val duration = runCatching {
        val extras = org.json.JSONObject(task.extraJson)
        extras.optInt("actualDuration", extras.optInt("duration", 0)).coerceAtLeast(0)
    }.getOrDefault(0)
    val flowState = runCatching { org.json.JSONObject(task.extraJson).optString("flowState") }
        .getOrDefault("")
    Card(shape = RoundedCornerShape(18.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(task.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Text(
                    buildString {
                        append(task.scheduledFor)
                        if (duration > 0) append(" · $duration min")
                        if (flowState.isNotBlank()) append(" · $flowState")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (task.isFrog) Text("FROG", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
        }
    }
}

@Composable
private fun InsightMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier, shape = RoundedCornerShape(18.dp)) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeTaskEditorSheet(
    task: GoalflowTask,
    goals: List<GoalflowGoal>,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (String, String, SchedulePrecision, String, String?, Boolean, String?, Int) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val key = task.id
    var title by rememberSaveable(key) { mutableStateOf(task.title) }
    var notes by rememberSaveable(key) { mutableStateOf(task.notes) }
    var precisionName by rememberSaveable(key) { mutableStateOf(task.schedulePrecision.name) }
    var scheduledFor by rememberSaveable(key) { mutableStateOf(task.scheduledFor) }
    var scheduledTime by rememberSaveable(key) { mutableStateOf(task.scheduledTime.orEmpty()) }
    var frog by rememberSaveable(key) { mutableStateOf(task.isFrog) }
    var selectedGoalId by rememberSaveable(key) { mutableStateOf(task.goalId) }
    val initialDuration = remember(key) {
        runCatching { org.json.JSONObject(task.extraJson).optInt("duration", 25) }
            .getOrDefault(25)
            .coerceIn(1, 1_440)
    }
    var duration by rememberSaveable(key) { mutableStateOf(initialDuration.toString()) }
    var goalMenuOpen by rememberSaveable(key) { mutableStateOf(false) }
    var saving by rememberSaveable(key) { mutableStateOf(false) }
    var localError by rememberSaveable(key) { mutableStateOf<String?>(null) }
    LaunchedEffect(error) { if (error != null) saving = false }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().imePadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Edit commitment", style = MaterialTheme.typography.headlineMedium)
            OutlinedTextField(value = title, onValueChange = { title = it }, modifier = Modifier.fillMaxWidth(), label = { Text("What needs to happen?") }, singleLine = true)
            OutlinedTextField(value = notes, onValueChange = { notes = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Notes") }, minLines = 2, maxLines = 4)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (precisionName == SchedulePrecision.DAY.name) Button(onClick = { precisionName = SchedulePrecision.DAY.name }, modifier = Modifier.weight(1f)) { Text("Exact day") }
                else OutlinedButton(
                    onClick = {
                        precisionName = SchedulePrecision.DAY.name
                        if (scheduledFor.matches(Regex("\\d{4}-\\d{2}"))) scheduledFor += "-01"
                    },
                    modifier = Modifier.weight(1f)
                ) { Text("Exact day") }
                if (precisionName == SchedulePrecision.MONTH.name) Button(onClick = { precisionName = SchedulePrecision.MONTH.name }, modifier = Modifier.weight(1f)) { Text("Future month") }
                else OutlinedButton(
                    onClick = {
                        precisionName = SchedulePrecision.MONTH.name
                        if (scheduledFor.length >= 7) scheduledFor = scheduledFor.take(7)
                    },
                    modifier = Modifier.weight(1f)
                ) { Text("Future month") }
            }
            OutlinedTextField(value = scheduledFor, onValueChange = { scheduledFor = it.filter { char -> char.isDigit() || char == '-' }.take(10) }, modifier = Modifier.fillMaxWidth(), label = { Text(if (precisionName == SchedulePrecision.DAY.name) "Day (YYYY-MM-DD)" else "Month (YYYY-MM)") }, singleLine = true)
            if (precisionName == SchedulePrecision.DAY.name) {
                OutlinedTextField(
                    value = scheduledTime,
                    onValueChange = { scheduledTime = it.filter { char -> char.isDigit() || char == ':' }.take(5) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Time (HH:mm, optional)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done)
                )
            }
            OutlinedTextField(
                value = duration,
                onValueChange = { duration = it.filter(Char::isDigit).take(4); localError = null },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Estimated minutes") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next)
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
            CheckRow("Frog", frog, "A commitment you refuse to quietly avoid") { frog = it }
            (error ?: localError)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = {
                if (!saving) {
                    if (title.trim().isBlank()) localError = "A commitment needs a clear title."
                    else if (duration.toIntOrNull() == null || duration.toInt() !in 1..1_440) localError = "Duration must be between 1 and 1,440 minutes."
                    else {
                        saving = true
                        onSave(
                            title.trim(),
                            notes.trim(),
                            SchedulePrecision.valueOf(precisionName),
                            scheduledFor,
                            scheduledTime.trim().takeIf { precisionName == SchedulePrecision.DAY.name && it.isNotBlank() },
                            frog,
                            selectedGoalId,
                            duration.toInt()
                        )
                    }
                }
            }, enabled = !saving, modifier = Modifier.fillMaxWidth().height(56.dp)) { Text(if (saving) "Saving…" else "Save changes") }
        }
    }
}
