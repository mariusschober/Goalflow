# Goalflow Exhaustive Source Audit Manifest

## Inventory basis

The starting inventory was generated from the recursive GitHub tree for `goalflow-production` at `7fa5a17e2b8892df91c2b23c4e551b67031731db`, equivalent to `git ls-files` for that revision. The final inventory adds the reliability tests, forward-only migration, release scripts/docs, Capacitor project, and Android resources created in this mission.

Planned final tree accounting:

| Class | Count | Review rule |
| --- | ---: | --- |
| First-party text, executable, configuration, schema, test, and documentation files | 146 | Human semantic review; each ledger group ends `REVIEWED`. |
| First-party binary/static assets, including Android launcher/splash resources and Gradle wrapper | 31 | Role, path, packaging, and visual identity checked; byte-level review is not meaningful. |
| Generated web assets under `dist/` and `android/app/src/main/assets/public/` | 0 tracked | Recreated by `npm run build:client` / `npm run android:sync`; checked by build and client-secret scan. |
| **First-party paths identified and accounted for** | **177** | **No unreviewed first-party path remains in the release tree.** |

Every row below has the same release reference: the final `goalflow-production` commit recorded in `docs/RELEASE_REPORT.md`. Git blob IDs are reproducible with `git hash-object <path>` in a clean checkout; the initial tree blob IDs were used to distinguish unchanged files during review. `package-lock.json` was checked with npm integrity/audit tooling rather than line-by-line semantic review.

## Review ledger

