# Goalflow AI context handover

**Updated:** 2026-08-30  
**Purpose:** concise entrypoint for any future engineering agent.

## Read these first

1. [Authoritative five-tranche production-finalization plan](./PRODUCTION_FINALIZATION_PLAN.md)
2. [Current isolated Sol Max execution brief](./SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md)
3. [Current production-readiness evidence](./PRODUCTION_READINESS.md)
4. [Current T1 closure and T2 handover](./TRANCHE_2_HANDOVER.md)
5. [Product philosophy](./PRODUCT_PHILOSOPHY.md)
6. The attached user-supplied production-finalization specification, when available.

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
- a native Kotlin/Compose Android client under `android-native/`;
- a native macOS companion;
- a Telegram Bot;
- a Telegram Mini App.

The work is production finalization, not product reinvention. Preserve working behavior and avoid visual redesign, broad refactoring, or unrelated feature work unless the active tranche explicitly authorizes it.

## Architecture context

- Web persistence: IndexedDB with versioned local data and a durable mutation/outbox path.
- Native persistence: Room with exported schemas, migrations, local outbox, backup/restore, and lifecycle handling.
- Backend: server/API plus Supabase/Postgres/RLS for authenticated synchronization, receipts, revisions, cursors, conflicts, and backups.
- Security: credentials remain server-side; do not place secrets in browser bundles, logs, sync records, or backups.
- Android: `android-native/` is the native client; the separate Capacitor target remains distinct.
- One synchronization mastergoal governs PWA, Android, macOS, Telegram Bot, and Telegram Mini App.
- macOS requires durable local-write/outbox-before-success semantics.
- Telegram Bot mutations require stable `update_id` idempotency and acknowledgement only after durable processing.
- Telegram Mini App authentication is verified server-side and optimistic/offline success requires durable queuing.
- Each client must pass the canonical protocol/convergence/account-isolation suite before it can write production canonical data.

## Current state

- Authoritative production branch: `goalflow-production`.
- Isolated continuation branch: `codex/zero-data-loss-finalization`; use draft PR #1 and do not merge without approval.
- Pinned Android reference: `34005552de745682e798fce3bb851bb831e2c642`.
- T1 implementation/fix commit: `43643038917ac858b30f288aeb91d1e4f29c4fde` (Room v6 packaging).
- Contained zero-data-loss hardening: `6e7244a6e81d76f5890c645c63fc16b773e56759` (preserved, fixed on top).
- Current T1 status: **CLOSURE VERIFIED LOCALLY at 525e8fb** (codex/zero-data-loss-finalization, equivalent to production 5e30d78/b1b9d42) — `npm lint` PASS, `npm test` 102 PASS, `npm run build` PASS, `verify:migrations` PASS, `bash scripts/test-postgres-migrations.sh` PASS, `bash scripts/test-postgres-migration-case-regression.sh` POSTGRES_CASE_REGRESSION=PASS, `bash android-native/scripts/test-room-schema-assets.sh` ROOM_SCHEMA_ASSETS=PASS (1..7), `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native test` 70 tests PASS, `assembleProductionDebugAndroidTest` PASS, `lint` PASS, builds PASS. Hosted runs 33334560152/33334480320/33335350970 blocked by billing (`recent account payments have failed`), not code — must be re-run after billing cleared.
- Room schema v7 (`local_account`, 862f8cbc) exported and tracked; host emulator `connectedProductionDebugAndroidTest` still pending hosted confirmation.
- Five-client registry discovered and recorded in `docs/PRODUCTION_READINESS.md`: web/PWA PASS, Android PASS, macOS NOT VERIFIED (feature/macos-execution-companion), Bot NOT VERIFIED (server/telegram), Mini App NOT VERIFIED (feat/telegram-v1) — no new adapters implemented.
- No release signing/publication, owner-device installation, visual polish, or Tranches 3–5 work has been approved; T1 is green locally but hosted NOT VERIFIED due billing.

## Agent operating contract

- Inspect the live branch before acting.
- Add executable tests before or with every fix.
- Never weaken an invariant or delete a test to make CI green.
- Do not force-push, rewrite history, overwrite newer commits, or merge to `main` without explicit authority.
- Keep commits small and reviewable.
- Use hosted CI as authoritative when local Android/Postgres tooling is unavailable.
- Update the readiness document after each checkpoint.
- Stop at the active tranche boundary.

## Immediate next action

T1 closure is now verified locally at 525e8fb (see `docs/PRODUCTION_READINESS.md`). Next:

1. Push 4d92222..525e8fb to `origin/codex/zero-data-loss-finalization` (fast-forward) and record the next executing hosted CI run URL (clear billing first; runs 33334560152 etc. were infra-blocked).
2. Confirm hosted `migrations` (PG16) and `native-android` (`test` 70, `assembleProductionDebugAndroidTest`, emulator) are green; document PASS/FAIL per job.
3. Only after hosted green, begin Tranche 2 per `docs/PRODUCTION_FINALIZATION_PLAN.md` in small subtranches: secure callback → session recovery → sync serialization/health → fault injection → cross-client convergence + per-client conformance (macOS, Bot, Mini App). For each, write tests first, cover retries/duplicates/offline/account isolation/cursor/conflict, commit safely, update readiness, stop at T2 gate.

Do not implement new client adapters during the current red-gate repair. Do not begin Tranche 3, Tranche 4, or Tranche 5 while this checkpoint is unresolved.
