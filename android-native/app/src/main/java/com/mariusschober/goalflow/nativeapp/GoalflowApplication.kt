package com.mariusschober.goalflow.nativeapp

import android.app.Application
import com.mariusschober.goalflow.nativeapp.data.GoalflowDatabase
import com.mariusschober.goalflow.nativeapp.data.GoalflowRepository

class GoalflowApplication : Application() {
    val database: GoalflowDatabase by lazy { GoalflowDatabase.create(this) }
    val repository: GoalflowRepository by lazy { GoalflowRepository(database) }
}
