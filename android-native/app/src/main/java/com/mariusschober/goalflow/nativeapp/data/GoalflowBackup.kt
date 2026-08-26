package com.mariusschober.goalflow.nativeapp.data

import com.mariusschober.goalflow.nativeapp.domain.DailyPlan
import com.mariusschober.goalflow.nativeapp.domain.GoalflowGoal
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
    val plans: List<DailyPlan>
)

class BackupFormatException(message: String) : IllegalArgumentException(message)

enum class BackupRestoreMode { MERGE, REPLACE }

/** AES-256-GCM + PBKDF2-SHA256 envelope matching the web backup contract. */
object GoalflowBackup {
    private const val FORMAT = "goalflow-encrypted-backup"
    private const val FORMAT_VERSION = 1
    private const val SCHEMA_VERSION = 2
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
            val collections = envelopePayload.optJSONObject("collections") ?: envelopePayload
            val payload = parsePayload(collections)
            val expectedChecksum = envelopePayload.optString("checksum", collections.optString("checksum"))
            if (expectedChecksum.isNotBlank() && expectedChecksum != sha256(checksumSource(payload).toString())) {
                throw BackupFormatException("Backup checksum validation failed.")
            }
            return payload
        } catch (error: BackupFormatException) {
            throw error
        } catch (_: Exception) {
            throw BackupFormatException("The backup password is incorrect or the file is damaged.")
        }
    }

    private fun parsePayload(collections: JSONObject): GoalflowBackupPayload {
        val tasks = collections.optJSONArray("tasks")?.toString()?.let(GoalflowJson::parseTasks).orEmpty()
        val goals = collections.optJSONArray("goals")?.toString()?.let(GoalflowJson::parseGoals).orEmpty()
        val plans = collections.optJSONArray("plans")?.let(::parsePlans).orEmpty()
        return GoalflowBackupPayload(tasks, goals, plans)
    }

    private fun backupJson(payload: GoalflowBackupPayload): JSONObject = JSONObject().apply {
        put("schemaVersion", SCHEMA_VERSION)
        put("exportedAt", Instant.now().toString())
        put("checksum", sha256(checksumSource(payload).toString()))
        put("collections", checksumSource(payload))
    }

    private fun checksumSource(payload: GoalflowBackupPayload): JSONObject = JSONObject().apply {
        put("tasks", GoalflowJson.tasksPayload(payload.tasks))
        put("goals", GoalflowJson.goalsPayload(payload.goals))
        put("plans", plansPayload(payload.plans))
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
            val item = array.optJSONObject(index) ?: continue
            val localDate = item.optString("localDate").trim()
            if (localDate.isBlank()) continue
            val ids = item.optJSONArray("taskIds")?.let { idsArray ->
                buildList(idsArray.length()) { for (idIndex in 0 until idsArray.length()) add(idsArray.optString(idIndex)) }
            }.orEmpty()
            add(DailyPlan(localDate, item.optLong("confirmedAt", 0L), ids))
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
