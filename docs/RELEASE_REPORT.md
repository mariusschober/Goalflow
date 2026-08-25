# Goalflow Release Report

## Release identity

- Branch: `goalflow-production`
- Starting SHA: `7fa5a17e2b8892df91c2b23c4e551b67031731db`
- Implementation commit: `5be4328fdff311e6aeae4108ce4fea0b7a00703b`
- Isolated test-build commits: `67a57d6959a07e91b78eedfaeecbe20731d2993c`, `f844ff29c44c2f8b505336a6665d27343ebe9b68`
- Version: `0.1.0`
- Date: `2026-08-25`
- Final executable implementation SHA: `f844ff29c44c2f8b505336a6665d27343ebe9b68`
- Final branch tip: the docs-only commit containing this evidence report, immediately after the executable implementation above; the exact tip is recorded in the final handoff

## Product preservation

No intentional product-semantic changes were made. The changes preserve Current, Planning, frogs, breakdown, local-day scheduling, goals, circadian logic, gamification, optional AI, optional Telegram, and the existing navigation philosophy while hardening failure and lifecycle behavior.

## Audit completeness

`docs/AUDIT_MANIFEST.md` accounts for 177 first-party paths: 146 executable/configuration/schema/documentation text paths and 31 binary/static assets. All relevant first-party paths are marked `REVIEWED`; unreviewed relevant files: 0. Generated Capacitor/WebView assets are intentionally reproducible build output and are not treated as hand-maintained source.

## Defects

The review found and fixed defects in local mutation ordering, backup import atomicity and validation, sync metadata races, Current/planning determinism, local deletion reconciliation, duplicate completion handling, duplicate habit rescheduling, local-day/time-zone handling, API-origin configuration, Telegram validation, modal focus stability, and startup error recovery.

| Severity | Discovered | Fixed | Remaining |
| --- | ---: | ---: | ---: |
| P0 | 0 | 0 | 0 |
| P1 | 7 | 7 | 0 |
| P2 | 8 | 8 | 0 |

These are the defects classified and remediated during this pass; they are not a claim that unknown defects are impossible. No known fixable P0–P2 defect remains within the reviewed repository scope. Live-infrastructure checks that could reveal additional defects are listed as `NOT AVAILABLE` below.

## Verification commands

| Check | Result |
| --- | --- |
| `CI=1 npm run verify:release` | PASS |
| `npm ci --cache /tmp/goalflow-npm-cache` | PASS |
| TypeScript compilation via `npm run lint` | PASS |
| Unit/domain/storage tests | PASS — 6 files, 31 tests |
| Property/state-machine test | PASS — 400 generated sequences, up to 120 operations each; preserved regression seed `-117028276` |
| Client/server production build | PASS |
| Production server startup and `/api/v1/health` | PASS |
| Client bundle secret scan | PASS — 27 built files scanned |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities reported |
| `CI=1 npm run android:sync` | PASS |
| `npm run verify:test-build` | PASS — test bundle contains the isolated gate; production bundle contains no `123456` |
| `npm run android:sync:test` | PASS — isolated test web bundle synchronized into Capacitor |
| GitHub Actions exact-tip production/test Android run `32825578193` | PASS — production and sandbox APKs built and uploaded |
| Local Gradle tests, lint, debug APK | NOT AVAILABLE — Android SDK/Gradle distribution/JDK 21 are unavailable in this environment |
| GitHub Actions clean-checkout web and Android gates | PASS — run `32793296539`; verify, secrets, and Android jobs all succeeded |
| Browser E2E, screenshots, axe/accessibility runtime, install/offline browser exercise | NOT AVAILABLE — no browser executable is available |
| Live Supabase/RLS identity tests | NOT AVAILABLE — no staging credentials/identities are available |
| Live Telegram and AI-provider failure tests | NOT AVAILABLE — optional provider credentials are unavailable |

## Property and date/time testing

The domain property test generates create, reschedule, skip, complete, drop, breakdown, reorder, and habit operations, checking identity, valid schedules, frog relationships, habit idempotency, and deterministic queue ordering after each operation. The suite includes deterministic regressions for planning-order changes, numeric creation timestamps, leap-day validity, duplicate habit rescheduling, local-day formatting across UTC/Canary/Berlin/New York/Tokyo, DST transition instants, storage rejection, interrupted import transactions, and backup round trips.

