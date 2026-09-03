package com.mariusschober.goalflow.nativeapp.sync

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Base64

@RunWith(RobolectricTestRunner::class)
class NativeAuthClientTest {
    private lateinit var store: SecureSessionStore
    private lateinit var client: NativeAuthClient

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        store = object : SecureSessionStore(context) {
            private var memSession: NativeSession? = null
            private var memState: String? = null
            private var memVerifier: String? = null
            override fun read(): NativeSession? = memSession
            override fun write(session: NativeSession) { memSession = session }
            override fun clear() { memSession = null }
            override fun setPendingState(state: String, verifier: String) { memState = state; memVerifier = verifier }
            override fun getPendingState(): String? = memState
            override fun getPendingVerifier(): String? = memVerifier
            override fun clearPendingState() { memState = null; memVerifier = null }
        }
        client = testClient()
    }

    @After
    fun tearDown() {
        store.clear()
        store.clearPendingState()
    }

    @Test
    fun `callback rejects mismatched state before exchange`() = runBlocking {
        store.setPendingState("expected_state_123", VERIFIER)

        expectAuthFailure {
            client.acceptCallback(callbackIntent("code=auth-code&state=wrong_state_123"))
        }

        assertNull(store.read())
        assertEquals("expected_state_123", store.getPendingState())
    }

    @Test
    fun `callback rejects legacy implicit token fragments`() = runBlocking {
        store.setPendingState("state123", VERIFIER)

        expectAuthFailure {
            client.acceptCallback(Intent().apply {
                data = Uri.parse("goalflow://auth/callback?state=state123#access_token=unsafe&refresh_token=unsafe")
            })
        }

        assertNull(store.read())
    }

    @Test
    fun `callback exchanges the code and stores only a project bound account`() = runBlocking {
        store.setPendingState("valid_state_123456", VERIFIER)
        var capturedUrl = ""
        var capturedBody = ""
        var capturedHeaders = emptyMap<String, String>()
        val exchangingClient = testClient { url, _, body, headers ->
            capturedUrl = url
            capturedBody = body.orEmpty()
            capturedHeaders = headers
            NativeAuthClient.HttpResponse(200, tokenResponse())
        }

        assertTrue(exchangingClient.acceptCallback(callbackIntent("code=one-time-code&state=valid_state_123456")))

        val exchange = JSONObject(capturedBody)
        assertTrue(capturedUrl.endsWith("/auth/v1/token?grant_type=pkce"))
        assertEquals("one-time-code", exchange.getString("auth_code"))
        assertEquals(VERIFIER, exchange.getString("code_verifier"))
        assertEquals(PUBLIC_KEY, capturedHeaders["apikey"])
        assertEquals("Bearer $PUBLIC_KEY", capturedHeaders["Authorization"])
        assertEquals(USER_ID, store.read()?.userId)
        assertNull(store.getPendingState())
        assertNull(store.getPendingVerifier())
    }

    @Test
    fun `expired exchanged token is rejected without writing a session`() = runBlocking {
        store.setPendingState("state123", VERIFIER)
        val exchangingClient = testClient { _, _, _, _ ->
            NativeAuthClient.HttpResponse(
                200,
                tokenResponse(accessToken = jwt(exp = System.currentTimeMillis() / 1_000L - 60L))
            )
        }

        expectAuthFailure {
            exchangingClient.acceptCallback(callbackIntent("code=expired-code&state=state123"))
        }

        assertNull(store.read())
        assertEquals(VERIFIER, store.getPendingVerifier())
    }

    @Test
    fun `exchange account mismatch is rejected without writing a session`() = runBlocking {
        store.setPendingState("state123", VERIFIER)
        val exchangingClient = testClient { _, _, _, _ ->
            NativeAuthClient.HttpResponse(
                200,
                tokenResponse(userId = "00000000-0000-4000-8000-000000000099")
            )
        }

        expectAuthFailure {
            exchangingClient.acceptCallback(callbackIntent("code=mismatch-code&state=state123"))
        }

        assertNull(store.read())
    }

    @Test
    fun `exchange rejects a token issued by another Supabase project`() = runBlocking {
        store.setPendingState("state123", VERIFIER)
        val exchangingClient = testClient { _, _, _, _ ->
            NativeAuthClient.HttpResponse(
                200,
                tokenResponse(accessToken = jwt(iss = "https://other-project.supabase.co/auth/v1"))
            )
        }

        expectAuthFailure {
            exchangingClient.acceptCallback(callbackIntent("code=wrong-project&state=state123"))
        }

        assertNull(store.read())
    }

    @Test
    fun `exchange rejects a token without the authenticated audience`() = runBlocking {
        store.setPendingState("state123", VERIFIER)
        val exchangingClient = testClient { _, _, _, _ ->
            NativeAuthClient.HttpResponse(200, tokenResponse(accessToken = jwt(aud = "anon")))
        }

        expectAuthFailure {
            exchangingClient.acceptCallback(callbackIntent("code=wrong-audience&state=state123"))
        }

        assertNull(store.read())
    }

    @Test
    fun `magic link request sends Supabase PKCE fields and exact native redirect`() = runBlocking {
        var capturedUrl = ""
        var capturedBody = ""
        val capturingClient = testClient { url, _, body, _ ->
            capturedUrl = url
            capturedBody = body.orEmpty()
            NativeAuthClient.HttpResponse(200, "{}")
        }

        capturingClient.requestMagicLink("person@example.com")

        val storedState = store.getPendingState()
        val storedVerifier = store.getPendingVerifier()
        assertNotNull(storedState)
        assertNotNull(storedVerifier)
        assertTrue(storedVerifier!!.length in 43..128)
        val body = JSONObject(capturedBody)
        assertEquals(false, body.getBoolean("create_user"))
        assertEquals("s256", body.getString("code_challenge_method"))
        assertEquals(capturingClient.codeChallenge(storedVerifier), body.getString("code_challenge"))
        assertFalse(body.has("options"))
        val redirect = Uri.parse(capturedUrl).getQueryParameter("redirect_to")
        assertNotNull(redirect)
        val redirectUri = Uri.parse(redirect)
        assertEquals(AUTH_REDIRECT, "${redirectUri.scheme}://${redirectUri.host}${redirectUri.path}")
        assertEquals(storedState, redirectUri.getQueryParameter("state"))
    }

    @Test
    fun `code challenge matches the RFC7636 S256 vector`() {
        val verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", client.codeChallenge(verifier))
    }

    @Test
    fun `owner authenticator challenge stores an exact aal2 session`() = runBlocking {
        store.write(session())
        val requests = mutableListOf<Pair<String, String?>>()
        val mfaClient = testClient { url, method, body, headers ->
            assertEquals("Bearer access-token", headers["Authorization"])
            requests += ("$method $url" to body)
            when {
                url.endsWith("/auth/v1/user") -> NativeAuthClient.HttpResponse(
                    200,
                    JSONObject().put("factors", org.json.JSONArray().put(JSONObject()
                        .put("id", FACTOR_ID)
                        .put("factor_type", "totp")
                        .put("status", "verified"))).toString()
                )
                url.endsWith("/factors/$FACTOR_ID/challenge") -> NativeAuthClient.HttpResponse(
                    200,
                    JSONObject().put("id", CHALLENGE_ID).put("type", "totp").toString()
                )
                url.endsWith("/factors/$FACTOR_ID/verify") -> NativeAuthClient.HttpResponse(
                    200,
                    tokenResponse(accessToken = jwt(aal = "aal2"))
                )
                else -> throw AssertionError("Unexpected MFA request: $url")
            }
        }

        val elevated = mfaClient.completeMfa("123456")

        assertEquals("aal2", elevated.assuranceLevel)
        assertEquals(USER_ID, elevated.userId)
        assertEquals(elevated, store.read())
        assertEquals(3, requests.size)
        assertEquals(FACTOR_ID, JSONObject(requests[1].second!!).getString("factorId"))
        val verification = JSONObject(requests[2].second!!)
        assertEquals(CHALLENGE_ID, verification.getString("challenge_id"))
        assertEquals("123456", verification.getString("code"))
    }

    @Test
    fun `invalid authenticator code is rejected before network and retains session`() = runBlocking {
        val original = session()
        store.write(original)
        val mfaClient = testClient { _, _, _, _ ->
            throw AssertionError("Network request was not expected")
        }

        expectAuthFailure { mfaClient.completeMfa("12 34") }

        assertEquals(original, store.read())
    }

    @Test
    fun `mfa verification never overwrites a session changed during challenge`() = runBlocking {
        val original = session()
        val replacement = session(
            accessToken = "replacement-token",
            userId = "00000000-0000-4000-8000-000000000099"
        )
        store.write(original)
        var requestCount = 0
        val mfaClient = testClient { url, _, _, _ ->
            requestCount += 1
            if (!url.endsWith("/auth/v1/user")) throw AssertionError("Only the factor lookup was expected")
            store.write(replacement)
            NativeAuthClient.HttpResponse(
                200,
                JSONObject().put("factors", org.json.JSONArray().put(JSONObject()
                    .put("id", FACTOR_ID)
                    .put("factor_type", "totp")
                    .put("status", "verified"))).toString()
            )
        }

        expectAuthFailure { mfaClient.completeMfa("123456") }

        assertEquals(1, requestCount)
        assertEquals(replacement, store.read())
    }

    @Test
    fun `revoked mfa session clears only the matching cloud session`() = runBlocking {
        store.write(session())
        val mfaClient = testClient { _, _, _, _ -> NativeAuthClient.HttpResponse(401, "{}") }

        expectAuthFailure { mfaClient.completeMfa("123456") }

        assertNull(store.read())
    }

    @Test
    fun `temporary refresh failure retains the durable session`() = runBlocking {
        val original = session(expiresAtMillis = System.currentTimeMillis() + 30_000L)
        store.write(original)
        val refreshingClient = testClient { _, _, _, _ -> NativeAuthClient.HttpResponse(503, "{}") }

        expectTransientAuthFailure { refreshingClient.currentSession() }

        assertEquals(original, store.read())
    }

    @Test
    fun `permanent refresh rejection clears tokens but not local data`() = runBlocking {
        store.write(session(expiresAtMillis = System.currentTimeMillis() + 30_000L))
        val refreshingClient = testClient { _, _, _, _ -> NativeAuthClient.HttpResponse(400, "{}") }

        expectAuthFailure { refreshingClient.currentSession() }

        assertNull(store.read())
    }

    @Test
    fun `sign out clears locally then revokes only the current Supabase session`() = runBlocking {
        store.write(session())
        var capturedUrl = ""
        var capturedHeaders = emptyMap<String, String>()
        val signingOutClient = testClient { url, _, _, headers ->
            capturedUrl = url
            capturedHeaders = headers
            assertNull(store.read())
            NativeAuthClient.HttpResponse(204, "")
        }

        signingOutClient.signOut()

        assertTrue(capturedUrl.endsWith("/auth/v1/logout?scope=local"))
        assertEquals("Bearer access-token", capturedHeaders["Authorization"])
        assertNull(store.read())
    }

    @Test
    fun `unconfirmed server sign out remains visible while local session stays cleared`() = runBlocking {
        store.write(session())
        val signingOutClient = testClient { _, _, _, _ -> NativeAuthClient.HttpResponse(503, "{}") }

        expectAuthFailure { signingOutClient.signOut() }

        assertNull(store.read())
    }

    private fun testClient(
        responder: ((String, String, String?, Map<String, String>) -> NativeAuthClient.HttpResponse)? = null
    ): NativeAuthClient = object : NativeAuthClient(
        sessionStore = store,
        isAuthEnabled = { true },
        supabaseUrl = SUPABASE_URL,
        supabasePublicKey = PUBLIC_KEY,
        authRedirectUri = AUTH_REDIRECT
    ) {
        override fun request(url: String, method: String, body: String?, headers: Map<String, String>): HttpResponse {
            return responder?.invoke(url, method, body, headers)
                ?: throw AssertionError("Network request was not expected: $url")
        }
    }

    private fun callbackIntent(query: String): Intent = Intent().apply {
        data = Uri.parse("$AUTH_REDIRECT?$query")
    }

    private fun session(
        expiresAtMillis: Long = System.currentTimeMillis() + 3_600_000L,
        accessToken: String = "access-token",
        userId: String = USER_ID,
        assuranceLevel: String = "aal1"
    ) = NativeSession(
        accessToken = accessToken,
        refreshToken = "refresh-token",
        expiresAtMillis = expiresAtMillis,
        userId = userId,
        assuranceLevel = assuranceLevel
    )

    private fun tokenResponse(
        accessToken: String = jwt(),
        userId: String = USER_ID
    ): String = JSONObject()
        .put("access_token", accessToken)
        .put("refresh_token", "refresh-token")
        .put("expires_in", 3_600)
        .put("user", JSONObject().put("id", userId))
        .toString()

    private fun jwt(
        iss: String = "$SUPABASE_URL/auth/v1",
        aud: String = "authenticated",
        exp: Long = System.currentTimeMillis() / 1_000L + 3_600L,
        sub: String = USER_ID,
        aal: String = "aal1"
    ): String {
        val header = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("""{"alg":"RS256","typ":"JWT"}""".toByteArray())
        val payload = JSONObject()
            .put("iss", iss)
            .put("aud", aud)
            .put("exp", exp)
            .put("sub", sub)
            .put("aal", aal)
        val encodedPayload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payload.toString().toByteArray())
        return "$header.$encodedPayload.synthetic-signature"
    }

    private suspend fun expectAuthFailure(block: suspend () -> Unit): NativeAuthException {
        return try {
            block()
            throw AssertionError("Expected NativeAuthException")
        } catch (error: NativeAuthException) {
            error
        }
    }

    private suspend fun expectTransientAuthFailure(block: suspend () -> Unit): NativeAuthTransientException {
        return try {
            block()
            throw AssertionError("Expected NativeAuthTransientException")
        } catch (error: NativeAuthTransientException) {
            error
        }
    }

    private companion object {
        const val SUPABASE_URL = "https://project-ref.supabase.co"
        const val PUBLIC_KEY = "sb_publishable_goalflow_test"
        const val AUTH_REDIRECT = "goalflow://auth/callback"
        const val USER_ID = "00000000-0000-4000-8000-000000000001"
        const val FACTOR_ID = "00000000-0000-4000-8000-000000000002"
        const val CHALLENGE_ID = "00000000-0000-4000-8000-000000000003"
        const val VERIFIER = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG"
    }
}
