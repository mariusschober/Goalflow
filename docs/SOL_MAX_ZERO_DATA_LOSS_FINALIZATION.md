# Sol Max continuation brief — zero silent data loss finalization

Prepared: 2026-08-30 UTC

This document is the single entry point for the next Goalflow engineering chat. It
exists to prevent conversation replay, shared-worktree collisions, branch races,
and unverified claims.

## Repository and isolated execution

- Repository: `mariusschober/Goalflow`
- Production branch: `goalflow-production`
- Production tip when this brief was created:
  `9fa82a7d9c5c440181b8a64774622cf3003ba2fb`
- Dedicated continuation branch:
  `codex/zero-data-loss-finalization`
- The continuation branch was created directly from that production tip.
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
- server/API and Supabase/PostgreSQL;
- native Android Room and its sync transport;
- backup, restore, conflict, retry, and account-isolation paths.

Do not redesign Goalflow, add features, perform visual polish, broaden
authentication, publish releases, deploy migrations, or optimize unrelated code.

Product rule:

> A duplicated task is annoying. A visible conflict is acceptable. A
> temporarily failed sync is acceptable. A silently lost task is unacceptable.

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
- canonical task/daily-plan JSON mirrors that preserve unknown client fields.

Read these before editing:

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

### Blocker A — executable PostgreSQL migration

Failure:

- `supabase/migrations/202608260001_zero_silent_data_loss.sql:1423`
- PostgreSQL reports `syntax error at end of input`.
- The failing PL/pgSQL condition compares `scheduled_for` to a multiline
  `CASE` expression.

Known candidate correction, not yet admitted to GitHub:

```diff
- or created_task.scheduled_for <> case when task_payload->>'schedulePrecision' = 'month'
+ or created_task.scheduled_for <> (case when task_payload->>'schedulePrecision' = 'month'
    then to_date((task_payload->>'scheduledFor') || '-01', 'YYYY-MM-DD')
-   else (task_payload->>'scheduledFor')::date end
+   else (task_payload->>'scheduledFor')::date end)
```

Do not accept this from inspection alone. First reproduce the failing
PostgreSQL harness, apply the smallest correction, and prove both empty-schema
and seeded-current-schema migration paths.

### Blocker B — native cross-account sync regression

Failure:

- Test:
  `GoalflowRepositorySyncTest > local Room data can never synchronize into a second account`
- Result: `expected:<1> but was:<2>`
- Native suite: 70 tests executed, one failed.

Do not change the expected count merely to make CI green. Trace which two
durable records remain, whether they are outbox entries, conflict evidence, or
domain data, and determine whether the behavior preserves or violates account
isolation. Write/strengthen tests that prove:

- first-account domain data is never pushed as the second account;
- ambiguous ownership stops visibly;
- pending mutations are retained or quarantined, never dropped;
- binding and conflict evidence survive restart;
- a verified identity change cannot reuse another account's cursor or
  acknowledgements.

Fix the production code only if the evidence identifies a defect. If the
implementation is correct and the assertion is obsolete, replace it with
stronger semantic assertions rather than a weaker count.

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
8. Push normally to the continuation branch. Never use force.
9. Iterate on the draft-PR CI until every existing job is green. Do not skip,
   disable, soften, or condition away a failing job.
10. Update `DATA_INTEGRITY_REPORT.md`,
    `DATA_INTEGRITY_HANDOVER.md`, `docs/PRODUCTION_READINESS.md`, and this
    document with exact commit SHAs, run URLs, PASS/FAIL/NOT VERIFIED status, and
    remaining live risks.
11. Stop. Do not deploy or merge into production. Ask the user to approve the
    final promotion and the next tranche.

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
Pinned branch baseline: 9fa82a7d9c5c440181b8a64774622cf3003ba2fb
Authoritative brief:
docs/SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md

First read that brief completely, then read every repository document it marks
as required. Verify the live branch SHAs before editing.

Use a fresh isolated clone or worktree. Do not touch, clean, reset, or reuse any
dirty shared workspace. Only this chat may write to the exclusive branch.
Treat goalflow-production as read-only. Use a draft PR for clean-checkout CI;
do not merge it.

Close the two existing red gates: the executable PostgreSQL migration failure
and the native Android cross-account sync regression. Reproduce each failure,
add or strengthen executable tests, make the smallest evidence-backed fix, and
preserve every zero-silent-data-loss invariant. Do not weaken assertions,
delete conflict evidence, drain pending mutations, or revert the hardening
wholesale merely to make CI green.

Run all web/server, PostgreSQL 16, Android unit, Room migration, sync,
build/lint, and hosted-emulator gates listed in the brief. Android tests are
authorized. Push only normal non-force commits to the exclusive branch and
iterate until the draft-PR CI is fully green.

Then update the integrity/readiness/handover documents with exact SHAs, run
URLs, PASS/FAIL/NOT VERIFIED results, and remaining live risks. Stop without
deploying or merging into production, and request my approval for promotion.

Begin by reporting:
1. the live production and working-branch SHAs;
2. confirmation that the worktree is isolated and clean;
3. the two exact failing tests/gates;
4. the first executable regression test you will run or add.

Then execute.
```