## Data integrity and recovery

The available storage suite passes typed merge, serialized mutation ordering, malformed backup rejection, failed-transaction preservation of the previous committed state, encrypted export/clear/replace-import round trip, and recovery-copy behavior. Wrong-password, modified-ciphertext, truncated-envelope, invalid-schema, and checksum validation paths fail before replacement. Sync locking and explicit local/cloud conflict choices are covered by source-level review and deterministic client logic; live two-identity chaos testing is `NOT AVAILABLE` without Supabase credentials.

## Security

- Threat model: documented in `docs/THREAT_MODEL.md`.
- Dependency audit: PASS, no high/critical findings reported by `npm audit --audit-level=high`.
- Repository secret scan: CI configured with Gitleaks; a local history scan could not authenticate to the private remote from the shell.
- Client bundle secret scan: PASS; forbidden server-secret names are absent from built client output.
- RLS and ownership policies: migrations and server boundaries reviewed; adversarial live identity execution is `NOT AVAILABLE` without staging identities.
- Logs and optional integrations: reviewed for secret/content exposure; AI and Telegram remain optional.

## Web/PWA

The production client build, manifest generation, service-worker generation, server startup, health endpoint, and IndexedDB/local-first source paths pass available checks. Browser installation, offline relaunch, stale-cache update, responsive viewport execution, visual comparison, accessibility automation, and core Playwright journey execution are `NOT AVAILABLE` because this environment has no browser executable.

## Android

Capacitor configuration and Android project generation/synchronization pass. The production project uses application ID `com.mariusschober.goalflow` and application name `Goalflow`. The isolated test variant uses `com.mariusschober.goalflow.test`, is labeled `Goalflow Test`, accepts compile-time code `123456`, and stores data locally without production authentication or cloud synchronization. Both variants share the React/domain/storage implementation. Exact-tip GitHub Actions run `32825578193` built both artifacts:

- Production: `Goalflow-0.1.0-debug-final.apk`, SHA-256 `aca4553500fab5cc4a185ce83884aef7869cb90bc321273f0121ab5084cca3f5`
- Test: `Goalflow-Test-0.1.0-debug.apk`, SHA-256 `d0fc4fcefad18ccc6d35a9e0ad2f1c59b07578315a448f36acea75a63927ab42`

Local Gradle execution remains unavailable.

Local Gradle tests, lint, APK assembly, emulator/device smoke testing, lifecycle torture testing, and APK SHA-256 calculation are `NOT AVAILABLE` in this environment: the Android SDK and Gradle distribution are absent, and the generated Capacitor project requires JDK 21 while only Java 17 is present. CI is configured to build both `app-production-debug.apk` and `app-sandbox-debug.apk`. No private signing material was added.

## Clean-room verification

GitHub Actions run `32825578193` performed a fresh checkout of final implementation commit `f844ff29c44c2f8b505336a6665d27343ebe9b68`, installed from the committed lockfile, passed lint, tests, production build, dependency audit, startup/health, secret scan, Capacitor synchronization, Gradle tests, Android lint, production debug assembly, test-bundle synchronization, and sandbox debug assembly.

A true shell-side fresh clone could not be created because the shell has no credentials for this private repository. The GitHub Actions clean checkout is the available clean-room execution evidence.

## External blockers

- Private-repository shell credentials are unavailable, so the required local `git clone` clean-room procedure and local history secret scan cannot be executed directly.
- No browser executable is installed for browser-level E2E, visual, responsive, accessibility, PWA installation, and offline-relaunch tests.
- No Android SDK/emulator/device, Gradle distribution, or JDK 21 is available for local APK and lifecycle verification.
- No Supabase staging identities/credentials are available for live RLS, sync-chaos, or two-client convergence execution.
- No optional Telegram/AI provider credentials are available for live provider failure injection.

## Known defects

No known fixable P0–P2 defects remain after the verification procedures available in this environment. This report does not claim mathematical bug-freedom; the unavailable runtime/infrastructure checks remain explicit blockers.
