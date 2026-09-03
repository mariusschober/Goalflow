> **HISTORICAL HANDOVER.** This file predates `integration/beta` and must not be
> used as current release or deployment instruction.

# Goalflow zero-silent-data-loss handover

## Current status — 2026-08-30

- The implementation and local non-Android release verification are complete.
- The user-supplied native baseline `34005552de745682e798fce3bb851bb831e2c642` was not the current production tip. The integration preserves the newer production history through `c8999b9cc2ae18b60aa5523df0d9b42bd51ad84d`, including Room schemas, task events, widgets, migration tests, and the corrected emulator APK handoff.
- The earlier exact checkpoint remains backed up on GitHub branch `goalflow-integrity-checkpoint-20260829-a867470`.
- The current merge adds the zero-silent-data-loss work on top of that production history. The final commit is the commit containing this document.
- `DATA_INTEGRITY_REPORT.md` is complete and is the authoritative PASS/NOT VERIFIED matrix.
- Android sync is included. Android tests were not executed, per the user’s earlier instruction.

### Latest evidence

- `npm run verify:release` — **PASS**.
- `npm test` — **PASS**, 10 files / 102 tests.
- Production client/server build and health startup — **PASS**.
- Client secret scan — **PASS**, 27 built files.
- Dependency audit — **PASS**, 0 vulnerabilities.
- Static migration verifier — **PASS**, 6 migrations.
- PostgreSQL execution — **NOT VERIFIED** locally (`createdb` unavailable).
- Native non-test compilation — **NOT VERIFIED** locally (Gradle distribution/JDK 21/Android SDK unavailable).
- Android tests — **NOT VERIFIED**, intentionally not run.

### Newest integration fixes

- Production Room v6 retains `task_events`; durable account binding is a forward v6→v7 migration.
- Native backups carry both server binding and durable owner binding; cross-account restore stops before mutation.
- Native task events now pass the HTTP/RPC boundary, project append-only into canonical `task_events`, and retry idempotently.
- Server-generated task events receive cursor-visible sync records for native second devices.
- The PWA has a hidden record-level `task_events` IndexedDB store, preventing native/server event rows from poisoning or skipping the shared cursor.
- Canonical task/daily-plan mirrors merge known fields into the existing full JSON payload and retain unknown client fields.
- Cross-platform backup aliases are preserved where safe; a non-empty foreign pending ledger stops visibly rather than being silently ignored.

### Pause/approval boundary

After this tree is committed and safely pushed, stop. Do not continue deployment or additional goal work without the user’s approval.

On approval, the next agent should:

1. Inspect the final GitHub CI run, especially PostgreSQL and `native-android` jobs.
2. If CI generated Room schema 7, retain/review it in a follow-up commit if it is not already tracked.
3. Run the live Supabase migration/RLS/two-device/restore drill described in `DATA_INTEGRITY_REPORT.md`.
4. Deploy in order: database migrations, API, then clients; observe pending outbox/conflict metrics.
5. Never force-push, rewrite history, reset over newer work, or merge to `main` without explicit authority.

## Goal and product rule

The active objective is to make Goalflow's persistence and synchronization path resilient to crashes, offline use, retries, process death, concurrent devices, server restarts, restores, and conflicts.

> A duplicated task is annoying. A visible conflict is acceptable. A temporarily failed sync is acceptable. A silently lost task is unacceptable.

Do not redesign Goalflow, add product features, optimize aesthetics, delete working functionality, introduce credentials, or add production test bypasses. Prefer the smallest robust architecture change. Android implementation remains in scope, but the user explicitly excluded running Android tests for this work session.

## Repository checkpoint

- Repository: `mariusschober/Goalflow`
- Branch: `goalflow-production`
- Checkpoint: the commit containing this document
- Baseline before this audit: local commit `7d39b32`
- Final integrity report: `DATA_INTEGRITY_REPORT.md`.

## Implemented architecture

### Browser/PWA

- Added a synchronous, read-verified local WAL before UI mutation success.
- Flushes WAL entries into IndexedDB with the user value, sync versions, and durable outbox in one transaction.
- Groups semantic multi-store changes such as completion/stat updates, reschedules, habit mutations, goal deletion/unlinking, and planning decisions into one staged transaction.
- Migrates tasks, goals, habits, True North goals, and daily plans from destructive store snapshots to record-level mutations while retaining backward-compatible legacy snapshot handling.
- Uses stable mutation identities, dependency chains, exact accepted-receipt validation, durable conflict history, and cursor/page atomicity.
- Keeps a mutation until exact acceptance or durable conflict representation.
- Fetches PostgreSQL-only conflicts after push/pull and durably hydrates both sides on fresh/restored clients.
- Prevents stale conflict-ledger responses from replacing a newer preserved server side.
- Adds account-keyed app remounting to prevent in-memory state crossing authenticated users.
- Makes backup import owner-bound, checksummed, and atomic; includes pending outbox, versions, and conflicts.

