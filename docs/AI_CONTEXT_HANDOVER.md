# Goalflow AI Context Handover

**Updated:** 2026-08-29  
**Purpose:** Preserve the project goal, the verified release state, and the unfinished work so a new AI agent can continue without guessing or overwriting good work.

## Goal

Make Goalflow boringly dependable for real commitments:

- zero silent data loss;
- local-first task, goal, habit, planning, completion, backup, and sync behavior;
- a native Android client that feels fast, calm, tactile, and reliable offline;
- the existing web/PWA product preserved independently;
- no product-semantic changes unless explicitly required and documented.

The native Android client is a real Kotlin/Jetpack Compose/Room client. The existing Capacitor/WebView Android target and the web/PWA must remain available while the native client is validated.

## Non-negotiable product constraints

- Current is the execution environment; Planning is the decision environment.
- Preserve scheduled tasks, ordered planning, frogs, breakdown, circadian behavior, habits, goals, stats, backup, and sync semantics.
- Never turn optional AI or Telegram into a core dependency.
- Never put provider or production credentials in client bundles.
- Production authentication must remain real. There is no production default access code.
- The isolated native sandbox/test build may accept `123456`; it has a separate application identity and must never contaminate production.
- Do not add Inbox, Projects, Kanban, teams, social, feeds, subscriptions, billing, autonomous planning, or unrelated gamification.
- Never force-push, rewrite history, or merge experimental work directly into `main`.

## GitHub state

### Verified production branch

- Repository: `mariusschober/Goalflow`
- Branch: `goalflow-production`
- Verified tip: `9640955d8199a0be70b5d3a4a3031ba0c87fe1a9`
- Exact CI run: `33190514489` — successful clean-checkout web, security, migration, Capacitor, and native Android gates.
- Production remains untouched by this backup operation.

### This backup branch

- Branch: `codex/goalflow-local-worktree-backup-2026-08-29`
- Backup commit: `23d430cd3e0ac727554a469be5635fc5fbf9dcf7`
- Base: remote commit `3cc0373f821105fb9a80ecf714f09578baf72bad`
- The branch is an archival snapshot of the local in-progress worktree, including its source changes, tests, scripts, migration, and integrity hardening.
- It is intentionally **not** represented as a verified release and is intentionally not a wholesale replacement for the newer production tip. The production branch contains later native UX and build refinements that are absent from this older local snapshot.

Use the production branch as the current release baseline. Use this backup branch to recover or inspect the additional local work that had not yet been safely integrated.

## What was in the backed-up work

The snapshot includes, among other changes:

- serialized local persistence and safer mutation ordering;
- atomic backup validation/restore paths and migration checks;
- durable sync protocol work, receipt validation, conflict/retry coverage, and sync property/adversarial tests;
- stricter task/date validation and reconciliation safeguards;
- native Kotlin/Compose/Room capture, planning, completion, backup, secure session, and outbox/sync work;
- native JVM/Room regression tests;
- Postgres migration and backup-integrity verification scripts;
- CI changes for web, Capacitor, and native Android verification.

The snapshot also contains `DATA_INTEGRITY_HANDOVER.md` and the earlier implementation documentation. Read this file together with:

- `docs/PRODUCT_PHILOSOPHY.md`
- `docs/THREAT_MODEL.md`
- `docs/AUDIT_MANIFEST.md`
- `docs/NATIVE_ANDROID.md`
- `docs/IMPLEMENTATION_HANDOFF.md`
- `docs/RELEASE_REPORT.md`
- `DATA_INTEGRITY_HANDOVER.md`

## Verified production evidence

The current production tip has already passed:

- web TypeScript/tests/build/server startup/health;
- client secret scan and high-severity dependency audit;
- migration verification and the available database checks;
- Capacitor sync, Gradle tests, lint, production/test APK assembly;
- native Android unit tests, lint, debug/release assembly, and artifact upload.

Final-tip APK checksums materialized from CI run `33190514489`:

| Artifact | SHA-256 |
|---|---|
| native production debug APK | `2988d1dcd83bbcb6611aa9803dcbffe7df7dff169daa08039f7e868245bbfbc4` |
| native sandbox/test debug APK | `ec5d45469d4e95c7d061394503a3fe32a5d4b7766e963b9d281e30b9a55bce76` |

The sandbox/test APK accepts `123456`. Browser E2E/PWA install-runtime testing, emulator/device lifecycle testing, and live Supabase RLS/sync-chaos testing were unavailable in the prior environment; do not relabel those checks as passed without actually running them.

## Continuation plan

1. **Recover safely.** Fetch both `goalflow-production` and `codex/goalflow-local-worktree-backup-2026-08-29`. Confirm the two SHAs above before editing.
2. **Compare before merging.** Compare the backup against production file by file. Do not replace the production native files wholesale: production contains later focus-session, preferences, secondary-screen, Android resource, and UX refinements.
3. **Integrate data-integrity work first.** Reconcile the backup’s storage, backup/restore, sync protocol, server, migration, and tests onto the current production baseline. Preserve the stronger behavior when the changes do not conflict; resolve conflicts explicitly when they do.
4. **Run focused tests.** Start with TypeScript, domain/property tests, storage/backup/sync tests, migration checks, and native JVM/Room tests. Review `.skip`, `.only`, TODO/disabled tests, weak assertions, and snapshots.
5. **Run release gates.** Build web and server, exercise health, scan secrets, run dependency audit, run Capacitor gates, and run native tests/lint/debug/release assembly. Use CI from a clean checkout.
6. **Adversarial pass.** Attack persistence, interrupted writes, duplicate/reordered sync, stale versions, conflicts, auth expiry, malformed backups, optional AI/Telegram failure, Android lifecycle, keyboard/focus, offline process death, and double-submit behavior. Fix, add a regression test, and rerun.
7. **Update evidence.** Record only actual PASS, FAIL, or NOT AVAILABLE results in `docs/RELEASE_REPORT.md`; update `docs/AUDIT_MANIFEST.md` for every first-party file reviewed.
8. **Promote deliberately.** Push a coherent, tested commit to `goalflow-production` only after the merged result passes clean-checkout CI. Keep this backup branch immutable as historical recovery material.

## Useful comparison commands

```bash
git fetch origin goalflow-production codex/goalflow-local-worktree-backup-2026-08-29
git diff 9640955d8199a0be70b5d3a4a3031ba0c87fe1a9..23d430cd3e0ac727554a469be5635fc5fbf9dcf7
git diff --stat 9640955d8199a0be70b5d3a4a3031ba0c87fe1a9..23d430cd3e0ac727554a469be5635fc5fbf9dcf7
```

If ordinary Git credentials are unavailable, use the connected GitHub Git-data API to read blobs, create trees/commits, and advance refs with `force=false`. Never claim a push or test based only on a local intention.

## Handover conclusion

The verified product baseline is safe on `goalflow-production`. The additional persistence/synchronization/native work is now safely preserved on the dedicated backup branch. Continue from the production baseline plus a deliberate, tested integration of the backup; do not infer that the backup branch itself is release-ready.
