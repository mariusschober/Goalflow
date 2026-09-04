package com.mariusschober.goalflow.nativeapp.sync

import com.mariusschober.goalflow.nativeapp.BuildConfig

object NativeConfig {
    val apiOrigin: String = BuildConfig.API_ORIGIN.trim().trimEnd('/')
    val supabaseUrl: String = BuildConfig.SUPABASE_URL.trim().trimEnd('/')
    val supabasePublicKey: String = BuildConfig.SUPABASE_PUBLISHABLE_KEY.trim()
    val isSandboxBuild: Boolean = BuildConfig.SANDBOX_BUILD
    val sandboxAccessCode: String = BuildConfig.TEST_ACCESS_CODE
    const val authRedirectUri: String = "tsurfing://auth/callback"

    val canUseCloud: Boolean
        get() = apiOrigin.startsWith("https://")

    val canUseAuthentication: Boolean
        get() = supabaseUrl.startsWith("https://") && supabasePublicKey.isNotBlank()
}
