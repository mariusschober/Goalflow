package com.mariusschober.goalflow.nativeapp

import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.mariusschober.goalflow.nativeapp.sync.NativeAuthClient
import com.mariusschober.goalflow.nativeapp.sync.NativeSyncScheduler
import com.mariusschober.goalflow.nativeapp.ui.GoalflowRoot

const val GOALFLOW_CAPTURE_ACTION = "com.mariusschober.goalflow.CAPTURE"

class MainActivity : ComponentActivity() {
    private lateinit var authClient: NativeAuthClient
    private var pendingCaptureText by mutableStateOf<String?>(null)
    private var pendingCaptureRequest by mutableStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val application = application as GoalflowApplication
        authClient = NativeAuthClient(application.sessionStore)
        handleIncomingIntent(intent)
        registerCaptureShortcut()
        if (authClient.acceptCallback(intent)) NativeSyncScheduler.schedule(this)
        setContent {
            GoalflowRoot(
                externalCaptureText = pendingCaptureText,
                externalCaptureRequest = pendingCaptureRequest,
                onExternalCaptureConsumed = { pendingCaptureText = null }
            )
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
        if (authClient.acceptCallback(intent)) NativeSyncScheduler.schedule(this)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        val sharedText = if (intent?.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true) {
            intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.takeIf(String::isNotBlank)
        } else {
            null
        }
        val shortcutCapture = intent?.action == GOALFLOW_CAPTURE_ACTION
        if (sharedText != null || shortcutCapture) {
            pendingCaptureText = sharedText?.take(MAX_SHARED_TEXT_LENGTH)
            pendingCaptureRequest += 1
        }
    }

    private fun registerCaptureShortcut() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return
        getSystemService(ShortcutManager::class.java)?.dynamicShortcuts = listOf(
            ShortcutInfo.Builder(this, "capture-commitment")
                .setShortLabel("Capture")
                .setLongLabel("Capture a commitment")
                .setIcon(Icon.createWithResource(this, R.drawable.ic_launcher_foreground))
                .setIntent(Intent(GOALFLOW_CAPTURE_ACTION).setClass(this, MainActivity::class.java))
                .build()
        )
    }

    private companion object {
        const val MAX_SHARED_TEXT_LENGTH = 4_000
    }
}
