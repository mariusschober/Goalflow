# Goalflow

Goalflow is an offline-capable productivity PWA built around one rule: plan deliberately, then execute exactly one task. Every task belongs to an exact local day or a future month. There are no projects and no unscheduled tasks.

The application retains the complete Goalflow experience: Current, daily and monthly planning, habits, frogs, timer and Pomodoro flow, focus music, circadian planning, goals, True North, Reality Navigator, Transurfing, insights, subtle gamification, and provider-neutral AI workflows.

## Architecture

- React, Vite, Tailwind, IndexedDB, and a service worker provide the installable offline PWA.
- Express serves the PWA, authenticated APIs, Telegram webhook, synchronization, and AI proxy.
- Supabase provides Telegram OIDC and email auth, Postgres with Row-Level Security, and private encrypted backup storage.
- One pure scheduling domain in `src/domain/scheduling.ts` defines schedule validation, planning gates, queue precedence, skip, frog promotion, breakdown, and habit generation.
- Telegram uses the same task and queue rules for text, voice, and command capture.

## Local development

Requirements: Node.js 22 and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Use `VITE_ENABLE_LOCAL_DEMO=true` and `ENABLE_LOCAL_DEMO=true` only for local interface work. Production rejects the demo token.

## Local-only Mac use

Double-click `Start Goalflow.command`, or run:

```bash
npm run local
```

The local configuration binds Goalflow to `127.0.0.1`, bypasses cloud authentication, and stores application data in this browser profile's IndexedDB. Supabase, Railway, Telegram, SMTP, CAPTCHA, and hosting are not required. Use Settings > Sync & Backup to create password-protected `.goalflow-backup` files.

AI is optional. To enable it, add `DEEPSEEK_API_KEY=...` to the ignored `.env.local` file and restart Goalflow. The key stays in the local server process and is never placed in the browser bundle.

## Quality checks

```bash
npm run lint
npm test
npm run build
npm run verify:server
npm run verify:client-secrets
npm audit --audit-level=high
npm run verify:release
npm run verify:test-build
```

The production server listens on `PORT` and exposes `/api/v1/health`. Client and server bundles are separated under `dist/client` and `dist/server`; production source maps are disabled.

## Android

Goalflow has a native Kotlin/Compose client in `android-native/` and retains
the Capacitor target in `android/` as a compatibility delivery. The native
client is the recommended Android experience: it uses Room, native Compose
surfaces, Android lifecycle handling, and a durable local outbox. Install
Android Studio or the Android SDK, Java 21, and accept the SDK licenses before
running:

```bash
./android-native/gradlew -p android-native test
./android-native/gradlew -p android-native lint
./android-native/gradlew -p android-native assembleProductionDebug
```

The native production debug APK is produced under
`android-native/app/build/outputs/apk/production/debug/`. The native release
variant is unsigned unless signing is supplied outside the repository.

For the existing Capacitor target, run:

```bash
npm run android:sync
npm run android:test
npm run android:lint
npm run android:assembleDebug
```

The production debug APK is produced at `android/app/build/outputs/apk/production/debug/app-production-debug.apk`. For cloud features in a packaged build, set the public API origin at build time, for example `VITE_API_ORIGIN=https://goalflow.example npm run android:sync`; local task execution remains available without a backend. Do not put credentials in `VITE_` variables. Release signing is intentionally not committed.

To build the separate local test app, which accepts `123456` and uses a distinct Android application ID:

```bash
npm run android:sync:test
npm run android:assembleTestDebug
```

The test APK is produced at `android/app/build/outputs/apk/sandbox/debug/app-sandbox-debug.apk`. It is labeled `Goalflow Test`, uses `com.mariusschober.goalflow.test`, and never enables production authentication or cloud synchronization.

The separate native sandbox test app is built with:

```bash
./android-native/gradlew -p android-native assembleSandboxDebug
```

It is labeled `Goalflow Test`, uses
`com.mariusschober.goalflow.sandbox.dev`, and accepts the isolated entry code
`123456`. Native and Capacitor test packages are separate installations.

## Production setup

Follow [DEPLOYMENT.md](./DEPLOYMENT.md). Apply the Supabase migrations in order, provision Telegram OIDC and the bot webhook, set every Railway secret, bootstrap the owner through the verified `mris@tuta.io` magic link, and enroll TOTP before using owner APIs.

This release is a free invite beta. Entitlements grant the complete feature set and no payment code is present.

For a detailed record of the production rewrite, verification status, and remaining
launch work, see [docs/IMPLEMENTATION_HANDOFF.md](./docs/IMPLEMENTATION_HANDOFF.md).
