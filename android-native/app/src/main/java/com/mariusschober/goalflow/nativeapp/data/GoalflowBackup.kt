package com.mariusschober.goalflow.nativeapp.data

import com.mariusschober.goalflow.nativeapp.domain.DailyPlan
import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
import com.mariusschober.goalflow.nativeapp.domain.GoalflowHabit
import com.mariusschober.goalflow.nativeapp.domain.GoalflowTask
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

data class GoalflowBackupPayload(
    val tasks: List<GoalflowTask>,
    val goals: List<GoalflowGoal>,
    val plans: List<DailyPlan>,
    val habits: List<GoalflowHabit> = emptyList(),
    val outbox: List<SyncOutboxEntity> = emptyList(),
    val syncMeta: List<SyncMetaEntity> = emptyList(),
    val conflicts: List<SyncConflictEntity> = emptyList(),
    val ownerUserId: String? = null
)

class BackupFormatException(message: String) : IllegalArgumentException(message)

enum class BackupRestoreMode { MERGE, REPLACE }

/** AES-256-GCM + PBKDF2-SHA256 envelope matching the web backup contract. */
object GoalflowBackup {
    private const val FORMAT = "goalflow-encrypted-backup"
    private const val FORMAT_VERSION = 1
    private const val SCHEMA_VERSION = 4
    private const val ITERATIONS = 310_000
    private const val MIN_ITERATIONS = 100_000
    private const val MAX_ITERATIONS = 1_000_000
    private const val MAX_CIPHERTEXT_BYTES = 10 * 1024 * 1024

