# Tsurfing beta readiness evidence

**Status: NOT READY.** This document is the current release ledger. Historical
documents may describe earlier local or simulated checkpoints; they are not
release evidence. Do not move `main`, create a beta tag, deploy production, or
delete preserved branches while any required row below is `BLOCKED`, `NOT RUN`,
or `IN PROGRESS`.

## Candidate

| Item | Current evidence | State |
| --- | --- | --- |
| Active finalization branch | `codex/personal-beta-finalization-20260904`; current authentication checkpoint `ffc779996d7bca4d4faf488f1511ddf87743c8c7` | CANDIDATE ONLY |
| Reviewed source | `chore/railway-beta-gate` at `44bd85d9662b2e5a9c012b977a26cf4a5c501964`; original handover SHA `01f864720df7acfa211745e64edec8b5163ab612` remains an ancestor | VERIFIED SOURCE |
| Active local handover | `docs/handover/LOCAL_CODEX_START_PROMPT.md` and `docs/handover/LOCAL_CODEX_PERSONAL_BETA_CONTEXT.md` | DOCUMENTED |
| Canonical baseline | `reconcile/canonical-main-20260831` at `6bd503605efe0ba4a92d57a6850e98590c1117a8` | PRESERVED |
| Production source | `main` remains at obsolete head `84bd036ba25d825b5fae36cb780842d9221ed097` | NOT PROMOTED |
| Staging source | Railway staging exists but has no repository source or deployment; `develop` has not been created from a proven release | CONFIGURED / NOT DEPLOYED |
| Release tag | `v0.4.0-beta.1` does not exist | NOT RELEASED |

## Tsurfing boundary checkpoint — 2026-09-04

GitHub repository `mariusschober/Goalflow` was renamed to
`mariusschober/Tsurfing` after checkpoint
`2d95d5da828eb57fa4110f20aaf206e5a8f088ca` was pushed. The local checkout
remains at `/Users/schober/Projects/Goalflow` for compatibility and its `origin`
now fetches and pushes `https://github.com/mariusschober/Tsurfing.git`.

The checkpoint establishes public Tsurfing identity without rewriting durable
internals: Web/PWA copy and metadata, Android package
`com.mariusschober.tsurfing` with version code `4`, macOS bundle
`com.mariusschober.tsurfing.mac` with version `0.4.0` build `3`, callback
`tsurfing://auth/callback`, Railway resource definitions, artifact names, Bot
and Mini App copy, and `.tsurfing-backup` exports. Existing migration text,
`goalflow_*` database objects, source namespaces, IndexedDB/storage keys,
Android Room filename, encrypted-backup magic, and `.goalflow-backup` imports
remain intentionally compatible. `npm run verify:identifiers` passed all 20
declared boundaries.

Local checkpoint evidence:

- `npm run verify:release` passed TypeScript, 52 Vitest files / 265 tests,
  production Web/Mini/server builds, fail-closed server and maintenance probes,
  and both source and built-client secret scans.
- All 14 migration hashes and all 8 Room schema hashes passed. Static migration
  verification passed empty-order, additive-upgrade, and access-boundary checks;
  hosted Supabase execution remains unproven.
- Native Android `test lint assembleProductionDebug` passed 186 tasks after a
  clean analyzer run. The unsigned release candidate is package
  `com.mariusschober.tsurfing`, version `0.4.0-beta.1` / code `4`, SHA-256
  `77ef80bef11db6b8db92e7535bb268ec1007b5ea6f1261900b4f62ee36ec1059`.
  It is explicitly not the signed release artifact.
- Production-debug SHA-256 is
  `ab22a6d7d7c8efaa7ee11589f1dca6686bcd35dd074f6c64259fd1b0d125269f`.
  It installed on connected Samsung SM-S918B `R3CW404GVBL`, cold-launched in
  852 ms, exposed the exact Tsurfing package/scheme/actions, and passed all
  seven app instrumentation tests on the physical device. The separate
  macrobenchmark task could not auto-grant its Samsung test permission and is
  not represented as a performance pass.
- The macOS suite passed 176 tests with one hosted-only skip and zero failures.
  A universal arm64/x86_64 Release app built with display name `Tsurfing`, the
  final bundle/version/feed/icon configuration, hardened runtime, and a valid
  ad-hoc signature. Executable SHA-256 is
  `46d283fd26702bc01be3dcfe1c3cd8bfc20e09deea1188b7907fa2bfa64928db`;
  full code-directory SHA-256 is
  `5dcf04fc5925ee96e8e5cb277ce6bdef0a71d7a2a97d18d6d99f44c9c1805ae8`.
  Developer-ID entitlements and notarization remain owner-signing work, not a
  local pass.

