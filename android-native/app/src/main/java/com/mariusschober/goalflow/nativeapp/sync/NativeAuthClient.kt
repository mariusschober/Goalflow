package com.mariusschober.goalflow.nativeapp.sync

import android.content.Intent
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

class NativeAuthException(message: String) : IllegalStateException(message)

/**
 * Uses the existing Supabase magic-link flow. No local/demo account is ever
 * synthesized; without configured public Supabase settings the native app is
 * simply local-first and unauthenticated.
 */
class NativeAuthClient(private val sessionStore: SecureSessionStore) {
    suspend fun requestMagicLink(email: String) = withContext(Dispatchers.IO) {
        if (!NativeConfig.canUseAuthentication) throw NativeAuthException("Authentication is not configured for this build.")
        val cleanEmail = email.trim()
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(cleanEmail).matches()) {
            throw NativeAuthException("Enter a valid email address.")
        }
        val body = JSONObject().apply {
            put("email", cleanEmail)
            put("create_user", false)
            put("options", JSONObject().put("redirect_to", NativeConfig.authRedirectUri))
        }
        val response = request(
            url = "${NativeConfig.supabaseUrl}/auth/v1/otp",
            method = "POST",
            body = body.toString(),
            headers = mapOf("apikey" to NativeConfig.supabaseAnonKey)
        )
        if (response.code !in 200..299) throw NativeAuthException("The sign-in link could not be sent.")
    }

    suspend fun currentSession(): NativeSession? = withContext(Dispatchers.IO) {
        val current = sessionStore.read() ?: return@withContext null
        if (current.expiresAtMillis > System.currentTimeMillis() + EXPIRY_SAFETY_WINDOW_MILLIS) return@withContext current
        refresh(current.refreshToken)
    }

    fun acceptCallback(intent: Intent?): Boolean {
        val uri = intent?.data ?: return false
        if (uri.scheme != "goalflow" || uri.host != "auth" || uri.path != "/callback") return false
        val params = parseFragment(uri)
        val accessToken = params["access_token"].orEmpty()
        val refreshToken = params["refresh_token"].orEmpty()
        if (accessToken.isBlank() || refreshToken.isBlank()) return false
        val expiresIn = params["expires_in"]?.toLongOrNull()?.coerceAtLeast(60L) ?: 3_600L
        sessionStore.write(
            NativeSession(
                accessToken = accessToken,
                refreshToken = refreshToken,
                expiresAtMillis = System.currentTimeMillis() + expiresIn * 1_000L,
                userId = params["user_id"]
            )
        )
        return true
    }

    fun clearSession() = sessionStore.clear()

    private suspend fun refresh(refreshToken: String): NativeSession = withContext(Dispatchers.IO) {
        if (!NativeConfig.canUseAuthentication) throw NativeAuthException("Authentication is not configured for this build.")
        val response = request(
            url = "${NativeConfig.supabaseUrl}/auth/v1/token?grant_type=refresh_token",
            method = "POST",
            body = JSONObject().put("refresh_token", refreshToken).toString(),
            headers = mapOf("apikey" to NativeConfig.supabaseAnonKey)
        )
        if (response.code !in 200..299) {
            sessionStore.clear()
            throw NativeAuthException("Your cloud session expired. Local commitments are still available.")
        }
        val json = JSONObject(response.body)
        val session = NativeSession(
            accessToken = json.getString("access_token"),
            refreshToken = json.optString("refresh_token", refreshToken),
            expiresAtMillis = System.currentTimeMillis() + json.optLong("expires_in", 3_600L) * 1_000L,
            userId = json.optJSONObject("user")?.optString("id")?.takeIf(String::isNotBlank)
        )
        sessionStore.write(session)
        session
    }

    private fun request(
        url: String,
        method: String,
        body: String?,
        headers: Map<String, String>
    ): HttpResponse {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 15_000
            useCaches = false
            doInput = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Cache-Control", "no-store")
            headers.forEach { (key, value) -> setRequestProperty(key, value) }
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

    private fun parseFragment(uri: Uri): Map<String, String> = uri.fragment.orEmpty()
        .split('&')
        .mapNotNull { pair ->
            val parts = pair.split('=', limit = 2)
            if (parts.size != 2) return@mapNotNull null
            URLDecoder.decode(parts[0], StandardCharsets.UTF_8.name()) to
                URLDecoder.decode(parts[1], StandardCharsets.UTF_8.name())
        }
        .toMap()

    private data class HttpResponse(val code: Int, val body: String)

    private companion object {
        const val EXPIRY_SAFETY_WINDOW_MILLIS = 60_000L
    }
}