    fun encrypt(payload: GoalflowBackupPayload, password: String): String {
        requirePassword(password)
        val salt = ByteArray(16).also(SecureRandom()::nextBytes)
        val iv = ByteArray(12).also(SecureRandom()::nextBytes)
        val plaintext = backupJson(payload).toString().toByteArray(StandardCharsets.UTF_8)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, deriveKey(password, salt, ITERATIONS), GCMParameterSpec(128, iv))
        val ciphertext = cipher.doFinal(plaintext)
        return JSONObject().apply {
            put("format", FORMAT)
            put("formatVersion", FORMAT_VERSION)
            put("cipher", "AES-256-GCM")
            put("kdf", "PBKDF2-SHA256")
            put("iterations", ITERATIONS)
            put("salt", Base64.getEncoder().encodeToString(salt))
            put("iv", Base64.getEncoder().encodeToString(iv))
            put("ciphertext", Base64.getEncoder().encodeToString(ciphertext))
        }.toString()
    }

    fun decrypt(envelopeText: String, password: String): GoalflowBackupPayload {
        requirePassword(password)
        try {
            val envelope = JSONObject(envelopeText)
            if (envelope.optString("format") != FORMAT || envelope.optInt("formatVersion") != FORMAT_VERSION) {
                throw BackupFormatException("Unsupported encrypted backup format.")
            }
            if (envelope.optString("cipher") != "AES-256-GCM" || envelope.optString("kdf") != "PBKDF2-SHA256") {
                throw BackupFormatException("Unsupported encrypted backup algorithms.")
            }
            val iterations = envelope.optInt("iterations")
            if (iterations !in MIN_ITERATIONS..MAX_ITERATIONS) throw BackupFormatException("Backup KDF parameters are invalid.")
            val salt = decodeBase64(envelope.optString("salt"), 16, "salt")
            val iv = decodeBase64(envelope.optString("iv"), 12, "iv")
            val ciphertext = decodeBase64(envelope.optString("ciphertext"), null, "ciphertext")
            if (ciphertext.size < 16 || ciphertext.size > MAX_CIPHERTEXT_BYTES) throw BackupFormatException("Backup ciphertext is invalid.")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, deriveKey(password, salt, iterations), GCMParameterSpec(128, iv))
            val envelopePayload = JSONObject(String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8))
            val schemaVersion = envelopePayload.optInt("schemaVersion", 1)
            if (schemaVersion !in 1..SCHEMA_VERSION) throw BackupFormatException("This backup was created by a newer Goalflow version.")
            if (schemaVersion >= 3) {
                runCatching { Instant.parse(envelopePayload.getString("exportedAt")) }
                    .getOrElse { throw BackupFormatException("Backup export timestamp is invalid or missing.") }
            }
            val collections = envelopePayload.optJSONObject("collections") ?: envelopePayload
            val payload = parsePayload(collections, schemaVersion)
            val expectedChecksum = envelopePayload.optString("checksum", collections.optString("checksum"))
            if (schemaVersion >= 3 && !expectedChecksum.matches(Regex("^[0-9a-fA-F]{64}$"))) {
                throw BackupFormatException("Backup checksum is invalid or missing.")
            }
            if (expectedChecksum.isNotBlank() && expectedChecksum != sha256(checksumSource(payload, schemaVersion).toString())) {
                throw BackupFormatException("Backup checksum validation failed.")
            }
            return payload
        } catch (error: BackupFormatException) {
            throw error
        } catch (_: Exception) {
            throw BackupFormatException("The backup password is incorrect or the file is damaged.")
        }
    }

    private fun parsePayload(collections: JSONObject, schemaVersion: Int): GoalflowBackupPayload {
        val tasks = requiredArray(collections, "tasks").toString().let { GoalflowJson.parseTasks(it, strict = true) }
        val goals = requiredArray(collections, "goals").toString().let { GoalflowJson.parseGoals(it, strict = true) }
        val plans = parsePlans(requiredArray(collections, "plans"))
        val habits = (if (schemaVersion >= 3) requiredArray(collections, "habits") else collections.optJSONArray("habits"))?.let { array ->
            buildList(array.length()) {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: throw BackupFormatException("Backup contains an invalid habit.")
                    add(GoalflowJson.parseHabit(item.toString(), strict = true))
                }
            }
        }.orEmpty()
        val payload = GoalflowBackupPayload(
            tasks,
            goals,
            plans,
            habits,
            (if (schemaVersion >= 3) requiredArray(collections, "outbox") else collections.optJSONArray("outbox"))?.let(::parseOutbox).orEmpty(),
            (if (schemaVersion >= 3) requiredArray(collections, "syncMeta") else collections.optJSONArray("syncMeta"))?.let(::parseSyncMeta).orEmpty(),
            (if (schemaVersion >= 3) requiredArray(collections, "conflicts") else collections.optJSONArray("conflicts"))?.let(::parseConflicts).orEmpty(),
            if (schemaVersion >= 4 && collections.has("ownerUserId") && !collections.isNull("ownerUserId")) {
                collections.optString("ownerUserId").trim().also { owner ->
                    if (runCatching { java.util.UUID.fromString(owner) }.isFailure) {
                        throw BackupFormatException("Backup account binding is invalid.")
                    }
                }
            } else null
        )
        requireUnique(payload.tasks.map { it.id }, "task")
        requireUnique(payload.goals.map { it.id }, "goal")
        requireUnique(payload.habits.map { it.id }, "habit")
        requireUnique(payload.plans.map { it.localDate }, "planning decision")
        requireUnique(payload.outbox.map { it.mutationId }, "pending mutation")
        requireUnique(payload.syncMeta.map { it.entityType }, "synchronization metadata")
        requireUnique(payload.conflicts.map { it.id }, "conflict")
        validateSyncState(payload)
        return payload
    }

    private fun requiredArray(collections: JSONObject, key: String): JSONArray =
        collections.optJSONArray(key) ?: throw BackupFormatException("Backup collection $key is missing or invalid.")

    private fun requireUnique(ids: List<String>, kind: String) {
        if (ids.any(String::isBlank) || ids.toSet().size != ids.size) {
            throw BackupFormatException("Backup contains duplicate or invalid $kind identities.")
        }
    }

    private fun backupJson(payload: GoalflowBackupPayload): JSONObject = JSONObject().apply {
        put("schemaVersion", SCHEMA_VERSION)
        put("exportedAt", Instant.now().toString())
        put("checksum", sha256(checksumSource(payload).toString()))
        put("collections", checksumSource(payload))
    }

    private fun checksumSource(payload: GoalflowBackupPayload, schemaVersion: Int = SCHEMA_VERSION): JSONObject = JSONObject().apply {
        put("tasks", GoalflowJson.tasksPayload(payload.tasks))
        put("goals", GoalflowJson.goalsPayload(payload.goals))
        put("plans", plansPayload(payload.plans))
        if (schemaVersion >= 3) {
            put("habits", GoalflowJson.habitsPayload(payload.habits))
            put("outbox", outboxPayload(payload.outbox))
            put("syncMeta", syncMetaPayload(payload.syncMeta))
            put("conflicts", conflictsPayload(payload.conflicts))
        }
        if (schemaVersion >= 4) put("ownerUserId", payload.ownerUserId ?: JSONObject.NULL)
    }

    private fun plansPayload(plans: List<DailyPlan>): JSONArray = JSONArray().apply {
        plans.forEach { plan ->
            put(JSONObject().apply {
                put("localDate", plan.localDate)
                put("confirmedAt", plan.confirmedAt)
                put("taskIds", JSONArray(plan.taskIds))
            })
        }
    }

    private fun parsePlans(array: JSONArray): List<DailyPlan> = buildList(array.length()) {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: throw BackupFormatException("Backup contains an invalid planning decision.")
            val localDate = item.optString("localDate").trim()
            if (!localDate.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$"))
                || runCatching { java.time.LocalDate.parse(localDate) }.isFailure
                || item.optLong("confirmedAt", 0L) <= 0L
            ) throw BackupFormatException("Backup contains an invalid planning decision.")
            val ids = item.optJSONArray("taskIds")?.let { idsArray ->
                buildList(idsArray.length()) {
                    for (idIndex in 0 until idsArray.length()) {
                        val id = idsArray.optString(idIndex).trim()
                        if (id.isBlank()) throw BackupFormatException("Backup contains an invalid planning decision.")
                        add(id)
                    }
                }
            } ?: throw BackupFormatException("Backup contains an invalid planning decision.")
            add(DailyPlan(localDate, item.optLong("confirmedAt", 0L), ids))
        }
    }

    private fun outboxPayload(rows: List<SyncOutboxEntity>): JSONArray = JSONArray().apply {
        rows.forEach { row -> put(JSONObject().apply {
            put("mutationId", row.mutationId); put("deviceId", row.deviceId)
            put("entityType", row.entityType); put("entityId", row.entityId)
            put("baseServerVersion", row.baseServerVersion ?: JSONObject.NULL); put("version", row.version)
            put("payload", row.payload); put("updatedAt", row.updatedAt)
            put("deletedAt", row.deletedAt ?: JSONObject.NULL)
            put("dependsOnMutationId", row.dependsOnMutationId ?: JSONObject.NULL)
            put("resolvesConflictId", row.resolvesConflictId ?: JSONObject.NULL)
            put("attemptedAt", row.attemptedAt ?: JSONObject.NULL)
        }) }
    }

    private fun syncMetaPayload(rows: List<SyncMetaEntity>): JSONArray = JSONArray().apply {
        rows.forEach { row -> put(JSONObject().apply {
            put("entityType", row.entityType); put("cursor", row.cursor); put("localVersion", row.localVersion)
            put("serverVersion", row.serverVersion ?: JSONObject.NULL)
            put("lastSuccessfulSync", row.lastSuccessfulSync ?: JSONObject.NULL)
        }) }
    }

    private fun conflictsPayload(rows: List<SyncConflictEntity>): JSONArray = JSONArray().apply {
        rows.forEach { row -> put(JSONObject().apply {
            put("id", row.id); put("entityType", row.entityType); put("entityId", row.entityId)
            put("mutationId", row.mutationId ?: JSONObject.NULL); put("localPayload", row.localPayload)
            put("localDeletedAt", row.localDeletedAt ?: JSONObject.NULL); put("localHistory", row.localHistory)
            put("serverPayload", row.serverPayload); put("serverDeletedAt", row.serverDeletedAt ?: JSONObject.NULL)
            put("serverVersion", row.serverVersion); put("createdAt", row.createdAt); put("status", row.status)
        }) }
    }

    private fun parseOutbox(array: JSONArray): List<SyncOutboxEntity> = buildList(array.length()) {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: throw BackupFormatException("Backup contains an invalid pending mutation.")
            val mutationId = item.requiredString("mutationId", "pending mutation")
            runCatching { java.util.UUID.fromString(mutationId) }
                .getOrElse { throw BackupFormatException("Backup contains an invalid pending mutation identity.") }
            val payload = item.requiredString("payload", "pending mutation")
            runCatching {
                if (payload.trimStart().startsWith("[")) JSONArray(payload) else JSONObject(payload)
            }.getOrElse { throw BackupFormatException("Backup contains an invalid pending mutation payload.") }
            val updatedAt = item.requiredString("updatedAt", "pending mutation")
            requireInstant(updatedAt, "pending mutation timestamp")
            val deletedAt = item.nullableString("deletedAt")
            deletedAt?.let { requireInstant(it, "pending mutation deletion timestamp") }
            val attemptedAt = item.nullableString("attemptedAt")
            attemptedAt?.let { requireInstant(it, "pending mutation attempt timestamp") }
            add(SyncOutboxEntity(
                mutationId = mutationId,
                deviceId = item.requiredString("deviceId", "pending mutation"),
                entityType = item.requiredString("entityType", "pending mutation"),
                entityId = item.requiredString("entityId", "pending mutation"),
                baseServerVersion = item.nullableLong("baseServerVersion"),
                version = item.optLong("version").takeIf { it > 0L } ?: throw BackupFormatException("Backup contains an invalid pending mutation."),
                payload = payload,
                updatedAt = updatedAt,
                deletedAt = deletedAt,
                dependsOnMutationId = item.nullableString("dependsOnMutationId"),
                resolvesConflictId = item.nullableString("resolvesConflictId"),
                attemptedAt = attemptedAt
            ))
        }
    }

    private fun parseSyncMeta(array: JSONArray): List<SyncMetaEntity> = buildList(array.length()) {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: throw BackupFormatException("Backup contains invalid synchronization metadata.")
            val cursor = item.optLong("cursor", -1L)
            val localVersion = item.optLong("localVersion", -1L)
            if (cursor < 0L || localVersion < 0L) throw BackupFormatException("Backup contains invalid synchronization metadata.")
            val serverVersion = if (!item.has("serverVersion") || item.isNull("serverVersion")) null else {
                val raw = item.opt("serverVersion")
                if (raw !is Number || raw.toLong() < 0L) {
                    throw BackupFormatException("Backup contains invalid synchronization metadata.")
                }
                raw.toLong()
            }
            val lastSuccessfulSync = item.nullableString("lastSuccessfulSync")
            lastSuccessfulSync?.let { requireInstant(it, "synchronization timestamp") }
            add(SyncMetaEntity(
                entityType = item.requiredString("entityType", "synchronization metadata"),
                cursor = cursor,
                localVersion = localVersion,
                serverVersion = serverVersion,
                lastSuccessfulSync = lastSuccessfulSync
            ))
        }
    }

    private fun parseConflicts(array: JSONArray): List<SyncConflictEntity> = buildList(array.length()) {
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: throw BackupFormatException("Backup contains an invalid conflict.")
            val localHistory = item.optString("localHistory", "[]")
            val history = runCatching { JSONArray(localHistory) }
                .getOrElse { throw BackupFormatException("Backup contains invalid conflict history.") }
            for (historyIndex in 0 until history.length()) {
                val entry = history.optJSONObject(historyIndex)
                    ?: throw BackupFormatException("Backup contains invalid conflict history.")
                val historyMutationId = entry.requiredString("mutationId", "conflict history")
                runCatching { java.util.UUID.fromString(historyMutationId) }
                    .getOrElse { throw BackupFormatException("Backup contains invalid conflict history identity.") }
                if (!entry.has("payload") || entry.optLong("version", 0L) <= 0L) {
                    throw BackupFormatException("Backup contains invalid conflict history.")
                }
                requireInstant(entry.requiredString("updatedAt", "conflict history"), "conflict history timestamp")
                entry.nullableString("deletedAt")?.let { requireInstant(it, "conflict history deletion timestamp") }
            }
            val serverVersionValue = item.opt("serverVersion")
            if (serverVersionValue !is Number || serverVersionValue.toLong() < 0L) {
                throw BackupFormatException("Backup contains an invalid conflict server version.")
            }
            val createdAt = item.requiredString("createdAt", "conflict")
            requireInstant(createdAt, "conflict timestamp")
            val status = item.optString("status", "unresolved").ifBlank { "unresolved" }
            if (status !in setOf("unresolved", "resolving_local", "replay_mismatch", "unsupported_remote")) {
                throw BackupFormatException("Backup contains an invalid conflict status.")
            }
            val mutationId = item.nullableString("mutationId")
            mutationId?.let {
                runCatching { java.util.UUID.fromString(it) }
                    .getOrElse { throw BackupFormatException("Backup contains an invalid conflict mutation identity.") }
            }
            val localDeletedAt = item.nullableString("localDeletedAt")
            val serverDeletedAt = item.nullableString("serverDeletedAt")
            localDeletedAt?.let { requireInstant(it, "conflict local deletion timestamp") }
            serverDeletedAt?.let { requireInstant(it, "conflict server deletion timestamp") }
            add(SyncConflictEntity(
                id = item.requiredString("id", "conflict"),
                entityType = item.requiredString("entityType", "conflict"),
                entityId = item.optString("entityId", "singleton").ifBlank { "singleton" },
                mutationId = mutationId,
                localPayload = item.optString("localPayload"),
                localDeletedAt = localDeletedAt,
                localHistory = localHistory,
                serverPayload = item.optString("serverPayload"),
                serverDeletedAt = serverDeletedAt,
                serverVersion = serverVersionValue.toLong(),
                createdAt = createdAt,
                status = status
            ))
        }
    }

    private fun JSONObject.requiredString(key: String, kind: String): String = optString(key).trim()
        .takeIf(String::isNotBlank) ?: throw BackupFormatException("Backup contains invalid $kind data.")

    private fun JSONObject.nullableString(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).takeIf(String::isNotBlank)

    private fun JSONObject.nullableLong(key: String): Long? {
        if (!has(key) || isNull(key)) return null
        val raw = opt(key)
        if (raw !is Number || raw.toLong() < 0L) {
            throw BackupFormatException("Backup contains an invalid numeric synchronization value.")
        }
        return raw.toLong()
    }

    private fun requireInstant(value: String, kind: String) {
        runCatching { Instant.parse(value) }
            .getOrElse { throw BackupFormatException("Backup contains an invalid $kind.") }
    }

    private fun validateSyncState(payload: GoalflowBackupPayload) {
        val outboxIds = payload.outbox.mapTo(linkedSetOf()) { it.mutationId }
        payload.outbox.forEach { mutation ->
            mutation.dependsOnMutationId?.let { dependency ->
                runCatching { java.util.UUID.fromString(dependency) }
                    .getOrElse { throw BackupFormatException("Backup contains an invalid pending dependency identity.") }
                if (dependency !in outboxIds) {
                    throw BackupFormatException("Backup contains a pending mutation with a missing dependency.")
                }
            }
            mutation.resolvesConflictId?.let { conflictId ->
                if (payload.conflicts.none { it.id == conflictId }) {
                    throw BackupFormatException("Backup contains a conflict resolution without its preserved conflict.")
                }
            }
        }
        val represented = outboxIds.toMutableSet()
        payload.conflicts.forEach { conflict ->
            val history = JSONArray(conflict.localHistory)
            for (index in 0 until history.length()) {
                val mutationId = history.getJSONObject(index).getString("mutationId")
                if (!represented.add(mutationId)) {
                    throw BackupFormatException("Backup repeats one pending mutation identity in synchronization state.")
                }
            }
        }
    }

    private fun deriveKey(password: String, salt: ByteArray, iterations: Int): SecretKeySpec {
        val spec = PBEKeySpec(password.toCharArray(), salt, iterations, 256)
        return try {
            SecretKeySpec(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded, "AES")
        } finally {
            spec.clearPassword()
        }
    }

    private fun requirePassword(password: String) {
        if (password.length < 12) throw BackupFormatException("Use a backup password with at least 12 characters.")
    }

    private fun decodeBase64(value: String, expectedSize: Int?, field: String): ByteArray {
        val decoded = runCatching { Base64.getDecoder().decode(value) }
            .getOrElse { throw BackupFormatException("Backup $field is invalid.") }
        if (expectedSize != null && decoded.size != expectedSize) throw BackupFormatException("Backup $field is invalid.")
        return decoded
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { byte -> (byte.toInt() and 0xff).toString(16).padStart(2, '0') }
}
