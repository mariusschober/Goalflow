# Goalflow web production — 24-hour handover

Updated: 2026-08-30 UTC

## Objective and exclusions

Produce an evidence-backed **web/PWA-only** production release candidate and the shortest safe path to a live deployment while preserving the invariant that no user task, goal, completion, reschedule, planning decision, habit mutation, pending sync mutation, conflict, or backup state is silently lost.

Excluded unless a direct web production blocker requires otherwise: native Android, Capacitor Android, macOS, Telegram Bot/Mini App, Chrome extension, visual redesign, and generalized cross-client sync expansion. This document never claims all-platform production readiness.

## Repository state

- Repository: `mariusschober/Goalflow`
- Authoritative integration branch: `goalflow-production` (read-only for this mission)
- Fetched production tip: `3b510ca254641281088675117dc76b2ef3926ebc`
- User orientation production tip: `7a502cd6908b4ce5dfaad3216bd7a804aa4a1fd8` (superseded)
- Isolated branch: `sol/web-production-24h`
- Isolated branch base: `3b510ca254641281088675117dc76b2ef3926ebc`
- Draft integrity PR: #1, `codex/zero-data-loss-finalization` -> `goalflow-production`
- Fetched PR #1 head: `678c90302d4d87e4a3ca9c756c67b91140d67f6d`
- PR #1 base SHA: `7a502cd6908b4ce5dfaad3216bd7a804aa4a1fd8`
- PR #1 state: open, draft, mergeable at fetch time; do not merge blindly
- Latest production Actions run: `33335119616` at `3b510ca`

## Current plan

1. Materialize a clean isolated checkout at the exact branch head and record toolchain versions.
2. Inspect production ancestry, PR #1, current work, workflows, deployment configuration, migrations, and prior handovers.
3. Establish a reproducible web baseline: clean install, lint/typecheck, all tests, client build, server build, health startup, secret scan, dependency audit.
4. Execute all PostgreSQL migrations on PostgreSQL 16 against:
   - an empty database;
   - a seeded current/pre-upgrade schema;
   - a repeat application/idempotency check.
5. Compare PR #1 to the current production tip and admit only focused, web-safe integrity changes with regression evidence.
6. Add a web-only release gate without deleting, disabling, bypassing, or weakening Android checks.
7. Add the minimum Playwright coverage for critical production journeys.
8. Deploy staging only through the repository's existing Railway/Supabase path after configuration and credential boundaries are verified.
9. Prove authentication, RLS/account isolation, CRUD/completion/reschedule, offline/restart/outbox/retry/duplicates/conflicts, two-browser convergence, backup/restore, PWA install/update/offline relaunch, deployment identity, monitoring, and rollback.
10. Return a binary web-only GO/NO-GO recommendation with exact residual risks.

## Completed work

- Fetched live GitHub repository, branch, PR, commit, and Actions state through the connected GitHub integration.
- Confirmed `goalflow-production` advanced from the orientation SHA to `3b510ca`.
- Confirmed PR #1 remains open/draft and targets an older production base.
- Confirmed the latest production run `33335119616` failed before executable job steps were exposed:
  - `verify`: failure, `steps=null`
  - `secrets`: failure, `steps=null`
  - `migrations`: failure, `steps=null`
  - `native-android`: skipped
  - `android`: skipped
- Created isolated branch `sol/web-production-24h` from exact fetched production tip.
- Materialized the exact branch text tree through the connected GitHub integration after direct shell Git authentication proved unavailable. The local web mirror contains 137 web/server/migration/test/documentation files. Remote binary asset SHAs remain unchanged and were not copied into the local mirror.
- Installed the locked dependency graph with Node `v24.19.0` / npm `11.9.0`: 676 packages installed.
- Executed the complete sequential release script at the isolated head: TypeScript, 102 tests, client/server builds, production health startup, client bundle secret scan, and dependency audit all passed.
- Installed and executed PostgreSQL `16.15` in a disposable local cluster. The static migration verifier, empty-database migration path, seeded current-schema upgrade path, integrity assertions, and malformed-CASE regression all passed.
- Reviewed PR #1 against current production with the GitHub compare API. It is diverged: 4 commits ahead and 4 behind, merge base `7a502cd`. Relative to `3b510ca`, its entire delta is documentation only: `docs/AI_CONTEXT_HANDOVER.md`, `docs/PRODUCTION_FINALIZATION_PLAN.md`, `docs/SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md`, and `docs/TRANCHE_2_HANDOVER.md` (459 additions, 82 deletions). No web code was admitted.
- No production branch, production database, or production deployment was modified.

## Test and command evidence

Evidence generated in this mission:

