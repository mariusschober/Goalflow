package com.mariusschober.goalflow.nativeapp.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class GoalflowFocusSessionStoreTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext<Context>()
        check(
            context.getSharedPreferences("goalflow-native-focus", Context.MODE_PRIVATE)
                .edit()
                .clear()
                .commit()
        )
    }

    @Test
    fun `focus anchor resumes for the same task and replaces a different task`() {
        val store = GoalflowFocusSessionStore(context)

        assertEquals(NativeFocusSession("task-a", 100L), store.beginOrResume("task-a", 100L))
        assertEquals(NativeFocusSession("task-a", 100L), store.beginOrResume("task-a", 200L))
        assertEquals(NativeFocusSession("task-b", 300L), store.beginOrResume("task-b", 300L))

        store.clear()
        assertNull(store.read())
    }
}
