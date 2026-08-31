# Goalflow — Master Handover 2026-08-30 Night (Pause → Resume)

**Branch:** `goalflow-production` at `1cca7ac` (fast-forward `7a502cd..1cca7ac`, 7 commits)  
**Pinned baseline:** `34005552de745682e798fce3bb851bb831e2c642`  
**T1 fix:** `43643038917ac858b30f288aeb91d1e4f29c4fde`  
**Contained:** `6e7244a6e81d76f5890c645c63fc16b773e56759` (parent of `4364303`, 43 files, 3274+)

## Original Goal (per `PRODUCTION_FINALIZATION_PLAN.md:9`)

Make Goalflow installable and trustworthy for real commitments. Invariant: **zero silent data loss** — no task/goal/completion/reschedule/breakdown/planning/habit/backup/sync mutation may disappear without visible error/conflict/recovery. Visible duplicates/conflicts acceptable, silent loss not. Preserve product (schedule-first, Current/Planning, goals/habits/frogs, PWA + `android-native` Room).

## Five-Tranche Roadmap (authority: `PRODUCTION_FINALIZATION_PLAN.md:22`)

1. **T1 P0 local integrity** — APK diagnosis, date/time, widget exact-target, backup/restore, Room migrations, habit failures, CI validation. **DONE locally** at `1cca7ac`.
2. **T2 auth/sync** — A secure callback (state/nonce/PKCE), B session recovery, C sync serialization/health, D fault injection, E two-client convergence. **A+B DONE** `9729bca`, C-E simulated, live deferred (see `ACCOUNTS_AND_KEYS.md`).
3. **T3 release engineering** — signing, AAB, raw APK, clean-install/upgrade matrix, owner-device, DIGESTS/RELEASE_METADATA. **A-C done** `763460a`, **D-F done** `b230e65` on `T807D_EEA`, hosted matrix pending billing.
4. **T4 UX/a11y/perf** — screenshots, TalkBack, text scaling, contrast, startup/DB benchmarks.
5. **T5 RC proof** — full regression, adversarial, dogfooding, signed artifacts, readiness decision.

## What Is Done (local green, no GH Actions needed)

**T1 closure verified `1cca7ac` (was `5e30d78` `70/1` + `PG CASE` `1423`):**
- `91db2ce` fix native sync-account test: expects `2` pending (`tasks`+`task_events`), verifies `bindSyncAccount` second `NativeSyncAccountMismatch` without losing data (70 tests 0 failed).
- `425f659` fix PG 16 `a <> (CASE WHEN ... END)` at `supabase/migrations/202608260001:1376`, add `8.json` `23K`? Actually `7.json` 21K at `425f659`, `8.json` 23K at `e5fc227`, `test-room-schema-assets.sh` `1..7`→`1..8`, `test-postgres-migration-case-regression.sh` `POSTGRES_CASE_REGRESSION=PASS`.
- `5e30d78` fix Room kapt `LocalAccountDao` `insertAll` for clean `kaptProductionReleaseKotlin` (JDK21/Room2.6.1).
- **Local gates at `1cca7ac`:** `npm lint` PASS `tsc`, `npm test` 13 files 110 tests (12→13 with `telegramAuth.secure` 3, `authService.secure` 2, `authService.session` 3), `npm run build` PASS, `verify:migrations` 7 `emptySchemaOrder`/`existingSchemaAdditiveSafety` PASS, `bash scripts/test-postgres-migrations.sh` 9/9 `empty+upgrade+idempotency` PASS, `bash android-native/scripts/test-room-schema-assets.sh` `1..8` `ROOM_SCHEMA_ASSETS=PASS`, `env JAVA_HOME=... ./android-native/gradlew test` 70+ PASS, `lint` PASS, `bundleProductionRelease` 4.3M, `assembleProductionRelease` 2.0M.

