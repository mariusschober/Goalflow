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
- No production branch, production database, or production deployment was modified.

## Test and command evidence

Evidence generated in this mission:

| Gate | Command/evidence | Result |
| --- | --- | --- |
| Live production ref | GitHub branch API | `3b510ca254641281088675117dc76b2ef3926ebc` |
| PR #1 identity | GitHub PR API | head `678c9030`, base `7a502cd6`, open/draft |
| Latest hosted CI | Actions run `33335119616` | Infrastructure/account-style failure before steps; not code evidence |
| Direct clean clone | `git clone --no-tags https://github.com/mariusschober/Goalflow.git goalflow-web-24h` | BLOCKED: shell has no GitHub credential; connector access is healthy |
| Web code/tests/builds | Not executed yet in this mission | PENDING |
| PostgreSQL 16 migrations | Not executed yet in this mission | PENDING |
| Browser/PWA/staging/RLS/backup/rollback | Not executed yet in this mission | PENDING |

Inherited repository documentation claims local PASS at earlier commit `5e30d7831de9bd12fd5ba0e190ac0ce799a40324` for lint, 102 tests, builds, migration verification, and PostgreSQL harness. Those claims are orientation only and must be reproduced at this branch head.

## Defects and decisions

- **Decision:** Current production tip, not the supplied orientation SHA, is the base.
- **Decision:** PR #1 is review input only. Its older base and integrity scope prohibit blind merge/cherry-pick.
- **Decision:** Repeatedly rerunning zero-step GitHub Actions failures has no release value.
- **Defect/blocker:** Direct shell Git authentication is unavailable in the current executor, although the connected GitHub integration has repository admin/write access.
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

Reason: no current-head clean checkout gate, executable PostgreSQL evidence, browser/PWA evidence, staging identity/health, RLS isolation drill, backup/restore proof, or rollback proof exists for this mission.

## Exact next actions and commands

Run from a clean authenticated checkout:

```bash
git fetch --all --prune
git switch --create sol/web-production-24h --track origin/goalflow-production
git rev-parse HEAD
git status --short
node --version
npm --version
npm ci
npm run lint
npm test
npm run build
npm run verify:migrations
bash scripts/test-postgres-migrations.sh
npm audit --omit=dev
```

Then inspect actual scripts before invoking any non-existent aliases:

```bash
node -e "const p=require('./package.json'); console.log(p.scripts)"
rg -n "Railway|Supabase|health|Playwright|secret|audit|rollback|backup|restore" .github docs scripts package.json server services supabase
```

Do not deploy or change a database until the target environment and rollback boundary are explicit.
