# Sol Max continuation brief — zero silent data loss finalization

Prepared: 2026-08-30 UTC

This document is the single entry point for the next Goalflow engineering chat. It
exists to prevent conversation replay, shared-worktree collisions, branch races,
and unverified claims.

## Repository and isolated execution

- Repository: `mariusschober/Goalflow`
- Production branch: `goalflow-production`
- Production history integrated before launch:
  `7a502cd6908b4ce5dfaad3216bd7a804aa4a1fd8`
- Dedicated continuation branch:
  `codex/zero-data-loss-finalization`
- The continuation branch was created from `9fa82a7d9c5c440181b8a64774622cf3003ba2fb`;
  the compatible documentation-only production delta through `7a502cd` was
  then admitted explicitly by merge commit
  `c19f9432355afd14cfb9a83813f22abfdc30f8f6`.
- Historical native reference supplied by the user:
  `34005552de745682e798fce3bb851bb831e2c642`
- Zero-data-loss integration commit:
  `6e7244a6e81d76f5890c645c63fc16b773e56759`
- Current native Room schema packaging fix:
  `43643038917ac858b30f288aeb91d1e4f29c4fde`

Work only in a fresh clone or isolated worktree checked out at
`codex/zero-data-loss-finalization`. Do not use or clean an existing dirty
workspace. A previous shared workspace was concurrently switched to an older
checkpoint while another agent was editing it; its local state is not
authoritative.

Treat `goalflow-production` as read-only during this pass. Never force-push,
rewrite history, reset over work, merge to `main`, or merge the continuation
branch into production. Use a draft pull request into `goalflow-production` to
obtain clean-checkout CI. The user will approve promotion separately.

Only one agent may write to the continuation branch. Other Goalflow agents must
use different branches and worktrees.

## Objective and scope

The only objective in this pass is to produce a clean, evidenced baseline for
Goalflow's persistence and synchronization architecture across:

- web/PWA IndexedDB;
- native Android Room and its sync transport;
- the native macOS app;
- the Telegram Bot;
- the Telegram Mini App;
- server/API and Supabase/PostgreSQL;
- backup, restore, conflict, retry, and account-isolation paths.

Do not redesign Goalflow, add features, perform visual polish, broaden
authentication, publish releases, deploy migrations, or optimize unrelated code.

Product rule:

> A duplicated task is annoying. A visible conflict is acceptable. A
> temporarily failed sync is acceptable. A silently lost task is unacceptable.

## Unified client synchronization mastergoal

The unit of safety is every mutation-capable surface, not only a platform.
Web/PWA, native Android, native macOS, the Telegram Bot, and the Telegram Mini
App are all first-class participants in one canonical synchronization contract.

- Web/PWA remains a full offline client with IndexedDB, WAL, outbox, conflicts,
  versions, and cursor safety.
- Android remains a full offline Room client with the same semantic guarantees.
- macOS must durably persist every accepted local capture/mutation and its
  outbox entry before showing success; offline use, restart, conflict, cursor,
  receipt, and account-binding behavior must conform to the shared protocol.
- The Telegram Bot is a server-side mutation ingress. Telegram `update_id`
  must derive stable idempotency identity; webhook acknowledgement occurs only
  after durable processing, and retry/restart cannot duplicate or lose work.
- The Telegram Mini App must validate Telegram authentication server-side and
  use the canonical API/protocol. If it shows optimistic or offline success, it
  requires a durable local queue before success.
- Future clients may not write canonical data until they pass the same
  conformance contract.

The exact locations and maturity of the new macOS and Telegram code must be
discovered and recorded from GitHub; do not guess or rewrite them during the
current repair phase.

This expansion changes the master T2 architecture and test plan. It does not
expand the immediate red-gate repair: first close PostgreSQL and Android
account-isolation, obtain a green baseline, document the five-client
conformance plan, and stop for approval before implementing new adapters.

## Required invariants

1. UI success follows durable local persistence.
2. A sync mutation remains recoverable until exact server acceptance or a
   durable conflict preserving both sides.
