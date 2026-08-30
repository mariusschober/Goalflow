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

## Current state

- Authoritative branch: `goalflow-production`.
- Pinned Android reference: `34005552de745682e798fce3bb851bb831e2c642`.
- T1 implementation/fix commit: `43643038917ac858b30f288aeb91d1e4f29c4fde`.
- A concurrent T2-like commit `6e7244a6e81d76f5890c645c63fc16b773e56759` is present in the current ancestry and is not yet approved as a T2 base.
- Current T1 status: implementation pushed; closure blocked by the native sync-account unit failure and PostgreSQL migration syntax failure documented in `PRODUCTION_READINESS.md`.
- Room schema asset guard passes; Room runtime migration coverage must be rerun after the unit gate is resolved.
- Prior hosted emulator evidence proves the test-only APK can be diagnosed, installed, and launched.
- No release signing/publication, owner-device installation, visual polish, or Tranches 3–5 work has been approved by this checkpoint.

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

Execute the exact T1 closure procedure in `TRANCHE_2_HANDOVER.md`:

1. Review and contain `6e7244a`.
2. Add tests and correct the evidenced SQL and sync-account failures without weakening zero-silent-data-loss coverage.
3. Re-run the full relevant web, native, Room, APK, emulator, and migration gates.
4. Record a clean green T1 baseline.
5. Only then start Tranche 2, in small subtranches, with secure callback flow, session recovery, sync serialization/health, fault injection, and two-client convergence.

Do not begin Tranche 3, Tranche 4, or Tranche 5 work while this checkpoint is unresolved.
