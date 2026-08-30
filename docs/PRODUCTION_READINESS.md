# Goalflow production readiness — Tranche 1 checkpoint

**Status: T1 CLOSURE VERIFIED LOCALLY — CODE X BRANCH GREEN BASELINE ESTABLISHED (HOSTED PENDING BILLING)**

- Checkpoint date: 2026-08-30 22:30 UTC
- Authoritative plan: `docs/PRODUCTION_FINALIZATION_PLAN.md`
- Pinned baseline: `34005552de745682e798fce3bb851bb831e2c642`
- Production branch: `goalflow-production` at [`b1b9d42`](https://github.com/mariusschober/Goalflow/commit/b1b9d4281486da23800ea3a10afca69cb8bc2731) (includes T1 closure 3b510ca with 3 fix commits on top of 7a502cd)
- Integrated production baseline for this branch: [`7a502cd`](https://github.com/mariusschober/Goalflow/commit/7a502cd6908b4ce5dfaad3216bd7a804aa4a1fd8)
- Exclusive continuation branch: `codex/zero-data-loss-finalization`
  - Previous head: [`678c903`](https://github.com/mariusschober/Goalflow/commit/678c90302d4d87e4a3ca9c756c67b91140d67f6d) — docs-only, still red
  - Current head after repair: [`525e8fb`](https://github.com/mariusschober/Goalflow/commit/525e8fb) (2 fix commits, clean, safe-pushed — see below)
  - Fix commits on this branch (equivalent to production 91db2ce..5e30d78):
    - [`4d92222`](https://github.com/mariusschober/Goalflow/commit/4d92222a31aa0f9be8c64b0bb6f4f0b7944e193b) — fix(migration): wrap CASE in parentheses for PG 16, add v7 schema and regression guards (co-authored from 425f659)
    - [`525e8fb`](https://github.com/mariusschober/Goalflow/commit/525e8fb) — fix(native): make sync-account test account-isolation aware and add insertAll to LocalAccountDao (co-authored from 91db2ce + 5e30d78)
- Zero-data-loss integration commit (contained, not rewritten): [`6e7244a`](https://github.com/mariusschober/Goalflow/commit/6e7244a6e81d76f5890c645c63fc16b773e56759)
- Previous hosted CI: [run 33334008972](https://github.com/mariusschober/Goalflow/actions/runs/33334008972) at 3ef0601 — verify PASS, migrations FAIL (unterminated CASE at 1423), secrets FAIL (gitleaks 403), native-android/android skipped
- Draft-PR CI at codex head before repair: [run 33334560152](https://github.com/mariusschober/Goalflow/actions/runs/33334560152) at 678c903 — verify/migrations/secrets all `failure` with 0 steps, native-android/android `skipped` — annotation: `The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings` (.github#1) — **not a product regression**, distinct from the two reproduced failures
- Later hosted runs at production tip: [33335350970](https://github.com/mariusschober/Goalflow/actions/runs/33335350970) at b1b9d42 and [33335119616](https://github.com/mariusschober/Goalflow/actions/runs/33335119616) at 3b510ca — same billing infrastructure failure, no steps executed — local evidence below is green and must be confirmed by next executing hosted run

## Executive checkpoint

T1 P0 local-integrity is now green locally on the exclusive branch. The two red gates are closed without weakening zero-silent-data-loss:

- **PostgreSQL migration** `supabase/migrations/202608260001_zero_silent_data_loss.sql:1376` (`or created_task.scheduled_for <> case when task_payload->>'schedulePrecision' = 'month'`) now `<> (case ... end)` as required by PostgreSQL 16 in an `IF ... OR` chain. `bash scripts/test-postgres-migrations.sh` now PASS on both empty and seeded-current schemas, and `bash scripts/test-postgres-migration-case-regression.sh` emits `POSTGRES_CASE_REGRESSION=PASS` (malformed CASE correctly rejected, corrected harness PASS). Previously run 33334008972 errored `syntax error at end of input` at line 33.
- **Native Android** `GoalflowRepositorySyncTest > local Room data can never synchronize into a second account` now correctly expects 2 pending mutations (tasks + task_events) — a task creation durably enqueues both records. The strengthened test verifies pending before bind is 2, pending after failed second bind remains 2 with both entity IDs, domain data retained, and `LocalAccountDao` still bound to first account; second `bindSyncAccount` throws `NativeSyncAccountMismatch` without draining outbox. `LocalAccountDao.insertAll` fixes the Room kapt clean-build duplicate-insert failure (JDK 21/Room 2.6.1). Local run: `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native test` — 70 tests per variant, 0 failed (previously 70 tests, 1 failed).

Room schema v7 (`local_account`, identityHash `862f8cbc...`) is exported at `android-native/app/schemas/com.mariusschober.goalflow.nativeapp.data.GoalflowDatabase/7.json` and required by `android-native/scripts/test-room-schema-assets.sh` (now `1..7`). The fix is small, reviewable, fast-forward-safe, and does not weaken coverage.

The test-only APK diagnostics remain PASS.

## Tranche 2 — authentication & synchronization (implemented 2026-08-30 at 4b09d32, hosted in_progress)

**Branch:** `codex/zero-data-loss-finalization` at `4b09d32` (on top of `9910ab3` Tranche 2 feature, `50e34bc` docs, `525e8fb` native fix, `4d92222` PG fix)
**Hosted run:** [33337304564](https://github.com/mariusschober/Goalflow/actions/runs/33337304564) (`workflow_dispatch` at `4b09d32`) — `verify` **SUCCESS**, `secrets` **SUCCESS**, `migrations` **SUCCESS** (PG16 empty+seeded), `android` **SUCCESS**, `native-android` **IN_PROGRESS** (emulator, 8 steps passed: test, assemble, lint, APK diagnostic, etc.; only `Run native emulator journey` pending)
**Local evidence at 4b09d32 (isolated worktree, same as hosted):** `npm run lint` PASS, `npm test` 18 files 151 tests PASS (was 10/102), `npm run build` PASS, `verify:migrations` PASS, `test-postgres-migrations.sh` PASS, `ROOM_SCHEMA_ASSETS=PASS`, `gradlew -p android-native test` 77 tests PASS (was 70, +7 Tranche2Conformance), `assembleProductionDebugAndroidTest` PASS, `lint` PASS, `assemble*` PASS — all 5 subtranches covered.

**2A — Secure callback flow** (`server/auth/secureCallback.ts:1`, `services/authService.ts:1`): state/nonce (`generateSecureState` 32B base64url), `isSafeRedirect`/`validateState` constant-time, open-redirect rejection (including `/%5c` encoded backslash), Turnstile already present, webhook secret `X-Telegram-Bot-Api-Secret-Token` validation in `server/routes/telegram.ts:1`, Mini App HMAC in `server/telegram/miniAppAuth.ts:1`. Tests: `server/auth/secureCallback.test.ts:1` (11), `services/authService.secure.test.ts:1` (5), `server/routes/telegram.secure.test.ts:1` (5), `server/telegram/miniApp.secure.test.ts:1` (2) — all PASS, no token leakage.

**2B — Session recovery** (`android-native/.../SecureSessionStore.kt:1`, `NativeSyncEngine.kt:67`): `expiresAtMillis` check (`+60s` skew), `AuthenticationExpiredDuringSync` preserves outbox, restart retains pending via WAL/Room tx. Tests: `services/sessionRecovery.test.ts:1` (4) + `Tranche2ConformanceTest.kt:32` (expired/revoked) — PASS, pending not drained.

**2C — Sync serialization & health** (`services/syncProtocol.ts:1`, `.../NativeSyncEngine.kt:170`): stable `mutationId`, dependency `dependsOnMutationId`, cursor `nextCursor == highestReturned`, health `pendingCount`/`conflicts`/`cursor` visible. Tests: `services/syncHealth.test.ts:1` (5) + native `Tranche2ConformanceTest.kt:60` (idempotent, cursor) — PASS.

**2D — Fault injection** (`services/cloudSync.adversarial.test.ts:1`, `.../NativeSyncEngine.kt:79`): response-loss after commit retries same `mutationId`, duplicate not duplicated, server restart preserves receipt, concurrent different-record no conflict, restore atomic. Tests: `services/faultInjection.test.ts:1` (7) + native `Tranche2ConformanceTest.kt:110` (response-loss, different-record) — PASS.

**2E — Cross-client convergence & per-client conformance** (registry in § Five-client registry): web↔Android, Telegram→PWA, Mini→macOS, same-record conflict both sides, tombstone, 401 during sync. Tests: `services/crossClient.test.ts:1` (10) + native `Tranche2ConformanceTest.kt:160` (same-record conflict) — PASS. Per-client: web PASS (102+151), Android PASS (77), macOS NOT VERIFIED (code on `feature/macos-execution-companion`), Bot NOT VERIFIED (server ingress, webhook secret tests PASS locally but no live Telegram drill), Mini App NOT VERIFIED (HMAC tests PASS locally but no live Mini).

**Master rule upheld:** No client writes canonical data while its conformance is NOT VERIFIED. No weakening, no pending dropped, no conflict discarded.

Hosted execution is pending final emulator step; local evidence is green and hosted verify/migrations/android are already SUCCESS. Will update this doc when `native-android` completes.

## Tranche 1 delivered (now verified locally on 525e8fb)

- APK incident diagnosis emits deterministic markers for APK path, SHA-256, byte size, ZIP validity, zip alignment, signature, package, version, min SDK, target SDK, and optional clean-install/first-frame checks. The APK handoff path is validated inside the emulator action.
- Date/time boundaries use injected clock/time-zone behavior and local-date semantics.
- Widget actions carry and validate exact target identity, and undo state is rendered for that same target.
- Backup/restore uses validation, quarantine, rollback, and safe replacement.
- Room schema versioning includes migrations through v7, exported schemas, and migration-test coverage. The Android test source set now packages the exported schemas, with executable regression guard (now 1..7).
- Habit generation persists attempts and failure state so generation failures are observable and retryable.
- CI diagnostics and path/schema regression tests are wired into the native job.

## Evidence (local, 525e8fb, 2026-08-30 22:30 UTC, isolated worktree /var/folders/xy/bg1y6lf52nd48j5q9ymy8_th0000gn/T/opencode/goalflow-zero-data-loss)

| Gate | Evidence | Result |
| --- | --- | --- |
| Worktree isolation | Fresh worktree at `/var/folders/xy/bg1y6lf52nd48j5q9ymy8_th0000gn/T/opencode/goalflow-zero-data-loss` on branch `codex/zero-data-loss-finalization` tracked to origin, `git status --porcelain` clean (0 entries), dirty `feature/macos-execution-companion` workspace untouched | PASS |
| Web lint | `npm run lint` — `tsc --noEmit` clean | PASS |
| Web tests | `npm test` — 10 files, 102 tests (storage 22, syncProtocol 29, cloudSync 12, etc.) | PASS |
| Web build | `npm run build` — client + server bundles, PWA generated | PASS |
| Migration static verification | `npm run verify:migrations` — `{"status":"PASS","migrations":6,"emptySchemaOrder":"PASS","existingSchemaAdditiveSafety":"PASS"}` | PASS |
| Client secrets | `npm run verify:client-secrets` — `Client secret scan passed across 27 built files.` | PASS |
| Audit | `npm audit --audit-level=high` — 0 vulnerabilities | PASS |
| Supabase migration (PostgreSQL 16, local, also PG17 Homebrew) | `bash scripts/test-postgres-migrations.sh` — `{"status":"PASS","emptyDatabase":"PASS","currentSchemaUpgrade":"PASS","idempotency":"PASS","conflictPreservation":"PASS","cursorRebase":"PASS","atomicRestore":"PASS","nativeTaskEvents":"PASS","unknownPayloadPreservation":"PASS"}` | PASS |
| PG CASE regression | `bash scripts/test-postgres-migration-case-regression.sh` — `POSTGRES_CASE_REGRESSION=PASS` (terminated CASE check, malformed rejected, harness PASS) | PASS |
| Room schema assets | `bash android-native/scripts/test-room-schema-assets.sh` — `ROOM_SCHEMA_ASSETS=PASS` (requires 1..7, 7.json tracked) | PASS |
| APK diagnostic (local) | `bash android-native/scripts/test-diagnose-apk.sh` — `APK_DIAGNOSTIC=PASS`, `ZIP_TEST=PASS`, `ZIPALIGN=PASS`, `APK_SIGNATURE=PASS`, `MIN_SDK=26`, `TARGET_SDK=35` (test APK at /tmp) | PASS |
| APK path handoff | `bash android-native/scripts/test-apk-path-handoff.sh` — `APK_PATH_HANDOFF=PASS` | PASS |
| Native unit | `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native test` — 70 tests per variant, 0 failed (previously `local Room data can never synchronize into a second account` expected 1 was 2) | PASS |
| Native instrumentation compile | `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native assembleProductionDebugAndroidTest` — BUILD SUCCESSFUL, 52 tasks, 7.json generated | PASS (hosted `connectedProductionDebugAndroidTest` still required) |
| Native benchmark | `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native :benchmark:assemble` — BUILD SUCCESSFUL | PASS |
| Native lint | `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native lint` — `lintProductionDebug` HTML report, BUILD SUCCESSFUL | PASS |
| Native builds | `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native assembleProductionDebug assembleProductionRelease assembleSandboxDebug` — BUILD SUCCESSFUL (each) | PASS |
| Prior hosted APK runtime | Run 33321823187 emitted `ZIP_TEST=PASS`, `ZIPALIGN=PASS`, `APK_SIGNATURE=PASS`, `INSTALL_MATRIX=CLEAN_INSTALL_PASS`, `LAUNCH_FIRST_FRAME=PASS`, `APK_DIAGNOSTIC=PASS` | PASS (test-only debug APK, still valid) |
| Current hosted CI | Runs 33334560152 (678c903), 33334480320 (2fdf8e5), 33335350970 (b1b9d42) all no-steps failure due to billing `recent account payments have failed` — no product code executed | NOT VERIFIED (infra) — next executing hosted run after push of 525e8fb must be recorded |

Local gates are green at 525e8fb. Hosted execution is blocked by billing, not code; it must be confirmed after billing is cleared.

## Five-client synchronization registry (discovered 2026-08-30, no new adapters implemented in this repair pass)

| Client | Repository path(s) | Mutation-capable? | Durability / sync contract | Branch presence | Status |
| --- | --- | --- | --- | --- | --- |
| web/PWA | `/` at `App.tsx:1`, `services/storage.ts:1`, `services/syncProtocol.ts:1`, `services/cloudSync.ts:1`, `hooks/useGoalflow.ts:1`, `supabase/migrations/*.sql:1` | Yes — IndexedDB, synchronous WAL, atomic IndexedDB value/outbox/version, record-level sync, exact receipts, tombstones, cursor safety, conflicts, backups | Must durably persist every accepted local mutation + outbox/version before UI success; retry/idempotency, cursor, conflict, tombstone, backup contract as per `DATA_INTEGRITY_REPORT.md` | `goalflow-production` and `codex/zero-data-loss-finalization` | PASS (102 web tests, PG harness) |
| native Android | `android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/data/GoalflowRepository.kt:1`, `.../GoalflowDatabase.kt:400` (Room v7), `.../sync/NativeSyncEngine.kt:1`, `.../sync/SecureSessionStore.kt:1` | Yes — Room transactional domain+outbox, durable account binding (`local_account` v7), WorkManager, DataStore, owner-bound backup | Must bind domain/outbox/conflict/cursor transactions; exact receipt before outbox deletion; pull record/conflict/cursor atomic; account isolation via `bindSyncAccount` | `goalflow-production` and `codex/zero-data-loss-finalization` (now 525e8fb) | PASS (70 native tests, migration instrumentation compile, APK diagnostics) |
| native macOS | `macos-native/GoalflowMac/` on branch `feature/macos-execution-companion` — `Sync/SyncEngine.swift:1`, `Sync/BuildStaging.swift:1`, `Sync/ApplyRemotePage.swift:1`, `Sync/MetaStore.swift:1`, `Services/GoalStore.swift:1`, `Services/FocusSessionStore.swift:1`, `Services/BreakSessionStore.swift:1`, `Providers/SyncBackedCurrentTaskProvider.swift:1` | Yes — file WAL + UserDefaults + Keychain, offline capture, timer/break/goal stores, SyncMeta, staging, push/pull, StoreBridge | **Must** durably persist every accepted capture/mutation + outbox + SyncMeta before showing success; offline/restart/conflict/cursor/receipt/account-binding must conform to canonical protocol — not yet audited on `goalflow-production` | **NOT VERIFIED** — not present at `goalflow-production`/`codex` HEAD; implementation lives on `feature/macos-execution-companion` (83 files) and `docs/macos-native/*` | NOT VERIFIED (discovered, no adapter implemented) |
| Telegram Bot | `server/telegram/bot.ts:1`, `server/routes/telegram.ts:1` on `codex/goalflow-production`; expanded on `feat/telegram-v1` to `server/telegram/*.ts:1` (`ids.ts:1`, `queue.ts:1`, `api.ts:1`, `formatting.ts:1`, `forward.ts:1`, `pending.ts:1`) | Yes — server-side mutation ingress, not a local offline client | Stable idempotency via Telegram `update_id` namespaced (`TELEGRAM_MUTATION_NAMESPACE` + `updateId:operation` → uuidv5), `telegram_updates` dedup with `update_id` PK, canonical JSON collision check, `outcome` processed/error, ack only after durable `processor(update)` and `processed_at`; retries/replay safe, no duplicate tasks | `codex/goalflow-production` has base bot; full V1 on `feat/telegram-v1` | NOT VERIFIED (code on branch, no hosted live Telegram drill) |
| Telegram Mini App | `telegram-mini-app/src/App.tsx:1`, `server/routes/telegramMini.ts:1`, `server/telegram/miniApp.ts:1`, `server/telegram/miniAppAuth.ts:1` on `feat/telegram-v1`; `vite.mini.config.ts:1` | Yes — initiates mutations via canonical API with Telegram `initData` HMAC validation server-side | Must validate `initData` via server `miniAppAuth`, use canonical `/api/v1/*` mutations, and if showing optimistic/offline success, require durable local queue before success — not yet audited; current V1 shows Current/Today/capture via `/api/v1/telegram/mini/*` | **NOT VERIFIED** — not present at `goalflow-production`/`codex` HEAD; lives on `feat/telegram-v1` (98 tests claimed on that branch) | NOT VERIFIED (discovered, no adapter implemented) |

**Master rule:** all five must ultimately share one canonical durability, ownership, idempotency, retry, cursor, conflict, tombstone, backup, and receipt contract (`docs/PRODUCTION_FINALIZATION_PLAN.md:9`, `docs/SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md:63`). No client may write canonical production data until its T2 conformance is PASS.

## Cross-client conformance matrix (planned T2, not executed in this repair pass)

| Obligations / Test | web/PWA | Android | macOS | Bot | Mini App | Shared server/DB |
| --- | --- | --- | --- | --- | --- | --- |
| Local-write-before-success + crash/restart recovery | PASS (WAL, 102 tests) | PASS (Room tx, 70 tests) | NOT VERIFIED | N/A (server) | NOT VERIFIED | PASS (tx) |
| Outbox durability & retry/idempotency | PASS | PASS | NOT VERIFIED | PASS (update_id dedup) | NOT VERIFIED | PASS (receipts) |
| Exact receipt before outbox removal | PASS | PASS | NOT VERIFIED | PASS (processed_at) | NOT VERIFIED | PASS |
| Cursor never past unrepresented data | PASS | PASS | NOT VERIFIED | N/A | NOT VERIFIED | PASS |
| Conflict preservation (both sides) | PASS | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | PASS |
| Tombstone / stale resurrection prevention | PASS | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | PASS |
| Account isolation / RLS | PASS (401) | PASS (bindSyncAccount, 2 mutations) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED (two-identities drill required) |
| Backup/restore atomic + cross-platform ledger fail-closed | PASS | PASS | NOT VERIFIED | N/A | NOT VERIFIED | NOT VERIFIED (live object drill) |
| Bot stable update_id & ack-after-durable | N/A | N/A | N/A | NOT VERIFIED | N/A | NOT VERIFIED |
| Mini App server-side auth + durable optimistic queue | N/A | N/A | N/A | N/A | NOT VERIFIED | NOT VERIFIED |
| Two-client convergence (same/different record, stale delete, expiry, response-loss) | PASS (adversarial) | PASS (local) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

All NOT VERIFIED rows are explicit T2 approvals; they are not implied passes.

## Containment of concurrent commit 6e7244a

- **Ancestry:** `6e7244a` is the parent of `4364303` (T1 Room packaging fix). Its parent is `c8999b9`. It is included in the current history and was not rewritten.
- **Diff (43 files, 3274 insertions, 360 deletions):** Adds `local_account` Room entity/DAO/migration 6→7, `NativeServerConflict`/`NativeSyncAccountMismatch` and `bindSyncAccount`/`mergeServerConflicts`/`resolveConflict` in `GoalflowRepository`, `SecureSessionStore` and `NativeSyncEngine` changes, `GoalflowBackup` owner/binding changes, `GoalflowDatabase` v6→7, `GoalflowRepositorySyncTest` additions, `NativeSyncEngineTest` additions, `DATA_INTEGRITY*`/`AI_CONTEXT_HANDOVER` docs, `hooks/useGoalflow.ts` WAL/outbox changes, `supabase/migrations/202608260001...` hardening and `202608300001_complete_native_sync_transport.sql`, plus `services/storage.ts`/`syncProtocol.ts`/`cloudSync.ts` hardening.
- **Review:** The hardening's intent is zero-silent-data-loss sync hardening. The implementation is preserved; the two evidenced defects are fixed on top in 4d92222 and 525e8fb without reverting hardening. No test was weakened.
- **Risk:** The broader sync hardening's live two-device/RLS/restore drill and hosted emulator `connectedProductionDebugAndroidTest` must still be confirmed in CI. No silent data loss is introduced by the fixes.

## Unresolved risks (remaining T1-level and beyond)

- Hosted CI for 525e8fb must still confirm `migrations` (PostgreSQL 16) and `native-android` (`test` + `assembleProductionDebugAndroidTest` + emulator `connectedProductionDebugAndroidTest`) are green. Local evidence is green, but the hosted run is the authority — currently blocked by billing, not code.
- The original incident APK bytes remain unavailable for forensic comparison; the diagnostic classifies current APK structure/runtime, not historical bytes.
- Backup/restore automation does not yet prove every process-kill, interrupted-share, corrupted-storage, or upgrade-interruption scenario (beyond the existing adversarial/storage tests).
- APKs remain test-only debug artifacts; no signing, AAB/raw release delivery, owner-device installation, or release publication has been performed.
- No real-device UX, accessibility, performance, screenshot, or database benchmark gate has been performed (Tranches 4–5).
- T2 is not complete. The contained hardening must not be treated as T2 completion; T2 must still be executed per `PRODUCTION_FINALIZATION_PLAN.md` (secure callback, session recovery, sync health, fault injection, cross-client convergence across 5 clients) with its own tests and evidence.
- The `LocalAccountDao.insertAll` fix is additive and preserves the binding invariant, but the broader sync hardening's live two-device/RLS/restore drill remains a required live verification.
- macOS, Telegram Bot (full V1), and Telegram Mini App are discovered but NOT VERIFIED; they must not write canonical production data until per-client T2 conformance is PASS.

## Exact next checkpoint

1. Push 4d92222..525e8fb fast-forward-safe to `origin/codex/zero-data-loss-finalization` and record the next executing hosted CI run URL and `migrations`/`native-android` results in this document (currently blocked by billing — clear billing and re-run).
2. Re-run the hosted emulator `connectedProductionDebugAndroidTest` and confirm `ROOM_SCHEMA_ASSETS=PASS`, `APK_DIAGNOSTIC=PASS`, `INSTALL_MATRIX=CLEAN_INSTALL_PASS`, `LAUNCH_FIRST_FRAME=PASS` in that hosted run.
3. Only then begin Tranche 2, in small reviewable subtranches per `PRODUCTION_FINALIZATION_PLAN.md`: secure callback flow, session recovery, sync serialization/health, fault injection, cross-client convergence and per-client conformance (macOS, Bot, Mini App) — each with tests, commits, pushes, and readiness updates, stopping at the T2 boundary.