3. Every mutation and retry is idempotent.
4. Duplicate requests cannot duplicate tasks or completions.
5. Server and client retries are safe.
6. A cursor never advances past discarded or unrepresented data.
7. Conflicts never silently select one side.
8. Crashes before or during sync recover correctly.
9. Process death preserves pending mutations.
10. Long offline use remains safe.
11. Different-record edits converge without unnecessary conflict.
12. Same-record edits preserve both versions until explicit deterministic
    resolution.
13. Tombstones prevent stale resurrection.
14. Old or replayed mutations cannot overwrite newer state.
15. Authentication expiry cannot drain an outbox.
16. Temporary network, API, or Supabase failure cannot invalidate local work.
17. Restore is atomic and failed restore preserves the old valid state.
18. Migrations are forward-only and non-destructive.
19. Cross-account local state can never synchronize under another identity.
20. Exact receipts, account identity, payload, version, timestamp, and tombstone
    semantics must be verified before acknowledgement removal.
21. Every mutation-capable client must use the canonical protocol or a
    semantically equivalent durable adapter and pass the shared conformance
    suite before release.

## Implemented architecture to preserve

The current branch contains substantial hardening that must not be wholesale
reverted merely to obtain green CI:

- synchronous browser WAL and atomic IndexedDB value/outbox/version commits;
- record-level synchronization with backward-compatible merge-only legacy
  snapshots;
- exact push receipts, stable mutation IDs, dependency chains, durable
  conflicts, monotonic conflict hydration, tombstones, and atomic pull pages;
- protocol-v3 server fingerprints, idempotency receipts, compare-and-swap
  revisions, conflict resolution, and cursor-visible restore rebasing;
- owner-bound encrypted backups with checksum validation and fail-closed
  cross-platform pending-ledger handling;
- Room transactions binding domain rows to outbox mutations;
- exact native acknowledgement validation before outbox deletion;
- native pull record/conflict/cursor transactions;
- durable native account binding and Room v6-to-v7 migration;
- bidirectional native task-event synchronization and hidden PWA task-event
  storage;
- canonical task/daily-plan JSON mirrors that preserve unknown client fields;
- stable Telegram webhook mutation identities and retryable processing already
  present in the server path must be preserved and formally certified.

Read these before editing:

- `docs/PRODUCTION_FINALIZATION_PLAN.md`
- `docs/PRODUCTION_READINESS.md`
- `docs/TRANCHE_2_HANDOVER.md`
- `DATA_INTEGRITY_REPORT.md`
- `DATA_INTEGRITY_HANDOVER.md`
- `docs/THREAT_MODEL.md`

Treat older PASS claims as evidence for their exact commit only.

## Exact current CI state

Latest production run at preparation time:

- Run: `33333028345`
- Commit: `9fa82a7d9c5c440181b8a64774622cf3003ba2fb`
- Web/server verification: PASS.
- Secret scan: PASS.
- Capacitor Android job: PASS.
- PostgreSQL migrations: FAIL.
- Native Android job: FAIL.

