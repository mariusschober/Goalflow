# Goalflow — authoritative production-finalization plan

**Status:** active production-finalization roadmap  
**Authority:** this document preserves the user-supplied Sol Max / Goalflow production-finalization specification.  
**Repository:** [mariusschober/Goalflow](https://github.com/mariusschober/Goalflow)  
**Authoritative branch:** `goalflow-production`  
**Pinned Android reference:** `34005552de745682e798fce3bb851bb831e2c642`

## Mission

Make Goalflow an application that a user can install and trust with real commitments.

The governing invariant is:

> No user-created task, goal, completion, reschedule, breakdown, planning decision, habit mutation, or sync mutation may be silently lost.

A visible duplicate, conflict, retry, or temporary sync failure is acceptable. Silent loss is not.

Goalflow remains the existing product: a schedule-first productivity system with Current, Planning, goals, habits, frogs, insights, gamification, circadian planning, AI workflows, PWA support, native Android, a native macOS companion, a Telegram Bot, and a Telegram Mini App. Production finalization perfects the implementation and verification of that product. It does not replace the product with a redesign.

## Document precedence

When repository documents overlap, use this order:

1. This document — authoritative five-tranche scope, sequencing, constraints, release gates, and client registry.
2. `docs/SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md` — isolated-branch execution contract for the current pass.
3. `docs/PRODUCTION_READINESS.md` — current evidence, pass/fail status, risks, and checkpoint.
4. `docs/TRANCHE_2_HANDOVER.md` — historical T1 closure evidence and T2 boundary.
5. `docs/AI_CONTEXT_HANDOVER.md` — concise agent entrypoint and product context.
6. Older implementation, integrity, release, and audit documents — useful evidence only; they do not override the documents above.

The attached user-supplied plan remains authoritative if it is available in the working session. Do not invent a relaxed interpretation of a release gate.

## Product and architecture context

- Web/PWA, native Android, native macOS, the Telegram Bot, and the Telegram Mini App are first-class mutation surfaces under one synchronization mastergoal.
- The web client uses IndexedDB and a durable mutation/outbox path.
- The Android client is under `android-native/`, using Kotlin, Compose, Room, DataStore, WorkManager, and local-first persistence.
- The macOS app must durably persist accepted mutations and outbox state before showing success, including offline/restart/account-binding behavior.
- The Telegram Bot is a server mutation ingress: stable identity derives from Telegram `update_id`, acknowledgement follows durable processing, and retries are idempotent.
- The Telegram Mini App validates Telegram authentication server-side and uses the canonical API; any optimistic/offline success requires a durable local queue.
- The exact code locations and current capabilities of macOS and both Telegram surfaces must be discovered and recorded before their T2 certification; do not infer verification from their existence.
- Server synchronization uses the API/Supabase/Postgres/RLS path, idempotent mutations, cursors, receipts, conflicts, and backups.
- Authentication, sync, and backup must preserve account ownership and must fail visibly rather than discarding data.
- Existing product behavior and user-facing modules are preserved unless a tranche explicitly authorizes a change.
- Credentials must remain server-side and must not enter browser bundles, logs, sync records, or backups.
- No test bypass, assertion weakening, destructive migration, silent fallback, force-push, or history rewrite is acceptable.

## Operating rules for every tranche

For each fix or feature:

1. Inspect the current branch and relevant architecture before changing it.
2. Add an executable regression test before or in the same commit as the fix.
3. Prefer the smallest robust change; avoid unrelated refactoring.
4. Use small, reviewable commits with precise messages.
5. Run the relevant local or hosted tests and record exact evidence.
6. Push with a fast-forward-safe update; never overwrite newer work.
7. Update the durable readiness document with status, evidence, risks, and the next checkpoint.
8. Stop at the tranche boundary. Do not silently continue into the next tranche.

A tranche is not complete merely because code exists. Its stated evidence gate must pass, and unresolved risks must be explicit.

## Tranche 1 — P0 local integrity

**Purpose:** ensure local data and local Android behavior are trustworthy before relying on authentication or synchronization.

**Scope:**

- APK incident diagnosis.
- Date/time correctness.
- Exact-target widget actions.
- Safe backup/restore.
- Room migrations.
- Habit-generation failures.
- Executable CI and hosted validation for those areas.

**Required properties:**

- APK diagnostics distinguish path, digest, byte size, ZIP validity, alignment, signature, package, version, SDK metadata, installation, and first-frame launch.
- Date/time behavior is deterministic across local time zones, daylight-saving transitions, leap days, and date boundaries.
- Widget actions target the intended record and cannot mutate a nearby or stale record.
- Backup/restore validates input, quarantines unsafe data, rolls back safely, and does not silently replace valid data with corrupt or partial data.
- Room migrations are forward-only, preserve existing data, package/export every supported schema, and have migration tests without destructive fallback.
- Habit-generation failures are persisted, visible, and retryable.

**Explicit T1 exclusions:**

- No visual polish.
- No broad refactoring.
- No authentication changes.
- No synchronization coordinator or chaos/two-client expansion.
- No release publication, signing, AAB/raw release delivery, or owner-device installation.
- No Tranches 2–5 implementation.

**T1 gate:** relevant unit tests, Room migration instrumentation, APK diagnostics, native builds/lint, hosted emulator install/launch where specified, and migration verification must be green or the exact blocker must be documented. Commit, push, update status, and stop.

## Tranche 2 — authentication and synchronization

**Purpose:** make authenticated, cross-client operation safe without compromising the local-first invariant.

**Scope:**

- Secure callback flow.
- Session recovery.
- Sync serialization and health.
- Fault injection.
- Cross-client convergence and protocol conformance across web/PWA, Android,
  macOS, Telegram Bot, and Telegram Mini App.

**Required properties:**

- Callback handling validates state/nonce/redirect boundaries and does not expose tokens.
- Session expiry, restart, revoked credentials, offline recovery, and refresh failures are explicit and recoverable.
- Mutations serialize safely, are idempotent, preserve ordering where required, expose health/backlog/conflict state, and never advance a cursor past uncommitted data.
- Fault injection covers response loss, retries, duplicates, server restarts, partial failures, concurrent writes, and restore interruptions.
- Independent clients converge deterministically while preserving account isolation, conflicts, unknown fields, tombstones, and pending work.
- The Bot proves stable `update_id` replay, response-loss, restart, and acknowledgement-after-durable-processing behavior.
- The Mini App proves server-side Telegram identity validation, account binding, retry/idempotency, and durable optimistic/offline behavior when supported.
- The macOS app proves local-write-before-success, restart/outbox recovery, exact receipts, cursor safety, conflicts, and account binding.
- Cross-client tests cover at minimum macOS to Android, Telegram to PWA, Mini App to macOS, same-record conflict, different-record convergence, stale deletion, authentication expiry, and response loss after commit.
- Tests prove that a failed sync never silently deletes or acknowledges local data.

**T2 gate:** secure callback/session tests, canonical protocol tests, per-client conformance evidence, fault-injection evidence, cross-client convergence evidence, account-isolation/RLS evidence, and hosted validation must pass. A mutation-capable client cannot be released against canonical data while its conformance status is FAIL or NOT VERIFIED. Commit, push, update status, and stop.

## Tranche 3 — release engineering

**Purpose:** produce installable, traceable release artifacts and prove upgrade safety.

**Scope:**

- Signing configuration and signing verification.
- AAB delivery.
- Raw APK delivery.
- Clean-install matrix.
- Upgrade matrix.
- Owner-device installation.

**Required properties:**

- Release credentials are handled outside the repository and are never logged or committed.
- Artifact identity, package name, version code/name, digest, signature, and provenance are recorded.
- AAB and raw APK artifacts are reproducible enough to audit and are delivered through the defined channel.
- Clean installs and upgrades are tested across the supported Android versions/devices.
- Existing local data, Room migrations, backups, sessions, and widget behavior survive upgrades.
- The owner-device installation is performed and recorded.

**T3 gate:** signed artifacts, artifact evidence, clean-install results, upgrade results, and owner-device installation evidence must pass. Commit, push, update status, and stop.

## Tranche 4 — UX, accessibility, and performance

**Purpose:** verify the existing product is usable, accessible, and responsive on real devices after integrity and release mechanics are stable.

**Scope:**

- Real-device screenshot audit.
- Current/Planning hierarchy.
- TalkBack.
- Text scaling.
- Contrast.
- Startup, interaction, and database benchmarks.

**Required properties:**

- Real-device screenshots reflect the intended current product and reveal layout, density, keyboard, safe-area, and lifecycle defects.
- Current and Planning hierarchy makes execution versus planning unambiguous without changing the product philosophy.
- TalkBack semantics, focus order, labels, actions, and state announcements are complete.
- Large-font/text-scaling modes remain usable.
- Contrast and touch targets meet the chosen accessibility criteria.
- Database and UI performance are measured against explicit budgets on representative data, not judged by intuition alone.

**T4 gate:** screenshot evidence, accessibility evidence, performance benchmarks, and database benchmark results must pass. Commit, push, update status, and stop.

## Tranche 5 — release-candidate proof

**Purpose:** make the final evidence-backed production decision.

**Scope:**

- Full regression.
- Adversarial review.
- Dogfooding.
- Signed production artifacts.
- Final readiness decision.

**Required properties:**

- Full web, native, migration, authentication, sync, backup/restore, lifecycle, release, accessibility, and performance regression passes.
- Adversarial review attacks the zero-silent-data-loss invariant and all documented unresolved risks.
- Dogfooding uses real commitments and records failures, recovery, conflicts, and user-visible defects.
- Final signed production artifacts correspond to the reviewed source and documented version.
- The readiness decision states what passed, what remains, who accepted each residual risk, and whether release is authorized.

**T5 gate:** only an evidence-backed readiness decision can authorize release publication.

## Current checkpoint (updated 2026-08-30 22:30 UTC — codex/zero-data-loss-finalization at 525e8fb, local green)

T1 local-integrity is now green locally on the exclusive branch `codex/zero-data-loss-finalization` at `525e8fb` (2 fix commits on top of `678c903`, equivalent to production `5e30d78`/`b1b9d42`). The two red gates are closed:

- **PostgreSQL:** `supabase/migrations/202608260001_zero_silent_data_loss.sql:1376` now `<> (case ... end)`; `bash scripts/test-postgres-migrations.sh` PASS (empty+seeded) and `bash scripts/test-postgres-migration-case-regression.sh` POSTGRES_CASE_REGRESSION=PASS. Previously `33334008972` errored `syntax error at end of input`.
- **Native Android:** `GoalflowRepositorySyncTest > local Room data can never synchronize into a second account` now expects 2 (tasks + task_events) with account-isolation semantics; `LocalAccountDao.insertAll` fixes kapt clean-build duplicate insert. `env JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android-native/gradlew -p android-native test` 70 tests PASS, `assembleProductionDebugAndroidTest` PASS, `ROOM_SCHEMA_ASSETS=PASS` (1..7, `7.json` 862f8cbc).

Hosted execution is currently blocked by billing (`The job was not started because recent account payments have failed` at runs `33334560152`/`33334480320`/`33335350970`, 0 steps) — distinct from the two product failures (run `33334008972` did execute and showed PG + Android failures). Local evidence at `525e8fb` is green across web/server, PG16, and Android gates (see `docs/PRODUCTION_READINESS.md` Evidence table). Next hosted run after billing is cleared must confirm `migrations` and `native-android` are green and is the authority.

The synchronization mastergoal now formally includes web/PWA, Android, macOS, Telegram Bot, and Telegram Mini App under one canonical durability/ownership/idempotency/retry/cursor/conflict/tombstone/backup/receipt contract. This repair pass did **not** implement new adapters; it first established the green baseline, then discovered and recorded each client's actual repository paths and mutation capabilities (see `docs/PRODUCTION_READINESS.md` five-client registry and cross-client conformance matrix). In this pass, web/PWA and Android are PASS, macOS/Telegram Bot/Mini App are discovered but NOT VERIFIED and must not write canonical data until T2 conformance is PASS.

Current evidence, registry, matrix, and exact next actions are maintained in [`docs/PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md), [`docs/TRANCHE_2_HANDOVER.md`](./TRANCHE_2_HANDOVER.md), and [`docs/SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md`](./SOL_MAX_ZERO_DATA_LOSS_FINALIZATION.md). After hosted green, Tranche 2 proceeds in small subtranches (secure callback, session recovery, sync serialization/health, fault injection, cross-client convergence) per the plan.

## Release-finalization rule

Do not call Goalflow production-ready while any required gate is red, any tranche boundary is skipped, any release artifact is unverified, or any unresolved risk is undocumented.
