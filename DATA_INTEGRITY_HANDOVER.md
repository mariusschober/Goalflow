# Goalflow zero-silent-data-loss handover

## Goal and product rule

The active objective is to make Goalflow's persistence and synchronization path resilient to crashes, offline use, retries, process death, concurrent devices, server restarts, restores, and conflicts.

> A duplicated task is annoying. A visible conflict is acceptable. A temporarily failed sync is acceptable. A silently lost task is unacceptable.

Do not redesign Goalflow, add product features, optimize aesthetics, delete working functionality, introduce credentials, or add production test bypasses. Prefer the smallest robust architecture change. Android implementation remains in scope, but the user explicitly excluded running Android tests for this work session.

## Repository checkpoint

- Repository: `mariusschober/Goalflow`
- Branch: `goalflow-production`
- Checkpoint: the commit containing this document
- Baseline before this audit: local commit `7d39b32`
- Final integrity report: `DATA_INTEGRITY_REPORT.md` is still to be completed after all available verification gates run.

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
- Android tests have intentionally not been run in this session per user instruction. Source still requires static review and, if tooling permits, non-test build verification.

## Important tests added

- Deterministic protocol/property tests for WAL replay, mutation identity collision, record-level independence, dependency ordering, exact receipts, cursor safety, stale operations, conflict history, tombstones, and conflict hydration.
- Adversarial browser sync tests for timeouts before/after commit, server restart, 401, duplicate response, client kill, long offline use, create-plus-complete, repeated completion, different-task convergence, same-task completion/reschedule conflict, and tombstone/stale-edit conflict.
- Backup tests for pending mutations, clean restore, corruption, owner mismatch, timestamp validation, and planning data.
- Server route/RPC contract tests for exact receipts, idempotency, conflict resolution, and task reconciliation behavior.
- Native Room/engine test source for restart, acknowledgement, cursor, backup, account, and migration behavior (not executed by request).
- PostgreSQL scripts for migration from an empty bootstrap and from the previous/current schema, including restore and replay assertions.

## Verification completed at this checkpoint

- `npm run lint` — PASS.
- `npx vitest run services/syncProtocol.property.test.ts services/cloudSync.adversarial.test.ts` — PASS, 39 tests.
- Earlier focused run including `server/backups.test.ts` and `server/routes/sync.test.ts` — PASS, 50 tests before the final monotonic conflict-merge guard; the final change did not touch those server files.
- `npm run verify:client-secrets` — PASS.
- `bash -n scripts/test-postgres-migrations.sh` — PASS.
- `git diff --check` — PASS.

These results are a checkpoint, not a production-readiness claim.

## Exact continuation plan

1. Finish static review of the conflict-hydration changes, especially Kotlin parsing/monotonic merge and SQL conflict column/value alignment.
2. Run the complete TypeScript test suite and fix every failure.
3. Run static migration verification and inspect all migration/restore assertions.
4. Run clean client/server production builds, server verification, client secret scan, test-build verification, dependency audit, and the aggregate release gate.
5. Attempt PostgreSQL migration execution from both empty and current schemas. If PostgreSQL tooling is unavailable, mark it `NOT VERIFIED`; never infer success from static checks.
6. Do not run Android tests. Attempt non-test native Android lint/assemble only if the toolchain is available, and report the exact result.
7. Recheck the full diff, generated artifacts, secrets, and repository status.
8. Complete `DATA_INTEGRITY_REPORT.md` with all 20 required invariants marked `PASS`, `FAIL`, or `NOT VERIFIED`, plus bugs, fixes, tests, remaining risks, and live-Supabase verification needs.
9. Commit and push the final follow-up changes without rewriting this checkpoint.

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