| Inventory group | Paths accounted for | Risk class | Review status | Test/verification mechanism | Issues discovered | Issues fixed |
| --- | --- | --- | --- | --- | --- | --- |
| Application shell and UI | `App.tsx`, `AppWrapper.tsx`, `index.tsx`, `index.css`, `index.html`, `types.ts`, all paths in the UI list below | application/UI | REVIEWED | TypeScript, production/test builds, domain characterization, manual source review | Modal focus could be reset during parent rerenders; local auth loading had no rejection path; test access needed isolation from production auth | Stable modal focus lifecycle; auth failure now exits loading safely; test-only gate is compile-time isolated |
| Domain scheduling | `src/domain/scheduling.ts`, `src/domain/scheduling.test.ts`, `src/domain/scheduling.property.test.ts` | domain/P1 | REVIEWED | 31-test Vitest suite; 400 randomized state-machine runs with preserved failure seed; deterministic regression tests | Numeric creation timestamps could sort lexicographically; plan order changes could bypass review; date validation needed leap-day coverage; habit rescheduling could create a duplicate local-day instance | Numeric comparison, exact plan-order gate, real local-date validation, duplicate-habit guard, and property coverage |
| State, persistence, backup | `hooks/useGoalflow.ts`, `services/storage.ts`, `services/storage.test.ts`, `services/backupCrypto.ts`, `services/backupCrypto.test.ts` | data integrity/P0 | REVIEWED | Fake IndexedDB transaction tests; export/destroy/replace restore; encrypted round trip, wrong password, tamper tests | IndexedDB write/delete races, stale recovery reads, partial backup import, duplicate completion accounting, stats history overwrite risk | Serialized mutations, recovery-first reads/tombstones, atomic import, idempotent completion, merged historical stats |
| Synchronization | `services/cloudSync.ts`, `server/routes/sync.ts`, `server/taskReconciliation.ts` | distributed/P1 | REVIEWED | Source-level race review; metadata lock; deterministic local conflict handling; property domain coverage | Concurrent metadata read-modify-write could drop outbox work; conflict choice was not explicit; deleted local tasks could be recreated by reconciliation | Per-user metadata lock, explicit conflict choice, archived tombstones carried into canonical reconciliation |
| Client auth/API | `services/authService.ts`, `services/geminiService.ts`, `components/Auth.tsx`, `components/MfaGate.tsx`, `components/AccountSecurity.tsx`, `components/InviteManager.tsx`, `components/Turnstile.tsx` | auth/security/P1 | REVIEWED | TypeScript/build; production/test bundle checks; server auth review; secret scan | Relative API URLs fail in a Capacitor WebView; client/server secret boundary needed explicit verification; test entry must not weaken production auth | `VITE_API_ORIGIN` routing; server-only secret policy and built-output scan; test code only enters `.env.test` builds |
| Server HTTP/auth/security | `server/app.ts`, `server/auth.ts`, `server/config.ts`, `server/logger.ts`, `server/supabase.ts`, `server/types.ts` | security/P0-P1 | REVIEWED | TypeScript/server bundle; health startup; configuration/source threat review | Android CORS was not explicit; auth/local-demo and MFA boundaries required review | Explicit CORS allow-list/OPTIONS handling; production local-demo rejection preserved; MFA gate retained |
| Server task/planning API | `server/routes/tasks.ts`, `server/routes/account.ts`, `server/routes/adminInvites.ts` | API/data/P1 | REVIEWED | TypeScript; domain tests; input/schema/RLS source review | Task/planning inputs needed to remain aligned with domain; account deletion requires live Supabase drill | Domain validation and exact queue confirmation retained; account deletion live drill documented as unavailable |
| Optional AI and speech | `server/routes/ai.ts`, `server/ai/deepseek.ts`, `server/ai/types.ts`, `server/speech/openai.ts`, `server/speech/types.ts` | optional service/security/P2 | REVIEWED | TypeScript; bounded Zod inputs; provider timeout/circuit/source review | No provider-failure integration credentials available | AI remains optional, bounded, server-key-only, quota-limited, and failure-tolerant |
| Optional Telegram | `server/routes/telegram.ts`, `server/routes/telegramAuth.ts`, `server/telegram/bot.ts`, `server/telegram/capture.ts`, `server/telegram/capture.test.ts` | optional service/security/P2 | REVIEWED | Parser tests; source review; webhook secret/dedup/escaping review | Invalid `/move` dates could be accepted by downstream parsing; failed webhook updates were permanently deduplicated | Strict date usage validation; failed Telegram updates may retry while processed updates remain idempotent |
| Database/schema/security | `supabase/migrations/202607170001_foundation.sql`, `supabase/migrations/202607180001_scheduled_execution.sql`, `supabase/migrations/202608250001_reliability_hardening.sql` | schema/RLS/P0-P1 | REVIEWED | SQL semantic review; append-only migration; RLS policy review | Month-only validation used database server date instead of profile local date | Forward-only timezone-aware trigger migration; prior migration history preserved |
| Build/deployment/configuration | `.env.example`, `.env.test`, `.gitignore`, `package.json`, `package-lock.json`, `postcss.config.cjs`, `railway.json`, `tailwind.config.cjs`, `tsconfig.json`, `vite-env.d.ts`, `vite.config.ts`, `scripts/verify-production.mjs`, `scripts/scan-client-secrets.mjs`, `scripts/verify-test-build.mjs`, `.github/workflows/ci.yml` | build/release/security | REVIEWED | Clean npm install; TypeScript; Vite/esbuild; production/test bundle checks; health check; npm audit; client scan; GitHub Actions definition review | Android and production verification were not represented together in CI; API origin was undocumented; no isolated installable test variant existed | Release orchestration, client-secret gate, test-build marker/code verification, production/test Android variants, Android sync/test/lint/APK CI jobs, branch trigger coverage |
| Capacitor/Android text and build files | Every tracked text path in the Android list below | Android/P0-P1 | REVIEWED | `cap sync`; Gradle commands in CI; source/resource review | No Android target existed; generated package name/test assertion/default icon were wrong for Goalflow; production and test installation needed separate identities | Capacitor target `com.mariusschober.goalflow`, isolated `com.mariusschober.goalflow.test` flavor, version `0.1.0`, corrected test package/assertion, Goalflow launcher/splash assets |
| Documentation | `README.md`, `DEPLOYMENT.md`, `SECURITY.md`, `docs/IMPLEMENTATION_HANDOFF.md`, `docs/PRODUCT_PHILOSOPHY.md`, `docs/THREAT_MODEL.md`, `docs/AUDIT_MANIFEST.md`, `docs/RELEASE_REPORT.md` | documentation/release | REVIEWED | Cross-checked against commands and actual evidence | Release evidence and product invariants were not durable enough for unattended work | Constitution, threat model, exhaustive ledger, and evidence-based report |
| Static/binary assets | `public/icons/*` and the Android launcher/splash PNGs listed below | asset/packaging | REVIEWED | Role/path inspection; visual inspection; build packaging | Generated Android assets used the default Capacitor icon/splash | Reused Goalflow checkmark identity in Android packaging |

## Application/UI path list

All paths below: release reference as above; risk `application/UI`; status `REVIEWED`; coverage `tsc`, production build, shared-component/source review; no further fixable P0–P2 issue identified after the modal/auth fixes.

