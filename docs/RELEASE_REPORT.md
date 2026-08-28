# Goalflow Release Report

Evidence for the `goalflow-production` release branch. This report records
what was actually exercised; unavailable infrastructure is not represented as
a pass.

## Release identity

- Starting SHA: `7fa5a17e2b8892df91c2b23c4e551b67031731db`
- Implementation/source SHA: `5e1c13c8c44c793410ade595fe6eb1533a70ddc4`
- Exact clean-checkout evidence tip: `35fd9d0d584c7865317a04c3437dd524d560c8b6`
- Final branch tip: the subsequent documentation-only evidence commit; the exact tip is recorded in the final handoff
- Branch: `goalflow-production`
- Web/Capacitor version: `0.1.0`
- Native Android version: `0.2.0-native` (`-sandbox` for the isolated test variant)
- Date: `2026-08-28`

## Product preservation

No intentional product-semantic changes. The native client preserves Current,
Planning, frogs, breakdown, local-day scheduling, goals, habits, circadian
logic, gamification, optional AI, optional Telegram, and the existing product
terminology. The web/PWA and Capacitor targets remain available; native Android
is a separate Compose client rather than a WebView main experience.

## Audit completeness

See [`docs/AUDIT_MANIFEST.md`](./AUDIT_MANIFEST.md). The current tracked tree
contains 235 first-party paths: 201 text/configuration/test/documentation paths
and 34 binary/static paths. First-party files identified: 235; reviewed: 235;
unreviewed relevant source/config/schema files: 0.

## Defects

| Severity | Discovered | Fixed | Remaining |
| --- | ---: | ---: | ---: |
| P0 | 0 | 0 | 0 |
| P1 | 8 | 8 | 0 |
| P2 | 8 | 8 | 0 |

The reviewed findings included storage ordering, backup atomicity and
validation, synchronization races, deterministic planning, duplicate habit
instances, date/time handling, API-origin configuration, Telegram validation,
modal focus stability, editor recovery, duplicate completion submission, and
native build/test defects. No known fixable P0-P2 defect remains within the
reviewed repository scope. This is not a claim that unknown defects are
impossible.

## Tests and verification

| Command or check | Result |
| --- | --- |
| `npm ci --cache /tmp/goalflow-npm-cache` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 9 files, 68 tests |
| Property/state-machine tests | PASS — 400 generated sequences; regression seed `-117028276` preserved |
| `npm run build` | PASS |
| `npm run verify:server` and `/api/v1/health` | PASS |
| `npm run verify:migrations` | PASS |
| `npm run test:migrations:postgres` | PASS via clean CI PostgreSQL service |
| `npm run verify:client-secrets` | PASS |
| `npm audit --audit-level=high` | PASS — 0 high/critical findings |
| Gitleaks repository scan | PASS via CI |
| Native Gradle JVM/Room/domain/sync/backup/focus tests | PASS via clean CI |
| Native Android lint | PASS via clean CI |
| Native `assembleProductionDebug` / `assembleProductionRelease` / `assembleSandboxDebug` | PASS via clean CI |
| Capacitor sync, Gradle tests, lint, production/test APK assembly | PASS via clean CI |
| Browser E2E, visual/accessibility runtime, PWA install/offline relaunch | NOT AVAILABLE — no browser executable |
| Android emulator/device, lifecycle, process-death, TalkBack, reduced-motion runtime tests | NOT AVAILABLE — no emulator/device |
| Live Supabase RLS, two-user sync chaos, and provider fault injection | NOT AVAILABLE — no staging identities/provider credentials |

The native test suite contains 41 deterministic JVM/Room/domain/sync/backup/
focus tests across seven test files. The web property suite checks scheduling,
planning order, completion, frog relationships, habit idempotency, local-day
formatting, storage rejection, and interrupted restore behavior.

## Data integrity

Available evidence covers reload/persistence, offline local mutations, queued
write/delete ordering, interrupted operations, encrypted backup export/clear/
restore, wrong password, tampered/truncated/corrupt backup rejection, schema
migration, sync acknowledgement validation, outbox dependency cycles, and
explicit local/cloud conflict handling. Live multi-client convergence and
device process-death execution are `NOT AVAILABLE` under the current
infrastructure.

## Security and privacy

- Threat model: [`docs/THREAT_MODEL.md`](./THREAT_MODEL.md), reviewed for web,
  Capacitor, native Android, API, database, backup, sync, AI, and Telegram.
- Dependency audit: PASS.
- Repository secret scan: PASS in CI.
- Client bundle secret scan: PASS; server/provider secrets are absent from
  built client output and native resources.
- RLS: migrations and server ownership boundaries reviewed; live identity tests
  are NOT AVAILABLE without staging identities.
- Logging: reviewed; task/goal content, prompts/responses, tokens, secrets,
  backup plaintext, and raw voice are not intentionally logged.

## Web/PWA

Production client/server build, startup, health, manifest, service-worker
generation, local-first source paths, migration checks, and client secret scan:
PASS. Browser-level installability, offline relaunch, responsive viewports,
visual comparison, accessibility automation, and Playwright E2E:
NOT AVAILABLE because no browser executable is installed.

## Android

The native target is Kotlin/Compose/Room/DataStore/WorkManager with production
authentication boundaries preserved. The native variants are:

- production debug: `com.mariusschober.goalflow.dev`
- production release: `com.mariusschober.goalflow`
- isolated sandbox debug: `com.mariusschober.goalflow.sandbox.dev`, label
  `Goalflow Test`, compile-time entry code `123456`

The existing Capacitor target and its isolated test build remain separately
available. Clean CI verified Capacitor sync, Gradle tests, lint, native tests,
lint, and native APK assembly. No production signing material was added.

Artifact paths and SHA-256 values are recorded after the exact final CI run:

| Artifact | Source | SHA-256 |
| --- | --- | --- |
| Native production debug APK | `goalflow-native-production-debug-apk` | `f3e276df1fab386d3a59bfb77892fe6e10d1ae5994f29eaa75fd5eff2791d076` |
| Native sandbox debug APK | `goalflow-native-sandbox-debug-apk` | `19de56db7f477dbd42b26cb607502af73cabe419dff9004a50851252368d0a7c` |

Local Gradle execution and emulator/device testing are NOT AVAILABLE in this
environment.

## Clean-room verification

GitHub Actions run `33189348602` performed a fresh checkout of evidence tip
`35fd9d0d584c7865317a04c3437dd524d560c8b6`, installed
from committed lockfiles, runs web/security/migration checks, starts the
production server, synchronizes Capacitor, and builds/tests/lints both Android
targets. The run uploaded the two native APKs whose SHA-256 values are listed
above. A shell-side clone could not be performed because credentials for the
private repository are not exposed in this environment; the GitHub-hosted
clean checkout is the available clean-room execution evidence.

## External blockers

- No browser executable for browser-level E2E/PWA runtime checks.
- No Android SDK emulator/device for lifecycle, accessibility, and process-death checks.
- No local Gradle distribution/JDK 21 combination; native CI is available.
- No Supabase staging identities for live RLS or sync-chaos tests.
- No optional Telegram/AI provider credentials for live fault injection.
- No shell Git credentials for an independent local clone.

## Known defects

No known fixable P0-P2 defects remain after the available verification
procedures. The runtime and live-infrastructure limitations above remain
explicit `NOT AVAILABLE` checks.
