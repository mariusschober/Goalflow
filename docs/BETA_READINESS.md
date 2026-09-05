# Tsurfing beta readiness evidence

**Status: NOT READY.** This is the active release ledger as of 2026-09-05.
The implementation and isolated staging environment are substantially proven,
including a destructive restore round-trip, but owner-retained signing,
Turnstile, Telegram, production isolation, promotion, and final smoke tests are
still open. Do not move `integration/beta` or `main`, create
`v0.4.0-beta.1`, or describe the product as ready while any required row below
is not `PASS`.

## Candidate

| Item | Current evidence | State |
| --- | --- | --- |
| Runtime implementation checkpoint | `b349ece62f17c7e70c1870f17371b72949e9e949` on `codex/personal-beta-finalization-20260904` | PROVEN IN STAGING |
| Reviewed source | `44bd85d9662b2e5a9c012b977a26cf4a5c501964` on `chore/railway-beta-gate`; handover SHA `01f864720df7acfa211745e64edec8b5163ab612` remains an ancestor | VERIFIED |
| Branch distance at runtime checkpoint | 133 commits ahead of `origin/integration/beta`; 46 ahead of the reviewed source; behind neither | VERIFIED |
| Pull request | Draft [PR #3](https://github.com/mariusschober/Tsurfing/pull/3), mergeable, targeting `integration/beta` | OPEN / NOT MERGED |
| Repository | `mariusschober/Tsurfing`; local directory intentionally remains `/Users/schober/Projects/Goalflow` | VERIFIED |
| Production source | `main` remains obsolete and unpromoted | BLOCKED |
| Release tag | `v0.4.0-beta.1` does not exist | BLOCKED |

The evidence commit following `b349ece` changes only the CI migration runtime,
its regression test, and this ledger. It pins the migration job to the official
PostgreSQL 17 image digest. Its hosted run must pass before it can supersede the
runtime checkpoint above.

## Tsurfing identity and compatibility boundary

Public identity is now Tsurfing across the Web/PWA, email sender, Android,
macOS, Railway, release metadata, Bot/Mini App copy, and active documentation.
The release identifiers are:

- Web production `https://app.tsurfing.com`, staging
  `https://staging.tsurfing.com`, same-origin API and `/mini/`;
- Android `com.mariusschober.tsurfing`, callback scheme `tsurfing`, version
  `0.4.0-beta.1`, code `4`;
- macOS `com.mariusschober.tsurfing.mac`, Keychain service and scheme
  `tsurfing`, version `0.4.0`, build `3`;
- native callback `tsurfing://auth/callback`;
- new exports `.tsurfing-backup`, with legacy `.goalflow-backup` imports still
  accepted.

Compatibility-sensitive `goalflow_*` database objects, immutable migration
text, source namespaces, IndexedDB/storage keys, Room database name, backup
envelope magic, and protocol names remain intentionally unchanged.
`npm run verify:identifiers` verifies this boundary.

## Implemented security and synchronization

| Capability | Current implementation | State |
| --- | --- | --- |
| Typed email OTP | One-use hashed ten-minute activation binding, generic preflight, invite/owner approval, rate limits, typed `verifyOtp` flow, 60-second resend cooldown, refresh rotation, logout and revocation | IMPLEMENTED / HOSTED |
| Web session | Supabase browser persistence with profile validation and fail-closed bootstrap | IMPLEMENTED / HOSTED |
| Android session | Encrypted Keystore persistence; damaged-session handling preserves Room and durable outbox data | IMPLEMENTED / LOCAL DEVICE |
| macOS session | Keychain persistence and one-use native callback state | IMPLEMENTED / SIGNED-PERSISTENCE PROOF PENDING |
| Telegram OIDC | Supabase `custom:telegram`, Authorization Code + PKCE, system browser on native, explicit immutable-subject linking, owner AAL2 guard | IMPLEMENTED / LIVE PROVIDER DISABLED |
| Realtime wake-up | Migration-backed per-user version plus private exact topic `tsurfing:user:<auth UUID>`; payload-free broadcast; no client write/broadcast grant | IMPLEMENTED / HOSTED |
| Foreground fallback | Immediate pull after wake, reconnect, focus/foreground and network recovery; 30-second foreground fallback on Web, Android and macOS | IMPLEMENTED / HOSTED WEB |
| Native realtime | Tested Phoenix WebSocket adapters with heartbeat, JWT refresh, reconnect backoff and shutdown | IMPLEMENTED / HOSTED TRANSPORT |
| Mini App relay | Server-validated raw `initData`, stale/replay rejection, ten-minute Secure/HttpOnly session cookie, exact-origin bounded SSE wake relay; no URL credentials | IMPLEMENTED / LIVE TELEGRAM PENDING |
| Bot writes | Committed authoritative mutation path creates normal sync records; reads use committed server state | IMPLEMENTED / LIVE BOT PENDING |

Realtime remains only a hint. Cursor pull, durable outbox, exact receipt,
conflict, tombstone, retry, and lost-acknowledgment behavior remain
authoritative.

## Local verification

At `b349ece`:

- `npm run verify:release` passed production Web, Mini App and server builds,
  fail-closed server/maintenance probes, and source/built-artifact secret scans.
- Vitest passed 57 files / 308 tests. Coverage includes OTP binding/expiry/
  replay/enumeration, metadata tampering, identity collisions, token rotation,
  revocation, wake rollback/topic forgery, SSE origin/replay/expiry, durable sync,
  and canonical restore verification.
- The complete migration suite passed on a temporary PostgreSQL 17.11 cluster
  from both an empty database and the supported prior state. It reported
  idempotency, conflict/cursor/restore safety, RLS isolation, direct Data API
  denial, session revocation, realtime wake-up, topic-forgery denial and advisor
  hardening as `PASS`.
- The macOS suite passed 190 tests with one intentionally hosted-only skip and
  no failures. The shared in-memory Keychain backend isolates unsigned CI tests
  from entitlement-only system Keychain behavior.

The migration workflow correction is guarded by
`tests/migration-runner-gate.test.ts`, which passed locally and requires a
digest-pinned PostgreSQL 17 service plus a live server-version check.

## Exact-head CI and hosted proof

[GitHub Actions run 33948021282](https://github.com/mariusschober/Tsurfing/actions/runs/33948021282)
completed `success` against exact head
`b349ece62f17c7e70c1870f17371b72949e9e949`.

| Job | Job ID | Result |
| --- | ---: | --- |
| `verify` | `101257517373` | PASS |
| `dependency-audit` | `101257517384` | PASS |
| `secrets` | `101257517408` | PASS |
| `migrations` | `101257517466` | PASS, but still PostgreSQL 16 in this run; corrected in the following evidence commit |
| `macos` | `101257517284` | PASS |
| `android` | `101257607296` | PASS |
| `native-android` | `101257607216` | PASS |
| `web-release` | `101257635226` | PASS |
| `hosted-staging` | `101257635183` | PASS |
| `hosted-cross-client` | `101260486154` | PASS |
| `beta-gate` | `101261446247` | PASS |
| `android-internal-beta` | `101261446847` | Expected skip outside an `integration/beta` push; not signing evidence |

Hosted protocol proof returned `PASS` for two-user isolation, direct-client
bypass denial, refresh, a second authenticated session, export isolation, safe
account-deletion refusal, remote logout, duplicate idempotency, conflict
preservation/resolution and tombstone propagation. Maximum observed request
time was 1,119 ms.

The hosted browser performed 20 realtime writes with latencies
`889, 1137, 1040, 1180, 1192, 1144, 1178, 1181, 1178, 1172, 1279, 1180,
1194, 1094, 1155, 1145, 1144, 1174, 1283, 1060` ms. p95 was 1,279 ms.
With wake-up absent, the foreground fallback began after 18,839 ms. It reported
zero recovered tracking conflicts and cross-user visibility `DENIED`.

The cross-client gate created one durable record through the hosted browser,
pulled/edited/pushed it through the production Android sync engine, verified it
in a fresh browser, then did the same through the production macOS transport.
The macOS mutation advanced server version 436 to 439. Browser seed, Android
verification, macOS verification and deletion/cleanup all passed.

### Retained CI artifacts at `b349ece`

These are test-only or ad-hoc artifacts, not authorized beta releases:

- Native production-debug APK artifact `9964235258`, 18,586,552-byte artifact
  archive, digest
  `sha256:69bab6538100c1a462c8221c0756dbec931a515625b039857b33b04bd538ea09`.
  The contained 19,126,936-byte APK is
  `sha256:20a21b8c87c018cffb030c391744d1b6b8c7d00ac662a6c2c35b8a32ff7e8497`,
  package `com.mariusschober.tsurfing.dev`, version code `4`, version
  `0.4.0-beta.1-dev`, v2 signature valid, ephemeral CI signer fingerprint
  `488b11b6219231937210a8c70d77ab1e54910acc60528599fd21208e7fc24026`.
- Native sandbox-debug artifact `9964235768`, digest
  `sha256:81b3f7daf3d5e53d7d9321520bf6498ce35ca4ac662a48509a038d3848c72e97`.
- Room schemas artifact `9964037583`, digest
  `sha256:c0c26a87db9b5d1ae7e02e7a85b0a01ea938fd2eaa148dd0f7a66b302475f0b2`.
- Legacy production-debug artifact `9963975890`, digest
  `sha256:4e38ce7bde9e59d4b189714626cc66b2f6264f6863504f01cf1b3b3e9dff6d64`.
- macOS ad-hoc artifact `9963957430`, artifact digest
  `sha256:5767fd47460ab45cbc17f30409bd4721308b37b178c3909ed9fd3b4f7473574b`.
  Its inner zip is
  `sha256:223fd7cfc7a5176243a81400acbad348213d62793aaeadf1911462aafa2aee21`;
  provenance binds it to `b349ece`, signing `ad-hoc`, notarization
  `not-requested`. The universal `x86_64 arm64` executable is
  `sha256:73e82e7ed908700640b617a2bc0f439226552dc9b50a7d4430a2996121d139b3`.
- Gitleaks SARIF artifact `9963932042`, digest
  `sha256:643d27451c08e7ceeae3590d1a42e0f5e9e2ca4e27dfe9eae127abf20d61167a`.

The complete-history secret scan is green. The deleted Firebase project
finding is retired with an exact commit/path/rule acknowledgement and one-way
fingerprint in `docs/security/HISTORICAL_CREDENTIAL_ACTIONS.md`; no broad
exclusion or history rewrite was used.

### Physical Android evidence

TCL T807D `ZXKRS4VKGQ8PWGEQ`, Android 16 / API 36, is the selected physical
device. The Samsung was not used for this checkpoint.

An exact `b349ece` native production-debug APK built locally with the modern
Supabase publishable key and staging origins, using the retained local debug
signer. It installed in place without clearing existing application data and
cold-launched in 1,278 ms. The visible Settings screen reported cloud sync as
configured and offered sign-in. Installed metadata is package
`com.mariusschober.tsurfing.dev`, version `0.4.0-beta.1-dev`, code `4`; its
original first-install timestamp was preserved.

The exact CI APK could not replace the existing local-debug-signed package:
Android correctly rejected it as an incompatible signer. No uninstall or data
erasure was performed. Therefore this is exact-source physical-device proof,
not proof that the exact CI bytes or a release-signed APK were installed.

The CI API-30 emulator independently passed clean install, rendered launch,
instrumentation, preserved v2-to-v4 in-place upgrade, exact Room/outbox/
tombstone/dependency/account-binding sentinels, and emitted
`UPGRADE_DATA_PRESERVATION=PASS`, `UPGRADE_MATRIX=PASS`, and
`EMULATOR_GATE=PASS`.

### Superseded pre-staging runs

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

Supabase project `xyjgpwwvsyjhurkycyqr` is the isolated free
`Tsurfing Staging` project in `eu-west-1`, `ACTIVE_HEALTHY`, PostgreSQL 17.6.
Movetrics was not queried or changed.

All 18 immutable migrations are applied and hash-ledgered, including realtime
wake-up and database-advisor hardening. The live catalog has 22 public
application tables and all 22 have RLS enabled. The only direct public-table
client grant is authenticated `SELECT` on `sync_wakeup_state`; all other client
access is through the intended RPC/API boundary. The sole Realtime messages
policy permits authenticated `SELECT` only when the exact private topic equals
`tsurfing:user:` plus `auth.uid()` and the extension is `broadcast`. No
security-definer function lacks a fixed search path.

Supabase owns its managed `storage.objects` and `storage.buckets` tables, so
the migration role cannot execute owner-only grant statements there. The
hash-pinned hosted procedure proves both managed tables have RLS enabled, zero
client policies, and a private `goalflow-backups` bucket before accepting that
managed-platform exception.

Security advisors now report only informational no-policy notices for
deliberately server-only tables plus Supabase's password-leak warning. Tsurfing
does not expose password authentication; leaked-password protection is not a
typed-OTP control. Performance advisors report only newly unused indexes,
expected for a fresh personal staging database. The earlier mutable search
path, unindexed foreign key and per-row `auth.uid()` findings are resolved. No
production Supabase project exists.

## Authentication and account lifecycle

Unit/integration and hosted tests cover production boot validation, immutable
UUID authorization, invite/access approval, activation binding, refresh,
malformed and expired tokens, remote logout/revocation, disabled accounts,
export isolation and safe deletion refusal. Password and magic-link entry
points are absent from the production UI.

Owner account `ms@mariusschober.com` is email-confirmed, active with role
`owner`, and has one verified TOTP factor. The last live sign-in was
2026-09-05 00:43:57 UTC. There is no currently active AAL2 session, so the next
owner journey must elevate again rather than reusing old proof.

Supabase Auth uses the staging site/callback allowlist, six-digit typed email
codes, ten-minute expiry, 60-second resend cooldown, refresh-token reuse
detection and TOTP. Postmark sends as `Tsurfing <login@tsurfing.com>`. Gmail
search confirmed one delivery from `login@tsurfing.com` to the owner mailbox in
the preceding day; no OTP body or code was read or recorded. A live typed code
had already been consumed successfully. Turnstile remains disabled pending
retained site/secret entry.

Telegram remains disabled in Railway and Supabase. Staging bot `@tstagebot`
and production bot `@tsurfbot` exist, but no retained bot/OIDC/webhook secret
has been requested or exposed and no live Telegram claim is made.

## Synchronization matrix

| Journey | Exact hosted evidence | State |
| --- | --- | --- |
| Browser A/B create/edit/delete | 20 private wake-up samples, p95 1,279 ms; fallback pull 18,839 ms | PASS |
| Duplicate and lost acknowledgment | Hosted protocol reported `IDEMPOTENT`; property/adversarial tests retain exact-receipt checks | PASS |
| Offline restart/reconnect | Durable IndexedDB/Room/Keychain tests plus reconnect/focus/network pull triggers | SOURCE PASS / OWNER DEVICE RESTART PENDING |
| Conflict and tombstone convergence | Hosted conflict `PRESERVED_AND_RESOLVED`; tombstone `PROPAGATED`; PostgreSQL rollback/rebase tests | PASS |
| User A cannot inject/read user B | Hosted direct bypass and visibility both `DENIED`; account export isolated | PASS |
| Web to native Android | Hosted production transport edited the browser-created record and a fresh browser verified it | PASS |
| Web to native macOS | Hosted production transport advanced server version 436 to 439 and a fresh browser verified it | PASS |
| Telegram Bot and Mini App | Adversarial implementation tests only; live credentials intentionally absent | DISABLED / NOT RUN |

Realtime wake-ups contain no task payload and only start the authoritative
cursor pull. All active non-Telegram clients also pull on reconnect, focus or
network recovery and every 30 seconds while foregrounded.

## Encrypted backup and destructive restore proof

The target daily backup is metadata row
`1a7ee2c0-5884-4c77-a65c-11996ae3fb09`, object suffix
`daily/2026-09-05T01-30-37-564Z.goalflow-backup.enc`, 13,871 bytes,
encryption envelope v2, SHA-256
`0020e6e62a4d270912f54f947621e341859015674e7c0f1c4fdc5a53ad6c8475`.
The metadata and private-object size agree. A fresh scheduled backup
`924c0ce0-ed4f-45dc-bb35-f57a92d5720b` was also created and authenticated:
16,722 bytes, SHA-256
`c813f1bd085408a053bb8d17a1eb5acc375243975cd19bc006f20d5092ef57fb`.

The first destructive attempt on older code committed the requested restore
but its canonical-projection verifier exited nonzero. It therefore did not
report false success and retained pre-restore snapshot
`c1ac9aed-a434-4dd8-bf5c-e16e2c83e055`, 16,722
bytes, SHA-256
`48b16ca327cbf8ba9e6aba571fdf90d1c1adc25534f9c9fc5b27acc3660c87e5`.
Checkpoint `b349ece` corrects only that false negative and remains
strict about record content, cursor state, conflicts, tombstones and receipts.

| Phase | Railway deployment | Result |
| --- | --- | --- |
| Recovery-backup dry run | `e13fb151-f8b7-41c1-b1ca-a621e66f6533` | Valid v2/schema-4 backup bound to the exact release SHA |
| Recovery-backup execute | `7071eb3f-8445-439f-801e-d2836d0da86f` | Transactional restore PASS; sentinel task and live sync record returned |
| Daily-target dry run | `3e89388a-96d5-4e38-a671-572f5e96e695` | Valid v2/schema-4 backup bound to the exact release SHA |
| Daily-target execute | `9179b707-e749-448c-a652-0b2094845213` | Transactional restore and exact-content verification PASS |

The two successful destructive executions created complete pre-restore
snapshots `0f80b64a-c38f-4a4c-8d12-bcb81f569c27` (19,493 bytes,
`9eb4df39a90d483fb60fc727f0c2396b55d7ee05a75baa32d92c2e3cde68b7ab`)
and `2ca57110-20a3-41e3-b305-4826a1e101e8` (22,242 bytes,
`100809933ce92695755d080dea0c439e3e072ee9ae7aba2bc95a703d4e2460cc`).
Both metadata rows match their private objects.

Final staging state matches the chosen daily target: one projected task, zero
live sync records, ten total sync records, two tombstones, twelve mutations,
four conflicts and wake version 76. The temporary sentinel task is absent;
its append-only mutation and tombstone correctly remain. Readiness was HTTP
200 after the round trip. A fresh owner login and active-client convergence
after restore remain an owner-assisted check.

## Deployment and rollback

Railway project `58c0b3aa-f2ad-459a-bb6f-194b130c3e68` is `Tsurfing`.
Persistent staging is environment `e7ed6925-b96b-4a17-af4e-ae78b2a934fb`;
production environment `02c29da8-5155-4768-8cf3-66da21d6d7e6` remains empty.
No production service, variable, source or deployment has been created.

Staging Web/API service `9e949038-a0e4-4aa2-925d-f746ae21ba25` deployed exact
runtime checkpoint `b349ece` as deployment
`66a5cc10-0176-42e9-8875-75caa688ead8`. `https://staging.tsurfing.com`,
`/mini/` and `/api/v1/health/live` return 200 over valid TLS; readiness exposes
exact revision `b349ece62f17c7e70c1870f17371b72949e9e949`.

Maintenance service `5691dbd1-eee6-4ec8-8733-1dec19680393` was used only for
the bounded backup/restore drill. It was then returned to safe steady state:
`npm run maintenance`, cron `0 2 * * *`, restart policy `NEVER`, operation
marker `complete`. Deployment `ec6ea027-584d-4ee3-b972-367e1ee0d32a`
succeeded and its build log proves the normal start command. No paid resource
was created or authorized.

Before production exists, rollback means do not promote: leave `main` and the
production environment untouched. After release, rollback is to redeploy the
last known-good immutable commit while retaining forward-only database
migrations; never roll back by editing an applied migration. For a data
incident, stop writes, preserve failed backup metadata and objects, dry-run the
chosen encrypted backup, and follow `docs/operations/BETA_RUNBOOK.md` with an
explicit user UUID and pre-restore snapshot.

## Release ledger and blockers

| Required gate | State | Remaining proof or action |
| --- | --- | --- |
| Tsurfing public boundary and compatibility | PASS | None |
| Typed email OTP implementation | PASS | None |
| Live owner email OTP and TOTP | PARTIAL | Repeat after destructive restore on Web, TCL and macOS |
| Hosted auth, UUID isolation, RLS and durable sync | PASS | None |
| Realtime p95 below two seconds and fallback below 30 seconds | PASS | None |
| Web/Android/macOS durable handoff | PASS | None |
| Encrypted backup and destructive restore | PASS | Owner-assisted post-restore client login remains a separate journey |
| PostgreSQL 17 hosted migration gate | IN PROGRESS | Exact-head CI for the following evidence commit must pass |
| Turnstile | BLOCKED | Owner must enter retained site and secret values directly |
| Telegram OIDC, Bot and Mini App five-surface matrix | BLOCKED | Retained staging credentials and live owner test, deliberately last |
| Android internal-beta signing | BLOCKED | Protected environment and externally retained signer authorization |
| macOS distributable signing | BLOCKED | Developer ID signing; notarization remains honestly deferred if chosen |
| Isolated production Supabase | BLOCKED | Pause staging, reconfirm Free allowance, then explicitly confirm `$0` in `eu-west-1` |
| Production deploy and smoke tests | BLOCKED | Must use the exact completely proven commit |
| Branch protection, promotion and `v0.4.0-beta.1` | BLOCKED | Only after every applicable ledger row is green |

## Known noncritical limitations

- The macOS candidate is ad-hoc signed and not distributable; notarization is
  intentionally deferred unless the owner chooses otherwise.
- GitHub may emit dependency/action deprecation warnings; they are nonblocking
  only while the pinned checks and aggregate gate remain green.
- Supabase's leaked-password warning is not applicable to the passwordless
  production UI, which has no password entry point.
- The legacy Capacitor Android application remains preserved for compatibility;
  the native client is the beta target.
- The Chrome extension is preserved as post-beta and is not part of the core
  release gate.
- AI and voice are optional and remain disabled by default.

After the autonomous PostgreSQL 17 CI checkpoint, the next owner action is one
fresh post-restore typed-email-code plus TOTP sign-in while Web, TCL and macOS
are available. Never send a code or secret in chat. Telegram and retained
signing/Turnstile credentials are intentionally later. Movetrics remains an
absolute exclusion.
