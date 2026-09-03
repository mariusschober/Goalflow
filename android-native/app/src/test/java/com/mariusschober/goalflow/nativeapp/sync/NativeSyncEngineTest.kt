package com.mariusschober.goalflow.nativeapp.sync

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.mariusschober.goalflow.nativeapp.data.GoalflowDatabase
import com.mariusschober.goalflow.nativeapp.data.GoalflowJson
import com.mariusschober.goalflow.nativeapp.data.GoalflowRepository
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import com.mariusschober.goalflow.nativeapp.domain.SchedulePrecision
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.net.SocketTimeoutException
import java.time.Instant
import java.time.LocalDate

@RunWith(RobolectricTestRunner::class)
class NativeSyncEngineTest {
    private lateinit var database: GoalflowDatabase
    private lateinit var repository: GoalflowRepository

    private val validSession = NativeSession(
        accessToken = "test-access-token",
        refreshToken = "test-refresh-token",
        expiresAtMillis = Long.MAX_VALUE,
        userId = "00000000-0000-4000-8000-000000000001"
    )

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, GoalflowDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = GoalflowRepository(database, deviceId = "device-a")
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun `timeout after server commit retries the exact mutation id`() = runTest {
        repository.createTask(
            title = "Committed before timeout",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val originalMutationId = repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId
        var pushCalls = 0
        var retriedTaskCalls = 0
        var eventCalls = 0
        var committedMutationId: String? = null
        val transport = NativeSyncTransport { path, _, _, body ->
            when {
                path == "/api/v1/sync/push" -> {
                    val mutation = JSONObject(body!!)
                        .getJSONArray("mutations")
                        .getJSONObject(0)
                    val mutationId = mutation.getString("mutationId")
                    pushCalls += 1
                    if (pushCalls == 1) {
                        committedMutationId = mutationId
                        throw SocketTimeoutException("response lost after commit")
                    }
                    if (mutation.getString("entityType") == "tasks") {
                        assertEquals(committedMutationId, mutationId)
                        retriedTaskCalls += 1
                    } else {
                        assertEquals("task_events", mutation.getString("entityType"))
                        eventCalls += 1
                    }
                    NativeHttpResponse(
                        200,
                        JSONObject().put(
                            "results",
                            JSONArray().put(
                                JSONObject()
                                    .put("mutationId", mutationId)
                                    .put("accepted", true)
                                    .put("serverVersion", 1)
                                    .put("record", JSONObject()
                                        .put("entityType", mutation.getString("entityType"))
                                        .put("entityId", mutation.getString("entityId"))
                                        .put("deviceId", mutation.getString("deviceId"))
                                        .put("version", mutation.getLong("version"))
                                        .put("serverVersion", 1)
                                        .put("payload", mutation.get("payload"))
                                        .put("updatedAt", mutation.getString("updatedAt"))
                                        .put("deletedAt", mutation.get("deletedAt")))
                            )
                        ).toString()
                    )
                }
                path.startsWith("/api/v1/sync/pull") -> emptyPull()
                else -> throw AssertionError("Unexpected request: $path")
            }
        }
        val engine = engine(transport)

        engine.synchronize()

        assertEquals(3, pushCalls)
        assertEquals(1, retriedTaskCalls)
        assertEquals(1, eventCalls)
        assertTrue(repository.pendingSyncMutations().isEmpty())
    }

    @Test
    fun `401 during push preserves the pending mutation`() = runTest {
        repository.createTask(
            title = "Keep through auth expiry",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val mutationId = repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId
        val engine = engine(NativeSyncTransport { path, _, _, _ ->
            if (path == "/api/v1/sync/push") NativeHttpResponse(401, "{}")
            else throw AssertionError("Unexpected request: $path")
        })

        try {
            engine.synchronize()
            fail("Authentication expiry must be visible")
        } catch (_: AuthenticationExpiredDuringSync) {
            // Expected.
        }

        assertEquals(mutationId, repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId)
    }

    @Test
    fun `transient server failure is bounded and preserves the pending mutation`() = runTest {
        repository.createTask(
            title = "Retry later",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val mutationId = repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId
        var pushCalls = 0
        val engine = engine(NativeSyncTransport { path, _, _, _ ->
            if (path != "/api/v1/sync/push") throw AssertionError("Unexpected request: $path")
            pushCalls += 1
            NativeHttpResponse(503, "{}")
        })

        try {
            engine.synchronize()
            fail("A bounded transient failure must remain visible")
        } catch (_: NativeSyncTransientException) {
            // WorkManager may retry later, but not indefinitely in one run.
        }

        assertEquals(3, pushCalls)
        assertEquals(mutationId, repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId)
    }

    @Test
    fun `logout while push is in flight discards the response but not the mutation`() = runTest {
        repository.createTask(
            title = "Keep through logout",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val mutationId = repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId
        var currentSession: NativeSession? = validSession
        val engine = engine(
            transport = NativeSyncTransport { path, _, _, body ->
                if (path != "/api/v1/sync/push") throw AssertionError("Unexpected request: $path")
                val response = acceptedPush(body!!)
                currentSession = null
                response
            },
            sessionProvider = NativeSessionProvider { currentSession }
        )

        try {
            engine.synchronize()
            fail("Logout must invalidate an in-flight acknowledgement")
        } catch (_: NativeSyncSessionChangedDuringSync) {
            // The server may have committed; the exact mutation remains retryable.
        }

        assertEquals(mutationId, repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId)
    }

    @Test
    fun `server identity mismatch stops before any local mutation is sent`() = runTest {
        repository.createTask(
            title = "Bound to the encrypted account",
            notes = "",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            scheduledTime = null,
            isFrog = false
        )
        val mutationId = repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId
        var pushCalls = 0
        val engine = engine(
            transport = NativeSyncTransport { path, _, _, _ ->
                if (path == "/api/v1/sync/push") pushCalls += 1
                throw AssertionError("Unexpected request: $path")
            },
            serverUserId = "00000000-0000-4000-8000-000000000099"
        )

        try {
            engine.synchronize()
            fail("A mismatched verified account must stop synchronization")
        } catch (_: NativeSyncProtocolException) {
            // Expected before the push boundary.
        }

        assertEquals(0, pushCalls)
        assertEquals(mutationId, repository.pendingSyncMutations().single { it.entityType == "tasks" }.mutationId)
    }

    @Test
    fun `duplicated acknowledgement cannot remove an unacknowledged mutation`() = runTest {
        repeat(2) { index ->
            repository.createTask(
                title = "Independent $index",
                notes = "",
                schedulePrecision = SchedulePrecision.DAY,
                scheduledFor = LocalDate.now().toString(),
                scheduledTime = null,
                isFrog = false
            )
        }
        val pendingIds = repository.pendingSyncMutations().map { it.mutationId }.toSet()
        val engine = engine(NativeSyncTransport { path, _, _, body ->
            if (path != "/api/v1/sync/push") throw AssertionError("Unexpected request: $path")
            val firstId = JSONObject(body!!).getJSONArray("mutations").getJSONObject(0).getString("mutationId")
            val duplicate = JSONObject()
                .put("mutationId", firstId)
                .put("accepted", true)
                .put("serverVersion", 1)
            NativeHttpResponse(
                200,
                JSONObject().put("results", JSONArray().put(duplicate).put(JSONObject(duplicate.toString()))).toString()
            )
        })

        try {
            engine.synchronize()
            fail("A mismatched acknowledgement set must be rejected")
        } catch (_: NativeSyncProtocolException) {
            // Expected.
        }

        assertEquals(pendingIds, repository.pendingSyncMutations().map { it.mutationId }.toSet())
    }

    @Test
    fun `pull cursor cannot advance beyond the highest returned record`() = runTest {
        val remote = GoalflowTask(
            id = "00000000-0000-4000-8000-000000000002",
            title = "Must not be silently skipped",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            createdAt = 1,
            updatedAt = 2
        )
        val response = JSONObject()
            .put(
                "records",
                JSONArray().put(
                    JSONObject()
                        .put("entityType", "tasks")
                        .put("entityId", remote.id)
                        .put("version", 1)
                        .put("serverVersion", 5)
                        .put("deviceId", "device-b")
                        .put("payload", GoalflowJson.taskPayload(remote))
                        .put("updatedAt", Instant.now().toString())
                        .put("deletedAt", JSONObject.NULL)
                )
            )
            .put("nextCursor", 6)
            .put("hasMore", false)
        val engine = engine(NativeSyncTransport { path, _, _, _ ->
            if (path.startsWith("/api/v1/sync/pull")) NativeHttpResponse(200, response.toString())
            else throw AssertionError("Unexpected request: $path")
        })

        try {
            engine.synchronize()
            fail("An unsafe cursor must abort the page")
        } catch (_: NativeSyncProtocolException) {
            // Expected.
        }

        assertNull(database.taskDao().get(remote.id))
        assertNull(repository.syncMetadata("_cursor"))
    }

    @Test
    fun `pull record without durable timestamp cannot advance the cursor`() = runTest {
        val remote = GoalflowTask(
            id = "00000000-0000-4000-8000-000000000003",
            title = "Missing server timestamp",
            schedulePrecision = SchedulePrecision.DAY,
            scheduledFor = LocalDate.now().toString(),
            createdAt = 1,
            updatedAt = 2
        )
        val response = JSONObject()
            .put(
                "records",
                JSONArray().put(
                    JSONObject()
                        .put("entityType", "tasks")
                        .put("entityId", remote.id)
                        .put("version", 1)
                        .put("serverVersion", 1)
                        .put("deviceId", "device-b")
                        .put("payload", GoalflowJson.taskPayload(remote))
                        .put("deletedAt", JSONObject.NULL)
                )
            )
            .put("nextCursor", 1)
            .put("hasMore", false)
        val engine = engine(NativeSyncTransport { path, _, _, _ ->
            if (path.startsWith("/api/v1/sync/pull")) NativeHttpResponse(200, response.toString())
            else throw AssertionError("Unexpected request: $path")
        })

        try {
            engine.synchronize()
            fail("A record without its durable timestamp must be rejected")
        } catch (_: NativeSyncProtocolException) {
            // The record and cursor remain unapplied.
        }

        assertNull(database.taskDao().get(remote.id))
        assertNull(repository.syncMetadata("_cursor"))
    }

    private fun engine(
        transport: NativeSyncTransport,
        sessionProvider: NativeSessionProvider = NativeSessionProvider { validSession },
        serverUserId: String = validSession.userId!!
    ): NativeSyncEngine = NativeSyncEngine(
        repository = repository,
        sessionProvider = sessionProvider,
        transport = NativeSyncTransport { path, token, method, body ->
            when (path) {
                "/api/v1/sync/status" -> NativeHttpResponse(
                    200,
                    JSONObject().put("userId", serverUserId).put("serverVersion", 0)
                        .put("unresolvedConflicts", 0).toString()
                )
                "/api/v1/sync/conflicts" -> NativeHttpResponse(
                    200,
                    JSONObject().put("conflicts", JSONArray()).toString()
                )
                else -> transport.request(path, token, method, body)
            }
        },
        cloudAvailable = { true },
        retryPolicy = NativeSyncRetryPolicy(
            initialDelayMillis = 0,
            maximumDelayMillis = 0,
            jitterMillis = { 0 },
            wait = {}
        )
    )

    private fun acceptedPush(body: String): NativeHttpResponse {
        val mutation = JSONObject(body).getJSONArray("mutations").getJSONObject(0)
        return NativeHttpResponse(
            200,
            JSONObject().put(
                "results",
                JSONArray().put(
                    JSONObject()
                        .put("mutationId", mutation.getString("mutationId"))
                        .put("accepted", true)
                        .put("serverVersion", 1)
                        .put("record", JSONObject()
                            .put("entityType", mutation.getString("entityType"))
                            .put("entityId", mutation.getString("entityId"))
                            .put("deviceId", mutation.getString("deviceId"))
                            .put("version", mutation.getLong("version"))
                            .put("serverVersion", 1)
                            .put("payload", mutation.get("payload"))
                            .put("updatedAt", mutation.getString("updatedAt"))
                            .put("deletedAt", mutation.get("deletedAt")))
                )
            ).toString()
        )
    }

    private fun emptyPull(): NativeHttpResponse = NativeHttpResponse(
        200,
        JSONObject()
            .put("records", JSONArray())
            .put("nextCursor", 0)
            .put("hasMore", false)
            .toString()
    )
}
