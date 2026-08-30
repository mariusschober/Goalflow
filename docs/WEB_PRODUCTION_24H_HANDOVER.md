# Goalflow web production — 24-hour handover

Updated: 2026-08-30 UTC (post-merge 600616d)

## Objective and exclusions

Produce an evidence-backed **web/PWA-only** production release candidate and the shortest safe path to a live deployment while preserving the invariant that no user task, goal, completion, reschedule, planning decision, habit mutation, pending sync mutation, conflict, or backup state is silently lost.

Excluded unless a direct web production blocker requires otherwise: native Android, Capacitor Android, macOS, Telegram Bot/Mini App, Chrome extension, visual redesign, and generalized cross-client sync expansion. This document never claims all-platform production readiness.

## Repository state

- Repository: `mariusschober/Goalflow`
- Authoritative integration branch: `goalflow-production` (read-only for this mission)
- Fetched production tip: `5243bcdaa3179b85838d21e67eca3674a6220d3d` (docs: master handover 1cca7ac P0-1 + Tranche3)
- User orientation production tip: `7a502cd6908b4ce5dfaad3216bd7a804aa4a1fd8` (superseded)
- Isolated branch: `sol/web-production-24h`
- Isolated branch base (original): `3b510ca254641281088675117dc76b2ef3926ebc`
- Isolated branch HEAD (pre-merge, verified): `a30401a409d4db263668c5a5531a9ae8b29b35cb` (4 docs commits on 3b510ca)
- Isolated branch HEAD (post-merge, current): `600616d` (merge 5243bcd into sol, 9 commits ahead, 36 files, 2235+)
- Draft integrity PR: #1, `codex/zero-data-loss-finalization` -> `goalflow-production` (now deleted ref, predecessor 552e8f4; entire delta vs 3b510ca was docs only, no web code — reviewed and not merged)
- Latest production Actions runs: `33338775290` at `5243bcd` (verify SUCCESS, secrets SUCCESS, migrations SUCCESS, android SUCCESS, native-android in_progress), `33338446599` at `1cca7ac` (verify/secrets/migrations/android SUCCESS, native-android FAILED at `assembleProductionRelease` signing)
- Previous stale run `33335119616` at `3b510ca` failed before steps due to billing — superseded by recent successes

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

- Fetched every live branch and PR ref (`git fetch origin --prune`, `gh run list`, `gh run view`, `gh api`).
- Located newest branch containing `docs/WEB_PRODUCTION_24H_HANDOVER.md`: `sol/web-production-24h` at `a30401a` (4 commits ahead of 3b510ca).
- Read `docs/WEB_PRODUCTION_24H_HANDOVER.md` completely, then `docs/PRODUCTION_FINALIZATION_PLAN.md`, `docs/PRODUCTION_READINESS.md`, `DATA_INTEGRITY_REPORT.md`, `DEPLOYMENT.md`, `.github/workflows/ci.yml`, `supabase/migrations/*`, `package.json` scripts, `scripts/*`.
- Inspected every commit and diff since handover's recorded base `3b510ca`:
  - `sol/web-production-24h`: 4 docs-only commits (7c4b7c3, 2d282d8, 6b47a11, a30401a)
  - `goalflow-production`: 9 commits ahead (b1b9d42, 9729bca, c6f9acd, e5fc227, 02e7280, 763460a, b230e65, 1cca7ac, 5243bcd) — 36 files, 2235 insertions, web-relevant fixes present
- Compared handover claims with GitHub CI/logs and reran smallest decisive local gate on `a30401a`:
  - `npm run lint` PASS (`tsc --noEmit`)
  - `npm test` PASS 10 files 102/102
  - `npm run verify:migrations` PASS 6 migrations
  - `npm run build:client` PASS Vite 6.4.3 18 precache entries
  - `bash scripts/test-postgres-migrations.sh` PASS 9/9
  - Confirmed hosted CI for `3b510ca` run `33335119616` failure-before-steps is stale; recent prod runs at `5243bcd`/`1cca7ac` show web gates SUCCESS
- Merged `origin/goalflow-production` (5243bcd) into `sol/web-production-24h` as `600616d` (fast-forward-safe, no history rewrite, no force-push, no prod mutation) to cure 9-commit stale divergence. Brings web zero-data-loss fixes missing from sol:
  - `hooks/useGoalflow.ts` `prevHabitGenRef` guard (P0-3 infinite loop)
  - `server/routes/sync.ts` `Promise.all` batch c5 (P0-7 sequential RTT)
  - `services/storage.ts` fallback cursor advance via `localStorage` when IndexedDB null (prevents sync stall)
  - `server/routes/telegram.ts` `crypto.timingSafeEqual` (secure webhook)
  - `services/authService.ts` PKCE `generateState`/`generateCodeVerifier`/`pkceChallenge` + `S256` + `sessionStorage` quarantine on `SIGNED_OUT` (Tranche 2 A+B)
  - `supabase/migrations/202608310001_telegram_auth_state_pkce.sql` 7th migration
  - `package.json` `0.3.0-tranche3`