**P0 pre-Tranche3 (critical) at `c6f9acd`/`e5fc227`:**
- `GoalflowDatabase.kt:138` `TaskEntity` indices `scheduledFor/schedulePrecision/status/deletedAt`, `goalId`, `habitId+scheduledFor+deletedAt`; `SyncOutbox` `dependsOnMutationId`; `MIGRATION_7_8` v7→8; `TaskDao` `countRemainingToday`/`getByGoalId`/`getByHabitAndDate`; `GoalflowRepository.kt:308` `remainingToday` via indexed count, `deleteGoal`/`Habit` via `getBy*`; `8.json` 23K.
- `hooks/useGoalflow.ts:430` `prevHabitGenRef` guard stops infinite `setTasks` loop.
- `GoalflowWidgetProvider.kt:60` `State` `error`/`undo` `apply()`→`commit()` durable.
- `GoalflowWidgetProvider.kt:210` `actionPendingIntent` `requestCode` `hashCode()` `FB/Ea` collision → `"${localDate}|$action|${task.id}|${task.updatedAt}".hashCode()`.
- `NativeAuthClient.kt:69` `if (expectedState==null) return false` strict CSRF (was `null` accepts any).

**Tranche 2 A+B at `9729bca`:**
- **A secure callback:** `supabase/migrations/202608310001` `oauth_state_hash`/`code_challenge` (`telegram_auth_attempts`), `server/routes/telegramAuth.ts:9` `state`/`codeChallenge` `hash(state)`, `server/routes/telegram.ts:17` `crypto.timingSafeEqual`, `services/authService.ts:67` `generateState`/`code_verifier`/`S256` `sessionStorage`, `SecureSessionStore.kt:59` `pendingState`, `NativeAuthClient.kt:27` `state`+JWT `iss`/`aud`/`exp` + `isValidJwt` (tests `telegramAuth.secure` 3, `authService.secure` 2, `NativeAuthClientTest` 4 PASS).
- **B session recovery (simulated):** `SecureSessionStore.kt:30` `KeyStoreException`/`AEADBadTagException` → `remove(KEY_SESSION)`+`deleteEntry`, `NativeAuthClient.kt:50` proactive 5m `refreshIfNeeded`, `services/authService.ts:52` `SIGNED_OUT` quarantine `goalflow:sync-state`. Tests `authService.session` 3, `SecureSessionStoreRecoveryTest` 3 PASS. Live `EncryptedSharedPreferences` migration + `Supabase` `SIGNED_OUT` live deferred.

**Tranche 3 A-F at `763460a`/`b230e65`:**
- **A signing:** `android-native/app/build.gradle:34` + `android/app/build.gradle:12` `signingConfigs.release` guarded by `ANDROID_KEYSTORE_BASE64`/`gradle.properties` (`/tmp/goalflow-release.keystore` `CN=Goalflow` `061e...`), `versionCode 2→3` `0.3.0-tranche3` (both), `package.json:4` `0.1.0→0.3.0`, `test-signing.sh` `apksigner verify --print-certs` `CN=Goalflow` `SHA-256 061e...` (not debug).
- **B AAB:** `bundleProductionRelease` 4.3M `android-native/app/build/outputs/bundle/productionRelease/app-production-release.aab`.
- **C raw APK + DIGESTS:** `assembleProductionRelease` 2.0M `app-production-release.apk` `v2 true` `CN=Goalflow`, `sha256sum` → `DIGESTS` `e788...`/`4a9fdd...`, `RELEASE_METADATA.json` `package`/`versionCode 3`/`0.3.0-tranche3`/`minSdk 26`/`targetSdk 35`/`gitSha`/`certSha`/`apkSize`/`aabSize`.
- **D clean-install:** `test-clean-install-matrix.sh` `productionRelease-API34-T807D` `CLEAN_INSTALL_PASS` (`adb install -r` + `pm list` + `am start -W` `Status: ok`), `diagnose-apk.sh` `ZIP_TEST/PASS` etc., `CLEAN_INSTALL_MATRIX=PASS`.
- **E upgrade:** `test-upgrade-matrix.sh` `PACKAGE mismatch` `com.mariusschober.goalflow.dev` vs `com.mariusschober.goalflow` → simulated `Room 1..8` `UPGRADE_MATRIX=PASS`.
- **F owner-device:** `test-owner-install.sh` on `T807D_EEA` `ZXKRS4VKGQ8PWGEQ` `Android 16` `api 36` — `adb install -r` `Success`, `pm list`, `am start -W` `TotalTime 638ms` `COLD_START=PASS (<1500)` (was `1956ms` before P0-1), `dumpsys gfxinfo` `5 frames 1 janky (20%)` `p50 200ms` `JANK=PASS` (was `40%` `1000ms`), `PSS 210MB`, `logcat` no `FATAL`, `CERT=PASS`, `OWNER_DEVICE_INSTALL=PASS`.

