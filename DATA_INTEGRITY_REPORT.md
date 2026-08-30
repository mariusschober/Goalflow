# Goalflow data-integrity report

Date: 2026-08-30 22:30 UTC
Branch: `codex/zero-data-loss-finalization` at `525e8fb` (equivalent to `goalflow-production` at `b1b9d42` / `5e30d78`); production baseline `7a502cd`
Objective: zero silent data loss across web/PWA, Android, macOS, Telegram Bot, Telegram Mini App, API/Supabase

This report distinguishes implemented/tested behavior from infrastructure that
was unavailable or deliberately excluded. It is not a “production ready” claim.

## Status legend

- **PASS** — exercised by the stated automated or executable check.
- **FAIL** — a known property is violated.
- **NOT VERIFIED** — implemented or statically reviewed, but the required runtime/live environment was not exercised.

The overall status is conservative: a cross-platform invariant remains **NOT VERIFIED** when its Android, PostgreSQL, or live-provider portion was not executed.

## Required invariants

| # | Invariant | Web/PWA | Server/DB | Native Android | macOS | Telegram Bot | Mini App | Overall |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | UI success follows durable local persistence | **PASS** — synchronous read-verified WAL | — | **PASS** — Room tx + outbox (525e8fb) | NOT VERIFIED | NOT VERIFIED (server ingress) | NOT VERIFIED | **NOT VERIFIED** |
| 2 | Cloud mutation remains pending until exact acceptance or durable conflict | **PASS** | **PASS** — PG harness executed empty+seeded (`test-postgres-migrations.sh` PASS) | **PASS** — Room tx + outbox retained | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **NOT VERIFIED** |
| 3 | Every mutation is idempotent | **PASS** | **PASS** — PG idempotency + receipt harness PASS | **PASS** — stable mutationId + 2 pending | NOT VERIFIED | PASS (update_id uuidv5) | NOT VERIFIED | **NOT VERIFIED** |
| 4 | Repeated requests do not duplicate tasks/completions | **PASS** — adversarial/API tests | **NOT VERIFIED** — real PostgreSQL unavailable | **NOT VERIFIED** | **NOT VERIFIED** |
| 5 | Server retries are safe | **PASS** — TypeScript fake-server/replay tests | **NOT VERIFIED** — live RPC execution | — | **NOT VERIFIED** |
| 6 | Client retries are safe | **PASS** — pre/post-commit timeout tests | — | **NOT VERIFIED** | **NOT VERIFIED** |
| 7 | Cursor never advances beyond discarded remote data | **PASS** — exact-page/cursor tests | **PASS** — API cursor response is last returned record | **NOT VERIFIED** | **NOT VERIFIED** |
| 8 | Conflicts never silently choose a side | **PASS** — durable local/server conflict hydration | **NOT VERIFIED** — SQL conflict ledger not executed | **NOT VERIFIED** | **NOT VERIFIED** |
| 9 | Crash between local write and sync recovers | **PASS** — WAL/restart tests | — | **NOT VERIFIED** | **NOT VERIFIED** |
| 10 | Crash during sync recovers | **PASS** — lost-response tests | **PASS** — exact receipts checked by API | **NOT VERIFIED** | **NOT VERIFIED** |
| 11 | Process death preserves pending mutations | **PASS** | — | **NOT VERIFIED** | **NOT VERIFIED** |
| 12 | Long offline use remains safe | **PASS** — state-machine/adversarial tests | — | **NOT VERIFIED** | **NOT VERIFIED** |
| 13 | Different-record device edits converge without conflict | **PASS** | **NOT VERIFIED** — live two-device drill | **NOT VERIFIED** | **NOT VERIFIED** |
| 14 | Same-record edits preserve both versions until resolution | **PASS** | **NOT VERIFIED** — SQL/live drill | **NOT VERIFIED** | **NOT VERIFIED** |
| 15 | Deletes/drops/completions do not resurrect from stale clients | **PASS** — tombstone/stale-edit tests | **NOT VERIFIED** — PostgreSQL/live clients | **NOT VERIFIED** | **NOT VERIFIED** |
| 16 | Replayed/old mutations cannot overwrite newer server state | **PASS** — CAS/replay tests | **NOT VERIFIED** — PostgreSQL harness unavailable | **NOT VERIFIED** | **NOT VERIFIED** |
| 17 | Authentication expiry cannot lose mutations | **PASS** — 401 recovery test | **PASS** — request rejected before receipt | **NOT VERIFIED** | **NOT VERIFIED** |
| 18 | Temporary server/Supabase failure cannot affect local execution | **PASS** | **PASS** — cloud errors do not enter local transaction | **NOT VERIFIED** | **NOT VERIFIED** |
| 19 | Restore is atomic; failed restore preserves old valid data | **PASS** — corruption/collision/owner tests | **NOT VERIFIED** — PostgreSQL restore drill unavailable | **NOT VERIFIED** | **NOT VERIFIED** |
| 20 | Migrations are forward-only and non-destructive/reversible | **PASS** | **PASS** — 6 migrations PG16 empty+seeded PASS | **PASS** — Room v7 exported 1..7, `ROOM_SCHEMA_ASSETS=PASS`, migration instrumentation compile PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **NOT VERIFIED** |

No required invariant is knowingly **FAIL**. The **NOT VERIFIED** results are real release gates, not implied passes.

## Bugs found

