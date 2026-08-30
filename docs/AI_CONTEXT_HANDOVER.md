# Goalflow AI context handover

Updated: 2026-08-30

This is the concise entry point for a future agent. The authoritative technical
status and PASS/NOT VERIFIED matrix are in:

- `DATA_INTEGRITY_HANDOVER.md`
- `DATA_INTEGRITY_REPORT.md`
- `docs/RELEASE_REPORT.md`

## Active goal

Make Goalflow's persistence and synchronization path resilient to crashes,
offline use, retries, process death, concurrent devices, server restarts,
restores, and conflicts, with one overriding rule: no user-created task, goal,
completion, reschedule, breakdown, planning decision, or habit mutation may be
silently lost.

Do not redesign the product, add unrelated features, weaken authentication,
delete working functionality, introduce credentials, or add production test
bypasses.

## Repository state

- Repository: `mariusschober/Goalflow`
- Active branch: `goalflow-production`
- User-supplied Android reference: `34005552de745682e798fce3bb851bb831e2c642`
- Production history integrated through the newer tip
  `c8999b9cc2ae18b60aa5523df0d9b42bd51ad84d`
- Historical integrity checkpoint:
  `goalflow-integrity-checkpoint-20260829-a867470`
- The active branch tip containing this document is the current integrated
  source of truth; do not replace it with either older reference.

Never force-push, rewrite history, reset over newer work, or merge to `main`
without explicit user authority.

## Completed integration

- Browser/PWA mutations use a read-verified WAL, atomic IndexedDB
  value/outbox/version transactions, record-level synchronization, exact
  receipts, explicit conflicts, and fail-closed cursor advancement.
- Server/API synchronization uses protocol v3 fingerprints, idempotent
  receipts, compare-and-swap revisions, durable conflicts, and transactional
  restore rebasing.
- Supabase migrations are forward-only and add canonical task/daily-plan
  mirrors that preserve unknown client JSON fields.
- `android-native` uses Room transactions for domain rows and outbox entries,
  verifies exact acknowledgements before removal, commits pull records and
  cursor together, binds local data to the authenticated account, and preserves
  conflicts and pending mutations in owner-bound backups.
- Native task events synchronize in both directions through the common cursor;
  the PWA durably stores them even though it does not expose an event UI.
- Cross-platform restore translates safe collection aliases and stops visibly
  when the other platform contains a non-empty pending ledger that cannot be
  represented losslessly.
- Existing production Android focus, widget, timeline, UI, and build work from
  the newer production history is preserved.

## Latest local evidence

- `npm run verify:release` — PASS.
- `npm test` — PASS, 10 files / 102 tests.
- Production client/server build and health startup — PASS.
- Client secret scan — PASS, 27 built files.
- Dependency audit — PASS, 0 vulnerabilities.
- Static migration verifier — PASS, 6 migrations.
- PostgreSQL execution — NOT VERIFIED locally (`createdb` unavailable).
- Native Kotlin compilation — NOT VERIFIED locally (required Gradle/JDK/SDK
  toolchain unavailable).
- Android tests — NOT VERIFIED; deliberately not run in this work session.

These checks are evidence, not a claim that the product is production ready.

## Approval boundary and next work

The user requested a pause after the integrated tree, reports, GitHub update,
and CI inspection. Do not continue deployment or expand the goal until the user
approves.

After approval:

1. Resolve any evidenced final CI failure without weakening an invariant.
2. Run the PostgreSQL migration harness from both empty and seeded-current
   schemas, then perform live Supabase RPC/RLS checks.
3. Run the two-device/auth-expiry/response-loss/restore drill against staging.
4. If Android execution is approved, compile Room v7, retain/review schema 7,
   and run native migration/process-death tests.
5. Deploy in order: database migrations, API, then clients. Monitor pending
   outbox entries and visible conflicts throughout rollout.

## Product rule

> A duplicated task is annoying. A visible conflict is acceptable. A
> temporarily failed sync is acceptable. A silently lost task is unacceptable.
