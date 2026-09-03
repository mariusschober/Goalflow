> **HISTORICAL SNAPSHOT — RELEASE NOT AUTHORIZED.** This report predates the
> beta reconciliation and is not evidence of a current signed or hosted build.



# Goalflow Release Report

> **2026-08-30 data-integrity follow-up:** The evidence below describes the
> earlier production baseline. A newer zero-silent-data-loss integration now
> sits on top of production commit `62d55195949782644ae09e82fa9b9437a69e7692`.
> Its local non-Android gate passes 102 tests, production builds/startup,
> secret scanning, and dependency audit. PostgreSQL execution, Room v7
> compilation, Android tests, and final clean GitHub CI are **NOT VERIFIED** at
> the time of this update. See [`DATA_INTEGRITY_REPORT.md`](../DATA_INTEGRITY_REPORT.md)
> and [`DATA_INTEGRITY_HANDOVER.md`](../DATA_INTEGRITY_HANDOVER.md). Do not use
> the older clean-CI claims below as proof for the follow-up tree.

Evidence for the `goalflow-production` release branch. This report records
what was actually exercised; unavailable infrastructure is not represented as
a pass.

## Release identity

- Starting SHA: `7fa5a17e2b8892df91c2b23c4e551b67031731db`
- Implementation/source SHA: `31697e2736fae17ee6dd81fefbc5d94ac65ea421`
- Exact clean-checkout evidence tip: `31697e2736fae17ee6dd81fefbc5d94ac65ea421`
- Final branch tip: the follow-on documentation evidence commit after the clean CI run below
- Branch: `goalflow-production`
- Web/Capacitor version: `0.1.0`
- Native Android version: `0.2.0-native` (`-sandbox` for the isolated test variant)
- Date: `2026-08-29`

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
| Native instrumentation APK compilation | PASS via clean CI |
| Native startup Macrobenchmark source/module compilation | PASS via clean CI (`:benchmark:assemble`); timing execution requires a device |
| Native Android lint | PASS via clean CI |
| Native `assembleProductionDebug` / `assembleProductionRelease` / `assembleSandboxDebug` | PASS via clean CI |
| Capacitor sync, Gradle tests, lint, production/test APK assembly | PASS via clean CI |
| Browser E2E, visual/accessibility runtime, PWA install/offline relaunch | NOT AVAILABLE — no browser executable |
| Android emulator/device, lifecycle, process-death, TalkBack, reduced-motion runtime tests | NOT AVAILABLE — no emulator/device |
| Live Supabase RLS, two-user sync chaos, and provider fault injection | NOT AVAILABLE — no staging identities/provider credentials |

The native test suite contains 44 deterministic JVM/Room/domain/sync/backup/
focus tests across seven test files. The instrumentation smoke test and startup
Macrobenchmark also compile in the native CI gate; their device execution is
not available in this environment. The web property suite checks scheduling,
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
available. Clean CI verified Capacitor sync, Gradle tests, lint, native tests, native
instrumentation compilation, Macrobenchmark source compilation, lint, and
native APK assembly. The native target manifest is profileable and includes
ProfileInstaller; no production signing material was added.

Artifact paths and GitHub Actions artifact digests are recorded from clean CI run
[33254691188](https://github.com/mariusschober/Goalflow/actions/runs/33254691188):

| Artifact | GitHub Actions artifact ID | Archive digest |
| --- | ---: | --- |
| Native production debug APK | `9715491423` | `sha256:e82a2a2478f270e3104319d3b46ece755208fe4829d378c112700ceaab8e3d1e` |
| Native sandbox debug APK | `9715591979` | `sha256:5324b98b453d9f4872f85036e3d2baff1b6515d6cd283fffd4bbcde79c1d28f4` |

The digest covers the GitHub Actions artifact ZIP; download the APK from the
linked run's artifact panel.

Local Gradle execution and emulator/device testing are NOT AVAILABLE in this
environment.

## Clean-room verification

GitHub Actions run `33254691188` performed a fresh checkout of evidence tip
`31697e2736fae17ee6dd81fefbc5d94ac65ea421`, installed from committed lockfiles,
ran web/security/migration checks, started the production server, synchronized
Capacitor, compiled the native instrumentation and Macrobenchmark source,
and built/tested/linted all Android variants. The run uploaded the two native
APK artifacts whose archive digests are listed above. A shell-side clone could
not be performed because credentials for the private repository are not exposed
in this environment; the GitHub-hosted clean checkout is the available
clean-room execution evidence.

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