- Re-proved gates at merged HEAD `600616d` (Node 24.19.0 / npm 11.9.0):
  - `npm run lint` PASS
  - `npm test` PASS 13 files 110/110 (adds `telegramAuth.secure` 3, `authService.secure` 2, `authService.session` 3)
  - `npm run verify:migrations` PASS 7 migrations
  - `npm run build` PASS client 18 entries 1364 KiB + server 97.7kb
  - `npm run verify:server` PASS health `status=ok` `version=0.3.0-tranche3`
  - `npm run verify:client-secrets` PASS 27 files
  - `npm audit --audit-level=high` PASS 0 vuln
  - `bash scripts/test-postgres-migrations.sh` PASS 9/9 (empty, upgrade, idempotency, conflict, cursor, restore, native task events, unknown)
- No production branch, production database, or production deployment was modified. Android `native-android` `assembleProductionRelease` failure at `33338446599` is signing-related, not web-blocking; web verify/secrets/migrations/android remain SUCCESS.

## Test and command evidence

Evidence generated in this mission (pre-merge `a30401a` and post-merge `600616d`):

| Gate | Command/evidence | Result |
| --- | --- | --- |
| Live production ref (pre-merge) | GitHub branch API `3b510ca` | Superseded |
| Live production ref (current) | `git rev-parse origin/goalflow-production` | `5243bcdaa3179b85838d21e67eca3674a6220d3d` |
| Isolated branch pre-merge | `git rev-parse HEAD` on `sol/web-production-24h` | `a30401a409d4db263668c5a5531a9ae8b29b35cb` |
| Isolated branch post-merge | `git rev-parse HEAD` after merge | `600616d` (merge 5243bcd) |
| PR #1 identity | GitHub PR API (deleted ref, predecessor 552e8f4) | base `7a502cd`, head `678c903`, open/draft, docs-only delta vs 3b510ca |
| Hosted CI (stale claim) | Actions run `33335119616` at `3b510ca` | Superseded (billing failure before steps) |
| Hosted CI (current prod) | `gh run view 33338775290` at `5243bcd` | verify SUCCESS, secrets SUCCESS, migrations SUCCESS, android SUCCESS, native-android in_progress |
| Hosted CI (previous prod) | `gh run view 33338446599` at `1cca7ac` | verify SUCCESS, secrets SUCCESS, migrations SUCCESS, android SUCCESS, native-android FAILED at `assembleProductionRelease` (signing) |
| Locked install (pre-merge) | `npm ci` | PASS 676 packages |
| TypeScript (pre-merge) | `npm run lint` | PASS `tsc --noEmit` |
| Unit tests (pre-merge) | `npm test` | PASS 10 files 102/102 |
| Migration static (pre-merge) | `npm run verify:migrations` | PASS 6 migrations |
| Production client build (pre-merge) | `npm run build:client` | PASS 18 precache entries |
| PostgreSQL harness (pre-merge) | `bash scripts/test-postgres-migrations.sh` | PASS 9/9 |
| TypeScript (post-merge) | `npm run lint` | PASS |
| Unit tests (post-merge) | `npm test` | PASS 13 files 110/110 |
| Migration static (post-merge) | `npm run verify:migrations` | PASS 7 migrations |
| Production build (post-merge) | `npm run build` | PASS client 18 entries + server 97.7kb |
| Production startup/health (post-merge) | `npm run verify:server` | PASS health `status=ok` `version=0.3.0-tranche3` |
| Client secret scan (post-merge) | `npm run verify:client-secrets` | PASS 27 files |
| Dependency audit (post-merge) | `npm audit --audit-level=high` | PASS 0 vuln |
| PostgreSQL harness (post-merge) | `bash scripts/test-postgres-migrations.sh` | PASS 9/9 |
| PG CASE regression (inherited) | `bash scripts/test-postgres-migration-case-regression.sh` | Inherited PASS (malformed CASE rejected) |
| Browser/PWA/staging/RLS/backup/rollback | Not executed yet in this mission | PENDING |

Inherited docs claimed local PASS at `5e30d78` for lint, 102 tests, builds, 6 migrations, PG harness — those claims are now superseded and reproduced at `600616d` with 110 tests, 7 migrations, identical PG harness.

## Defects and decisions

