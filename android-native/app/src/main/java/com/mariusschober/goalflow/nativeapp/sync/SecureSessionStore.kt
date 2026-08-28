package com.mariusschober.goalflow.nativeapp.sync

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class NativeSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtMillis: Long,
    val userId: String?
)

fun interface NativeSessionProvider {
    fun read(): NativeSession?
}

/** Stores cloud session material encrypted by an Android Keystore key. */
class SecureSessionStore(context: Context) : NativeSessionProvider {
    private val preferences = context.getSharedPreferences("goalflow-secure-session", Context.MODE_PRIVATE)

    override fun read(): NativeSession? = runCatching {
        val encoded = preferences.getString(KEY_SESSION, null) ?: return null
        val json = JSONObject(decrypt(encoded))
        NativeSession(
            accessToken = json.getString("accessToken"),
            refreshToken = json.getString("refreshToken"),
            expiresAtMillis = json.getLong("expiresAtMillis"),
            userId = json.optString("userId").takeIf(String::isNotBlank)
        )
    }.getOrNull()

    fun write(session: NativeSession) {
        val json = JSONObject().apply {
            put("accessToken", session.accessToken)
            put("refreshToken", session.refreshToken)
            put("expiresAtMillis", session.expiresAtMillis)
            put("userId", session.userId ?: JSONObject.NULL)
        }
        check(preferences.edit().putString(KEY_SESSION, encrypt(json.toString())).commit()) {
            "The cloud session could not be stored durably."
        }
    }

    fun clear() {
        check(preferences.edit().remove(KEY_SESSION).commit()) {
            "The cloud session could not be cleared."
        }
    }

    private fun key(): SecretKey {
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
                    .build()
            )
        }.generateKey()
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
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
