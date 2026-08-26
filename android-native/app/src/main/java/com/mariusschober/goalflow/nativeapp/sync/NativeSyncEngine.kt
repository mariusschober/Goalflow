package com.mariusschober.goalflow.nativeapp.sync

import com.mariusschober.goalflow.nativeapp.data.GoalflowRepository
import com.mariusschober.goalflow.nativeapp.data.SyncConflictEntity
import com.mariusschober.goalflow.nativeapp.data.SyncMetaEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID

sealed interface SyncResult {
    data object Skipped : SyncResult
    data class Synced(val conflicts: Int) : SyncResult
}

/** Conservative adapter for the existing push/pull protocol. */
class NativeSyncEngine(
    private val repository: GoalflowRepository,
    private val sessionStore: SecureSessionStore
) {
    suspend fun synchronize(): SyncResult = withContext(Dispatchers.IO) {
        if (!NativeConfig.canUseCloud) return@withContext SyncResult.Skipped
        val session = sessionStore.read() ?: return@withContext SyncResult.Skipped
        val activeSession = if (session.expiresAtMillis > System.currentTimeMillis() + 60_000L) session else {
            // The worker calls this only after the auth client has refreshed the
            // token. Keeping the stale session out of request headers prevents
            // accidental retries with an expired credential.
            return@withContext SyncResult.Skipped
        }
        var conflicts = 0
        val pending = repository.pendingSyncMutations()
        pending.chunked(50).forEach { batch ->
            val mutationArray = JSONArray().apply {
                batch.forEach { mutation ->
                    put(JSONObject().apply {
                        put("mutationId", mutation.mutationId)
                        put("deviceId", mutation.deviceId)
                        put("entityType", mutation.entityType)
                        put("entityId", mutation.entityId)
                        put("baseServerVersion", mutation.baseServerVersion ?: JSONObject.NULL)
                        put("version", mutation.version)
                        put("payload", parsePayload(mutation.payload))
                        put("updatedAt", mutation.updatedAt)
                        put("deletedAt", mutation.deletedAt ?: JSONObject.NULL)
                    })
                }
            }
            val response = request(
                "/api/v1/sync/push",
                activeSession.accessToken,
                "POST",
                JSONObject().put("mutations", mutationArray).toString()
            )
            if (response.code !in 200..299) throw SyncException("Sync push failed.")
            val results = JSONObject(response.body).optJSONArray("results") ?: throw SyncException("Sync response was invalid.")
            for (index in 0 until results.length()) {
                val result = results.optJSONObject(index) ?: continue
                val mutationId = result.optString("mutationId")
                val mutation = batch.firstOrNull { it.mutationId == mutationId } ?: continue
                repository.acknowledgeSyncMutation(mutationId)
                val serverVersion = result.optLong("serverVersion", 0L)
                val currentMeta = repository.syncMetadata(mutation.entityType)
                repository.saveSyncMetadata(
                    SyncMetaEntity(
                        entityType = mutation.entityType,
                        cursor = currentMeta?.cursor ?: 0L,
                        localVersion = maxOf(currentMeta?.localVersion ?: 0L, mutation.version),
                        serverVersion = serverVersion.takeIf { it > 0L } ?: currentMeta?.serverVersion,
                        lastSuccessfulSync = currentMeta?.lastSuccessfulSync
                    )
                )
                if (!result.optBoolean("accepted", false)) {
                    conflicts += 1
                    repository.recordSyncConflict(
                        SyncConflictEntity(
                            id = UUID.randomUUID().toString(),
                            entityType = mutation.entityType,
                            localPayload = mutation.payload,
                            serverPayload = result.optJSONObject("record")?.opt("payload")?.toString().orEmpty(),
                            serverVersion = serverVersion,
                            createdAt = Instant.now().toString()
                        )
                    )
                }
            }
        }

        var cursor = repository.syncMetadata(SYNC_CURSOR_KEY)?.cursor ?: 0L
        var hasMore = true
        while (hasMore) {
            val response = request(
                "/api/v1/sync/pull?cursor=$cursor&limit=100",
                activeSession.accessToken,
                "GET",
                null
            )
            if (response.code !in 200..299) throw SyncException("Sync pull failed.")
            val body = JSONObject(response.body)
            val records = body.optJSONArray("records") ?: throw SyncException("Sync response was invalid.")
            for (index in 0 until records.length()) {
                val record = records.optJSONObject(index) ?: continue
                val entityType = record.optString("entityType")
                val payload = record.opt("payload")?.toString().orEmpty()
                if (payload.isBlank()) continue
                val pendingEntity = repository.pendingSyncMutations().firstOrNull { it.entityType == entityType }
                if (pendingEntity != null && pendingEntity.deviceId != record.optString("deviceId")) {
                    conflicts += 1
                    continue
                }
                val serverVersion = record.optLong("serverVersion", 0L)
                val currentMeta = repository.syncMetadata(entityType)
                if (serverVersion > (currentMeta?.serverVersion ?: 0L)) {
                    when (entityType) {
                        "tasks" -> repository.applyRemoteTaskSnapshot(payload)
                        "goals" -> repository.applyRemoteGoalSnapshot(payload)
                    }
                    repository.saveSyncMetadata(
                        SyncMetaEntity(
                            entityType = entityType,
                            cursor = cursor,
                            localVersion = maxOf(currentMeta?.localVersion ?: 0L, record.optLong("version", 0L)),
                            serverVersion = serverVersion,
                            lastSuccessfulSync = currentMeta?.lastSuccessfulSync
                        )
                    )
                }
            }
            val nextCursor = body.optLong("nextCursor", cursor)
            cursor = maxOf(cursor, nextCursor)
            hasMore = body.optBoolean("hasMore", false)
            repository.saveSyncMetadata(
                SyncMetaEntity(
                    entityType = SYNC_CURSOR_KEY,
                    cursor = cursor,
                    localVersion = 0L,
                    serverVersion = null,
                    lastSuccessfulSync = null
                )
            )
        }

        val now = Instant.now().toString()
        listOf("tasks", "goals").forEach { entityType ->
            val meta = repository.syncMetadata(entityType)
            if (meta != null) repository.saveSyncMetadata(meta.copy(lastSuccessfulSync = now))
        }
        SyncResult.Synced(conflicts)
    }

    private fun parsePayload(payload: String): Any = runCatching { JSONArray(payload) }
        .getOrElse { JSONObject(payload) }

    private fun request(path: String, token: String, method: String, body: String?): HttpResponse {
        val connection = (URL("${NativeConfig.apiOrigin}$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 20_000
            useCaches = false
            doInput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cache-Control", "no-store")
            setRequestProperty("Authorization", "Bearer $token")
        }
        return try {
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            HttpResponse(code, stream?.bufferedReader()?.use { it.readText() }.orEmpty())
        } finally {
            connection.disconnect()
        }
    }

    private data class HttpResponse(val code: Int, val body: String)
    private class SyncException(message: String) : IllegalStateException(message)

    private companion object {
        const val SYNC_CURSOR_KEY = "_cursor"
    }
}
