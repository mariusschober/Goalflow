package com.mariusschober.goalflow.nativeapp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Semantic surfaces keep the native palette coherent while allowing capture
 * and focus to have a distinct emotional temperature. */
object GoalflowTokens {
    val captureSurfaceLight = Color(0xFFEAF3ED)
    val captureSurfaceDark = Color(0xFF1E2B24)
    val focusSurfaceLight = Color(0xFF17392C)
    val focusSurfaceDark = Color(0xFF0C2118)
    val frogSurfaceLight = Color(0xFFFFE7A3)
    val frogSurfaceDark = Color(0xFF574500)
    val frogAccentLight = Color(0xFF8A6814)
    val frogAccentDark = Color(0xFFFFD76C)
    val focusOnSurfaceLight = Color(0xFFE7F5EB)
    val focusOnSurfaceDark = Color(0xFFD9E9DE)
    val focusAccentLight = Color(0xFFA3E3B6)
    val focusAccentDark = Color(0xFFA7D0B8)
}

@Composable
fun goalflowCaptureSurface(): Color =
    if (isSystemInDarkTheme()) GoalflowTokens.captureSurfaceDark else GoalflowTokens.captureSurfaceLight

@Composable
fun goalflowFocusSurface(): Color =
    if (isSystemInDarkTheme()) GoalflowTokens.focusSurfaceDark else GoalflowTokens.focusSurfaceLight

@Composable
fun goalflowFocusOnSurface(): Color =
    if (isSystemInDarkTheme()) GoalflowTokens.focusOnSurfaceDark else GoalflowTokens.focusOnSurfaceLight

@Composable
fun goalflowFocusAccent(): Color =
    if (isSystemInDarkTheme()) GoalflowTokens.focusAccentDark else GoalflowTokens.focusAccentLight

private val GoalflowLightColors = lightColorScheme(
    primary = Color(0xFF315C4B),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD9E9DE),
    onPrimaryContainer = Color(0xFF123225),
    secondary = Color(0xFFB98B22),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFE7A3),
    onSecondaryContainer = Color(0xFF3A2A00),
    background = Color(0xFFF8F7F3),
    onBackground = Color(0xFF1F2421),
    surface = Color(0xFFF8F7F3),
    onSurface = Color(0xFF1F2421),
    surfaceVariant = Color(0xFFE8E6DF),
    onSurfaceVariant = Color(0xFF5E625C),
    outline = Color(0xFF7C817A)
)

private val GoalflowDarkColors = darkColorScheme(
    primary = Color(0xFFA7D0B8),
    onPrimary = Color(0xFF123225),
    primaryContainer = Color(0xFF244A39),
    onPrimaryContainer = Color(0xFFD9E9DE),
    secondary = Color(0xFFE8C45B),
    onSecondary = Color(0xFF3A2A00),
    secondaryContainer = Color(0xFF574500),
    onSecondaryContainer = Color(0xFFFFE7A3),
    background = Color(0xFF121412),
    onBackground = Color(0xFFE6E4DE),
    surface = Color(0xFF121412),
    onSurface = Color(0xFFE6E4DE),
    surfaceVariant = Color(0xFF414640),
    onSurfaceVariant = Color(0xFFC1C9BF),
    outline = Color(0xFF8B938A)
)

private val GoalflowTypography = Typography().let { base ->
    base.copy(
        headlineLarge = base.headlineLarge.copy(fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold),
        headlineMedium = base.headlineMedium.copy(fontSize = 27.sp, lineHeight = 33.sp, fontWeight = FontWeight.SemiBold),
        titleLarge = base.titleLarge.copy(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = base.bodyLarge.copy(fontSize = 17.sp, lineHeight = 25.sp),
        bodyMedium = base.bodyMedium.copy(fontSize = 15.sp, lineHeight = 21.sp),
        labelLarge = base.labelLarge.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    )
}

@Composable
fun GoalflowTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) GoalflowDarkColors else GoalflowLightColors,
        typography = GoalflowTypography,
        content = content
    )
}
