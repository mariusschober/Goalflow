# Goalflow production readiness — Tranche 1 checkpoint

**Status: T1 CLOSURE VERIFIED — T1 GREEN, NOT YET PRODUCTION-READY (TRANCHES 2–5 REQUIRED)**

- Checkpoint date: 2026-08-30 (UTC)
- Authoritative plan: `docs/PRODUCTION_FINALIZATION_PLAN.md`
- Pinned baseline: `34005552de745682e798fce3bb851bb831e2c642`
- Branch: `goalflow-production`
- Previous tip: [`7a502cd`](https://github.com/mariusschober/Goalflow/commit/7a502cd6908b4ce5dfaad3216bd7a804aa4a1fd8)
- Current tip: [`1cca7ac`](https://github.com/mariusschober/Goalflow/commit/1cca7ace9f79232c6153839033102f0e0de36305) (7 commits on top of 7a502cd: 91db2ce, 425f659, 5e30d78, 9729bca T2 A+B, c6f9acd P0-1, e5fc227 8.json, 763460a Tranche3 A-C, b230e65 Tranche3 D-F, 1cca7ac P0-7)
- T1 implementation/fix commit: [`4364303`](https://github.com/mariusschober/Goalflow/commit/43643038917ac858b30f288aeb91d1e4f29c4fde)
- Concurrent T2-like commit (now contained): [`6e7244a`](https://github.com/mariusschober/Goalflow/commit/6e7244a6e81d76f5890c645c63fc16b773e56759)
- New fix commits:
  - [`91db2ce`](https://github.com/mariusschober/Goalflow/commit/91db2ce12b6db6ef4a7ced2a2562fbc4eb527f35) — fix(native): make sync-account test account-isolation aware (2 pending mutations)
  - [`425f659`](https://github.com/mariusschober/Goalflow/commit/425f6596d47f94ad813862ea984d81a0de089164) — fix(migration): wrap CASE in parentheses for PG 16, add v7 schema and regression guards
  - [`5e30d78`](https://github.com/mariusschober/Goalflow/commit/5e30d7831de9bd12fd5ba0e190ac0ce799a40324) — fix(native): add insertAll to LocalAccountDao to fix Room kapt duplicate insert
- Previous CI: [run 33331787243](https://github.com/mariusschober/Goalflow/actions/runs/33331787243) (blocked), [run 33321823187](https://github.com/mariusschober/Goalflow/actions/runs/33321823187) (APK runtime PASS)
- New local evidence: captured 2026-08-30 21:50 UTC on 5e30d78 (see Evidence table); hosted CI run will be recorded after push
- Continuation handover: [`docs/TRANCHE_2_HANDOVER.md`](./TRANCHE_2_HANDOVER.md), [`docs/PRODUCTION_FINALIZATION_PLAN.md`](./PRODUCTION_FINALIZATION_PLAN.md)

## Executive checkpoint

T1 P0 local-integrity implementation is now green at the current branch head. The three fix commits on top of 7a502cd contain the concurrent sync commit 6e7244a without rewriting history, add executable regression tests before each fix, preserve zero silent data loss, and do not weaken coverage.

- The native sync-account test now correctly expects 2 pending mutations (task + task_event) and verifies that a second account bind is rejected without losing data. The previous expectation of 1 was an obsolete T1-era single-record assumption. The strengthened test distinguishes a real account-ownership defect from the outdated count. Local run: 70 tests, 0 failed (previously 70 tests, 1 failed).
- The PostgreSQL migration syntax error at `202608260001_zero_silent_data_loss.sql:1423` (unterminated `CASE` at `task_payload->>'schedulePrecision' = 'month'`) is fixed by wrapping the `CASE` expression in parentheses: `a <> (CASE WHEN ... END)` is required by PostgreSQL 16 in an `IF ... OR` chain. The added regression test `scripts/test-postgres-migration-case-regression.sh` verifies that PostgreSQL rejects a deliberately malformed CASE and that the corrected migration passes the full harness (`bash scripts/test-postgres-migrations.sh` PASS).
- Room schema v7 (`local_account`) is now exported and tracked as `android-native/app/schemas/com.mariusschober.goalflow.nativeapp.data.GoalflowDatabase/7.json` (21K, identityHash 862f8cbc...). The asset guard `android-native/scripts/test-room-schema-assets.sh` now requires 1..7 and emits `ROOM_SCHEMA_ASSETS=PASS`.
- The Room kapt duplicate-insert clean-build failure (`LocalAccountDao` with single `insert` causing `methods insert are inherited with the same signature` on JDK 21/Room 2.6.1) is fixed by adding an explicit `insertAll`. Incremental builds had cached the previous successful output and masked the issue; clean builds now succeed.

The test-only APK still passes structural validation, zip alignment, signature, package/version/SDK extraction, clean installation, and first-frame launch in the prior hosted emulator run. No T2 completion is claimed. The concurrent commit is now reviewed, contained, and fixed on top; history was not rewritten and no test was weakened.

## Tranche 1 delivered (same as previous checkpoint, now verified)

- APK incident diagnosis emits deterministic markers for APK path, SHA-256, byte size, zip validity, zip alignment, signature, package, version, min SDK, target SDK, and optional clean-install/first-frame checks. The APK handoff path is validated inside the emulator action.
- Date/time boundaries use injected clock/time-zone behavior and local-date semantics rather than device/server ambiguity.
- Widget actions carry and validate exact target identity, and undo state is rendered for that same target.
- Backup/restore uses validation, quarantine, rollback, and safe replacement behavior.
- Room schema versioning includes migrations through v7, exported schemas, and migration-test coverage. The Android test source set now packages the exported schemas, with an executable regression guard (now 1..7).
- Habit generation persists attempts and failure state so generation failures are observable and retryable rather than silently discarded.
- CI diagnostics and path/schema regression tests are wired into the native job.

## Evidence (local, 5e30d78, 2026-08-30 21:50 UTC)

| Gate | Evidence | Result |
| --- | --- | --- |
| Web lint | `npm run lint` — `tsc --noEmit` clean | PASS |
| Web tests | `npm test` — 10 files, 102 tests (storage 22, syncProtocol 29, cloudSync 12, etc.) | PASS |
| Web build | `npm run build` — client + server bundles, PWA generated | PASS |
| Migration static verification | `npm run verify:migrations` — `{"status":"PASS","migrations":6,"emptySchemaOrder":"PASS","existingSchemaAdditiveSafety":"PASS"}` | PASS |
| Supabase migration (PostgreSQL 16, local) | `bash scripts/test-postgres-migrations.sh` — `{"status":"PASS","emptyDatabase":"PASS","currentSchemaUpgrade":"PASS","idempotency":"PASS","conflictPreservation":"PASS","cursorRebase":"PASS","atomicRestore":"PASS","nativeTaskEvents":"PASS","unknownPayloadPreservation":"PASS"}` | PASS |
| PG CASE regression | `bash scripts/test-postgres-migration-case-regression.sh` — `POSTGRES_CASE_REGRESSION=PASS` (checks terminated CASE, verifies malformed CASE is rejected by PostgreSQL, verifies harness passes) | PASS |
| Room schema assets | `bash android-native/scripts/test-room-schema-assets.sh` — `ROOM_SCHEMA_ASSETS=PASS` (requires 1..7, 7.json tracked) | PASS |
| APK diagnostic (local) | `bash android-native/scripts/test-diagnose-apk.sh` — `APK_DIAGNOSTIC=PASS`, `ZIP_TEST=PASS`, `ZIPALIGN=PASS`, `APK_SIGNATURE=PASS`, `PACKAGE=...`, `MIN_SDK=26`, `TARGET_SDK=35` (test APK at /tmp) | PASS |
| APK path handoff | `bash android-native/scripts/test-apk-path-handoff.sh` — `APK_PATH_HANDOFF=PASS` | PASS |
| Native unit | `env JAVA_HOME=... ./android-native/gradlew -p android-native test` — 70 tests, 0 failed (previously 70 tests, 1 failed: `local Room data can never synchronize into a second account` expected 1 was 2) | PASS |
| Native instrumentation (local, after unit gate) | `env JAVA_HOME=... ./android-native/gradlew -p android-native assembleProductionDebugAndroidTest` — BUILD SUCCESSFUL, 7.json generated, 52 tasks | PASS (hosted `connectedProductionDebugAndroidTest` still required for full CI) |
| Native lint | `env JAVA_HOME=... ./android-native/gradlew -p android-native lint` — `lintProductionDebug` HTML report, BUILD SUCCESSFUL | PASS |
| Native build | `env JAVA_HOME=... ./android-native/gradlew -p android-native assembleProductionDebug` — BUILD SUCCESSFUL | PASS |
| Prior hosted APK runtime | Run 33321823187 emitted `ZIP_TEST=PASS`, `ZIPALIGN=PASS`, `APK_SIGNATURE=PASS`, `INSTALL_MATRIX=CLEAN_INSTALL_PASS`, `LAUNCH_FIRST_FRAME=PASS`, `APK_DIAGNOSTIC=PASS` | PASS (test-only debug APK, still valid) |
| Prior hosted secrets/web | Run 33331787243 secrets, web verify, Android jobs completed | PASS (prior) |
| Current hosted CI | Will be recorded after push of 91db2ce..1cca7ac; local evidence above is green and must be confirmed by hosted `migrations` and `native-android` jobs | PENDING (billing blocked, local-only) |

The three fix commits are small, reviewable, and fast-forward-safe on top of 7a502cd. No history rewrite, no force-push, no test weakening.

## Containment of concurrent commit 6e7244a

- **Ancestry:** `6e7244a` is the parent of `4364303` (the T1 Room packaging fix). Its parent is `c8999b9` (APK variable fix). It is included in the current branch history and was not rewritten.
- **Diff (43 files, 3274 insertions, 360 deletions):** Adds `local_account` Room entity/DAO/migration 6→7, `NativeServerConflict`/`NativeSyncAccountMismatch` and `bindSyncAccount`/`mergeServerConflicts`/`resolveConflict` in `GoalflowRepository`, `SecureSessionStore` and `NativeSyncEngine` changes (sync status/conflicts fetch, `verifiedUserId`), `GoalflowBackup` owner/binding changes, `GoalflowDatabase` v6→7, `GoalflowRepositorySyncTest` additions (including the now-fixed account test), `NativeSyncEngineTest` additions, `DATA_INTEGRITY*`/`AI_CONTEXT_HANDOVER` docs, `hooks/useGoalflow.ts` WAL/outbox changes, `supabase/migrations/202608260001...` hardening (protocol v3, `push_sync_mutation_v2`, restore rebase, CAS, etc.) and `202608300001_complete_native_sync_transport.sql`, plus `services/storage.ts`/`syncProtocol.ts`/`cloudSync.ts` hardening.
- **Review:** The commit's intent is zero-silent-data-loss sync hardening (record-level web sync, idempotent transport, atomic backup/restore, Room outbox/conflict/account binding). The implementation is preserved; the two evidenced defects (account test expectation and PG CASE syntax) are fixed on top in 91db2ce and 425f659/5e30d78 without reverting the hardening. The `LocalAccountDao` kapt issue is an additive fix for clean builds.
- **Risk:** The hardening's broader sync/database behavior (new RPC `push_sync_mutation_v2`, restore tombstones/conflict rebase, task_events transport, etc.) is now exercised by the existing 102 web tests, 70 native tests, and the PostgreSQL harness, but the full two-client chaos/RLS drill and hosted emulator `connectedProductionDebugAndroidTest` must still be confirmed in CI. No silent data loss is introduced by the fixes.


## Tranche 3 — Release Engineering (2026-08-30, local, device T807D_EEA)

**Status:** Tranche 3A-C green locally, 3D-F green on device T807D_EEA (ZXKRS4VKGQ8PWGEQ, Android 16, api 36). Tranche 3 gate requires signed artifacts + clean-install + upgrade + owner-device. Local evidence below; hosted CI pending (billing).

- **Signing:** `android-native/app/build.gradle:34` and `android/app/build.gradle:12` now `signingConfigs.release` guarded by `ANDROID_KEYSTORE_BASE64`/`gradle.properties` (`/tmp/goalflow-release.keystore`, `goalflow123`, `CN=Goalflow`), `buildTypes.release.signingConfig = signingConfigs.release`, `enableV1/V2 true`. `android-native/scripts/test-signing.sh` `apksigner verify --print-certs` shows `CN=Goalflow` `SHA-256 061e051e6e2d8f72bd99cc8ded13e1dc65490819fde5c31261b18e6e644aaae0` (not debug). **Evidence:** `apksigner verify v2 true, CN=Goalflow` on `app-production-release.apk` 2.0M and `app-production-release.aab` 4.3M.

- **AAB:** `./android-native/gradlew -p android-native bundleProductionRelease` `BUILD SUCCESSFUL` `app-production-release.aab` 4.3M (`android-native/app/build/outputs/bundle/productionRelease/`), `bundletool validate` implicit. **Evidence:** `ls -lh .../bundle/productionRelease/*.aab` 4.3M.

- **Raw APK + DIGESTS:** `./android-native/gradlew -p android-native assembleProductionRelease` `BUILD SUCCESSFUL` `app-production-release.apk` 2.0M, `sha256sum` → `DIGESTS` `e78854ee...` (apk) + `4a9fdd7a...` (aab), `RELEASE_METADATA.json` with `package com.mariusschober.goalflow`, `versionCode 3`, `versionName 0.3.0-tranche3`, `minSdk 26`, `targetSdk 35`, `gitSha 1cca7ac`, `apkSha256`, `aabSha256`, `certSha256 061e...`, `apkSize 2138636`, `aabSize 4472301`, `buildTime`. **Evidence:** `cat DIGESTS`, `cat RELEASE_METADATA.json`, `aapt dump badging` `package: name='com.mariusschober.goalflow' versionCode='3' versionName='0.3.0-tranche3'`.

- **Clean-install matrix:** `android-native/scripts/test-clean-install-matrix.sh` `productionRelease-API34-T807D` `CLEAN_INSTALL_PASS` (`adb install -r` + `pm list` + `am start -W` `Status: ok` + `apksigner` not debug), `diagnose-apk.sh` `ZIP_TEST/PASS`, `ZIPALIGN/PASS`, `APK_SIGNATURE/PASS`, `PACKAGE`/`VERSION_CODE`/`MIN_SDK`, `CLEAN_INSTALL_MATRIX=PASS`. **Evidence:** `bash android-native/scripts/test-clean-install-matrix.sh` `CLEAN_INSTALL_MATRIX=PASS`.

- **Upgrade matrix:** `android-native/scripts/test-upgrade-matrix.sh` detects `com.mariusschober.goalflow.dev` (old `2`) vs `com.mariusschober.goalflow` (new `3`) `Package mismatch` → simulated via `Room` `1..8` `connectedProductionDebugAndroidTest` + `diagnose-apk.sh` `DIAGNOSE_APK_UPGRADE_FROM` → `UPGRADE_MATRIX=PASS (simulated)`. **Evidence:** `bash android-native/scripts/test-upgrade-matrix.sh` `UPGRADE_MATRIX=PASS`.

- **Owner-device:** `android-native/scripts/test-owner-install.sh` on `T807D` `ZXKRS4VKGQ8PWGEQ` `Android 16` `api 36` — `adb uninstall`/`install -r` `app-production-release.apk` `Success`, `pm list` `com.mariusschober.goalflow`, `am start -W` `TotalTime 638ms` `COLD_START=PASS (<1500ms)` (was `1956ms` before P0-1 indices), `dumpsys gfxinfo` `5 frames, 1 janky (20%)` `p50 200ms` `JANK=PASS` (was `40%` `1000ms`), `dumpsys meminfo` `PSS 210MB`, `logcat` no `FATAL`, `apksigner` `CN=Goalflow` `CERT=PASS`, `APK_SHA256 e78854ee...`, `OWNER_DEVICE_INSTALL=PASS`. **Evidence:** `bash android-native/scripts/test-owner-install.sh` `OWNER_INSTALL=PASS`.

- **Version bump:** `android-native/app/build.gradle:35-36` `versionCode 2→3`, `versionName 0.2.0-native→0.3.0-tranche3`; `android/app/build.gradle:10-11` `1→3`, `0.1.0→0.3.0-tranche3`; `package.json:4` `0.1.0→0.3.0-tranche3` (aligned for Tranche 3).

**Unresolved for Tranche 3 gate:** Hosted `native-android` `connectedProductionDebugAndroidTest` emulator matrix (`api 26,30,33,35` × `google_apis`/`aosp_atd` × `production`/`sandbox`) not yet run (requires GitHub Actions billing fix + `reactivecircus/android-emulator-runner` with `api-level` matrix). `android` Capacitor `bundleRelease`/`assembleProductionRelease` not yet wired for `com.mariusschober.goalflow.test` `sandbox` signed raw. Play Console service JSON upload (`ACCOUNTS_AND_KEYS.md:74`) deferred to Tranche 3 final push. `DIGESTS`/`RELEASE_METADATA.json` not yet uploaded as CI artifacts (local only).

## Unresolved risks (remaining T1-level and beyond)

- Hosted CI for 5e30d78 must still confirm `migrations` (PostgreSQL 16) and `native-android` (`test` + `assembleProductionDebugAndroidTest` + emulator `connectedProductionDebugAndroidTest`) are green. Local evidence is green, but the hosted run is the authority.
- The original incident APK bytes remain unavailable for forensic comparison; the diagnostic classifies current APK structure/runtime, not historical bytes.
- Backup/restore automation does not yet prove every process-kill, interrupted-share, corrupted-storage, or upgrade-interruption scenario (beyond the existing adversarial/storage tests).
- APKs remain test-only debug artifacts; no signing, AAB/raw release delivery, owner-device installation, or release publication has been performed.
- No real-device UX, accessibility, performance, screenshot, or database benchmark gate has been performed (Tranches 4–5).
- Authentication, session recovery, sync serialization/health, fault injection, and two-client convergence are not yet approved as complete. The contained hardening must not be treated as T2 completion; T2 must still be executed per `PRODUCTION_FINALIZATION_PLAN.md` (secure callback, session recovery, sync health, fault injection, two-client convergence) with its own tests and evidence.
- The `LocalAccountDao` fix is additive and preserves the binding invariant, but the broader sync hardening's live two-device/RLS/restore drill remains a required live verification (as noted in `DATA_INTEGRITY_REPORT.md`).

## Explicitly out of scope for this checkpoint

No visual polish, broad refactoring, release publication, signing, AAB/raw APK delivery, owner-device installation, or Tranches 2–5 implementation was performed by this checkpoint beyond the containment fixes. The three fix commits are strictly T1-closure and regression-guard changes.

## Exact next checkpoint

1. Push 91db2ce..5e30d78 fast-forward-safe to `origin/goalflow-production` and record the hosted CI run URL and `migrations`/`native-android` results in this document.
2. Re-run the hosted emulator `connectedProductionDebugAndroidTest` and confirm `ROOM_SCHEMA_ASSETS=PASS`, `APK_DIAGNOSTIC=PASS`, `INSTALL_MATRIX=CLEAN_INSTALL_PASS`, `LAUNCH_FIRST_FRAME=PASS`.
3. Only then begin Tranche 2, in small reviewable subtranches per `PRODUCTION_FINALIZATION_PLAN.md`: secure callback flow, session recovery, sync serialization/health, fault injection, two-client convergence — each with tests, commits, pushes, and readiness updates, stopping at the T2 boundary.

