# Goalflow AI context handover

**Updated:** 2026-08-30  
**Purpose:** concise entrypoint for any future engineering agent.

## Read these first

1. [Authoritative five-tranche production-finalization plan](./PRODUCTION_FINALIZATION_PLAN.md)
2. [Current production-readiness evidence](./PRODUCTION_READINESS.md)
3. [Current T1 closure and T2 handover](./TRANCHE_2_HANDOVER.md)
4. [Product philosophy](./PRODUCT_PHILOSOPHY.md)
5. The attached user-supplied production-finalization specification, when available.

The five-tranche plan is the scope authority. The readiness document is the status authority. Older handovers may contain useful historical evidence, but they must not override these documents.

## Mission

Make Goalflow installable and trustworthy for real commitments while preserving the existing product.

The non-negotiable invariant is zero silent data loss: no task, goal, completion, reschedule, breakdown, planning decision, habit mutation, backup mutation, or sync mutation may disappear without a visible error, conflict, or recovery path.

Visible duplicates, conflicts, retries, temporary offline state, and delayed synchronization are acceptable. Silent loss is not.

## Product context

Goalflow is a schedule-first productivity system with:

- Current and Planning;
- daily and monthly planning;
- goals, True North, habits, frogs, insights, and gamification;
- timer/focus and circadian workflows;
- AI task breakdown and related workflows;
- an installable PWA;
- a native Kotlin/Compose Android client under `android-native/`.

The work is production finalization, not product reinvention. Preserve working behavior and avoid visual redesign, broad refactoring, or unrelated feature work unless the active tranche explicitly authorizes it.

## Architecture context

- Web persistence: IndexedDB with versioned local data and a durable mutation/outbox path.
- Native persistence: Room with exported schemas, migrations, local outbox, backup/restore, and lifecycle handling.
- Backend: server/API plus Supabase/Postgres/RLS for authenticated synchronization, receipts, revisions, cursors, conflicts, and backups.
- Security: credentials remain server-side; do not place secrets in browser bundles, logs, sync records, or backups.
- Android: `android-native/` is the native client; the separate Capacitor target remains distinct.

## Current state (updated 2026-08-30 — pause)

- Authoritative branch: `goalflow-production`.
- Pinned Android reference: `34005552de745682e798fce3bb851bb831e2c642`.
- T1 implementation/fix commit: `43643038917ac858b30f288aeb91d1e4f29c4fde`.
- Concurrent T2-like commit `6e7244a6e81d76f5890c645c63fc16b773e56759` is now **contained and fixed on top** via `91db2ce` (native account test), `425f659` (PG CASE + Room v7 + regression guards), `5e30d78` (Room kapt) — history not rewritten.
- Current tip: `3b510ca254641281088675117dc76b2ef3926ebc` (4 commits on top of `7a502cd`; see `docs/PRODUCTION_READINESS.md` for full evidence).
- Current T1 status: **CLOSURE VERIFIED locally** — `npm lint` PASS, `npm test` 10 files 102 tests PASS, `npm run build` PASS, `verify:migrations` PASS, `bash scripts/test-postgres-migrations.sh` PASS, `bash scripts/test-postgres-migration-case-regression.sh` POSTGRES_CASE_REGRESSION=PASS, `bash android-native/scripts/test-room-schema-assets.sh` ROOM_SCHEMA_ASSETS=PASS (1..7, 7.json tracked), `env JAVA_HOME=... ./android-native/gradlew -p android-native test` 70 tests PASS (was 70/1), `assembleProductionDebugAndroidTest` PASS, `lint` PASS. Hosted run `33335119616` for `3b510ca` was **blocked by GitHub billing** (`recent account payments have failed`), not by code; previous hosted APK runtime `33321823187` still PASS.
- Room schema v7 (`local_account`, identityHash `862f8cbc...`) is exported and tracked; asset guard now requires 1..7.
- Prior hosted emulator evidence proves the test-only APK can be diagnosed, installed, and launched; local `test-diagnose-apk.sh` and `test-apk-path-handoff.sh` still PASS.
- No release signing/publication, owner-device installation, visual polish, or Tranches 3–5 work has been approved; T1 is green locally but not yet production-ready per `PRODUCTION_FINALIZATION_PLAN.md`.

## Agent operating contract

- Inspect the live branch before acting.
- Add executable tests before or with every fix.
- Never weaken an invariant or delete a test to make CI green.
- Do not force-push, rewrite history, overwrite newer commits, or merge to `main` without explicit authority.
- Keep commits small and reviewable.
- Use hosted CI as authoritative when local Android/Postgres tooling is unavailable.
- Update the readiness document after each checkpoint.
- Stop at the active tranche boundary.

## Immediate next action (pause → resume)

**T1 is locally green at `3b510ca`; do not re-do T1.** The next agent must:

1. **Clear GitHub billing** and re-run hosted CI for `3b510ca` (see `gh run view 33335119616` — blocked, not code). Record the new run URL in `docs/PRODUCTION_READINESS.md` and confirm `migrations` (PG 16) and `native-android` (`test` 70/70, `assembleProductionDebugAndroidTest`, emulator `connectedProductionDebugAndroidTest` with `ZIP_TEST=PASS`, `ZIPALIGN=PASS`, `APK_SIGNATURE=PASS`, `INSTALL_MATRIX=CLEAN_INSTALL_PASS`, `LAUNCH_FIRST_FRAME=PASS`, `APK_DIAGNOSTIC=PASS`, `ROOM_SCHEMA_ASSETS=PASS`) are green. If hosted still red, fix only what the hosted log evidences with a regression test before/with the fix, never weakening coverage, and push fast-forward-safe.
2. **Only after hosted T1 is green**, begin Tranche 2 per `docs/PRODUCTION_FINALIZATION_PLAN.md` and `docs/ACCOUNTS_AND_KEYS.md` (provision Supabase/Railway/Telegram/Turnstile/Resend first, then AI keys). Execute Tranche 2 in small reviewable subtranches: secure callback flow → session recovery → sync serialization/health → fault injection → two-client convergence. For each, inspect architecture, write tests first, cover retries/duplicates/offline/account isolation/cursor safety/conflict preservation, commit/push safely, update readiness/handover, and stop at the T2 gate.
3. **Do not start** Tranche 3 (signing/AAB/raw APK/clean-install/upgrade/owner-device), Tranche 4 (a11y/perf/screenshots), or Tranche 5 (RC proof/dogfooding) until Tranche 2 is green and documented.

Use `docs/STARTER_PROMPT.md` as the verbatim next-chat prompt and `docs/ACCOUNTS_AND_KEYS.md` as the provisioning checklist. Keep commits small, do not force-push, do not rewrite history, do not merge to `main`.
