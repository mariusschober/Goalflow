package com.mariusschober.goalflow.nativeapp.sync

import com.mariusschober.goalflow.nativeapp.data.GoalflowRepository
import com.mariusschober.goalflow.nativeapp.data.NativePushResult
import com.mariusschober.goalflow.nativeapp.data.NativeRemoteRecord
import com.mariusschober.goalflow.nativeapp.data.SyncConflictEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.time.Instant

sealed interface SyncResult {
    data object Skipped : SyncResult
    data class Synced(val conflicts: Int) : SyncResult
}

data class NativeHttpResponse(val code: Int, val body: String)

fun interface NativeSyncTransport {
    fun request(path: String, token: String, method: String, body: String?): NativeHttpResponse
}

class AuthenticationExpiredDuringSync : IllegalStateException("Authentication expired during synchronization.")
class NativeSyncProtocolException(message: String) : IllegalStateException(message)

/**
 * At-least-once sync adapter. Network responses never mutate Room piecemeal:
 * the repository commits acknowledgements, conflicts, records, and cursors in
 * explicit transactions. Therefore a timeout or process death only causes a
 * retry of the same mutation id.
 */
class NativeSyncEngine(
    private val repository: GoalflowRepository,
    private val sessionProvider: NativeSessionProvider,
    private val transport: NativeSyncTransport = NativeSyncTransport(::httpRequest),
    private val cloudAvailable: () -> Boolean = { NativeConfig.canUseCloud }
) {
    suspend fun resolveConflictWithCloud(conflict: SyncConflictEntity) = withContext(Dispatchers.IO) {
        if (cloudAvailable() && conflict.mutationId != null) {
            val session = sessionProvider.read() ?: throw AuthenticationExpiredDuringSync()
            if (session.expiresAtMillis <= System.currentTimeMillis() + 60_000L) {
                throw AuthenticationExpiredDuringSync()
            }
            val response = transport.request(
                "/api/v1/sync/conflicts/resolve",
                session.accessToken,
                "POST",
                JSONObject()
                    .put("mutationId", conflict.mutationId)
                    .put("choice", "cloud")
                    .toString()
            )
            ensureAuthorized(response)
            if (response.code !in 200..299) {
                throw NativeSyncProtocolException("The server conflict could not be resolved; both versions remain preserved.")
            }
        }
        repository.resolveConflictWithCloud(conflict.id)
    }

    suspend fun synchronize(): SyncResult = withContext(Dispatchers.IO) {
        if (!cloudAvailable()) return@withContext SyncResult.Skipped
        val session = sessionProvider.read() ?: return@withContext SyncResult.Skipped
        if (session.expiresAtMillis <= System.currentTimeMillis() + 60_000L) {
            return@withContext SyncResult.Skipped
        }

        var conflicts = 0
        while (true) {
            val batch = repository.readySyncMutations(50)
            if (batch.isEmpty()) break
            repository.markSyncAttempted(batch.map { it.mutationId })
            val mutations = JSONArray().apply {
                batch.forEach { mutation -> put(JSONObject().apply {
                    put("mutationId", mutation.mutationId)
                    put("deviceId", mutation.deviceId)
                    put("entityType", mutation.entityType)
                    put("entityId", mutation.entityId)
                    put("baseServerVersion", mutation.baseServerVersion ?: JSONObject.NULL)
                    put("version", mutation.version)
                    put("payload", parseJsonValue(mutation.payload))
                    put("updatedAt", mutation.updatedAt)
                    put("deletedAt", mutation.deletedAt ?: JSONObject.NULL)
                    mutation.resolvesConflictId
                        ?.takeIf { it.matches(UUID_PATTERN) }
                        ?.let { put("resolvesConflictId", it) }
                }) }
            }
            val response = transport.request(
                "/api/v1/sync/push",
                session.accessToken,
                "POST",
                JSONObject().put("mutations", mutations).toString()
            )
            ensureAuthorized(response)
            if (response.code !in 200..299) throw NativeSyncProtocolException("Sync push failed with HTTP ${response.code}.")
            val body = parseObject(response.body, "Sync push response is not valid JSON.")
            val array = body.optJSONArray("results")
                ?: throw NativeSyncProtocolException("Sync push response has no result set.")
            if (array.length() != batch.size) {
                throw NativeSyncProtocolException("Sync push response has an incomplete acknowledgement set.")
            }
            val results = buildList(array.length()) {
                for (index in 0 until array.length()) {
                    val result = array.optJSONObject(index)
                        ?: throw NativeSyncProtocolException("Sync push response contains an invalid result.")
                    val acceptedValue = result.opt("accepted")
                    val mutationIdValue = result.opt("mutationId")
                    val serverVersionValue = result.opt("serverVersion")
                    if (acceptedValue !is Boolean || mutationIdValue !is String || mutationIdValue.isBlank()
                        || serverVersionValue !is Number
                        || (result.has("replayMismatch") && result.opt("replayMismatch") !is Boolean)
                        || (result.has("serverMissing") && result.opt("serverMissing") !is Boolean)
                    ) {
                        throw NativeSyncProtocolException("Sync push response contains an ambiguous result.")
                    }
                    val record = result.optJSONObject("record")
                    val recordEntityType = record?.optString("entityType")?.takeIf(String::isNotBlank)
                        ?: record?.optString("entity_type")?.takeIf(String::isNotBlank)
                    val recordEntityId = record?.optString("entityId")?.takeIf(String::isNotBlank)
                        ?: record?.optString("entity_id")?.takeIf(String::isNotBlank)
                    val recordVersion = record?.let {
                        if (!it.has("version")) null else safeLong(it.opt("version"), "accepted record version")
                    }
                    val recordServerVersion = record?.let {
                        val value = if (it.has("serverVersion")) it.opt("serverVersion") else it.opt("server_version")
                        if (value == null || value == JSONObject.NULL) null
                        else safeLong(value, "accepted record server version", allowZero = false)
                    }
                    val recordPayload = record?.opt("payload")?.let(::jsonValueText)
                    val recordUpdatedAt = record?.nullableString("updatedAt")
                        ?: record?.nullableString("updated_at")
                    val recordDeletedAt = record?.nullableString("deletedAt")
                        ?: record?.nullableString("deleted_at")
                    add(
                        NativePushResult(
                            mutationId = mutationIdValue,
                            accepted = acceptedValue,
                            serverVersion = safeLong(serverVersionValue, "acknowledgement server version", allowZero = !acceptedValue),
                            conflictId = result.nullableString("conflictId"),
                            replayMismatch = result.optBoolean("replayMismatch", false),
                            serverMissing = result.optBoolean("serverMissing", false),
                            serverPayload = record?.opt("payload")?.let(::jsonValueText).orEmpty(),
                            serverDeletedAt = recordDeletedAt,
                            recordEntityType = recordEntityType,
                            recordEntityId = recordEntityId,
                            recordVersion = recordVersion,
                            recordServerVersion = recordServerVersion,
                            recordPayload = recordPayload,
                            recordUpdatedAt = recordUpdatedAt,
                            recordDeletedAt = recordDeletedAt
                        )
                    )
                }
            }
            val expectedIds = batch.map { it.mutationId }.toSet()
            if (results.map { it.mutationId }.toSet() != expectedIds || results.map { it.mutationId }.distinct().size != results.size) {
                throw NativeSyncProtocolException("Sync push response acknowledged the wrong mutation ids.")
            }
            conflicts += repository.commitPushResults(batch, results)
        }

        var cursor = repository.syncMetadata(SYNC_CURSOR_KEY)?.cursor ?: 0L
        var hasMore: Boolean
        do {
            val response = transport.request(
                "/api/v1/sync/pull?cursor=$cursor&limit=100",
                session.accessToken,
                "GET",
                null
            )
            ensureAuthorized(response)
            if (response.code !in 200..299) throw NativeSyncProtocolException("Sync pull failed with HTTP ${response.code}.")
            val body = parseObject(response.body, "Sync pull response is not valid JSON.")
            val array = body.optJSONArray("records")
                ?: throw NativeSyncProtocolException("Sync pull response has no record set.")
            val nextCursorValue = body.opt("nextCursor")
            val hasMoreValue = body.opt("hasMore")
            if (nextCursorValue !is Number || hasMoreValue !is Boolean) {
                throw NativeSyncProtocolException("Sync pull response has an invalid cursor envelope.")
            }
                    val nextCursor = safeLong(nextCursorValue, "sync cursor")
            hasMore = hasMoreValue
            if (nextCursor < cursor || (hasMore && nextCursor == cursor)) {
                throw NativeSyncProtocolException("Sync pull cursor did not make safe progress.")
            }
            val records = buildList(array.length()) {
                for (index in 0 until array.length()) {
                    val record = array.optJSONObject(index)
                        ?: throw NativeSyncProtocolException("Sync pull response contains an invalid record.")
                    val payload = record.opt("payload")
                        ?: throw NativeSyncProtocolException("Sync pull record has no payload.")
                    val entityType = record.opt("entityType")
                    val entityId = record.opt("entityId")
                    val version = record.opt("version")
                    val serverVersion = record.opt("serverVersion")
                    if (entityType !is String || entityType.isBlank()
                        || entityId !is String || entityId.isBlank()
                        || version !is Number || serverVersion !is Number
                        || (record.has("deviceId") && record.opt("deviceId") !is String)
                        || (record.has("updatedAt") && record.opt("updatedAt") !is String)
                        || (record.has("deletedAt") && !record.isNull("deletedAt") && record.opt("deletedAt") !is String)
                    ) {
                        throw NativeSyncProtocolException("Sync pull response contains an ambiguous record.")
                    }
                    add(
                        NativeRemoteRecord(
                            entityType = entityType,
                            entityId = entityId,
                            version = safeLong(version, "remote record version"),
                            serverVersion = safeLong(serverVersion, "remote server version", allowZero = false),
                            deviceId = record.optString("deviceId"),
                            payload = jsonValueText(payload),
                            updatedAt = record.optString("updatedAt", Instant.EPOCH.toString()),
                            deletedAt = record.nullableString("deletedAt")
                        )
                    )
                }
            }
            val highestReturned = records.maxOfOrNull { it.serverVersion } ?: cursor
            if (nextCursor != highestReturned) {
                throw NativeSyncProtocolException("Sync pull cursor would skip or discard remote information.")
            }
            conflicts += repository.applyRemotePage(records, nextCursor)
            cursor = nextCursor
        } while (hasMore)

        repository.markSyncSuccessful()
        SyncResult.Synced(conflicts)
    }

    private fun ensureAuthorized(response: NativeHttpResponse) {
        if (response.code == 401 || response.code == 403) throw AuthenticationExpiredDuringSync()
    }

    private companion object {
        const val SYNC_CURSOR_KEY = "_cursor"
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

        fun parseObject(value: String, message: String): JSONObject =
            runCatching { JSONObject(value) }.getOrElse { throw NativeSyncProtocolException(message) }

        fun parseJsonValue(value: String): Any = runCatching<Any> { JSONObject(value) }
            .recoverCatching { JSONArray(value) }
            .recoverCatching { JSONArray("[$value]").get(0) }
            .getOrElse { throw NativeSyncProtocolException("A pending mutation contains invalid JSON.") }

        fun jsonValueText(value: Any): String {
            if (value === JSONObject.NULL) return "null"
            return when (value) {
                is JSONObject, is JSONArray -> value.toString()
                is String -> JSONObject.quote(value)
                is Number, is Boolean -> value.toString()
                else -> throw NativeSyncProtocolException("A sync payload is not valid JSON.")
            }
        }

        fun safeLong(value: Any?, field: String, allowZero: Boolean = true): Long {
            if (value !is Number) throw NativeSyncProtocolException("The sync response contains an invalid $field.")
            val result = value.toLong()
            val doubleValue = value.toDouble()
            if (!doubleValue.isFinite()
                || doubleValue != result.toDouble()
                || doubleValue > MAX_SAFE_JSON_INTEGER
                || result < 0L
                || (!allowZero && result == 0L)
            ) {
                throw NativeSyncProtocolException("The sync response contains an invalid $field.")
            }
            return result
        }

        const val MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991.0

        fun JSONObject.nullableString(key: String): String? =
            if (!has(key) || isNull(key)) null else optString(key).takeIf(String::isNotBlank)

        fun httpRequest(path: String, token: String, method: String, body: String?): NativeHttpResponse {
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
                NativeHttpResponse(code, stream?.bufferedReader()?.use { it.readText() }.orEmpty())
            } finally {
                connection.disconnect()
            }
        }
    }
}