### Server/API/Supabase

- Added sync protocol v3 and `push_sync_mutation_v2` with request fingerprints, immutable receipts, compare-and-swap, exact replay behavior, and durable conflicts.
- Added record-level canonical task and daily-plan projection guarded by monotonic server versions.
- Added idempotency and expected-revision handling to task mutations and Telegram ingestion.
- Added user-scoped unresolved-conflict retrieval and explicit conflict resolution.
- Added forward-only migration columns/indexes/functions/triggers without dropping existing user data.
- Made restore transactional, owner-validated, checksum-validated, and sequence-safe.
- Restore preserves post-backup absent records as new tombstones and same-record divergence as unresolved conflicts containing both versions.
- Restore retains mutation/API receipts so previously committed requests cannot execute again.
- Added empty-schema and current-schema migration harnesses plus integrity assertions.

### Native Android Room

- Local domain mutation, entity row, sync metadata, and outbox entry now share a Room transaction.
- Exact durable receipt validation occurs before deleting an outbox row.
- Pull application, conflict creation, and cursor advancement share one Room transaction.
- Pull never advances past malformed, skipped, or unrepresented records.
- PostgreSQL-only conflicts are fetched and hydrated into Room; stale conflict responses cannot replace newer preserved server data.
- Added durable account binding to prevent cross-account sync, additive Room migrations, and owner-bound atomic backup/restore including outbox/meta/conflicts.
- Android tests have intentionally not been run in this session per user instruction. Native sync source is integrated and statically reviewed; compile/runtime status remains **NOT VERIFIED** until CI.

## Important tests added

- Deterministic protocol/property tests for WAL replay, mutation identity collision, record-level independence, dependency ordering, exact receipts, cursor safety, stale operations, conflict history, tombstones, and conflict hydration.
- Adversarial browser sync tests for timeouts before/after commit, server restart, 401, duplicate response, client kill, long offline use, create-plus-complete, repeated completion, different-task convergence, same-task completion/reschedule conflict, and tombstone/stale-edit conflict.
- Backup tests for pending mutations, clean restore, corruption, owner mismatch, timestamp validation, and planning data.
- Server route/RPC contract tests for exact receipts, idempotency, conflict resolution, and task reconciliation behavior.
- Native Room/engine test source for restart, acknowledgement, cursor, backup, account, and migration behavior (not executed by request).
- PostgreSQL scripts for migration from an empty bootstrap and from the previous/current schema, including restore and replay assertions.

## Verification completed at the final local checkpoint

- `npm run verify:release` — PASS.
- `npm test` — PASS, 102 tests across 10 files.
- `npm run build` and production health startup — PASS.
- `npm run verify:client-secrets` — PASS, 27 built files.
- `npm audit --audit-level=high` — PASS, 0 vulnerabilities.
- `npm run verify:migrations` — PASS, static verification across 6 migrations.
- `bash -n scripts/test-postgres-migrations.sh` — PASS.
- `git diff --check` — PASS.

These results are a checkpoint, not a production-readiness claim.

## Exact continuation plan after user approval

1. Inspect final clean GitHub CI and address only evidenced failures.
2. Execute the live Supabase/RLS/two-device/restore drill.
3. Review/retain the generated Room v7 schema and run native migration/process-death tests if the user approves Android execution.
4. Deploy in the order documented above and monitor outbox/conflict health.

## Known remaining verification risks

- The new Supabase migration and restore routine have not yet executed against a real PostgreSQL/Supabase instance in this session.
- Live Supabase RPC permissions, production data shape, storage backup upload/download, and a real restore drill remain live-environment checks.
- Android tests are excluded by explicit user direction; Android compilation may also be unavailable depending on the workspace JDK/SDK.
- Passing local tests must not be described as “production ready.”

## High-value files to inspect first

- `services/storage.ts`
- `services/syncProtocol.ts`
- `services/cloudSync.ts`
- `hooks/useGoalflow.ts`
- `server/routes/sync.ts`
- `server/routes/tasks.ts`
- `server/taskReconciliation.ts`
- `server/backups.ts`
- `supabase/migrations/202608260001_zero_silent_data_loss.sql`
- `scripts/test-postgres-migrations.sh`
- `scripts/migration-integrity-assertions.sql`
- `android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/data/GoalflowRepository.kt`
- `android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/sync/NativeSyncEngine.kt`