Draft-PR run `33334480320` at `2fdf8e5` and later runs `33334560152` at `678c903`, `33335350970` at `b1b9d42` ended before any job steps were created: verify, migrations, and secrets reported failure with no steps, and dependent Android jobs were skipped. Annotation: `The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings` (.github#1). Treat this as CI startup/billing infrastructure state, not as evidence of a third product regression. The next agent must inspect it and require an actual clean-checkout run after the first substantive fix commit; it may not relabel unexecuted jobs as PASS. Local green at `525e8fb` (2026-08-30 22:30 UTC) is evidence that product gates are closed; hosted must be confirmed after billing is cleared.

### Blocker A — executable PostgreSQL migration — FIXED LOCALLY at 525e8fb

- Previously: `supabase/migrations/202608260001_zero_silent_data_loss.sql:1376` (`<> case when ...`) caused PostgreSQL `syntax error at end of input` at `33334008972:1423`.
- Fix admitted at `4d92222` (equivalent to production `425f659`): `<> (case when ... end)` — see `supabase/migrations/202608260001_zero_silent_data_loss.sql:1376`.
- Regression guard `scripts/test-postgres-migration-case-regression.sh:1` verifies malformed CASE rejected and corrected harness passes.
- Evidence at 525e8fb: `bash scripts/test-postgres-migrations.sh` PASS (empty+seeded, `{"status":"PASS",...}`), `bash scripts/test-postgres-migration-case-regression.sh` POSTGRES_CASE_REGRESSION=PASS — hosted `migrations` job still needs executing run after billing cleared.

### Blocker B — native cross-account sync regression — FIXED LOCALLY at 525e8fb

- Previously: `GoalflowRepositorySyncTest > local Room data can never synchronize into a second account` — `expected:<1> but was:<2>` (70 tests, 1 failed).
- Diagnosis: a task creation enqueues 2 pending mutations (tasks + task_events); expectation of 1 was obsolete single-record assumption. Two durable records are outbox entries bound to first account, not conflict evidence; behavior preserves account isolation.
- Fix admitted at `525e8fb` (equivalent to production `91db2ce` + `5e30d78`): strengthened test now asserts `pendingBeforeBind` 2, `pendingAfterFailedBind` 2 with entity IDs, domain retained, second `bindSyncAccount` throws `NativeSyncAccountMismatch` without draining; added `LocalAccountDao.insertAll` to fix Room kapt clean-build duplicate insert (JDK 21).
- Evidence at 525e8fb: `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native test` — 70 tests, 0 failed; `assembleProductionDebugAndroidTest` PASS; `ROOM_SCHEMA_ASSETS=PASS` (1..7).

Both fixes are small, evidence-backed, and do not weaken invariants, discard conflict evidence, or remove pending mutations.

## Required working sequence

1. Fetch remote refs and report the exact production and continuation SHAs.
2. Create a fresh isolated worktree/clone at the continuation branch. Confirm a
   clean status before editing.
3. Open or reuse a draft PR from the continuation branch to
   `goalflow-production`; do not merge it.
4. Reproduce both failures.
5. Fix Blocker A in one small commit with executable PostgreSQL evidence.
6. Diagnose and fix Blocker B in a separate small commit with adversarial
   account-isolation tests.
7. Run the complete relevant local gates.
8. Inspect and record the actual repositories/paths and mutation capabilities
   of web/PWA, Android, macOS, Telegram Bot, and Telegram Mini App. Update the
   T2 plan and conformance matrix without implementing new client adapters in
   this repair pass.
9. Push normally to the continuation branch. Never use force.
10. Iterate on the draft-PR CI until every existing job is green. Do not skip,
    disable, soften, or condition away a failing job.
11. Update `DATA_INTEGRITY_REPORT.md`,
    `DATA_INTEGRITY_HANDOVER.md`, `docs/PRODUCTION_READINESS.md`,
    `docs/PRODUCTION_FINALIZATION_PLAN.md`, and this document with exact
    commit SHAs, run URLs, PASS/FAIL/NOT VERIFIED status, client coverage, and
    remaining live risks.
12. Stop. Do not deploy or merge into production. Ask the user to approve the
    final promotion and the first multi-client T2 subtranche.

If `goalflow-production` advances during the pass, do not overwrite it or
silently rebase. Fetch it, inspect the delta, merge it explicitly into the
continuation branch only when it does not require a product decision, and
rerun every gate. Otherwise stop and report the conflict.

## Required verification

Web/server:

```sh
npm ci
npm run lint
npm test
npm run build
npm run verify:migrations
npm run verify:client-secrets
npm audit --audit-level=high
```

PostgreSQL 16:

```sh
npm run test:migrations:postgres
```

This must execute both the empty-database and seeded-current-schema paths. A
static SQL check is insufficient.

Native Android, with JDK 21, Android SDK, and Gradle available:

```sh
sh android-native/scripts/test-diagnose-apk.sh
sh android-native/scripts/test-apk-path-handoff.sh
sh android-native/scripts/test-room-schema-assets.sh
./android-native/gradlew -p android-native test --stacktrace
./android-native/gradlew -p android-native assembleProductionDebugAndroidTest
./android-native/gradlew -p android-native :benchmark:assemble
./android-native/gradlew -p android-native lint
./android-native/gradlew -p android-native assembleProductionDebug
./android-native/gradlew -p android-native assembleProductionRelease
./android-native/gradlew -p android-native assembleSandboxDebug
```

Use the existing hosted emulator workflow for installation, instrumentation,
and first-frame launch. Android tests are authorized for this continuation.
Do not add credentials or production authentication bypasses.

## Completion definition

This pass is complete only when:

- both current failures are resolved by evidence-backed changes;
- the entire draft-PR CI run is green;
- PostgreSQL migrations execute from empty and seeded-current schemas;
- native account-isolation tests pass semantically;
- Room migration/instrumentation and native build gates pass;
- reports accurately distinguish PASS from NOT VERIFIED;
- the five-client registry and per-client synchronization obligations are
  documented without misrepresenting unaudited clients as verified;
- the continuation branch is clean and safely pushed;
- no deployment or production merge has occurred.

Live Supabase RLS, two-real-device chaos, provider fault injection, production
backup-object restore, and rollout observation may remain NOT VERIFIED if
credentials/infrastructure are unavailable. They must remain explicit and
become the next approval checkpoint.

## Stop conditions

Stop and ask the user rather than guessing if:

- a fix requires choosing between incompatible user-data versions;
- production has advanced with a materially conflicting sync design;
- credentials, live data mutation, deployment, or destructive migration are
  required;
- a test can only pass by weakening an invariant;
- branch protection or permissions prevent a normal safe push.

## Starter prompt

The exact starter prompt is maintained below so this document can be used
without importing the preceding conversation.

```text
@GitHub

Continue Goalflow's zero-silent-data-loss finalization autonomously.

Repository: https://github.com/mariusschober/Goalflow
Production branch: goalflow-production
Exclusive working branch: codex/zero-data-loss-finalization
Integrated production baseline: 7a502cd6908b4ce5dfaad3216bd7a804aa4a1fd8
Draft PR: https://github.com/mariusschober/Goalflow/pull/1
Authoritative execution brief:
docs/SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md
Authoritative five-tranche roadmap:
docs/PRODUCTION_FINALIZATION_PLAN.md

Read both documents completely, then read every repository document they mark
as required. Verify the live branch SHAs before editing.

The latest documentation-only draft-PR run `33334480320` failed before any
job steps started. Inspect that CI startup state, but keep it distinct from the
two reproduced product failures. Require an executing clean-checkout CI run
before claiming any PASS.

Use a fresh isolated clone or worktree. Do not touch, clean, reset, or reuse any
dirty shared workspace. Only this chat may write to the exclusive branch.
Treat goalflow-production as read-only. Use draft PR #1 for clean-checkout CI;
do not merge it.

The synchronization mastergoal covers every mutation-capable client: web/PWA,
native Android, native macOS, Telegram Bot, and Telegram Mini App. They must
ultimately share one canonical idempotency, ownership, cursor, conflict,
tombstone, retry, backup, and receipt contract. Discover and record the actual
locations and capabilities of the newer macOS and Telegram implementations;
do not guess.

Phase order is strict. First close the two existing red gates: the executable
PostgreSQL migration failure and the native Android cross-account sync
regression. Reproduce each failure, add or strengthen executable tests, make
the smallest evidence-backed fix, and preserve every zero-silent-data-loss
invariant. Do not weaken assertions, delete conflict evidence, drain pending
mutations, or revert hardening merely to make CI green.

Run all web/server, PostgreSQL 16, Android unit, Room migration, sync,
build/lint, and hosted-emulator gates listed in the brief. Android tests are
authorized. Push only normal non-force commits to the exclusive branch and
iterate until draft-PR CI is fully green.

After the green baseline, update the master roadmap and integrity/readiness
documents with the five-client registry, each client's mutation and durability
obligations, exact SHAs, CI URLs, PASS/FAIL/NOT VERIFIED results, and the
planned cross-client conformance matrix. Do not implement new macOS, Bot, or
Mini App sync adapters in this repair pass.

Stop without deploying or merging into production. Request my approval for
promotion and for the first multi-client Tranche 2 subtranche.

Begin by reporting:
1. the live production and working-branch SHAs;
2. confirmation that the worktree is isolated and clean;
3. the two exact failing tests/gates;
4. the first executable regression test you will run or add;
5. the discovered repository paths for macOS, Telegram Bot, and Telegram Mini
   App, marking anything not yet located as NOT VERIFIED.

Then execute.
```
