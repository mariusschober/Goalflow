package com.mariusschober.goalflow.nativeapp.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.LocalTime
import java.time.format.DateTimeFormatter

private val goalflowTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

private fun parseGoalflowTime(value: String?, fallback: LocalTime = LocalTime.of(9, 0)): LocalTime =
    runCatching { LocalTime.parse(value.orEmpty(), goalflowTimeFormatter) }.getOrDefault(fallback)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalflowTimeField(
    value: String?,
    onValueChange: (String?) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    optional: Boolean = true
) {
    var pickerOpen by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(
            onClick = {
                focusManager.clearFocus(force = true)
                keyboard?.hide()
                pickerOpen = true
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
                .semantics { contentDescription = "$label ${value ?: "not set"}" },
            contentPadding = PaddingValues(horizontal = 16.dp)
        ) {
            Icon(Icons.Rounded.Schedule, contentDescription = null)
            Spacer(Modifier.width(10.dp))
            Text(value?.takeIf(String::isNotBlank) ?: if (optional) "Choose time" else "Set time")
        }
    }
    if (pickerOpen) {
        val initial = parseGoalflowTime(value)
        val state = rememberTimePickerState(
            initialHour = initial.hour,
            initialMinute = initial.minute,
            is24Hour = true
        )
        AlertDialog(
            onDismissRequest = { pickerOpen = false },
            title = { Text(label) },
            text = { TimePicker(state = state, modifier = Modifier.fillMaxWidth()) },
            confirmButton = {
                TextButton(onClick = {
                    onValueChange(String.format("%02d:%02d", state.hour, state.minute))
                    pickerOpen = false
                }) { Text("Set") }
            },
            dismissButton = {
                Row {
                    if (optional && value != null) {
                        TextButton(onClick = { onValueChange(null); pickerOpen = false }) { Text("Clear") }
                    }
                    TextButton(onClick = { pickerOpen = false }) { Text("Cancel") }
                }
            }
        )
    }
}

@Composable
fun GoalflowDurationField(
    value: Int?,
    onValueChange: (Int?) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    optional: Boolean = false,
    defaultMinutes: Int = 25
) {
    var pickerOpen by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(
            onClick = {
                focusManager.clearFocus(force = true)
                keyboard?.hide()
                pickerOpen = true
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
                .semantics {
                    contentDescription = "$label ${value?.let { "$it minutes" } ?: "not set"}"
                },
            contentPadding = PaddingValues(horizontal = 16.dp)
        ) {
            Icon(Icons.Rounded.Timer, contentDescription = null)
            Spacer(Modifier.width(10.dp))
            Text(value?.let { formatDurationMinutes(it) } ?: if (optional) "Choose duration" else "$defaultMinutes min")
        }
    }
    if (pickerOpen) {
        DurationPickerDialog(
            initialMinutes = value ?: defaultMinutes,
            optional = optional,
            onDismiss = { pickerOpen = false },
            onConfirm = { selected -> onValueChange(selected); pickerOpen = false },
            onClear = { onValueChange(null); pickerOpen = false }
        )
    }
}

@Composable
private fun DurationPickerDialog(
    initialMinutes: Int,
    optional: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (Int) -> Unit,
    onClear: () -> Unit
) {
    var minutes by remember(initialMinutes) { mutableIntStateOf(initialMinutes.coerceIn(1, 1_440)) }
    val presets = listOf(5, 15, 25, 45, 60, 90)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Estimated time") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(
                    formatDurationMinutes(minutes),
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { minutes = (minutes - 5).coerceAtLeast(1) }) {
                        Icon(Icons.Rounded.Remove, contentDescription = "Decrease duration")
                    }
                    Text("5 minute steps", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    IconButton(onClick = { minutes = (minutes + 5).coerceAtMost(1_440) }) {
                        Icon(Icons.Rounded.Add, contentDescription = "Increase duration")
                    }
                }
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    presets.forEach { preset ->
                        if (minutes == preset) {
                            androidx.compose.material3.Button(onClick = { minutes = preset }) { Text("$preset") }
                        } else {
                            OutlinedButton(onClick = { minutes = preset }) { Text("$preset") }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(minutes) }) { Text("Set") } },
        dismissButton = {
            Row {
                if (optional) TextButton(onClick = onClear) { Text("Clear") }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        }
    )
}

fun formatDurationMinutes(minutes: Int): String = when {
    minutes >= 60 && minutes % 60 == 0 -> "${minutes / 60} h"
    minutes >= 60 -> "${minutes / 60} h ${minutes % 60} min"
    else -> "$minutes min"
}

