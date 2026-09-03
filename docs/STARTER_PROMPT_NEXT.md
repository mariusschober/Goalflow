> **HISTORICAL PROMPT — DO NOT EXECUTE.** The branch, gates, and evidence below
> are obsolete. Use `docs/reconciliation/BETA_PROVENANCE.md` and the live
> `integration/beta` branch.



# Goalflow — Starter Prompt for Next Chat (Post-P0-7, Pre-P1)

Copy the block below verbatim into a new chat. Ensure `origin/goalflow-production` is fetched and `T807D_EEA` `ZXKRS4VKGQ8PWGEQ` is `adb devices -l` `device`.

```text
@GitHub

You are continuing Goalflow's production-finalization. Work autonomously, use GitHub for inspection/commits/push, no force-push, no history rewrite.

Repository: https://github.com/mariusschober/Goalflow
Branch: goalflow-production
Current tip: 1cca7ac (goalflow-production, 7 commits on top of 7a502cd: 91db2ce native 2 pending, 425f659 PG CASE + 7.json, 5e30d78 kapt, 9729bca T2 A+B PKCE/session, c6f9acd P0-1 DB indices, e5fc227 8.json, 763460a Tranche3 A-C signing/AAB/raw, b230e65 Tranche3 D-F clean/upgrade/owner, 1cca7ac P0-7 batch push)
Pinned baseline: 34005552de745682e798fce3bb851bb831e2c642
T1 fix: 43643038917ac858b30f288aeb91d1e4f29c4fde
Contained: 6e7244a (fixed via 91db2ce/425f659/5e30d78)

Read first (in order, GitHub):
- docs/HANDOVER_2026-08-30_MASTER.md  (master pause→resume, must/should/could, P0-7 done, P1-1..P1-6 remaining, local gates)
- docs/PRODUCTION_FINALIZATION_PLAN.md:1 (authority, 5-tranche gates)
- docs/PRODUCTION_READINESS.md:1 (status, now at 1cca7ac, T1 green + Tranche3 A-F + P0-1, hosted 33335119616 blocked by billing)
- docs/PRE_TRANCHE3_BUGFIX_PLAN.md (P0/P1 attack plan, device T807D_EEA TotalTime 638ms JANK 20%)
- docs/ACCOUNTS_AND_KEYS.md (Supabase/Railway/Telegram/Turnstile/Resend/OPENAI/DeepSeek, ANDROID_KEYSTORE_BASE64 — Defer AI)
- docs/AI_CONTEXT_HANDOVER.md (pause, 9729bca T2 A+B)
- DEPLOYMENT.md + .env.example + .github/workflows/ci.yml (verify, migrations PG16, native-android JDK21, diagnose-apk, connectedProductionDebugAndroidTest)
- Relevant code: android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/data/GoalflowDatabase.kt:138 (indices 7→8), GoalflowRepository.kt:308 (countRemainingToday), services/storage.ts:302 (listWal), hooks/useGoalflow.ts:430 (prevHabitGenRef), android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/sync/NativeAuthClient.kt:159 (dead verifier), services/storage.ts:813 (fallback cursor), server/routes/sync.ts:98 (Promise.all)

Mission order (local-only, no GH Actions, no servers/keys/billing):

PHASE 1 — FINISH P0-8 + P1-1..P1-6 (must before Tranche 3 gate):
- P0-8: wire code_verifier → code_challenge S256 in NativeAuthClient.requestMagicLink or document magic-link implicit (state is CSRF) + test verifier sent
- P1-1: services/storage.ts listWal debounce 200ms + requestIdleCallback + memoize latestWalValue
- P1-2: hooks/useGoalflow.ts persistLocalState debounce 300ms useDebouncedCallback
- P1-3: GoalflowViewModel batch habitId IN + GoalflowRepository exportBackup LIMIT 500 streaming
- P1-4: GoalflowViewModel WhileSubscribed(5000)→Eagerly + GoalflowWidgetProvider refresh 500ms distinctUntilChanged
- P1-5: GoalflowWidgetProvider global scope → ProcessLifecycleOwner + OkHttp singleton
- P1-6: PlanningView useMemo bioContext + React.memo areEqual
For each: write failing test first, fix, run npm run lint && npm test (12→15 files 110→115) && npm run verify:migrations (7→8) && bash scripts/test-postgres-migrations.sh 9/9 && bash android-native/scripts/test-room-schema-assets.sh 1..8 && env JAVA_HOME=... ./android-native/gradlew -p android-native test lint assembleProductionDebug bundleProductionRelease, commit small, push fast-forward origin/goalflow-production.

PHASE 2 — VERIFY ON DEVICE (T807D_EEA ZXKRS4VKGQ8PWGEQ, Android 16 api 36):
adb uninstall com.mariusschober.goalflow; adb install -r android-native/app/build/outputs/apk/production/release/app-production-release.apk; adb shell am start -W -n com.mariusschober.goalflow/com.mariusschober.goalflow.nativeapp.MainActivity # target TotalTime <900ms (now 638ms), verify via bash android-native/scripts/test-owner-install.sh COLD_START=PASS
adb shell dumpsys gfxinfo com.mariusschober.goalflow framestats # target p95 <30ms Janky <5% (now 20% 200ms)
adb shell dumpsys meminfo com.mariusschober.goalflow # target PSS <180MB (now 210MB)
bash android-native/scripts/test-clean-install-matrix.sh # CLEAN_INSTALL_MATRIX=PASS
bash android-native/scripts/test-signing.sh # SIGNING=PASS CN=Goalflow

PHASE 3 — STOP at pre-tranche3 tag (do not start Tranche 3 hosted matrix api [26,30,33,35] or Tranche 4 a11y/benchmark or Tranche 5 RC until P1 green and docs/PRODUCTION_READINESS.md updated with TotalTime/Janky/PSS evidence).

Do not claim production-ready while any P0 red or risk undocumented. Use small reviewable commits, never force-push, keep credentials outside repo (ANDROID_KEYSTORE_BASE64 in env, not VITE_).

Begin by reporting live branch SHA (expected 1cca7ac), local gates (npm + gradlew + psql + test-room-assets), and first P to take (P0-8 wire PKCE). Then execute.
```

**Why this prompt is correct:**
- Points to live tip `1cca7ac` (not `b1b9d42`/`5e30d78` stale) and pinned baseline, `6e7244a` contained via `91db2ce`/`425f659`/`5e30d78`.
- References correct GitHub files in precedence order, now including `HANDOVER_2026-08-30_MASTER.md` (must/should/could) and `PRE_TRANCHE3_BUGFIX_PLAN.md` (device 638ms).
- Requires local-only verification (no GH Actions billing, no Supabase live) and forbids Tranche 3 hosted matrix until P1 green.
- Scopes remaining `P0-8` + `P1-1..P1-6` precisely, with file:line and test-first.
- Forbids visual polish beyond `P1-6` memo and forbids `force-push`.

**Local evidence at `1cca7ac` to be re-proven after P0-8/P1:** `npm lint` PASS, `npm test` 13 files 110 tests PASS, `verify:migrations` 7→8 PASS, `test-postgres` 9/9 PASS, `test-room-assets` 1..8 PASS, `gradlew test` 70+ PASS, `bundle` 4.3M `assemble` 2.0M `CN=Goalflow`, `DIGESTS` `e788...`, `RELEASE_METADATA` `versionCode 3`, `test-clean-install-matrix` `CLEAN_INSTALL_MATRIX=PASS`, `test-owner-install` `TotalTime 638ms` `20%` `PSS 210MB`.
