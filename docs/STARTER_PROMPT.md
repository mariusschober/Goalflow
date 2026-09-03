> **HISTORICAL PROMPT — DO NOT EXECUTE.** The branch, gates, and evidence below
> are obsolete. Use `docs/reconciliation/BETA_PROVENANCE.md` and the live
> `integration/beta` branch.



# Goalflow — Starter Prompt for Final Production Run (Tranche 2 → 5)

Copy the block below verbatim into a new chat. Ensure the working directory is clean and `origin/goalflow-production` is fetched.

```text
@GitHub

You are continuing Goalflow's production-finalization mission. Work autonomously in the repository and use GitHub for all repository inspection, commits, and safe pushes.

Repository: https://github.com/mariusschober/Goalflow
Authoritative branch: goalflow-production
Current tip (verified 2026-08-30): 3b510ca254641281088675117dc76b2ef3926ebc
Pinned baseline: 34005552de745682e798fce3bb851bb831e2c642
T1 fix: 43643038917ac858b30f288aeb91d1e4f29c4fde
Contained T2-like commit: 6e7244a6e81d76f5890c645c63fc16b773e56759 (now fixed on top via 91db2ce, 425f659, 5e30d78)

Read first (in order):
- docs/PRODUCTION_FINALIZATION_PLAN.md  (authoritative 5-tranche scope, gates, precedence)
- docs/PRODUCTION_READINESS.md          (current T1 closure verified at 5e30d78, local evidence, hosted run 33335119616 blocked by billing)
- docs/ACCOUNTS_AND_KEYS.md             (exact accounts/API keys to provision before hosted Tranche 2)
- docs/AI_CONTEXT_HANDOVER.md           (concise entrypoint, updated for 3b510ca)
- docs/TRANCHE_2_HANDOVER.md            (T1 closure instructions — now DONE locally)
- DEPLOYMENT.md and .env.example         (Railway/Supabase/Telegram/Turnstile/Backup/AI env)
- .github/workflows/ci.yml               (verify, secrets, migrations (PG16), android, native-android with JDK21, diagnose-apk, connectedProductionDebugAndroidTest)

Mission order is mandatory:

PHASE 1 — VERIFY T1 HOSTED GREEN (do not skip):
1. Clear GitHub Actions billing (run 33335119616 was blocked: "recent account payments have failed").
2. Re-run hosted CI for 3b510ca and record the new run URL in docs/PRODUCTION_READINESS.md (migrations + native-android must be green; emulator must show ZIP_TEST=PASS, ZIPALIGN=PASS, APK_SIGNATURE=PASS, INSTALL_MATRIX=CLEAN_INSTALL_PASS, LAUNCH_FIRST_FRAME=PASS, APK_DIAGNOSTIC=PASS, ROOM_SCHEMA_ASSETS=PASS).
3. If hosted still red, fix only what the hosted log evidences, with a regression test before/with the fix, never weakening coverage or rewriting history, and push fast-forward-safe.

PHASE 2 — TRANCHE 2 (only after hosted T1 is green):
Execute Tranche 2 in small reviewable subtranches per PRODUCTION_FINALIZATION_PLAN.md:
- secure callback flow (state/nonce/redirect, no token exposure)
- session recovery (expiry, revoke, offline, refresh)
- sync serialization/health (idempotent mutations, cursor never past uncommitted data, health/backlog/conflict visibility)
- fault injection (response loss, retries, duplicates, server restart, concurrent writes, restore interruption)
- two-client convergence (account isolation, RLS, unknown fields, pending work, zero silent data loss)

For each subtranche: inspect web/native architecture first, write executable tests first or in same commit, cover retries/duplicates/offline/account isolation/cursor safety/conflict preservation, commit and push safely, update docs/PRODUCTION_READINESS.md and docs/AI_CONTEXT_HANDOVER.md, and stop at the Tranche 2 gate. Do not start Tranche 3 (signing/AAB/raw APK/clean-install/upgrade/owner-device), Tranche 4 (a11y/perf/screenshots), or Tranche 5 (RC proof/dogfooding).

Do not begin visual polish, broad refactoring, release publication, signing, AAB/raw APK delivery, owner-device installation, or accessibility/performance work before Tranche 2 is green. Do not claim production readiness while any gate is red or any risk is undocumented. Use small reviewable commits and fast-forward-safe pushes; never force-push or rewrite history.

Begin by reporting the live branch SHA, the hosted run status for 3b510ca, and the first T2 subtranche you will take (secure callback flow). Then execute.
```

**Why this prompt is correct:**
- Points to the live tip `3b510ca` (T1 closure verified, 3 fix commits on top of `7a502cd`) and the pinned baseline.
- References the authoritative docs in precedence order, including the new `ACCOUNTS_AND_KEYS.md`.
- Requires hosted verification before Tranche 2 (billing fix + CI re-run) and forbids skipping gates.
- Scopes Tranche 2 precisely and forbids 3–5.

**Local evidence at 3b510ca (to be confirmed hosted after billing fix):** `npm lint` PASS, `npm test` 10 files 102 tests PASS, `npm run build` PASS, `npm run verify:migrations` PASS, `bash scripts/test-postgres-migrations.sh` PASS, `bash scripts/test-postgres-migration-case-regression.sh` POSTGRES_CASE_REGRESSION=PASS, `bash android-native/scripts/test-room-schema-assets.sh` ROOM_SCHEMA_ASSETS=PASS, `env JAVA_HOME=... ./android-native/gradlew -p android-native test` 70 tests PASS, `assembleProductionDebugAndroidTest` PASS, `lint` PASS.
