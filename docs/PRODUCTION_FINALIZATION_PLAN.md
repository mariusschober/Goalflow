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

Goalflow remains the existing product: a schedule-first productivity system with Current, Planning, goals, habits, frogs, insights, gamification, circadian planning, AI workflows, PWA support, and native Android support. Production finalization perfects the implementation and verification of that product. It does not replace the product with a redesign.

## Document precedence

When repository documents overlap, use this order:

1. This document — authoritative five-tranche scope, sequencing, constraints, and release gates.
2. `docs/PRODUCTION_READINESS.md` — current evidence, pass/fail status, risks, and checkpoint.
3. `docs/TRANCHE_2_HANDOVER.md` — current T1 closure instructions and the next-chat execution prompt.
4. `docs/AI_CONTEXT_HANDOVER.md` — concise agent entrypoint and product context.
5. Older implementation, integrity, release, and audit documents — useful evidence only; they do not override the documents above.

The attached user-supplied plan remains authoritative if it is available in the working session. Do not invent a relaxed interpretation of a release gate.

## Product and architecture context

- Web/PWA and native Android are first-class clients.
- The web client uses IndexedDB and a durable mutation/outbox path.
- The native client is under `android-native/`, using Kotlin, Compose, Room, DataStore, WorkManager, and local-first persistence.
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
- Two-client convergence.

**Required properties:**

- Callback handling validates state/nonce/redirect boundaries and does not expose tokens.
- Session expiry, restart, revoked credentials, offline recovery, and refresh failures are explicit and recoverable.
- Mutations serialize safely, are idempotent, preserve ordering where required, expose health/backlog/conflict state, and never advance a cursor past uncommitted data.
- Fault injection covers response loss, retries, duplicates, server restarts, partial failures, concurrent writes, and restore interruptions.
- Two independent clients converge deterministically while preserving account isolation, conflicts, unknown fields, and pending work.
- Tests prove that a failed sync never silently deletes or acknowledges local data.

**T2 gate:** secure callback/session tests, sync protocol tests, fault-injection evidence, two-client convergence evidence, account-isolation/RLS evidence, and hosted validation must pass. Commit, push, update status, and stop.

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

## Current checkpoint

T1 implementation is complete in code, but T1 closure is blocked. The current native unit gate reports one failure in `GoalflowRepositorySyncTest` (70 tests, 1 failure), and PostgreSQL reports an unterminated `CASE` at `supabase/migrations/202608260001_zero_silent_data_loss.sql:1423`. Both are associated with concurrent T2-like commit `6e7244a`, which must be reviewed and contained before it is treated as an approved T2 base.

The Room schema asset packaging fix is present and its executable guard passes, but the runtime Room migration instrumentation test has not rerun because the native unit gate fails first. The prior hosted emulator run proved test-only APK installation and first-frame launch.

Current evidence and exact next actions are maintained in [`docs/PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) and [`docs/TRANCHE_2_HANDOVER.md`](./TRANCHE_2_HANDOVER.md).

## Release-finalization rule

Do not call Goalflow production-ready while any required gate is red, any tranche boundary is skipped, any release artifact is unverified, or any unresolved risk is undocumented.