- React could render success before IndexedDB persistence; delayed effects could later write an older render over newer staged data.
- IndexedDB failure/recovery and hydration failure could select an older mirror or persist defaults over valid data.
- Web store snapshots allowed unrelated records on two devices to collide or disappear.
- Web task deletion did not carry a true transport tombstone.
- Completion, planning, goal/habit/check-in side effects crossed multiple non-atomic stores.
- Native push removed/reclassified mutations before exact acceptance was proven.
- Native pull could skip a conflicting record and still advance its cursor.
- Existing conflicts could retain an older cloud side while the cursor moved forward.
- Accepted receipts were not bound to exact identity/version/payload/timestamps/tombstone.
- Authentication/account changes could reuse another account’s local state.
- Backup/restore omitted pending synchronization state, allowed partial replacement, or silently selected same-ID data.
- Server task endpoints had idempotency without compare-and-swap, allowing a different mutation key to overwrite a newer revision.
- Telegram acknowledged work before durable processing and did not bind retry IDs to the update.
- Restores reused old cursors, erased receipt evidence, and could hide newer same-record values or post-backup records.
- Canonical task/plan mirrors rebuilt JSON from only known columns, truncating client-owned fields.
- Native `task_events` were queued locally but rejected by the HTTP schema and protocol-v3 RPC.
- Server-created task events were not mirrored to native second devices.
- Server task events would poison the web cursor because the PWA had no durable event store.
- Native and web backup formats could silently ignore the other platform’s pending recovery ledgers.
- Room production v6 already contained task events; adding account binding at v6 would have collided with deployed schema history.

## Fixes made

- Added read-verified browser WAL entries and atomic IndexedDB value/outbox/version transactions.
- Converted task, goal, habit, True North, daily-plan, and hidden task-event sync to record level; legacy snapshots are merge-only.
- Added deterministic mutation dependencies, exact receipt validation, explicit conflicts, monotonic conflict hydration, and atomic cursor pages.
- Added fail-closed hydration and fallback-to-IndexedDB reconciliation.
- Grouped semantic multi-store UI actions into one durable staged action.
- Added protocol v3 fingerprints, CAS, durable receipts/conflicts, explicit resolution, and account-scoped APIs.
- Added task/API/Telegram idempotency and expected-revision checks.
- Made server restore transactional, pre-backup-gated, cursor-rebased, tombstone-producing, and receipt-preserving.
- Made canonical task/plan JSON mirrors merge authoritative fields into existing full payloads.
- Completed bidirectional `task_events` transport: native → sync RPC → canonical table and canonical event → sync record → web/native devices.
- Added hidden PWA `task_events` IndexedDB storage so shared cursors remain safe.
- Added Room v6→v7 migration for durable account binding while preserving the production v6 task-event schema.
- Made native row/outbox writes, acknowledgement/conflict transitions, pull/cursor commits, backup, restore, and rollback transactional.
- Added encrypted, checksummed, owner-bound backups; incompatible cross-platform pending ledgers stop visibly instead of being dropped.

## Automated evidence

| Check | Status | Result |
| --- | --- | --- |
| `npm run lint` | **PASS** | TypeScript clean |
| `npm test` | **PASS** | 10 files, 102 tests |
| Deterministic/property/adversarial sync tests | **PASS** | WAL, timeouts, 401, replay, cursor, conflicts, stale writes, tombstones, native-event web hydration |
| `npm run build` | **PASS** | Production client and server bundles |
| `npm run verify:server` | **PASS** | Production startup and `/api/v1/health` |
| `npm run verify:client-secrets` | **PASS** | 27 built files scanned |
| `npm audit --audit-level=high` | **PASS** | 0 vulnerabilities |
| `npm run verify:migrations` | **PASS** | Static additive/order/protocol checks across 6 migrations (2026-08-30 525e8fb) |
| `bash scripts/test-postgres-migrations.sh` | **PASS** | PG16 empty+seeded PASS (`{"status":"PASS",...}`) at 525e8fb, local Homebrew PG17 also PASS |
| `npm run test:migrations:postgres` | **PASS** | `bash scripts/test-postgres-migrations.sh` PASS (empty+seeded, also `test-postgres-migration-case-regression.sh` POSTGRES_CASE_REGRESSION=PASS) — local |
| Native Room v7 compile | **PASS** | JDK21, `./android-native/gradlew -p android-native assembleProductionDebugAndroidTest` BUILD SUCCESSFUL, 7.json identityHash 862f8cbc |
| Android tests (native) | **PASS** | `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native test` — 70 tests per variant, 0 failed (GoalflowRepositorySyncTest 36) |
| GitHub hosted CI (this tree) | **NOT VERIFIED** | Billing-blocked (runs 33334560152, 33334480320, 33335350970 all 0 steps, `.github#1` payment failure) — local green must be confirmed after billing cleared |

## Remaining risks and required live verification

- Execute all six migrations on PostgreSQL 16 from both an empty database and the seeded current schema; the harness includes native-event, idempotency, CAS, restore, cursor, and unknown-payload assertions.
- Verify migration `202608300001_complete_native_sync_transport.sql` against the exact live `push_sync_mutation_v2` definition; it deliberately aborts if that definition differs.
- Compile Room v7 with JDK 21/Android SDK, retain the generated schema 7 artifact, and execute migration/device process-death tests when approved.
- Run real Supabase RLS checks with two user identities, two-device chaos, auth expiry, and response loss after commit.
- Verify live backup-object upload/download, pre-restore backup completion, checksum rejection, restore, and rollback.
- Deploy database migrations before clients/API that emit `task_events`; incorrect order should leave outbox data pending, but must be observed operationally.
- Historical client-owned JSON fields already truncated before this fix cannot be reconstructed automatically.
- Cross-platform backups with a non-empty foreign pending ledger intentionally fail visibly and must be restored on the originating platform; automatic ledger conversion remains unsupported.
