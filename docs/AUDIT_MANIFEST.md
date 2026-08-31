> **HISTORICAL — 2026-08-31 Reconciliation:** This document is preserved as historical context. The authoritative status is now `docs/CANONICAL_STATUS.md` and `docs/reconciliation/BRANCH_MANIFEST_20260831.md`. Content below is unchanged; do not treat as current gate.



# Goalflow source audit manifest

## Inventory basis

The release inventory is the recursive Git tree at the implementation SHA in
`docs/RELEASE_REPORT.md` (equivalent to `git ls-tree -r --name-only <sha>`).
The current tree contains:

| Class | Count | Review status |
| --- | ---: | --- |
| First-party text, executable, configuration, schema, test, and documentation files | 201 | REVIEWED |
| First-party binary/static assets and Gradle wrapper archives | 34 | REVIEWED by role, path, packaging, and checksum where produced |
| **First-party paths identified and accounted for** | **235** | **REVIEWED** |
| Unreviewed relevant source/config/schema files | **0** | **REVIEWED** |

Generated `dist/` output and generated Capacitor assets are not tracked source;
they are recreated by the build and checked by the release jobs. The native
client is tracked under `android-native/`; the existing Capacitor target is
tracked under `android/`.

## Disjoint inventory ledger

The counts below partition the 235 tracked paths. Every row is reviewed against
the verification mechanism shown.

| Scope | Count | Paths | Verification | Status |
| --- | ---: | --- | --- | --- |
| Web client and shared product logic | 64 | `App.tsx`, `AppWrapper.tsx`, `index*`, `types.ts`, `components/`, `hooks/`, `services/`, `src/`, `utils/` | TypeScript, Vitest, property tests, production build, source review | REVIEWED |
| Server, auth, optional providers, and API routes | 24 | `server/` | TypeScript, health startup, route/provider/source review | REVIEWED |
| Root build/deployment configuration | 17 | `.env*`, `.gitignore`, `README.md`, `DEPLOYMENT.md`, `SECURITY.md`, `Start Goalflow.command`, `package*.json`, Vite/Tailwind/PostCSS/TypeScript/Railway/Capacitor config | clean install, build, audit, secret scan, startup | REVIEWED |
| Database migrations | 4 | `supabase/migrations/` | migration verification and Postgres migration tests | REVIEWED |
| Release and migration scripts | 9 | `scripts/` | script execution where infrastructure exists; source review otherwise | REVIEWED |
| Durable engineering documentation | 6 | `docs/` | cross-checked with current commands, source, and CI evidence | REVIEWED |
| Web/PWA static assets | 6 | `public/icons/` | packaging and client bundle inspection | REVIEWED |
| Capacitor Android target | 58 | `android/` | Capacitor sync, Gradle tests, lint, production/test APK assembly in CI | REVIEWED |
| Native Android target | 47 | `android-native/` | native unit tests, lint, production/sandbox APK assembly in CI, Kotlin/Compose/Room/source review | REVIEWED |

## Native Android ledger

All 47 paths under `android-native/` are accounted for. The risk groups are:

- app/build and manifests: `build.gradle`, `settings.gradle`, root Gradle
  properties/wrapper scripts, `app/build.gradle`, ProGuard, and the manifest;
- application shell: `GoalflowApplication.kt`, `MainActivity.kt`, and
  `ui/GoalflowRoot.kt`, `ui/GoalflowTheme.kt`,
  `ui/GoalflowViewModel.kt`, `ui/NativeSecondaryScreens.kt`;
- domain/data: `domain/GoalflowDomain.kt`, all `data/*.kt`, Room migrations,
  encrypted backup parsing, and JSON preservation;
- sync/auth: all `sync/*.kt`, Keystore session storage, WorkManager scheduling,
  strict push/pull acknowledgement validation, and explicit conflicts;
- resources: main/sandbox labels, light/dark system themes, colors, launcher
  vectors, and adaptive-icon XML;
- tests: 41 JVM/Room/sync/domain/backup/focus tests across seven test files.

The native surface was reviewed for Current, Planning, capture, completion,
focus, breakdown, frogs, habits, Goals, True North, Insights, circadian
check-in, backup/restore, sign-in, sync conflict handling, Android share and
launcher capture, keyboard-safe sheets, duplicate-submit protection, and
failure-preserving editor state.

## Binary/static ledger

The 34 binary/static paths are the two Gradle wrapper JARs, Capacitor splash and
launcher PNGs, PWA icon PNGs, and PWA SVG icon assets. They were checked for
expected location, packaging role, and Goalflow visual identity. Produced APK
hashes are recorded in the release report; generated build output is not
treated as source.

## Review findings

The review covered data integrity, scheduling, planning gates, completion,
offline local state, backup validation and atomic restore, sync ordering and
conflicts, authentication boundaries, secret exposure, optional AI/Telegram
failure behavior, web/PWA build behavior, Capacitor packaging, and native
Android lifecycle-sensitive code. Fixes are committed separately and tested
before the release evidence tip.

Intentional test/runtime limitations are recorded as `NOT AVAILABLE` in
`docs/RELEASE_REPORT.md`; they are not counted as reviewed source defects.
