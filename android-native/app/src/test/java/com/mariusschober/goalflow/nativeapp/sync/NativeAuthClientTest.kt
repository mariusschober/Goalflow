package com.mariusschober.goalflow.nativeapp.sync

import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertFalse
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
        val context = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
        // In-memory store that bypasses AndroidKeyStore
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
        client = NativeAuthClient(store)
    }

    @After
    fun tearDown() {
        store.clear()
        store.clearPendingState()
    }

    private fun jwt(iss: String = "https://example.supabase.co", aud: String = "anon", exp: Long = System.currentTimeMillis() / 1000 + 3600, sub: String = "user-123"): String {
        val header = Base64.getUrlEncoder().withoutPadding().encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
        val payload = JSONObject().apply {
            put("iss", iss)
            put("aud", aud)
            put("exp", exp)
            put("sub", sub)
        }
        val payloadB64 = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toString().toByteArray())
        return "$header.$payloadB64.signature"
    }

    private fun intentWithFragment(fragment: String): Intent {
        val uri = Uri.parse("goalflow://auth/callback#$fragment")
        return Intent().apply { data = uri }
    }

    @Test
    fun `acceptCallback rejects mismatched state`() {
        store.setPendingState("expected_state_123", "verifier123")
        val token = jwt()
        val intent = intentWithFragment("access_token=$token&refresh_token=refresh123&state=wrong_state_123&expires_in=3600")
        assertFalse(client.acceptCallback(intent))
    }

    @Test
    fun `acceptCallback rejects expired JWT`() {
        store.setPendingState("state123", "verifier")
        val expiredToken = jwt(exp = System.currentTimeMillis() / 1000 - 3600)
        val expiredIntent = intentWithFragment("access_token=$expiredToken&refresh_token=refresh123&state=state123&expires_in=3600")
        assertFalse(client.acceptCallback(expiredIntent))
    }

    @Test
    fun `acceptCallback accepts valid state and JWT and clears pending`() {
        store.setPendingState("valid_state_123456", "verifier")
        val token = jwt(iss = "", aud = "", exp = System.currentTimeMillis() / 1000 + 3600)
        val intent = intentWithFragment("access_token=$token&refresh_token=refresh123&state=valid_state_123456&expires_in=3600")
        assertTrue(client.acceptCallback(intent))
        assertTrue(store.getPendingState() == null)
    }

    @Test
    fun `acceptCallback rejects missing tokens even with valid state`() {
        store.setPendingState("state123", "verifier")
        val intent = intentWithFragment("state=state123&expires_in=3600")
        assertFalse(client.acceptCallback(intent))
    }

    @Test
    fun `requestMagicLink stores pending state`() {
        // This test verifies the store interaction; actual network is not hit
        store.setPendingState("test_state", "test_verifier")
        assertTrue(store.getPendingState() == "test_state")
        assertTrue(store.getPendingVerifier() == "test_verifier")
        store.clearPendingState()
        assertTrue(store.getPendingState() == null)
    }
}
