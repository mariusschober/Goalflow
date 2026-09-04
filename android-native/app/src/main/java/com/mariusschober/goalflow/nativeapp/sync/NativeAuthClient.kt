package com.mariusschober.goalflow.nativeapp.sync

import android.content.Intent
import android.net.Uri
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom

class NativeAuthException(message: String) : IllegalStateException(message)
class NativeAuthTransientException(message: String) : IOException(message)

/**
 * Uses the existing Supabase magic-link flow. No local/demo account is ever
 * synthesized; without configured public Supabase settings the native app is
 * simply local-first and unauthenticated.
 */
open class NativeAuthClient(
    private val sessionStore: SecureSessionStore,
    private val isAuthEnabled: () -> Boolean = { NativeConfig.canUseAuthentication },
    private val supabaseUrl: String = NativeConfig.supabaseUrl,
    private val supabasePublicKey: String = NativeConfig.supabasePublicKey,
    private val authRedirectUri: String = NativeConfig.authRedirectUri
) {
    suspend fun requestMagicLink(email: String) = withContext(Dispatchers.IO) {
        requireSafeAuthConfiguration()
        val cleanEmail = email.trim()
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(cleanEmail).matches()) {
            throw NativeAuthException("Enter a valid email address.")
        }
        val state = generateState()
        val verifier = generateCodeVerifier()
        sessionStore.setPendingState(state, verifier)
        val codeChallenge = codeChallenge(verifier)
        val redirectWithState = Uri.parse(authRedirectUri).buildUpon()
            .appendQueryParameter("state", state)
            .build()
            .toString()
        val requestUrl = Uri.parse("$supabaseUrl/auth/v1/otp").buildUpon()
            .appendQueryParameter("redirect_to", redirectWithState)
            .build()
            .toString()
        val body = JSONObject().apply {
            put("email", cleanEmail)
            put("create_user", false)
            put("code_challenge", codeChallenge)
            put("code_challenge_method", "s256")
        }
        val response = request(
            url = requestUrl,
            method = "POST",
            body = body.toString(),
            headers = authHeaders()
        )
        if (response.code !in 200..299) {
            // The email may have been accepted even if its acknowledgement was
            // lost. Preserve the verifier so an arriving link remains usable.
            throw NativeAuthException("Sign-in delivery could not be confirmed. Use the link if it arrives, or request a new one.")
        }
    }

    suspend fun currentSession(): NativeSession? = withContext(Dispatchers.IO) {
        val current = sessionStore.read() ?: return@withContext null
        // Proactive refresh 5 minutes before expiry to avoid race with sync
        if (current.expiresAtMillis > System.currentTimeMillis() + 5 * 60_000L) return@withContext current
        if (current.expiresAtMillis > System.currentTimeMillis() + EXPIRY_SAFETY_WINDOW_MILLIS) {
            // Try refresh in background, but return current if still valid
            return@withContext try { refresh(current.refreshToken) } catch (_: IOException) { current }
        }
        refresh(current.refreshToken)
    }

    suspend fun refreshIfNeeded(): NativeSession? = currentSession()

    suspend fun completeMfa(code: String): NativeSession = withContext(Dispatchers.IO) {
        requireSafeAuthConfiguration()
        val cleanCode = code.trim()
        if (!cleanCode.matches(Regex("^[0-9]{6}$"))) {
            throw NativeAuthException("Enter the six-digit authenticator code.")
        }
        val current = sessionStore.read()
            ?: throw NativeAuthException("Sign in before verifying the owner session.")
        if (current.assuranceLevel == "aal2") return@withContext current

        val userResponse = request(
            url = "$supabaseUrl/auth/v1/user",
            method = "GET",
            body = null,
            headers = authHeaders(current.accessToken)
        )
        requireMfaResponse(userResponse, current, "The authenticator enrollment could not be loaded.")
        val factors = runCatching { JSONObject(userResponse.body).optJSONArray("factors") }
            .getOrNull()
            ?: throw NativeAuthException("Enroll an authenticator in the web app before verifying this device.")
        val factorId = (0 until factors.length())
            .mapNotNull { factors.optJSONObject(it) }
            .firstOrNull {
                it.optString("factor_type") == "totp" && it.optString("status") == "verified"
            }
            ?.optString("id")
            ?.takeIf { it.matches(UUID_PATTERN) }
            ?: throw NativeAuthException("Enroll an authenticator in the web app before verifying this device.")
        requireUnchangedSession(current)

        val challengeResponse = request(
            url = "$supabaseUrl/auth/v1/factors/$factorId/challenge",
            method = "POST",
            body = JSONObject().put("factorId", factorId).toString(),
            headers = authHeaders(current.accessToken)
        )
        requireMfaResponse(challengeResponse, current, "The authenticator challenge could not be created.")
        val challenge = runCatching { JSONObject(challengeResponse.body) }.getOrNull()
            ?: throw NativeAuthException("The authentication server returned invalid challenge data.")
        val challengeId = challenge.optString("id").takeIf { it.matches(UUID_PATTERN) }
            ?: throw NativeAuthException("The authentication server returned invalid challenge data.")
        if (challenge.optString("type") != "totp") {
            throw NativeAuthException("The authentication server returned an unsupported challenge.")
        }
        requireUnchangedSession(current)

        val verifyResponse = request(
            url = "$supabaseUrl/auth/v1/factors/$factorId/verify",
            method = "POST",
            body = JSONObject().put("challenge_id", challengeId).put("code", cleanCode).toString(),
            headers = authHeaders(current.accessToken)
        )
        requireMfaResponse(verifyResponse, current, "The authenticator code was not accepted.")
        val elevated = parseSessionResponse(verifyResponse.body, current.refreshToken)
        if (elevated.userId != current.userId || elevated.assuranceLevel != "aal2") {
            throw NativeAuthException("The verified session did not match this account at AAL2.")
        }
        requireUnchangedSession(current)
        sessionStore.write(elevated)
        elevated
    }

    suspend fun acceptCallback(intent: Intent?): Boolean = withContext(Dispatchers.IO) {
        val uri = intent?.data ?: return@withContext false
        if (!isExpectedCallback(uri)) return@withContext false
        requireSafeAuthConfiguration()
        if (!uri.fragment.isNullOrBlank()) {
            throw NativeAuthException("The sign-in callback used an unsupported token fragment. Request a new link.")
        }
        val returnedState = uri.getQueryParameter("state").orEmpty()
        val expectedState = sessionStore.getPendingState()
            ?: throw NativeAuthException("This sign-in link was not requested on this device.")
        if (!secureEquals(returnedState, expectedState)) {
            throw NativeAuthException("The sign-in link did not match this device request.")
        }
        val authCode = uri.getQueryParameter("code")?.takeIf { it.isNotBlank() && it.length <= 2_048 }
            ?: throw NativeAuthException("The sign-in link did not contain a usable authorization code.")
        val verifier = sessionStore.getPendingVerifier()
            ?.takeIf { it.length in 43..128 && it.matches(PKCE_VERIFIER_PATTERN) }
            ?: throw NativeAuthException("The sign-in verifier is missing. Request a new link on this device.")
        val response = request(
            url = "$supabaseUrl/auth/v1/token?grant_type=pkce",
            method = "POST",
            body = JSONObject()
                .put("auth_code", authCode)
                .put("code_verifier", verifier)
                .toString(),
            headers = authHeaders()
        )
        if (response.code !in 200..299) {
            if (isRetryableStatus(response.code)) {
                throw NativeAuthTransientException("The sign-in exchange is temporarily unavailable. Try this link again.")
            }
            throw NativeAuthException("The sign-in link is invalid or expired. Request a new link.")
        }
        val session = parseSessionResponse(response.body)
        sessionStore.write(session)
        // The authorization code is single-use. A stale verifier is harmless
        // if clearing fails after the durable session write, and a new request
        // always replaces it.
        runCatching { sessionStore.clearPendingState() }
        true
    }

    private fun isExpectedCallback(uri: Uri): Boolean {
        val expected = Uri.parse(authRedirectUri)
        return uri.scheme.equals(expected.scheme, ignoreCase = true)
            && uri.host.equals(expected.host, ignoreCase = true)
            && uri.port == expected.port
            && uri.path == expected.path
            && uri.userInfo == null
    }

    fun clearSession() = sessionStore.clear()

    suspend fun signOut() {
        val current = sessionStore.read()
        // Clear first so an in-flight worker stops before another authenticated
        // request. Room data and the outbox are deliberately untouched.
        sessionStore.clear()
        if (current == null || !isAuthEnabled()) return
        requireSafeAuthConfiguration()
        val response = withContext(Dispatchers.IO) {
            request(
                url = "$supabaseUrl/auth/v1/logout?scope=local",
                method = "POST",
                body = null,
                headers = authHeaders(current.accessToken)
            )
        }
        if (response.code !in 200..299 && response.code !in setOf(401, 403, 404)) {
            throw NativeAuthException("Signed out on this device, but server sign-out could not be confirmed.")
        }
    }

    private suspend fun refresh(refreshToken: String): NativeSession = withContext(Dispatchers.IO) {
        requireSafeAuthConfiguration()
        val response = request(
            url = "$supabaseUrl/auth/v1/token?grant_type=refresh_token",
            method = "POST",
            body = JSONObject().put("refresh_token", refreshToken).toString(),
            headers = authHeaders()
        )
        if (response.code !in 200..299) {
            if (!isRetryableStatus(response.code)) sessionStore.clear()
            if (isRetryableStatus(response.code)) {
                throw NativeAuthTransientException("Session refresh is temporarily unavailable. Local commitments are still available.")
            }
            throw NativeAuthException("Your cloud session expired. Local commitments are still available.")
        }
        val session = parseSessionResponse(response.body, refreshToken)
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
            instanceFollowRedirects = false
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
            val responseBody = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { reader ->
                val content = StringBuilder()
                val buffer = CharArray(4_096)
                while (true) {
                    val count = reader.read(buffer)
                    if (count < 0) break
                    if (content.length + count > MAX_AUTH_RESPONSE_CHARS) {
                        throw NativeAuthException("The authentication response was too large.")
                    }
                    content.append(buffer, 0, count)
                }
                content.toString()
            }.orEmpty()
            HttpResponse(code, responseBody)
        } finally {
            connection.disconnect()
        }
    }

    internal data class HttpResponse(val code: Int, val body: String)

    private data class TokenClaims(
        val issuer: String,
        val subject: String,
        val expiresAtSeconds: Long,
        val authenticatedAudience: Boolean,
        val assuranceLevel: String
    )

    private fun authHeaders(accessToken: String = supabasePublicKey): Map<String, String> = mapOf(
        "apikey" to supabasePublicKey,
        "Authorization" to "Bearer $accessToken"
    )

    private fun requireSafeAuthConfiguration() {
        val origin = runCatching { Uri.parse(supabaseUrl) }.getOrNull()
        if (!isAuthEnabled()
            || origin?.scheme != "https"
            || origin?.host.isNullOrBlank()
            || supabasePublicKey.isBlank()
            || authRedirectUri != NativeConfig.authRedirectUri
        ) {
            throw NativeAuthException("Authentication is not safely configured for this build.")
        }
    }

    private fun parseSessionResponse(body: String, fallbackRefreshToken: String? = null): NativeSession {
        val json = runCatching { JSONObject(body) }
            .getOrElse { throw NativeAuthException("The authentication server returned invalid data.") }
        val accessToken = json.optString("access_token").takeIf(String::isNotBlank)
            ?: throw NativeAuthException("The authentication response did not contain an access token.")
        val refreshToken = json.optString("refresh_token").takeIf(String::isNotBlank)
            ?: fallbackRefreshToken?.takeIf(String::isNotBlank)
            ?: throw NativeAuthException("The authentication response did not contain a refresh token.")
        val expiresInValue = json.opt("expires_in")
        val expiresIn = (expiresInValue as? Number)?.toLong()
            ?.takeIf { it in 60L..86_400L }
            ?: throw NativeAuthException("The authentication response contained an invalid expiry.")
        val responseUserId = json.optJSONObject("user")?.optString("id")
            ?.takeIf { it.matches(UUID_PATTERN) }
            ?: throw NativeAuthException("The authentication response contained no stable account identity.")
        val claims = parseTokenClaims(accessToken)
            ?: throw NativeAuthException("The authentication response contained an invalid access token.")
        val expectedIssuer = "$supabaseUrl/auth/v1"
        val now = System.currentTimeMillis()
        val tokenExpiryMillis = runCatching { Math.multiplyExact(claims.expiresAtSeconds, 1_000L) }
            .getOrDefault(0L)
        if (claims.issuer != expectedIssuer
            || claims.subject != responseUserId
            || !claims.authenticatedAudience
            || tokenExpiryMillis <= now
        ) {
            throw NativeAuthException("The authentication response did not match this Supabase project and account.")
        }
        return NativeSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtMillis = minOf(now + expiresIn * 1_000L, tokenExpiryMillis),
            userId = responseUserId,
            assuranceLevel = claims.assuranceLevel
        )
    }

    private fun parseTokenClaims(token: String): TokenClaims? = runCatching {
        val parts = token.split('.')
        if (parts.size != 3) return null
        val payloadJson = String(
            Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP),
            StandardCharsets.UTF_8
        )
        val payload = JSONObject(payloadJson)
        val audience = when (val value = payload.opt("aud")) {
            is String -> value == "authenticated"
            is JSONArray -> (0 until value.length()).any { value.optString(it) == "authenticated" }
            else -> false
        }
        TokenClaims(
            issuer = payload.optString("iss"),
            subject = payload.optString("sub"),
            expiresAtSeconds = (payload.opt("exp") as? Number)?.toLong() ?: 0L,
            authenticatedAudience = audience,
            assuranceLevel = if (payload.optString("aal") == "aal2") "aal2" else "aal1"
        )
    }.getOrNull()

    private fun requireMfaResponse(response: HttpResponse, expected: NativeSession, message: String) {
        if (response.code in 200..299) return
        if (response.code == 401 || response.code == 403) {
            clearSessionIfUnchanged(expected)
            throw NativeAuthException("The cloud session expired or was revoked. Local commitments remain available.")
        }
        if (isRetryableStatus(response.code)) {
            throw NativeAuthTransientException("Authentication is temporarily unavailable. Local commitments remain available.")
        }
        throw NativeAuthException(message)
    }

    private fun requireUnchangedSession(expected: NativeSession) {
        val current = sessionStore.read()
        if (current?.accessToken != expected.accessToken || current?.userId != expected.userId) {
            throw NativeAuthException("The signed-in account changed during verification. Try again with the current account.")
        }
    }

    private fun clearSessionIfUnchanged(expected: NativeSession) {
        val current = sessionStore.read()
        if (current?.accessToken == expected.accessToken && current?.userId == expected.userId) {
            sessionStore.clear()
        }
    }

    private fun secureEquals(left: String, right: String): Boolean = MessageDigest.isEqual(
        left.toByteArray(StandardCharsets.UTF_8),
        right.toByteArray(StandardCharsets.UTF_8)
    )

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

    private companion object {
        const val EXPIRY_SAFETY_WINDOW_MILLIS = 60_000L
        const val MAX_AUTH_RESPONSE_CHARS = 256 * 1024
        val PKCE_VERIFIER_PATTERN = Regex("^[A-Za-z0-9._~-]+$")
        val UUID_PATTERN = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        val RETRYABLE_STATUS = setOf(408, 425, 429)

        fun isRetryableStatus(code: Int): Boolean = code >= 500 || code in RETRYABLE_STATUS
    }
}
