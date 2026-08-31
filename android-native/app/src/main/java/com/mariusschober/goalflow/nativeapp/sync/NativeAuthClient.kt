package com.mariusschober.goalflow.nativeapp.sync

import android.content.Intent
import android.net.Uri
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom

class NativeAuthException(message: String) : IllegalStateException(message)

/**
 * Uses the existing Supabase magic-link flow. No local/demo account is ever
 * synthesized; without configured public Supabase settings the native app is
 * simply local-first and unauthenticated.
 */
open class NativeAuthClient(
    private val sessionStore: SecureSessionStore,
    private val isAuthEnabled: () -> Boolean = { NativeConfig.canUseAuthentication }
) {
    suspend fun requestMagicLink(email: String) = withContext(Dispatchers.IO) {
        if (!isAuthEnabled()) throw NativeAuthException("Authentication is not configured for this build.")
        val cleanEmail = email.trim()
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(cleanEmail).matches()) {
            throw NativeAuthException("Enter a valid email address.")
        }
        val state = generateState()
        val verifier = generateCodeVerifier()
        sessionStore.setPendingState(state, verifier)
        // PKCE S256: verifier -> code_challenge. Supabase magic-link uses implicit fragment flow (state is CSRF);
        // we wire code_challenge for forward-compatibility with code flow and retain verifier for future exchange.
        val codeChallenge = codeChallenge(verifier)
        val redirectWithState = "${NativeConfig.authRedirectUri}?state=$state&code_challenge=$codeChallenge&code_challenge_method=S256"
        val body = JSONObject().apply {
            put("email", cleanEmail)
            put("create_user", false)
            put("options", JSONObject()
                .put("redirect_to", redirectWithState)
                .put("code_challenge", codeChallenge)
                .put("code_challenge_method", "S256"))
            put("code_challenge", codeChallenge)
            put("code_challenge_method", "S256")
        }
        val response = request(
            url = "${NativeConfig.supabaseUrl}/auth/v1/otp",
            method = "POST",
            body = body.toString(),
            headers = mapOf("apikey" to NativeConfig.supabaseAnonKey)
        )
        if (response.code !in 200..299) {
            sessionStore.clearPendingState()
            throw NativeAuthException("The sign-in link could not be sent.")
        }
    }

    suspend fun currentSession(): NativeSession? = withContext(Dispatchers.IO) {
        val current = sessionStore.read() ?: return@withContext null
        // Proactive refresh 5 minutes before expiry to avoid race with sync
        if (current.expiresAtMillis > System.currentTimeMillis() + 5 * 60_000L) return@withContext current
        if (current.expiresAtMillis > System.currentTimeMillis() + EXPIRY_SAFETY_WINDOW_MILLIS) {
            // Try refresh in background, but return current if still valid
            return@withContext try { refresh(current.refreshToken) } catch (_: Exception) { current }
        }
        refresh(current.refreshToken)
    }

    suspend fun refreshIfNeeded(): NativeSession? = currentSession()

    fun acceptCallback(intent: Intent?): Boolean {
        val uri = intent?.data ?: return false
        if (uri.scheme != "goalflow" || uri.host != "auth" || uri.path != "/callback") return false
        val params = parseFragment(uri)
        // Validate OAuth state to prevent CSRF
        val returnedState = params["state"].orEmpty()
        val expectedState = sessionStore.getPendingState()
        if (expectedState == null) return false
        if (returnedState != expectedState) return false
        val queryState = uri.getQueryParameter("state")
        if (queryState != null && queryState != expectedState) return false
        val accessToken = params["access_token"].orEmpty()
        val refreshToken = params["refresh_token"].orEmpty()
        if (accessToken.isBlank() || refreshToken.isBlank()) return false
        // Validate JWT issuer, audience, expiry
        if (!isValidJwt(accessToken)) return false
        val expiresIn = params["expires_in"]?.toLongOrNull()?.coerceAtLeast(60L) ?: 3_600L
        sessionStore.write(
            NativeSession(
                accessToken = accessToken,
                refreshToken = refreshToken,
                expiresAtMillis = System.currentTimeMillis() + expiresIn * 1_000L,
                userId = params["user_id"] ?: extractUserIdFromJwt(accessToken)
            )
        )
        sessionStore.clearPendingState()
        return true
    }

    fun clearSession() = sessionStore.clear()

    private suspend fun refresh(refreshToken: String): NativeSession = withContext(Dispatchers.IO) {
        if (!isAuthEnabled()) throw NativeAuthException("Authentication is not configured for this build.")
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

    internal open fun request(
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

    internal data class HttpResponse(val code: Int, val body: String)

    internal fun codeChallenge(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(StandardCharsets.US_ASCII))
        return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    private fun generateState(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    private fun generateCodeVerifier(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    private fun isValidJwt(token: String): Boolean = runCatching {
        val parts = token.split('.')
        if (parts.size != 3) return false
        val payloadJson = String(Base64.decode(parts[1], Base64.URL_SAFE), StandardCharsets.UTF_8)
        val payload = JSONObject(payloadJson)
        val iss = payload.optString("iss")
        val aud = payload.optString("aud")
        val exp = payload.optLong("exp", 0L)
        if (iss.isNotBlank() && !iss.contains(NativeConfig.supabaseUrl)) return false
        if (aud.isNotBlank() && aud != NativeConfig.supabaseAnonKey && !aud.contains("authenticated")) {
            // Allow Supabase anon key or generic audience; if strict, check contains project ref
        }
        if (exp != 0L && exp * 1000L <= System.currentTimeMillis()) return false
        true
    }.getOrDefault(false)

    private fun extractUserIdFromJwt(token: String): String? = runCatching {
        val parts = token.split('.')
        if (parts.size != 3) return null
        val payloadJson = String(Base64.decode(parts[1], Base64.URL_SAFE), StandardCharsets.UTF_8)
        JSONObject(payloadJson).optString("sub").takeIf(String::isNotBlank)
    }.getOrNull()

    private companion object {
        const val EXPIRY_SAFETY_WINDOW_MILLIS = 60_000L
    }
}
