# Goalflow beta readiness evidence

**Status: NOT READY.** This document is the current release ledger. Historical
documents may describe earlier local or simulated checkpoints; they are not
release evidence. Do not move `main`, create a beta tag, deploy production, or
delete preserved branches while any required row below is `BLOCKED`, `NOT RUN`,
or `IN PROGRESS`.

## Candidate

| Item | Current evidence | State |
| --- | --- | --- |
| Candidate implementation | `chore/railway-beta-gate` implementation tree at `7d491c882ccb9e02691e2fe007ee0efce91eceee` | CANDIDATE ONLY |
| Canonical baseline | `reconcile/canonical-main-20260831` at `6bd503605efe0ba4a92d57a6850e98590c1117a8` | PRESERVED |
| Production source | `main` remains at obsolete head `84bd036ba25d825b5fae36cb780842d9221ed097` | NOT PROMOTED |
| Staging source | `develop` has not been created from a proven release | NOT CONFIGURED |
| Release tag | `v0.4.0-beta.1` does not exist | NOT RELEASED |

## CI and build evidence

The exact-implementation [Beta Gate run
33821008399](https://github.com/mariusschober/Goalflow/actions/runs/33821008399)
completed at `7d491c882ccb9e02691e2fe007ee0efce91eceee`. Its independent
`dependency-audit`, `verify`, clean PostgreSQL `migrations`, `web-release`,
legacy `android`, `native-android`, and `macos` jobs succeeded. Chromium and
WebKit completed all eight critical journeys. The OSV Scanner action, pinned to
an immutable commit, scanned the exact lockfile's 749 packages and reported no
issues. A missing lockfile, scanner error, timeout, or vulnerability remains
fatal to the aggregate gate.

The macOS job executed 176 tests with one explicitly skipped live-staging test
and zero failures, built and verified the ad-hoc signed application, and
retained artifact `9918299195` (1,148,130 bytes; artifact digest
`sha256:b5cfb7b6ecb3f381d80457ec1d244bbf961fdf7e488321f766aa84dcd41d4e4e`).
The skipped test is the real hosted transport handoff and is not represented as
live evidence.

The native API-30 gate proved a clean install and visible `Current`/`Capture`
semantics, ran exactly seven Compose/Room instrumentation tests, and installed
the preserved version-2 APK before upgrading it in place to version 3. Both
pre- and post-upgrade UI checks passed. SQLite verification retained two task
rows, three outbox rows, one tombstone, one mutation dependency, one account
binding, exact timestamps and cursor state, and every fixed durable ID. The
device emitted `UPGRADE_DATA_PRESERVATION=PASS`, `UPGRADE_MATRIX=PASS`, and
`EMULATOR_GATE=PASS`.

The same run's event-commit scan and candidate-tree scan found no leaks. The
complete-history scan examined 319 commits and found exactly the one unresolved
historical Firebase/GCP key (`history_status=1`, `tree_status=0`). Therefore
the aggregate `beta-gate` correctly failed. The `hosted-staging` result was
only the allowed absent-configuration preflight for this short-lived branch.
The new `hosted-cross-client` job also passed only its preflight; its browser,
Android, macOS, verification, and cleanup steps were all skipped because no
staging configuration exists. `android-internal-beta` was skipped because this
is not `integration/beta` and no signer/staging configuration has been
supplied. None of those skips is release evidence.

Local verification after the audit repair passed 51 Vitest files / 260 tests,
TypeScript, production client/server/Mini App builds, client and built-artifact
secret scans, workflow parsing, and the OSV workflow contract tests. CI's
independent lockfile scan reported zero vulnerabilities and also passed
production boot, one-shot maintenance fail-closed behavior, all 14 migration
hashes, all 8 Room schema hashes, and durable identifier checks. Local
Playwright did not execute
because this workspace could not download the Chromium binary and lacks WebKit
system libraries; hosted CI is the browser authority.

## Database and Supabase evidence

There are 14 immutable SQL migrations, ending at
`202609030007_telegram_capture_confirmation.sql`. Their exact SHA-256 values are
recorded in `supabase/migrations/MIGRATION_SHA256_MANIFEST.json`. The current
candidate's `migrations` job applied the complete ordered set to clean
PostgreSQL 16 and passed the empty-database, upgrade, idempotency, conflict,
cursor, restore, task-event, unknown-payload, and regression checks.

This is SQL execution evidence, not hosted Supabase evidence. No dedicated
Goalflow staging project exists, so extensions, grants, RPCs, triggers, RLS,
storage policies, auth hooks, and backup storage have not been proven in a real
Supabase project. No production migration state has been inspected or changed.

## Authentication and account lifecycle

Unit/integration tests cover production boot validation, immutable UUID owner
authorization, invite/access approval, profile validation, refresh, malformed
and expired tokens, remote logout/revocation, disabled accounts, export, and
safe deletion refusal. The UI remains authenticating until token and usable
profile validation complete, cross-tab session changes invalidate stale
bootstrap work, and local/global sign-out failures are not reported as
success. Native Android now performs the same project/account-bound TOTP AAL2
elevation required for an owner to synchronize. A damaged encrypted Android
session is reported without deleting Room data or its outbox; non-key-loss
ciphertext remains until an explicit replacement or clear.

No staging URL or staging identities exist. Registration email delivery,
verification, invite activation, login, reset, refresh, revocation, owner AAL2,
and redirect allowlists are therefore `NOT RUN` against a live provider. Test
identity A and B UUIDs/passwords must never be recorded in this file.

## Synchronization matrix

| Journey | Synthetic/protocol evidence | Hosted evidence | Release state |
| --- | --- | --- | --- |
| Browser A to browser B create/edit/delete | Durable fake server plus hosted-browser harness exists | No staging origin or identities | NOT RUN |
| Duplicate delivery and lost acknowledgment | Idempotency/property/adversarial tests pass | No staging project | NOT RUN |
| Offline mutations survive restart/reconnect | IndexedDB/Room outbox tests pass | No two-client staging drill | NOT RUN |
| Conflict and tombstone convergence | Shared protocol and PostgreSQL tests pass | No live cross-client drill | NOT RUN |
| User A cannot inject/read user B | Server/RLS test harness exists | Two real staging users absent | NOT RUN |
| Web to native Android | API-30 visible-UI, seven-test instrumentation, exact installed v2→v3 preservation, and a production-transport handoff harness compile | Hosted handoff skipped; no signed build or staging account | NOT RUN |
| Web to native macOS | 176 Swift tests, temporary-Keychain login, production URL-session handoff harness, and ad-hoc build gate compile | Hosted handoff skipped; no staging login/sync drill | NOT RUN |
| Telegram to linked Goalflow account | Disabled implementation and adversarial tests exist | BotFather test bot absent | DISABLED / NOT RUN |

Synthetic tests qualify a candidate for hosted testing; they do not prove zero
data loss or cross-user isolation in the deployed system.

## Backup and restore evidence

The one-shot maintenance command, AES-256-GCM/HKDF per-user envelope, private
object metadata, read-after-write authentication, retention, pre-restore
snapshot, dry run, transactional database replacement, and post-commit content
verification are implemented and covered by unit/PostgreSQL tests.

No staging backup object, maintenance invocation, checksum record, retention
run, dry-run output, pre-restore snapshot, or destructive staging restore drill
exists. Row-count, durable-ID, tombstone, sync-state, login, and post-restore
client convergence evidence is therefore `NOT RUN`.

## Deployment and rollback

The intended topology is one private Railway project with isolated persistent
`staging` and `production` environments. Each has one web/API service and one
one-shot maintenance service from the same commit. Staging follows `develop`
after CI; production follows `main` only by explicit promotion. Read-only
verification on 2026-09-04 found Railway project
`58c0b3aa-f2ad-459a-bb6f-194b130c3e68`, only its empty `production`
environment `e7ed6925-b96b-4a17-af4e-ae78b2a934fb`, and zero services. There
is no staging or production URL to record.

Before production exists, rollback means do not promote: leave `main` and the
production environment untouched. After release, rollback is to redeploy the
last known-good immutable commit while retaining forward-only database
migrations; never roll back by editing an applied migration. For a data
incident, stop writes, preserve failed backup metadata and objects, dry-run the
chosen encrypted backup, and follow `docs/operations/BETA_RUNBOOK.md` with an
explicit user UUID and pre-restore snapshot.

## Release blockers

- The historical Firebase/GCP client key has not received owner-side
  revoke/rotate/restrict and usage-review evidence. Complete-history scanning
  intentionally fails; see `docs/security/HISTORICAL_CREDENTIAL_ACTIONS.md`.
- Dedicated staging and production Supabase projects are absent.
- The Railway staging environment and both staging/production services are
  absent.
- Two synthetic staging identities and live auth/RLS/sync evidence are absent.
- The staging backup/restore drill is absent.
- Android release signing material and a signed internal APK checksum are
  absent.
- Web-to-Android and web-to-macOS hosted convergence are absent.
- Telegram remains disabled pending a live BotFather staging matrix.
- `main`/`develop` protection, promotion, tag, production deployment, and smoke
  evidence must wait for every preceding blocker.

## Known noncritical limitations

- The macOS candidate is ad-hoc signed and not notarized; notarization is
  intentionally post-beta.
- The legacy Capacitor Android application remains preserved until native
  Android parity and migration safety are proven.
- The Chrome extension is preserved as post-beta and is not part of the core
  release gate.
- AI and voice are optional and remain disabled by default.

The next release-critical action requiring repository-owner input is to resolve
the historical Google key in its console and choose the organization and region
for a new, isolated Goalflow staging Supabase project. No unrelated existing
project may be repurposed.