- **Decision:** Original handover base `3b510ca` was authoritative at mission start, but `goalflow-production` has since advanced 9 commits to `5243bcd`. Treating `3b510ca` as current would be stale and would reintroduce web regressions. Merged `5243bcd` into isolated branch to cure divergence (no force-push, no history rewrite, no prod mutation).
- **Decision:** PR #1 (`codex/zero-data-loss-finalization`) remains review input only. Its entire delta vs `3b510ca` was docs only (459+, 82-), and its live ref was deleted after fetch prune (predecessor at `552e8f4`). Not admitted.
- **Decision:** Stashed Android P0-8 `NativeAuthClient` PKCE wire (`code_challenge=S256(verifier)`, `isAuthEnabled` injection, RFC7636 vector test) found unstaged on `goalflow-production` — deferred as not web-blocking per mission scope (web/PWA, server/API, PG/Supabase, deployment, browser verification only). Stashed as `P0-8 Android PKCE wire - keep for later`.
- **Defect/cured:** `sol` at `a30401a` was missing web zero-data-loss fixes now in prod: `useGoalflow` infinite-loop guard, `storage` fallback cursor, `sync` batch concurrency, `telegram` timingSafeEqual, `authService` PKCE. Merged cure verified with 110 tests and 7 migrations.
- **Defect/persisting:** Hosted `native-android` `assembleProductionRelease` fails at signing (run `33338446599`) — Android release signing config (`DIGESTS`/`RELEASE_METADATA.json` local only, `ANDROID_KEYSTORE_BASE64` not in CI). Web gates are not blocked; web release gate must not weaken Android checks but can be separate. Stale handover claim "Hosted CI cannot provide code evidence because jobs fail before steps" is now false for web gates (verify/secrets/migrations/android SUCCESS).
- **Stale docs cured by merge:** `PRODUCTION_FINALIZATION_PLAN.md` "T1 blocked 70/1 + CASE 1423" → now T1 verified at `5e30d78`/`1cca7ac`; `PRODUCTION_READINESS.md` "current tip 5e30d78 3 commits" → now `1cca7ac` 7 commits + Tranche3 + P0-1; `WEB_PRODUCTION_24H_HANDOVER.md` "fetched prod 3b510ca run 33335119616 failure-before-steps" → now `5243bcd` run `33338775290` web SUCCESS.
- **Constraint:** Direct shell GitHub credential remains unavailable; connector-backed operations remain safe path. Local mirror omits binary PWA icons but remote blobs unchanged; PWA icon/install evidence must come from staging deployment.
- **Unknown:** Railway project/environment, Supabase staging project, secret availability, deployment URL, production rollback/backup configuration, real Chrome/Safari/PWA/two-browser behavior — still unproven, required for GO.

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

Reason: the merged-head web/server/security and PostgreSQL gates are green (lint, 110 tests, 7 migrations, build, health, secret scan, audit, PG 16 harness 9/9, hosted web gates SUCCESS), but exact browser/PWA evidence, staging identity/health, real Supabase RLS isolation, staging backup/restore, and rollback proof do not yet exist for this mission. The stale-base risk is cured, but the remaining web deployment evidence is still PENDING.

## Exact next actions and commands

Single highest-impact next action now is to establish a web-only release gate that mirrors CI `verify` without weakening Android jobs, then add minimum Playwright coverage for critical web journeys (auth, RLS/account isolation, CRUD/completion/reschedule, offline/restart/outbox/retry/duplicates/conflicts, two-browser convergence, backup/restore, PWA offline relaunch).

Execute autonomously on `sol/web-production-24h` at `600616d`:

```bash
# Verify complete web release gate at merged HEAD (already proven, re-run as checkpoint):
npm run verify:release  # lint && test && build && verify:server && verify:client-secrets && audit
npm run verify:migrations
bash scripts/test-postgres-migrations.sh
bash scripts/test-postgres-migration-case-regression.sh

# Inspect web-only gate separation (do not disable Android jobs):
cat .github/workflows/ci.yml
node -e "console.log(require('./package.json').scripts)"
rg -n "Railway|Supabase|health|Playwright|secret|audit|rollback|backup|restore" .github docs scripts package.json server services supabase

# Next: add web-only Playwright gate (do not weaken android/native-android):
# - create `playwright.config.ts` + `tests/e2e/web-critical.spec.ts` covering login, task CRUD, offline restart, sync retry, two-browser convergence, backup/restore preview, PWA offline
# - add `verify:web-e2e` script, wire into CI as separate `web-e2e` job that does not depend on Android
```

Do not deploy or change a database until the target environment and rollback boundary are explicit. Update this handover, commit, and push after each coherent tested change.
