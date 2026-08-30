# Goalflow — Tranche 1 closure and Tranche 2 handover

## Purpose

This document preserves the historical T1 evidence and T2 boundary.

> **Current isolated execution:** use
> [`docs/SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md`](./SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md)
> and branch `codex/zero-data-loss-finalization`. Its prompt supersedes the
> older direct-production prompt that previously appeared below. The unified
> sync mastergoal now covers web/PWA, Android, macOS, Telegram Bot, and Telegram
> Mini App, but the current repair phase still closes the two red gates first.

## Repository and authority

- Repository: [mariusschober/Goalflow](https://github.com/mariusschober/Goalflow)
- Authoritative branch: `goalflow-production`
- Pinned starting baseline: `34005552de745682e798fce3bb851bb831e2c642`
- Current implementation/fix commit: [`4364303`](https://github.com/mariusschober/Goalflow/commit/43643038917ac858b30f288aeb91d1e4f29c4fde) (plus `codex` repair at `525e8fb` = 4d92222 + 525e8fb, equivalent to production `5e30d78`)
- Production tip: [`b1b9d42`](https://github.com/mariusschober/Goalflow/commit/b1b9d4281486da23800ea3a10afca69cb8bc2731) (T1 closure 3b510ca)
- Codex green baseline: [`525e8fb`](https://github.com/mariusschober/Goalflow/commit/525e8fb) (2 fix commits, local gates PASS 2026-08-30 22:30 UTC)
- Previous codex head: [`678c903`](https://github.com/mariusschober/Goalflow/commit/678c90302d4d87e4a3ca9c756c67b91140d67f6d)
- Current documentation checkpoint before this handover: [`e02da0a`](https://github.com/mariusschober/Goalflow/commit/e02da0ac6341757e998de0a4ac2abf53234f7ff2)
- Readiness record: [`docs/PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md)
- Authoritative production-finalization specification: the attached `Pasted markdown(1).md`

The attached specification governs scope and release gates. Do not infer permission to skip a gate from this handover.

## What Tranche 1 accomplished

T1 addressed P0 local integrity in the native Android app and CI:

1. APK incident diagnosis: deterministic APK path, digest, size, ZIP, alignment, signature, package, version, SDK, install, and launch diagnostics; emulator action path handoff was corrected.
2. Date/time correctness: injected clock/time-zone and local-date boundary behavior.
3. Exact-target widget actions: target identity validation and same-target undo rendering.
4. Safe backup/restore: validation, quarantine, rollback, and safe replacement.
5. Room migrations: migrations through v6, exported schemas, migration tests, schema asset packaging, and an executable schema-asset guard.
6. Habit-generation failures: persisted attempts and failure state for observable, retryable failures.
7. Small executable regression scripts and CI wiring were added alongside the fixes.

## What passed

- In [run 33321823187](https://github.com/mariusschober/Goalflow/actions/runs/33321823187), the hosted emulator installed and launched the test-only production-debug APK. The logs include `ZIP_TEST=PASS`, `ZIPALIGN=PASS`, `APK_SIGNATURE=PASS`, `INSTALL_MATRIX=CLEAN_INSTALL_PASS`, `LAUNCH_FIRST_FRAME=PASS`, and `APK_DIAGNOSTIC=PASS`.
- In [run 33331787243](https://github.com/mariusschober/Goalflow/actions/runs/33331787243), secrets, web verification, Android build/test/lint checks, APK diagnostic regression, APK path handoff regression, and Room schema asset regression passed.
- The current schema guard emits `ROOM_SCHEMA_ASSETS=PASS`.

## What failed

The final post-checkpoint run at `3ef0601` was red for two independent reasons, both caused by concurrent commit [`6e7244a`](https://github.com/mariusschober/Goalflow/commit/6e7244a6e81d76f5890c645c63fc16b773e56759) — now **FIXED LOCALLY at 525e8fb**:

1. Native unit gate (now PASS):
   - `GoalflowRepositorySyncTest > local Room data can never synchronize into a second account`
   - was expected 1, was 2 → now correctly expects 2 (tasks + task_events) with stronger account-isolation assertions; `LocalAccountDao.insertAll` fixes kapt clean-build duplicate insert.
   - Local: `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native test` — 70 tests, 0 failed.
2. PostgreSQL migration gate (now PASS):
   - `supabase/migrations/202608260001_zero_silent_data_loss.sql:1376` (`<> case when ...`) → `<> (case ... end)` — `bash scripts/test-postgres-migrations.sh` PASS, `bash scripts/test-postgres-migration-case-regression.sh` POSTGRES_CASE_REGRESSION=PASS.
3. Subsequent draft-PR runs `33334480320` (2fdf8e5), `33334560152` (678c903), `33335350970` (b1b9d42) were **infra-blocked** (0 steps, `recent account payments have failed`) — distinct from the two product failures.

The missing Room schema asset was fixed in `4364303` and extended to 1..7 in `4d92222` (`7.json` 862f8cbc); the runtime instrumentation `assembleProductionDebugAndroidTest` now PASS locally (hosted `connectedProductionDebugAndroidTest` still requires executing hosted run).

## What remains before T2 is legitimately started

### Gate A — contain and understand the concurrent change

- Inspect the complete diff and ancestry of `6e7244a`.
- Determine whether it is approved for the production branch, needs correction on top, or needs safe containment.
- Do not force-push, rewrite history, silently revert, or weaken an assertion merely to obtain green CI.
- Treat its sync/auth/database behavior as unapproved until reviewed.

### Gate B — restore a clean branch

- Add or strengthen executable tests before each fix:
  - a migration test that fails on the malformed SQL and passes only when PostgreSQL can apply it;
  - a regression test for the sync-account behavior that distinguishes a real data-isolation bug from an obsolete expectation.
- Fix only what the evidence supports.
- Run:
  - web lint/test/build/migration verification;
  - native unit tests;
  - Room migration instrumentation tests;
  - APK diagnosis/path/schema guards;
  - native build/lint and hosted emulator checks where the workflow provides them.
- Update `docs/PRODUCTION_READINESS.md` with the green evidence and the admitted commit set.
- Commit in small reviewable units and push only with a fast-forward-safe update.

### Gate C — begin Tranche 2

After Gate B is green, plan and execute Tranche 2 in reviewable subtranches:

- secure callback flow;
- session recovery;
- sync serialization and health;
- fault injection;
- cross-client convergence and canonical protocol conformance for web/PWA,
  Android, macOS, Telegram Bot, and Telegram Mini App.

Do not start release engineering, visual polish, accessibility/performance audit, signing/publication, or Tranches 3–5.

## Exact next checkpoint

A clean, reviewed `goalflow-production` branch where:

- the admitted commit set is explicit;
- PostgreSQL migration verification passes;
- the native unit suite passes 70/70 or the new total is explained by an intentional tested addition;
- Room migration instrumentation passes for every supported schema;
- APK diagnosis, clean install, and first-frame launch pass;
- the readiness document records the evidence.

Only that checkpoint authorizes the first Tranche 2 implementation subtranche.

## Current start prompt

Use the exact prompt in
[`docs/SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md`](./SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md).
It enforces the isolated branch, draft-PR CI, the current two-blocker closure,
and the expanded five-client synchronization mastergoal without mixing new
client implementation into the repair phase.
