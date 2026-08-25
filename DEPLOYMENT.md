# Goalflow Deployment Runbook

## 1. Supabase

1. Create separate development, staging, and production projects.
2. Disable public email signup. Configure the production Site URL and allowed redirect URLs.
3. Apply `supabase/migrations/202607170001_foundation.sql`, then `202607180001_scheduled_execution.sql`, then every later forward-only migration such as `202608250001_reliability_hardening.sql`.
4. Configure Telegram as a Custom OIDC provider with identifier `custom:telegram`, issuer `https://oauth.telegram.org`, PKCE enabled, scopes `openid profile telegram:bot_access`, and the provider setting `email_optional=true`. Use the callback URL shown by Supabase in BotFather's allowed URLs.
5. Configure Resend as custom SMTP for owner magic links, recovery-email confirmation, and auth recovery.
6. Confirm every application table has RLS enabled. The service-role key belongs only in Railway.
7. Upgrade to a non-pausing Supabase plan before reliability-sensitive beta use.

## 2. Telegram

1. Create one branded bot with BotFather and set its public username.
2. Configure the OIDC provider to request bot access for that bot. Enable Supabase manual identity linking so the email-bootstrapped owner can connect Telegram from Account & Security.
3. Generate a random webhook secret of at least 32 characters.
4. After Railway has a stable HTTPS URL, register `<APP_ORIGIN>/api/v1/telegram/webhook` with Telegram and send the secret as `secret_token`.
5. Configure commands: `current`, `today`, `add`, `done`, `skip`, `move`, and `help`.

The webhook verifies `X-Telegram-Bot-Api-Secret-Token`, deduplicates update IDs, rate-limits requests, bounds voice files, transcribes in memory, and does not retain audio.

## 3. Railway

Connect the GitHub repository and use `railway.json`. Configure every applicable variable from `.env.example`. Required production secrets are Supabase URL/keys, Telegram credentials, owner email, and the 32-byte backup key. AI and voice remain unavailable until their server keys are configured.

Generate the backup key with a password manager or a cryptographic random-byte tool. Store it outside Supabase as well; encrypted snapshots cannot be restored without it.

Set both browser-safe Supabase variables and server variables. Set Turnstile site and secret keys together. Never put service-role, bot, AI, OpenAI, or backup keys in any `VITE_` variable.

## 4. Owner and beta activation

1. Create and verify `mris@tuta.io` once in Supabase Auth administration, then sign in through the owner magic-link flow. Browser magic links never create users.
2. Open Settings, add a recovery email if needed, and enroll an authenticator. Reauthenticate to confirm an `aal2` session.
3. Create a beta code in Settings. Its plaintext is displayed once; only its SHA-256 hash is stored.
4. Test Telegram signup with a separate account. Reusing or using an expired/revoked code must fail.

## 5. Launch gates

- CI passes TypeScript, unit/property tests, client/server builds, production startup, dependency audit, client secret scanning, and the Android Gradle test/lint/debug-APK job.
- Install and update work in Chrome and Safari; iOS safe areas and offline shell are verified.
- Current remains unavailable until overdue work is resolved and today's order is confirmed.
- Two devices can edit offline, reconnect, synchronize, and review a conflict without either version disappearing.
- Telegram text and voice capture create correctly scheduled tasks; voice audio is absent after processing.
- Every original Goalflow module is accessible and AI consent is off by default.
- Run an encrypted export/restore preview and a server snapshot restore drill before owner launch.

## 6. Reproducible release commands

From a clean checkout:

```bash
npm ci
npm run verify:release
npm run android:sync
npm run android:test
npm run android:lint
npm run android:assembleDebug
```

`verify:release` runs TypeScript, the full Vitest suite including property tests, production web/server builds, a production health check, the client secret scan, and the high-severity dependency audit. Android builds need Java 21 and a working Android SDK; the CI Android job exercises the production and isolated test variants and uploads both debug APKs.

The isolated test variant is built with `npm run android:sync:test` and `npm run android:assembleTestDebug`. It accepts only the compile-time test code `123456`, uses the application ID `com.mariusschober.goalflow.test`, stores data locally, and must never be used as a production authentication path.

## 7. Restore drill

Quarterly, select a recent object from the private `goalflow-backups` bucket, decrypt it offline with the separately held `BACKUP_MASTER_KEY`, verify the embedded SHA-256 checksum against `backup_metadata`, and restore into staging. Confirm tasks, habits, goals, advanced-module sync records, daily plans, and current-task order before recording the drill as successful.

Do not restore auth sessions, passwords, MFA secrets, invite plaintext, deployment secrets, AI keys, or raw Telegram voice data; these are intentionally absent.