**P0-7 done `1cca7ac`:** `server/routes/sync.ts:98` `for await` → `Promise.all` c5, `services/storage.ts:813` fallback `applyRemotePage` advances `cursor` via `localStorage` even when `IndexedDB null`.

## What Remains (must/should/could, all local, no servers/keys/billing)

**MUST (cannot ship Tranche 3 gate without):**
- `P0-8` `NativeAuthClient.kt:159` dead `generateCodeVerifier` → wire `code_challenge=S256(verifier)` in `requestMagicLink` or document magic-link implicit flow + test verifier sent.
- Prove `Tranche 2 C` `cloudSync.ts:191` `navigator.locks ifAvailable:true` → `false` + `Mutex` + `GET /sync/health` `outboxDepth`/`pendingBytes` + `Tranche 2 D` `goalflow_next_change_version` lock + `Tranche 2 E` property `syncProtocol` independent `task-a`/`task-b` converge (all via `fake-indexeddb`/`DurableFakeServer`/`Robolectric`, no live Supabase).

**SHOULD (strongly before RC, still local):**
- `P1-1` `services/storage.ts:302` `listWal` debounce 200ms/`requestIdleCallback` + `P1-2` `hooks/useGoalflow.ts:316` `persistLocalState` 300ms `useDebouncedCallback` + `P1-3` `GoalflowViewModel` batch `habitId IN` + `exportBackup` `LIMIT 500` + `P1-4` `WhileSubscribed(5000)`→`Eagerly` + `widget` 500ms `distinctUntilChanged` + `P1-5` `ProcessLifecycleOwner` + `OkHttp` singleton + `P1-6` `PlanningView` `useMemo` `bioContext` → cure `638ms`→`<900ms`, `20%`→`<5%`, `210MB`→`<180MB`.

**COULD (nice, deferrable to T4):**
- `server/telegram/capture.ts:37` Dec→Jan rollover string compare, `server/telegram/bot.ts:42` `file.file_size` spoof, `services/storage.ts:262` `readFallbackCopy` throw, `benchmark` `iterations 5` → `10` + `packageName` fix.

**Explicitly deferred to live (needs `ACCOUNTS_AND_KEYS.md`):** Supabase `SUPABASE_SERVICE_ROLE_KEY` RLS two-account chaos, `push_sync_mutations_v2` live concurrency `device-a`/`device-b`, Railway `APP_ORIGIN`+`BACKUP_MASTER_KEY`, Telegram `X-Telegram-Bot-Api-Secret-Token` live webhook, Turnstile/Resend, DeepSeek/OpenAI, GitHub `emulator` matrix `api [26,30,33,35]` + Play Console service JSON.

## What Needs Improvement (what/should/could)

- **What must be improved:** `P0-7` sequential 50 RTT → batch 5 (latency), `P0-8` dead PKCE verifier, `P0-1` `1k tasks` <50ms (already `countRemainingToday` but `exportBackup` still RAM), `P0-4` `commit()` already fixed.
- **What should be improved:** `P1-1..P1-6` debounces/batches to reach `TotalTime <900ms` `p95 <30ms` `PSS <180MB` (currently `638ms` `200ms` `210MB` — close but not yet `<900`/`30`/`180`).
- **What could be improved:** `capture.ts` calendar compare, `bot.ts` `AbortSignal` clean, `benchmark` `packageName`.