| Gate | Command/evidence | Result |
| --- | --- | --- |
| Live production ref | GitHub branch API | `3b510ca254641281088675117dc76b2ef3926ebc` |
| PR #1 identity | GitHub PR API | head `678c9030`, base `7a502cd6`, open/draft |
| Latest hosted CI | Actions run `33335119616` | Infrastructure/account-style failure before steps; not code evidence |
| Direct clean clone | `git clone --no-tags https://github.com/mariusschober/Goalflow.git goalflow-web-24h` | BLOCKED: shell has no GitHub credential; connector access is healthy |
| Locked install | `npm ci` | PASS; 676 packages installed |
| Complete web release gate | `npm run verify:release` | PASS |
| TypeScript | `npm run lint` | PASS; `tsc --noEmit` |
| Unit/property/server tests | `npm test` | PASS; 10 files, 102/102 tests |
| Production client build | `npm run build:client` | PASS; Vite 6.4.3, 321 modules; PWA service worker generated with 14 precache entries |
| Production server build | `npm run build:server` | PASS; `dist/server/index.mjs` generated |
| Production startup/health | `npm run verify:server` | PASS; HTTP 200, `status=ok`, version `0.1.0`; local test intentionally had no cloud credentials |
| Client secret scan | `npm run verify:client-secrets` after build | PASS across 23 built files |
| Dependency audit | `npm audit --audit-level=high` | PASS; 0 vulnerabilities |
| Migration static verification | `npm run verify:migrations` | PASS; 6 migrations, empty order and additive safety |
| PostgreSQL identity | `select version(); select current_user;` | PASS; PostgreSQL 16.15, superuser `postgres` |
| Empty + seeded migration harness | `bash scripts/test-postgres-migrations.sh` | PASS; empty database, current-schema upgrade, idempotency, conflict preservation, cursor rebase, atomic restore, native task events, unknown payload preservation |
| PostgreSQL CASE regression | `bash scripts/test-postgres-migration-case-regression.sh` | PASS; malformed CASE rejected and full corrected harness accepted |
| Browser/PWA/staging/RLS/backup/rollback | Not executed yet in this mission | PENDING |

Inherited repository documentation claims local PASS at earlier commit `5e30d7831de9bd12fd5ba0e190ac0ce799a40324` for lint, 102 tests, builds, migration verification, and PostgreSQL harness. Those claims are orientation only and must be reproduced at this branch head.

## Defects and decisions

- **Decision:** Current production tip, not the supplied orientation SHA, is the base.
- **Decision:** PR #1 is review input only. Its older base and integrity scope prohibit blind merge/cherry-pick.
- **Decision:** Admit nothing from PR #1. Its code-relevant integrity implementation is already in current production ancestry; its remaining diff expands the authoritative workstream into Android/macOS/Telegram and conflicts with this mission's web-only exclusion. Cherry-picking it would add stale status and scope, not release safety.
- **Decision:** Repeatedly rerunning zero-step GitHub Actions failures has no release value.
- **Decision:** Direct shell Git authentication remains unavailable, so connector-backed source materialization and connector-backed commits are the safe execution path. This no longer blocks local web gates.
- **Constraint:** The local mirror omits binary PWA icon files. The remote branch still contains their original blobs. Local build evidence is valid for code and bundling, but PWA icon/install evidence must come from an exact staging deployment or a credentialed full checkout.
- **Decision:** The PostgreSQL gate used real Ubuntu PostgreSQL 16.15 binaries and disposable databases. The executor maps only UID 0, so a temporary preload shim reported the existing `nobody` identity and ownership metadata to PostgreSQL and disabled Unix sockets; the server ran over loopback TCP. The shim was outside the repository and changes no SQL or database behavior. PostgreSQL version and user were queried before the harness.
- **Defect/blocker:** Hosted CI cannot currently provide code evidence because jobs fail before steps.
- **Unknown:** Railway project/environment, Supabase staging project, secret availability, deployment URL, and production rollback/backup configuration have not yet been verified.
- **Unknown:** Real Chrome/Safari, PWA, RLS, backup/restore, and two-browser behavior remain unproven.

## Credentials and authority boundaries

May proceed autonomously with isolated commits, draft PR updates, connector-backed repository operations, local tests, and staging deployment using already configured staging mechanisms.

Stop and request user action if any of these are required:

- new GitHub shell credentials rather than the connected GitHub integration;
- missing Railway or Supabase staging connection/secrets;
- merging to `goalflow-production`;
- applying migrations to the live production database;
- deploying production.

Never commit credentials or copy secrets into logs, tests, fixtures, or this handover.

## Current release decision

**NO-GO — web/PWA production release is unproven.**

Reason: the current-head web/server/security and PostgreSQL gates are green, but exact browser/PWA evidence, staging identity/health, real Supabase RLS isolation, staging backup/restore, and rollback proof do not yet exist for this mission.

## Exact next actions and commands

Establish a web-only release gate next without weakening existing Android jobs:

```bash
npm run verify:release
npm run verify:migrations
npm run test:migrations:postgres
```

Then inspect actual scripts before invoking any non-existent aliases:

```bash
node -e "const p=require('./package.json'); console.log(p.scripts)"
rg -n "Railway|Supabase|health|Playwright|secret|audit|rollback|backup|restore" .github docs scripts package.json server services supabase
```

Do not deploy or change a database until the target environment and rollback boundary are explicit.
