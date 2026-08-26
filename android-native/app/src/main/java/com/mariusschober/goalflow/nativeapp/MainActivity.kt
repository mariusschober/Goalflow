package com.mariusschober.goalflow.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.mariusschober.goalflow.nativeapp.sync.NativeAuthClient
import com.mariusschober.goalflow.nativeapp.ui.GoalflowRoot

class MainActivity : ComponentActivity() {
    private lateinit var authClient: NativeAuthClient

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val application = application as GoalflowApplication
        authClient = NativeAuthClient(application.sessionStore)
        authClient.acceptCallback(intent)
        setContent { GoalflowRoot() }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        authClient.acceptCallback(intent)
    }
}