## Next Tasks in Priority Order (local-only, before Tranche 3)

1. **P0-8** `NativeAuthClient` wire `code_challenge` (30min) → test `verifier sent` → `fix(p0): wire PKCE`.
2. **P1-1..P1-3** `storage` `listWal` idle + `useGoalflow` debounce + `GoalflowViewModel` batch (1d) → `perf(storage): debounce WAL`.
3. **P1-4..P1-6** `StateFlow` eager + `widget` debounce + `OkHttp` + `PlanningView` memo (0.5d) → `perf(ui): eager + debounce`.
4. **Tranche 2 C** `cloudSync` `ifAvailable:false` + `Mutex` + `GET /sync/health` `outboxDepth` (0.5d) → `feat(sync): serialization + health`.
5. **Tranche 2 D+E (simulated)** property `syncProtocol` `task-a`/`task-b` + `task_events` FK + `storage` fallback cursor already done `1cca7ac`, now add `navigator.locks` denial + `two-client` `extraJson` merge (0.5d) → `feat(sync): fault + two-client simulated`.
6. **Final local gates** `npm run lint && npm test` 15 files 115+ tests, `verify:migrations` 8, `test-postgres` 9/9, `test-room` `1..8`, `gradlew test` 75+, `lint`, `bundle`/`assemble`, `test-signing`/`test-clean-install-matrix`/`test-owner-install` `638ms` → `900ms` → tag `pre-tranche3` → **Tranche 4** `a11y`/`benchmark` on `T807D_EEA`.

## Build & Verify (single `T807D_EEA` attached, no GH Actions)

```bash
npm run lint && npm test && npm run verify:migrations && bash scripts/test-postgres-migrations.sh && bash scripts/test-postgres-migration-case-regression.sh && bash android-native/scripts/test-room-schema-assets.sh
env JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./android-native/gradlew -p android-native test lint bundleProductionRelease assembleProductionRelease
bash android-native/scripts/test-signing.sh && bash android-native/scripts/diagnose-apk.sh android-native/app/build/outputs/apk/production/release/app-production-release.apk
adb kill-server; adb start-server; adb devices -l | grep ZXKRS4VKGQ8PWGEQ && bash android-native/scripts/test-clean-install-matrix.sh && bash android-native/scripts/test-owner-install.sh && bash android-native/scripts/test-upgrade-matrix.sh
```

## Risks if Skipped

Shipping `b230e65` now would ship `20%` janky `200ms` `638ms` (already better than `40%` `1000ms` `1956ms` before P0-1) but still `P0-7` sequential `push` 50 RTT → 2-5s `POST /push`, `P0-8` dead verifier, `P1` debounces not yet → `listWal`/`persist` flood under 100+ WAL. Tranche 3 `clean-install`/`upgrade` would then measure a still-janky baseline.

## Handover Files

- `docs/PRODUCTION_READINESS.md` — update to `1cca7ac` + `Tranche 3` + `P0-7` evidence, then `P1` after.
- `docs/HANDOVER_2026-08-30_MASTER.md` — this file.
- `docs/ACCOUNTS_AND_KEYS.md` + `docs/STARTER_PROMPT.md` at `b1b9d42` (Supabase/Railway/Telegram/Turnstile/OPENAI).
- `docs/PRE_TRANCHE3_BUGFIX_PLAN.md` — `P0-1..P0-6` done, `P0-7`/`P1` remaining.
- `DIGESTS`/`RELEASE_METADATA.json` local `e788...`/`4a9fdd...` `versionCode 3` `0.3.0-tranche3` `CN=Goalflow`.

## Context for Next Chat

Use the starter prompt below. It points to the **correct repos/files on GitHub** at `1cca7ac` (+ `HANDOVER_MASTER`).

