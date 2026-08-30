# Goalflow — Tranche 1 closure and Tranche 2 handover

## Purpose

This document is the durable continuation context for the next engineering chat. It preserves the production-finalization constraints, current evidence, unresolved blockers, and the exact prompt to use.

## Repository and authority

- Repository: [mariusschober/Goalflow](https://github.com/mariusschober/Goalflow)
- Authoritative branch: `goalflow-production`
- Pinned starting baseline: `34005552de745682e798fce3bb851bb831e2c642`
- Current implementation/fix commit: [`4364303`](https://github.com/mariusschober/Goalflow/commit/43643038917ac858b30f288aeb91d1e4f29c4fde)
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

The final post-checkpoint run is red for two independent reasons, both caused by the concurrent commit [`6e7244a`](https://github.com/mariusschober/Goalflow/commit/6e7244a6e81d76f5890c645c63fc16b773e56759):

1. Native unit gate:
   - `GoalflowRepositorySyncTest > local Room data can never synchronize into a second account`
   - expected 1, actual 2
   - `70 tests completed, 1 failed`
   - instrumentation, APK build, and emulator steps were skipped after this failure.
2. PostgreSQL migration gate:
   - `supabase/migrations/202608260001_zero_silent_data_loss.sql:1423`
   - syntax error at end of input
   - the failing expression ends with an unterminated `CASE` beginning at `task_payload->>'schedulePrecision' = 'month'`.

The missing Room schema asset discovered in the preceding run was fixed in `4364303`; the current run proves the packaging guard, but the runtime Room migration test still needs to execute after the unit gate is unblocked.

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
- two-client convergence.

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

## Exact start prompt for the next chat

Copy the prompt below verbatim.

```text
@GitHub

You are continuing Goalflow’s production-finalization mission. Work autonomously in the repository and use GitHub for all repository inspection, commits, and safe pushes.

Repository: https://github.com/mariusschober/Goalflow
Authoritative branch: goalflow-production
Pinned baseline: 34005552de745682e798fce3bb851bb831e2c642
Current T1 implementation/fix commit: 43643038917ac858b30f288aeb91d1e4f29c4fde
Current documentation checkpoint: e02da0ac6341757e998de0a4ac2abf53234f7ff2

Read first:
- docs/PRODUCTION_READINESS.md
- docs/TRANCHE_2_HANDOVER.md
- the attached authoritative production-finalization specification

Mission order is mandatory:

PHASE 1 — CLOSE THE REMAINING T1 GATE

Do not assume that Tranche 1 is green. The current branch contains concurrent commit 6e7244a6e81d76f5890c645c63fc16b773e56759 as the parent of the T1 Room packaging fix. It contains T2-like sync/database changes that were not reviewed or authored by the T1 work.

1. Inspect the current branch tip, ancestry, and complete diff of 6e7244a. Establish exactly which files and behaviors it changes.
2. Contain and review that commit without force-pushing or rewriting history. Do not silently revert it or weaken tests just to obtain green CI. If correction is required, make a small, explicit, reviewable commit on top of the current branch.
3. Before or with every correction, add an executable regression test:
   - PostgreSQL must reject the malformed migration before the fix and apply it after the fix.
   - The native sync-account test must distinguish a real account-isolation/data-ownership defect from an obsolete expectation. Preserve zero silent data loss and never make the test pass by deleting coverage.
4. Re-run the complete relevant gates:
   - web lint, tests, build, migration verification, and audit;
   - native unit tests;
   - Room migration instrumentation across all supported schema versions;
   - APK diagnostic, path handoff, and Room schema asset guards;
   - native lint/build and hosted emulator install/launch checks.
5. Update docs/PRODUCTION_READINESS.md with exact commit SHAs, run URLs, pass/fail results, and unresolved risks.
6. Use small reviewable commits. Push only with a fast-forward-safe GitHub ref update. Stop and report if the branch cannot be made green without a material product decision.

PHASE 2 — START TRANCHE 2 ONLY AFTER PHASE 1 IS GREEN

Once the clean T1 checkpoint is evidenced, begin Tranche 2 in its own small subtranches. The only T2 scope is:
- secure callback flow;
- session recovery;
- sync serialization and health;
- fault injection;
- two-client convergence.

For each T2 subtranche:
- inspect the existing web and native architecture before changing it;
- write executable tests first or in the same commit as the fix;
- cover adversarial failure paths, retries, duplicates, offline behavior, account isolation, and zero silent data loss;
- commit and push safely;
- update the durable readiness/handover documentation;
- stop at the T2 boundary after the specified evidence is captured.

Do not begin visual polish, broad refactoring, release engineering, signing, AAB/raw APK publication, owner-device installation, accessibility/performance audits, or Tranches 3–5. Do not claim production readiness while any gate is red or any unresolved risk is undocumented.

Begin by reporting the current branch SHA, the exact remaining blockers, and the first test you will add. Then execute PHASE 1.
```
