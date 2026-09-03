package com.mariusschober.goalflow.nativeapp.sync

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.AEADBadTagException
import javax.crypto.BadPaddingException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class NativeSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtMillis: Long,
    val userId: String?,
    val assuranceLevel: String = "aal1"
)

fun interface NativeSessionProvider {
    fun read(): NativeSession?
}

/** Stores cloud session material encrypted by an Android Keystore key. */
open class SecureSessionStore(context: Context) : NativeSessionProvider {
    private val preferences = context.getSharedPreferences("goalflow-secure-session", Context.MODE_PRIVATE)
    @Volatile private var inMemoryReadProblem: String? = null

    override fun read(): NativeSession? {
        return try {
            val encoded = preferences.getString(KEY_SESSION, null) ?: return null
            val json = JSONObject(decrypt(encoded))
            NativeSession(
                accessToken = json.getString("accessToken"),
                refreshToken = json.getString("refreshToken"),
                expiresAtMillis = json.getLong("expiresAtMillis"),
                userId = if (!json.has("userId") || json.isNull("userId")) null
                    else json.optString("userId").takeIf(String::isNotBlank),
                assuranceLevel = if (json.optString("assuranceLevel") == "aal2") "aal2" else "aal1"
            ).also { clearReadProblemAfterVerifiedRead() }
        } catch (error: Exception) {
            recordReadProblem(error)
            null
        }
    }

    open fun readProblem(): String? = inMemoryReadProblem
        ?: runCatching { preferences.getString(KEY_SESSION_READ_PROBLEM, null) }.getOrNull()

    open fun write(session: NativeSession) {
        val json = JSONObject().apply {
            put("accessToken", session.accessToken)
            put("refreshToken", session.refreshToken)
            put("expiresAtMillis", session.expiresAtMillis)
            put("userId", session.userId ?: JSONObject.NULL)
            put("assuranceLevel", if (session.assuranceLevel == "aal2") "aal2" else "aal1")
        }
        check(preferences.edit()
            .putString(KEY_SESSION, encrypt(json.toString()))
            .remove(KEY_SESSION_READ_PROBLEM)
            .commit()) {
            "The cloud session could not be stored durably."
        }
        inMemoryReadProblem = null
    }

    open fun clear() {
        check(preferences.edit().remove(KEY_SESSION).remove(KEY_SESSION_READ_PROBLEM).commit()) {
            "The cloud session could not be cleared."
        }
        inMemoryReadProblem = null
    }

    open fun setPendingState(state: String, verifier: String) {
        val encrypted = encrypt(JSONObject().put("state", state).put("verifier", verifier).toString())
        check(preferences.edit()
            .putString(KEY_PENDING_AUTH, encrypted)
            .remove(KEY_PENDING_STATE)
            .remove(KEY_PENDING_VERIFIER)
            .commit()) {
            "The pending auth state could not be stored."
        }
    }

    open fun getPendingState(): String? = readPendingAuth()?.optString("state")?.takeIf(String::isNotBlank)

    open fun getPendingVerifier(): String? = readPendingAuth()?.optString("verifier")?.takeIf(String::isNotBlank)

    open fun clearPendingState() {
        check(preferences.edit()
            .remove(KEY_PENDING_AUTH)
            .remove(KEY_PENDING_STATE)
            .remove(KEY_PENDING_VERIFIER)
            .commit()) {
            "The pending auth state could not be cleared."
        }
    }

    private fun readPendingAuth(): JSONObject? {
        val encoded = preferences.getString(KEY_PENDING_AUTH, null) ?: return null
        return runCatching { JSONObject(decrypt(encoded)) }.getOrElse {
            // An unusable verifier can never complete PKCE. Remove only that
            // pending request; the independent local database remains intact.
            preferences.edit().remove(KEY_PENDING_AUTH).commit()
            null
        }
    }

    private fun recordReadProblem(error: Exception) {
        inMemoryReadProblem = SESSION_READ_PROBLEM
        val isDigestFailure = error is AEADBadTagException || error is BadPaddingException
            || error.cause is AEADBadTagException || error.cause is BadPaddingException
        val isKeyLoss = error is java.security.KeyStoreException
            || error is java.security.UnrecoverableKeyException
            || error.cause is java.security.KeyStoreException
            || isDigestFailure
        try {
            val editor = preferences.edit().putString(KEY_SESSION_READ_PROBLEM, SESSION_READ_PROBLEM)
            // Cryptographic key loss makes the ciphertext unrecoverable. Other
            // malformed values remain preserved until the user explicitly
            // replaces or clears the session.
            if (isKeyLoss) editor.remove(KEY_SESSION)
            editor.commit()
        } catch (_: Exception) {}
        if (isKeyLoss) {
            try { KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(KEY_ALIAS) } catch (_: Exception) {}
        }
    }

    private fun clearReadProblemAfterVerifiedRead() {
        if (readProblem() == null) return
        try {
            if (preferences.edit().remove(KEY_SESSION_READ_PROBLEM).commit()) {
                inMemoryReadProblem = null
            }
        } catch (_: Exception) {}
    }

    private fun key(): SecretKey {
        try {
            val store = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            val existing = store.getKey(KEY_ALIAS, null) as? SecretKey
            if (existing != null) return existing
            return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).apply {
                init(
                    KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                    )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setUserAuthenticationRequired(false)
                        .setInvalidatedByBiometricEnrollment(false)
                        .build()
                )
            }.generateKey()
        } catch (e: Exception) {
            // If KeyStore is unavailable (e.g., Robolectric), fallback to an in-memory key is handled by the test double.
            // In production, re-throw to let read() clear the stale entry.
            throw e
        }
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val ciphertext = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
        return "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(ciphertext, Base64.NO_WRAP)}"
    }

    private fun decrypt(value: String): String {
        val parts = value.split(':', limit = 2)
        require(parts.size == 2)
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        }
        return String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8)
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "goalflow_native_session"
        const val KEY_SESSION = "encrypted_session"
        const val KEY_SESSION_READ_PROBLEM = "session_read_problem"
        const val KEY_PENDING_AUTH = "encrypted_pending_auth"
        // Removed on every write/clear to purge pre-PKCE plaintext state.
        const val KEY_PENDING_STATE = "pending_oauth_state"
        const val KEY_PENDING_VERIFIER = "pending_code_verifier"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val SESSION_READ_PROBLEM = "Cloud session storage is unreadable. Local commitments and queued changes were not deleted; sign in again to replace the damaged session."
    }
}