The finalization branch is exercised through draft pull request
[`#3`](https://github.com/mariusschober/Tsurfing/pull/3). Exact-head CI evidence
for the later authentication checkpoint is recorded below.

## Authentication checkpoint — 2026-09-04

The current checkpoint `ffc779996d7bca4d4faf488f1511ddf87743c8c7`
contains typed email OTP activation and secure restart persistence on Web,
native Android, and native macOS. It also contains Supabase-managed Telegram
OIDC Authorization Code + PKCE and explicit immutable Telegram identity
linking on all three clients. Password and magic-link entry points are absent
from the production UI. Owner linking requires AAL2; account activation and
linking do not trust mutable metadata or merge by email, username, or phone.

Local verification passed 53 Vitest files / 279 tests and the complete Web,
Mini App, and server release build. Native Android passed unit tests, lint, and
debug assembly. The macOS suite ran 185 tests: 184 passed, the one explicitly
hosted-only transport test skipped, and none failed. A first release-verifier
run had one isolated five-second bundle-key test timeout; that test passed 4/4
when repeated and the complete verifier then passed without changing a gate.

## CI and build evidence

The authentication [Beta Gate run
33918137065](https://github.com/mariusschober/Tsurfing/actions/runs/33918137065)
completed against the exact head
`ffc779996d7bca4d4faf488f1511ddf87743c8c7`. `verify`,
`dependency-audit`, `migrations`, `web-release`, legacy `android`,
`native-android`, and `macos` succeeded. `secrets` failed on the single known
historical Firebase/GCP finding. `hosted-staging` and
`hosted-cross-client` failed because the required protected staging
configuration and deployed origin were absent. The aggregate `beta-gate`
therefore failed and `android-internal-beta` correctly skipped. These failures
were not weakened or relabeled.

The run retained these test-only or ad-hoc artifacts; none is the signed
internal-beta release:

- `tsurfing-native-sandbox-debug-apk-TEST-ONLY`, artifact `9954698641`,
  18,568,008 bytes, digest
  `sha256:e98fe49f13fec82358a2fcf32062593ba754119db97797d2b91b901da5f11ea3`.
- `tsurfing-native-production-debug-apk-TEST-ONLY`, artifact `9954697688`,
  18,567,800 bytes, digest
  `sha256:4f7d9bd429aefb23408e9995be337ff7875e45fd101b9480384210418a893b94`.
- `tsurfing-native-room-schemas`, artifact `9954244350`, 16,348 bytes,
  digest
  `sha256:99922f0610af38752219bf5843a4d80ebe9024ab6e204c72b5d78aad2d8c3228`.
- `tsurfing-production-debug-apk-TEST-ONLY`, artifact `9954058222`,
  4,143,733 bytes, digest
  `sha256:401fbedcaeceba1ef90b5b187cbf4128ed656e5cd4fbad60444ceef90c8c3397`.
- `tsurfing-macos-ad-hoc-beta`, artifact `9954042283`, 2,127,431 bytes,
  digest
  `sha256:1fdff645a105a490e3acc7de300f6d5de379aff87a92a2e5fe67bb46d58e059d`.
- `gitleaks-results.sarif`, artifact `9953946141`, 7,107 bytes, digest
  `sha256:5b0b4a82a9bdaa8d4a892ed4498378b140fa16d6479a1c158cbc11ade92c8496`.

The exact-implementation [Beta Gate run
33821008399](https://github.com/mariusschober/Tsurfing/actions/runs/33821008399)
completed at `7d491c882ccb9e02691e2fe007ee0efce91eceee`. Its independent
`dependency-audit`, `verify`, clean PostgreSQL `migrations`, `web-release`,
legacy `android`, `native-android`, and `macos` jobs succeeded. Chromium and
WebKit completed all eight critical journeys. The OSV Scanner action, pinned to
an immutable commit, scanned the exact lockfile's 749 packages and reported no
issues. A missing lockfile, scanner error, timeout, or vulnerability remains
fatal to the aggregate gate.

The documentation head was independently rerun as [Beta Gate run
33823362114](https://github.com/mariusschober/Tsurfing/actions/runs/33823362114)
at `01f864720df7acfa211745e64edec8b5163ab612`. Verification, migrations,
dependency audit, Web, legacy Android, native Android, and macOS all succeeded.
The aggregate again failed only because the complete-history secret job found
the same unresolved historical key. Hosted jobs again proved only their
unconfigured preflight, and the signed internal-beta job was correctly skipped.

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

There are 16 immutable SQL migrations, ending at
`202609040002_telegram_oidc_activation.sql`. Their exact SHA-256 values are
recorded in `supabase/migrations/MIGRATION_SHA256_MANIFEST.json`. The current
candidate's `migrations` job applied the complete ordered set to clean
PostgreSQL 17 and passed the empty-database, upgrade, idempotency, conflict,
cursor, restore, task-event, unknown-payload, and regression checks.

The free Supabase project `xyjgpwwvsyjhurkycyqr` was renamed to
`Tsurfing Staging`. It is healthy in `eu-west-1` on PostgreSQL 17.6 and all 16
migrations were applied in order from this branch. The resulting live catalog
has 21 empty public application tables, all with RLS enabled, and neither
`anon` nor `authenticated` has direct SELECT/INSERT/UPDATE/DELETE privileges
on any public application table. The private `goalflow-backups` bucket exists
with a 50 MiB limit.

One hosted-platform difference is recorded explicitly. Supabase owns its
managed `storage.objects` and `storage.buckets` tables, so the migration role
cannot execute the three owner-only ALTER/REVOKE/GRANT statements in
`202609030001_access_boundary_hardening.sql`. The hosted application applied
the otherwise identical migration after proving that both managed tables
already had RLS enabled, had zero client policies, and that the backup bucket
was private. Supabase's default SQL grants remain, while the absence of a
permissive RLS policy denies untrusted direct access. This exception must be
encoded as a hash-pinned, fail-closed hosted deployment procedure before
production rather than editing the immutable migration.

The live security advisor reported one actionable warning:
`public.validate_goalflow_task_schedule` lacks a fixed search path. Performance
advisors also reported unindexed foreign keys and older RLS policies that call
`auth.uid()` without an init-plan SELECT. These are not represented as green;
a forward migration is required. Movetrics was not queried or changed. No
production Supabase project exists.

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

Source authentication is complete for the current Web, native Android, and
native macOS checkpoint, but live proof remains incomplete. Supabase staging
uses site URL `https://staging.tsurfing.com`, allows only the staging Web path
and `tsurfing://auth/callback`, issues six-digit email OTPs with a ten-minute
expiry, detects compromised refresh-token reuse, keeps the recommended
ten-second refresh-token reuse interval, enables TOTP, and limits AAL1 sessions
to 15 minutes before MFA elevation.

Postmark server `20738479` was renamed to `Tsurfing Auth`; SMTP access is
enabled. `tsurfing.com` is DKIM and Return-Path verified and sender
`Tsurfing <login@tsurfing.com>` with reply-to `marius@tsurfing.com` is saved.
The Postmark account remains in Test mode. Its approval form was not submitted
and its retained credential was not opened. Supabase's custom-SMTP form is
prepared for STARTTLS on `smtp.postmarkapp.com:587` with a 60-second per-user
interval, but remains deliberately unsaved until the owner enters the retained
credential directly. The email template therefore cannot yet be changed to
`{{ .Token }}`. Turnstile is also disabled until its retained site and secret
keys are provisioned directly. No staging identities, delivered OTP, refresh,
revocation, or owner AAL2 journey has run; test identity secrets must never be
recorded here.

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
| Telegram to linked Tsurfing account | Disabled implementation and adversarial tests exist | BotFather test bot absent | DISABLED / NOT RUN |

Synthetic tests qualify a candidate for hosted testing; they do not prove zero
data loss or cross-user isolation in the deployed system.

The current implementation is durable but not instant. Web's visible-page poll
runs every 60 seconds, macOS polls every 300 seconds, and Android's durable
background WorkManager interval is 15 minutes, with faster one-shot pushes for
local edits. There is no Supabase Realtime wake-up layer. Near-instant
cross-client convergence therefore remains implementation and hosted-proof work,
not a current capability.

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

Railway project `58c0b3aa-f2ad-459a-bb6f-194b130c3e68` was renamed to
`Tsurfing`. Its former empty `production` environment was renamed to persistent
`staging` (`e7ed6925-b96b-4a17-af4e-ae78b2a934fb`) and a separate empty
`production` environment (`02c29da8-5155-4768-8cf3-66da21d6d7e6`) was
created. No production service, variable, source, or deployment was created.

Staging has empty service `tsurfing-web-api`
(`9e949038-a0e4-4aa2-925d-f746ae21ba25`) configured for the release build,
readiness health check, bounded crash restart, and Railway Serverless sleeping.
It also has empty cron service `tsurfing-maintenance`
(`5691dbd1-eee6-4ec8-8733-1dec19680393`) configured for the one-shot backup at
02:00 UTC with no restart. Public, non-secret staging variables point only to
Tsurfing Staging Supabase. Neither service has a GitHub source or deployment,
and the retained Supabase server key, backup master key, and owner UUID are
absent.

Custom domain `staging.tsurfing.com` is attached to the staging Web service and
is waiting for CNAME `0a00btfe.up.railway.app` plus certificate issuance. The
authoritative DNS is at OVH; no DNS record was changed because that account is
not authenticated in the in-app browser. Railway is currently a 30-day trial
with 26 days and the included $5 credit remaining. No service has been started,
so this checkpoint did not intentionally consume runtime credit or authorize a
paid plan.

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
- Realtime wake-up, 30-second foreground fallbacks, and the Mini App wake relay
  are not yet implemented.
- Tsurfing Staging Supabase needs the forward advisor fixes, hash-pinned hosted
  migration procedure, custom SMTP, `{{ .Token }}` template, Turnstile, and
  live two-user proof. The separate production project is absent by design
  until staging is proven and paused under the Free-plan two-project limit.
- Railway staging needs retained secret variables, owner UUID, GitHub source,
  the pending OVH CNAME, and an exact-commit deployment. Production remains
  intentionally empty.
- Postmark remains in Test mode; approval has not been requested.
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

The next release-critical owner action is to provide the historical Google key's
deletion disposition, deletion date, and one-way fingerprint after console
verification. Do not provide the key itself. Independent source, CI, staging,
and deployment work continues without touching Movetrics.
