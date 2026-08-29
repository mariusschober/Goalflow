package com.mariusschober.goalflow.nativeapp

import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
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
        composeRule.onNodeWithText("Current").assertExists()
        composeRule
            .onNodeWithContentDescription("Capture a scheduled commitment")
            .assertExists()
    }

    @Test
    fun activity_recreation_keeps_current_destination() {
        composeRule.activityRule.scenario.recreate()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Current").assertExists()
    }
}
