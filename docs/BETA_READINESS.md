# Tsurfing beta readiness evidence

**Status: NOT READY.** This is the active release ledger as of 2026-09-05.
The implementation and isolated staging environment are substantially proven,
including a destructive restore round-trip. The Telegram staging bot, webhook,
Mini App menu, and Supabase custom provider are configured and the real
Telegram authorization page is reachable, but no owner authorization/linking
round-trip or live five-surface Telegram matrix has completed. Turnstile,
owner-retained signing, production isolation, promotion, and final smoke tests
also remain open. Do not move `integration/beta` or `main`, create
`v0.4.0-beta.1`, or describe the product as ready while any required row below
is not `PASS`.

## Candidate

| Item | Current evidence | State |
| --- | --- | --- |
| Runtime implementation checkpoint | `5b7485fd29d6e7c6a894cea272dcd0b435fc5f19` on `codex/personal-beta-finalization-20260904`; Telegram OIDC origin fix included | PROVEN LOCALLY / IN STAGING |
| Exact evidence checkpoint | `5b7485fd29d6e7c6a894cea272dcd0b435fc5f19`; exact-head CI run `33957017550` fully green and exact Railway staging deployment healthy | PROVEN IN STAGING |
| Reviewed source | `44bd85d9662b2e5a9c012b977a26cf4a5c501964` on `chore/railway-beta-gate`; handover SHA `01f864720df7acfa211745e64edec8b5163ab612` remains an ancestor | VERIFIED |
| Branch distance at runtime checkpoint | 138 commits ahead of `origin/integration/beta`; 51 ahead of the reviewed source; behind neither | VERIFIED |
| Pull request | Draft [PR #3](https://github.com/mariusschober/Tsurfing/pull/3), mergeable, targeting `integration/beta` | OPEN / NOT MERGED |
| Repository | `mariusschober/Tsurfing`; local directory intentionally remains `/Users/schober/Projects/Goalflow` | VERIFIED |
| Production source | `main` remains obsolete and unpromoted | BLOCKED |
| Release tag | `v0.4.0-beta.1` does not exist | BLOCKED |

Checkpoint `942c7f7` pinned the migration job to the official PostgreSQL 17
image digest and remains the first exact PostgreSQL-17 staging proof. Commits
`7071126` and `4a9f63f` add fail-closed Telegram deployment configuration and
explicit acknowledgments. Candidate `5b7485f` supplies Telegram's required
OAuth `origin`, derived only from the configured Supabase URL, on Web, Android,
and macOS while leaving OAuth state and PKCE under Supabase/client-library
control.

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
| Telegram OIDC | Supabase `custom:telegram`, Authorization Code + PKCE, system browser on native, required callback-host origin, explicit immutable-subject linking, owner AAL2 guard | IMPLEMENTED / PROVIDER CONFIGURED / OWNER COMPLETION PENDING |
| Realtime wake-up | Migration-backed per-user version plus private exact topic `tsurfing:user:<auth UUID>`; payload-free broadcast; no client write/broadcast grant | IMPLEMENTED / HOSTED |
| Foreground fallback | Immediate pull after wake, reconnect, focus/foreground and network recovery; 30-second foreground fallback on Web, Android and macOS | IMPLEMENTED / HOSTED WEB |
| Native realtime | Tested Phoenix WebSocket adapters with heartbeat, JWT refresh, reconnect backoff and shutdown | IMPLEMENTED / HOSTED TRANSPORT |
| Mini App relay | Server-validated raw `initData`, stale/replay rejection, ten-minute Secure/HttpOnly session cookie, exact-origin bounded SSE wake relay; no URL credentials | IMPLEMENTED / LIVE TELEGRAM PENDING |
| Bot writes | Committed authoritative mutation path creates normal sync records; reads use committed server state | IMPLEMENTED / LIVE BOT PENDING |

Realtime remains only a hint. Cursor pull, durable outbox, exact receipt,
conflict, tombstone, retry, and lost-acknowledgment behavior remain
authoritative.

## Local verification

At runtime candidate `5b7485f`:

- `npm run check` passed 58 Vitest files / 315 tests, TypeScript, production
  builds, migration and Room ledgers, source/built-artifact secret scans, and
  release contracts.
- Focused macOS email/Telegram authentication tests passed 9 tests.
- A local Android rerun was blocked because this Mac currently exposes Java 18
  while the project requires Java 21. The stale configured local signing path
  was bypassed only for the attempted unsigned check. GitHub's Java-21 jobs are
  authoritative; no source or gate was weakened.

At evidence head `942c7f7` (whose runtime implementation was `b349ece`):

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

### Rejected documentation-only checkpoint

[GitHub Actions run 33958354320](https://github.com/mariusschober/Tsurfing/actions/runs/33958354320)
at documentation-only head `ab62ac9fcd2f37634c1c570d6f6bc2337164cb71`
is rejected evidence. `verify` failed because the newly shortened local start
prompt omitted four exact, case-sensitive safety anchors enforced by
`tests/active-handover.test.ts`; 57 other test files and 313 tests passed while
that file had two failures. Dependency audit, secrets, migrations, macOS, and
hosted staging passed; Android/Web downstream work skipped and the dependent
cross-client/aggregate result was therefore not eligible. The concise prompt
was corrected to retain the reviewed SHA/branch, autonomous-execution wording,
and explicit `main` prohibition. Its focused contract test then passed 4/4
locally before the correction commit. No gate or assertion was weakened.

### Current Telegram-origin checkpoint

[GitHub Actions run 33957017550](https://github.com/mariusschober/Tsurfing/actions/runs/33957017550)
completed `success` against exact runtime candidate
`5b7485fd29d6e7c6a894cea272dcd0b435fc5f19`.

| Job | Job ID | Result |
| --- | ---: | --- |
| `dependency-audit` | `101282070279` | PASS |
| `macos` | `101282070349` | PASS |
| `secrets` | `101282070367` | PASS |
| `migrations` | `101282070417` | PASS |
| `verify` | `101282070421` | PASS |
| `hosted-staging` | `101282155604` | PASS |
| `native-android` | `101282155607` | PASS |
| `android` | `101282155642` | PASS |
| `web-release` | `101282155672` | PASS |
| `hosted-cross-client` | `101284437309` | PASS |
| `beta-gate` | `101285336638` | PASS |
| `android-internal-beta` | `101285337223` | Expected skip; not signing evidence |

Hosted protocol proof returned `PASS` with two-user isolation, direct-client
bypass `DENIED`, refresh and second-session success, export isolation, safe
deletion refusal, remote logout, duplicate delivery `IDEMPOTENT`, conflict
`PRESERVED_AND_RESOLVED`, tombstone `PROPAGATED`, and maximum request time
1,351 ms. Twenty Realtime samples produced p95 1,365 ms; the wake-absent
foreground fallback began after 17,175 ms, with zero recovered tracking
conflicts and cross-user visibility `DENIED`.

The exact cross-client job again passed the hosted browser to production
Android to production macOS transport handoff and cleanup. The macOS mutation
advanced server version 675 to 678; the selected native test passed in 2.972
seconds.

Retained artifacts are test-only or ad-hoc, not authorized beta releases:

- Native sandbox debug APK `9966957609`, 18,586,969 bytes,
  `sha256:a940cf31a2d20e1648a42e909cf26453f281d6ce7f766f0f7188282c06737147`.
- Native production debug APK `9966957335`, 18,586,638 bytes,
  `sha256:c07724d7fd1e4d1f2ef88c79ca45c6c133bb8853103d2b9ac210e88a799f2388`.
- Room schemas `9966794129`, 16,348 bytes,
  `sha256:d5e5cecd12c1fcfd633deb358f853d7014a0a9b3b5dc45ef2e1afb880719ea9a`.
- Legacy production debug APK `9966725608`, 4,143,735 bytes,
  `sha256:d6f5154ec9c527cf3e3561f56be19e3241fae264475b97e1aeaad90ba549accd`.
- macOS ad-hoc candidate `9966716975`, 2,200,563 bytes,
  `sha256:121ab26a2a099fd1deefc7b5e0a982d14647903847744263e3215ad749c4c4ef`.
- Gitleaks SARIF `9966685616`, 7,107 bytes,
  `sha256:f16ca7313a6aa1973039c09f036d3d305170c77189eafa82dd3ddc9c9a426bff`.

The immediately preceding exact-head [run
33954876765](https://github.com/mariusschober/Tsurfing/actions/runs/33954876765)
completed `success` against
`4a9f63f2070b9ac58c07cafd9ca8fb51d242227c`. Its required non-signing jobs all
passed, including hosted staging, hosted cross-client, and `beta-gate`.
`android-internal-beta` correctly skipped because the protected signing gate is
deferred and this was not an `integration/beta` push.

| Job | Job ID | Result |
| --- | ---: | --- |
| `secrets` | `101276320841` | PASS |
| `verify` | `101276320864` | PASS |
| `macos` | `101276320866` | PASS |
| `migrations` | `101276320903` | PASS |
| `dependency-audit` | `101276320996` | PASS |
| `android` | `101276413011` | PASS |
| `web-release` | `101276413041` | PASS |
| `hosted-staging` | `101276413099` | PASS |
| `native-android` | `101276413114` | PASS |
| `hosted-cross-client` | `101278814125` | PASS |
| `beta-gate` | `101279440491` | PASS |
| `android-internal-beta` | `101279440714` | Expected skip; not signing evidence |

Retained artifacts from `33954876765` are all test-only or ad-hoc, not release
artifacts: native sandbox debug APK `9966313867`
(`sha256:800fb623d12c6fe4e68a47ab09c5b86bd947256fe7e3b3da181622cdab972e35`),
native production debug APK `9966313437`
(`sha256:e479b29a0ebbe4b3594af3acddfa50369ec08eabc181c7e5367cda67f06dfecc`),
Room schemas `9966127255`
(`sha256:acb92496eb2a9e9db9f3456175df9f8e3b275fce6feaca50472ee4c5028e57c1`),
legacy production debug APK `9966073068`
(`sha256:64319329fcbda81c1a28b1a97b403e1afe4a847e783f0f0c8517ef9de811712d`),
macOS ad-hoc candidate `9966054511`
(`sha256:7429621088a4e7febe88ffbacf3b578b51dd5a58e8476d1d1b4019655bf9973d`),
and Gitleaks SARIF `9966021456`
(`sha256:3448801f7609bc4618fad75871c12b32e55856be2c0d7f4ca92f8922480d8c96`).

### PostgreSQL 17 and restore evidence checkpoint

[GitHub Actions run 33951359413](https://github.com/mariusschober/Tsurfing/actions/runs/33951359413)
completed `success` against exact head
`942c7f730e38cf09642d7a76bcb6d1768752b590`.

| Job | Job ID | Result |
| --- | ---: | --- |
| `verify` | `101266680949` | PASS |
| `dependency-audit` | `101266680974` | PASS |
| `secrets` | `101266680904` | PASS |
| `migrations` | `101266681024` | PASS on PostgreSQL 17.11 from the digest-pinned official image |
| `macos` | `101266680985` | PASS |
| `android` | `101266780961` | PASS |
| `native-android` | `101266781075` | PASS |
| `web-release` | `101266783400` | PASS |
| `hosted-staging` | `101266783501` | PASS |
| `hosted-cross-client` | `101269656183` | PASS |
| `beta-gate` | `101270302217` | PASS |
| `android-internal-beta` | `101270302851` | Expected skip outside an `integration/beta` push; not signing evidence |

Hosted protocol proof returned `PASS` for two-user isolation, direct-client
bypass denial, refresh, a second authenticated session, export isolation, safe
account-deletion refusal, remote logout, duplicate idempotency, conflict
preservation/resolution and tombstone propagation. Maximum observed request
time was 1,349 ms.

The hosted browser performed 20 realtime writes with latencies
`775, 1075, 1098, 1175, 1061, 1057, 1166, 1060, 1030, 1055, 1024, 860,
1144, 1031, 1098, 1069, 1064, 1063, 1171, 1151` ms. p95 was 1,171 ms.
With wake-up absent, the foreground fallback began after 20,912 ms. It reported
zero recovered tracking conflicts and cross-user visibility `DENIED`.

The cross-client gate created one durable record through the hosted browser,
pulled/edited/pushed it through the production Android sync engine, verified it
in a fresh browser, then did the same through the production macOS transport.
The macOS mutation advanced server version 508 to 511. Browser seed completed
in 14.9 seconds, the Android build in 2 minutes 37 seconds, browser Android
verification in 12.2 seconds, the selected macOS transport test in 2.567
seconds, browser macOS verification in 11.5 seconds, and deletion/cleanup in
16.8 seconds.

### Retained CI artifacts at `942c7f7`

These are test-only or ad-hoc artifacts, not authorized beta releases:

- Native production-debug APK artifact `9965256346`, 18,586,557-byte artifact
  archive, digest
  `sha256:c9d4403c6d1a620d79b66578fa33cadacf36195da8758d40725be1fc5da2cae7`.
  The contained 19,126,936-byte APK is
  `sha256:db08c45a3ada1ee781b7448e7ef599695e8c8f99cd0104ba02211abd5cc613bc`,
  package `com.mariusschober.tsurfing.dev`, version code `4`, version
  `0.4.0-beta.1-dev`, v2 signature valid, ephemeral CI signer fingerprint
  `7a9180bb4b50997b545613ba682f83bcc0db2ed5bc54e91750181fd83d4200f2`.
- Native sandbox-debug artifact `9965256739`, digest
  `sha256:972278eeae237efe08737ce559897ee183cdaa696d9fdf185fd9a62e6ddcb07c`.
- Room schemas artifact `9965053677`, digest
  `sha256:b1dac9923912700039c732bae91a4c48940ec4e7d3aec0f3dbfd99a3fb904048`.
- Legacy production-debug artifact `9964966381`, digest
  `sha256:8337972ef76b488a4555500bc25fd90e9281451019508fa5d314df19837aa029`.
- macOS ad-hoc artifact `9964966548`, artifact digest
  `sha256:8c58cd32e9a903cbea4b1e53c16692d51e124fbda688ea728a96d65f671cc184`.
  Its inner zip is
  `sha256:86081e14acbb921ff4ba5dbb24fafab3101ae82dcbdc0e1e6c4edaf07851d5de`;
  provenance binds it to `942c7f7`, signing `ad-hoc`, notarization
  `not-requested`. The universal `x86_64 arm64` executable is
  `sha256:73e82e7ed908700640b617a2bc0f439226552dc9b50a7d4430a2996121d139b3`.
  The signature is ad-hoc with CDHash
  `e41e21a1551042a55ee65e58452e6545e8c75ffe`, no TeamIdentifier.
- Gitleaks SARIF artifact `9964925241`, digest
  `sha256:d8ff3d72b4511a22c7949dff32ca659df4ebc05336c7e1dd3c266dfc1fc8ff0f`.

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

Telegram staging is enabled. Supabase has the `custom:telegram` provider with
issuer `https://oauth.telegram.org`, public client ID `8300507048`, scopes
`openid profile telegram:bot_access`, and callback
`https://xyjgpwwvsyjhurkycyqr.supabase.co/auth/v1/callback`. Railway holds the
retained replacement token and webhook secret directly; neither is in source
or this ledger. Deployment validates the token belongs to `@tstagebot`, then
registers and re-reads the exact staging webhook, Mini App menu URL, and bounded
commands before startup succeeds.

An earlier staging token became visible during authenticated UI inspection.
The owner revoked/rotated it and entered the replacement directly into Railway;
the deployed identity check subsequently accepted the replacement. No token
value is recorded here.

A direct diagnostic proved Telegram rejects `https://staging.tsurfing.com` as
the OIDC `origin` but accepts the registered Supabase callback origin. The
fixed Supabase flow reached the real **Telegram Authorization** screen for
`TStaging Bot`. No phone/login code was entered, no authorization approved, no
identity linked, and no Bot or Mini App journey run. The old diagnostic URL and
OAuth state must not be reused; the next test starts freshly from the deployed
app. No live Telegram identity or five-surface claim is made.

## Synchronization matrix

| Journey | Exact hosted evidence | State |
| --- | --- | --- |
| Browser A/B create/edit/delete | 20 private wake-up samples, p95 1,171 ms; fallback pull 20,912 ms | PASS |
| Duplicate and lost acknowledgment | Hosted protocol reported `IDEMPOTENT`; property/adversarial tests retain exact-receipt checks | PASS |
| Offline restart/reconnect | Durable IndexedDB/Room/Keychain tests plus reconnect/focus/network pull triggers | SOURCE PASS / OWNER DEVICE RESTART PENDING |
| Conflict and tombstone convergence | Hosted conflict `PRESERVED_AND_RESOLVED`; tombstone `PROPAGATED`; PostgreSQL rollback/rebase tests | PASS |
| User A cannot inject/read user B | Hosted direct bypass and visibility both `DENIED`; account export isolated | PASS |
| Web to native Android | Hosted production transport edited the browser-created record and a fresh browser verified it | PASS |
| Web to native macOS | Hosted production transport advanced server version 508 to 511 and a fresh browser verified it | PASS |
| Telegram Bot and Mini App | Bot identity/webhook/menu/commands configured and authorization screen reached; no owner approval, linked identity, Bot command, Mini App session, or five-surface matrix | CONFIGURED / LIVE JOURNEYS NOT RUN |

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

Immediately after the round trip, staging matched the chosen daily target: one projected task, zero
live sync records, ten total sync records, two tombstones, twelve mutations,
four conflicts and wake version 76. The temporary sentinel task is absent;
its append-only mutation and tombstone correctly remain. Later exact-head
hosted tests created and cleaned their own fixtures while preserving append-only
audit rows. Readiness was HTTP 200 after the round trip and after the exact-head
deployment. A fresh owner login and active-client convergence after restore
remain an owner-assisted check.

## Deployment and rollback

Railway project `58c0b3aa-f2ad-459a-bb6f-194b130c3e68` is `Tsurfing`.
Persistent staging is environment `e7ed6925-b96b-4a17-af4e-ae78b2a934fb`;
production environment `02c29da8-5155-4768-8cf3-66da21d6d7e6` remains empty.
No production service, variable, source or deployment has been created.

Staging Web/API service `9e949038-a0e4-4aa2-925d-f746ae21ba25` deployed exact
runtime candidate `5b7485f` as deployment
`71857011-70b7-4711-8c32-93a25df9e59a`, status `SUCCESS`.
`https://staging.tsurfing.com/api/v1/health/ready` returned HTTP 200 on
2026-09-05 with header
`x-tsurfing-revision: 5b7485fd29d6e7c6a894cea272dcd0b435fc5f19`.
The public app and `/mini/` remain on the same valid-TLS origin.

Maintenance service `5691dbd1-eee6-4ec8-8733-1dec19680393` was used only for
the bounded backup/restore drill. It was then returned to safe steady state:
`npm run maintenance`, cron `0 2 * * *`, restart policy `NEVER`, operation
marker `complete`. Deployment `ec6ea027-584d-4ee3-b972-367e1ee0d32a`
succeeded and its build log proves the normal start command. The newer evidence
revision is safely waiting for its next scheduled cron rather than being forced
to run again. No paid resource was created or authorized.

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
| PostgreSQL 17 hosted migration gate | PASS | PostgreSQL 17.11, empty and supported-upgrade paths, exact digest-pinned image |
| Turnstile | BLOCKED | Owner must enter retained site and secret values directly |
| Telegram OIDC, Bot and Mini App five-surface matrix | PARTIAL | Provider/bot/webhook/menu configured and authorization page reached; fresh owner authorization/linking, Bot/Mini App journeys, and five-surface proof remain |
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

The next checkpoint is to finish the exact-head run and then initiate one fresh
Telegram sign-in from the deployed staging app. The owner may approve the
Telegram authorization screen locally; never send a phone number, login code,
token, or session material in chat. After Telegram live proof, configure
Turnstile and repeat the post-restore email-code plus TOTP journey on Web, TCL
and macOS. Android and macOS release signing remain deferred for about one week.
Movetrics remains an absolute exclusion.
