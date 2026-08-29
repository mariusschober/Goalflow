package com.mariusschober.goalflow.nativeapp

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Device-side contract for the first frame: the native client must expose its
 * local Current surface and its capture action without waiting for cloud state.
 */
@RunWith(AndroidJUnit4::class)
class NativeAndroidSmokeTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun current_surface_exposes_capture_action() {
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Current").assertIsDisplayed()
        composeRule
            .onNodeWithContentDescription("Capture a scheduled commitment")
            .assertIsDisplayed()
    }

    @Test
    fun activity_recreation_keeps_current_destination() {
        composeRule.activityRule.scenario.recreate()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Current").assertIsDisplayed()
    }

    @Test
    fun capture_uses_clock_and_duration_controls_without_text_time_entry() {
        composeRule
            .onNodeWithContentDescription("Capture a scheduled commitment")
            .performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Capture").assertIsDisplayed()
        composeRule.onNodeWithText("Time (optional)").assertIsDisplayed()
        composeRule.onNodeWithText("Choose time").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Set").assertIsDisplayed()
        composeRule.onNodeWithText("Cancel").performClick()
        composeRule.onNodeWithText("25 min").assertIsDisplayed()
    }
}