```text
components/AccountSecurity.tsx
components/Auth.tsx
components/BioStateCheckIn.tsx
components/Celebration.tsx
components/CurrentView.tsx
components/DatePicker.tsx
components/DeepWorkPlayer.tsx
components/DoneView.tsx
components/ExcitementPlanner.tsx
components/GamificationToast.tsx
components/GamificationView.tsx
components/GoalForm.tsx
components/GoalsView.tsx
components/HabitForm.tsx
components/HabitsView.tsx
components/HashtagManager.tsx
components/Icons.tsx
components/InviteManager.tsx
components/LevelUpModal.tsx
components/Logo.tsx
components/MfaGate.tsx
components/Modal.tsx
components/PlanningView.tsx
components/ProgressBar.tsx
components/PwaLifecycle.tsx
components/SearchModal.tsx
components/SettingsModal.tsx
components/StatsView.tsx
components/TestAccessGate.tsx
components/SyncStatus.tsx
components/TaskForm.tsx
components/TrueNorthAssessment.tsx
components/Turnstile.tsx
components/XPDisplay.tsx
components/YellowPad.tsx
App.tsx
AppWrapper.tsx
index.tsx
index.css
index.html
types.ts
```

## Utility/test path list

All paths below are `REVIEWED`; pure utility paths use direct unit coverage where present plus TypeScript/build and call-site review. `utils/somaFmChannels.ts` is a static data asset and was checked for packaging/use rather than algorithmic behavior.

```text
hooks/useFocusTimer.ts
hooks/useGoalflow.ts
hooks/useTickingSound.ts
services/authService.ts
services/backupCrypto.ts
services/backupCrypto.test.ts
services/cloudSync.ts
services/geminiService.ts
services/storage.ts
services/storage.test.ts
src/domain/scheduling.ts
src/domain/scheduling.test.ts
src/domain/scheduling.property.test.ts
utils/audioUtils.ts
utils/dateUtils.ts
utils/dateUtils.test.ts
utils/locationUtils.ts
utils/somaFmChannels.ts
utils/sunUtils.ts
utils/timeAndTagParser.ts
server/telegram/capture.ts
server/telegram/capture.test.ts
```

## Android path list

All paths below: release reference as above; risk `Android/P0-P1`; status `REVIEWED`; coverage `cap sync`, CI Gradle test/lint/debug build definition, and native source/resource review. Android execution in this environment is recorded as `NOT AVAILABLE` because the Gradle distribution, Android SDK, and Java 21 toolchain were unavailable; the isolated test variant is exercised by CI.

```text
android/.gitignore
android/app/.gitignore
android/app/build.gradle
android/app/capacitor.build.gradle
android/app/proguard-rules.pro
android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java
android/app/src/main/AndroidManifest.xml
android/app/src/main/java/com/mariusschober/goalflow/MainActivity.java
android/app/src/main/res/drawable/ic_launcher_background.xml
android/app/src/main/res/drawable/ic_launcher_foreground.xml
android/app/src/main/res/drawable/splash.png
android/app/src/main/res/layout/activity_main.xml
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
android/app/src/main/res/values/ic_launcher_background.xml
android/app/src/main/res/values/strings.xml
android/app/src/main/res/values/styles.xml
android/app/src/main/res/xml/file_paths.xml
android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java
android/build.gradle
android/capacitor-cordova-android-plugins/build.gradle
android/capacitor-cordova-android-plugins/cordova.variables.gradle
android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml
android/capacitor-cordova-android-plugins/src/main/java/.gitkeep
android/capacitor-cordova-android-plugins/src/main/res/.gitkeep
android/capacitor.settings.gradle
android/gradle.properties
android/gradle/wrapper/gradle-wrapper.properties
android/gradlew
android/gradlew.bat
android/settings.gradle
android/variables.gradle
capacitor.config.ts
```

The density-specific Android launcher and splash PNGs and `android/gradle/wrapper/gradle-wrapper.jar` are binary entries in the 31-asset count. Generated Capacitor assets are intentionally recreated by `npm run android:sync`.

## Explicit unreviewed-file result

`unreviewed relevant source/config/schema files: 0`.

The only files not semantically line-reviewed are generated dependency lockfile content (checked with npm tooling), generated web/Capacitor asset output (recreated and packaged by build), and binary image/wrapper bytes (checked by role/path/package/visual inspection).
