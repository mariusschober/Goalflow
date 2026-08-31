# Goalflow — Accounts & API Keys for Final Production Run

**Branch:** `goalflow-production` at `3b510ca` (T1 closure verified, 2026-08-30)  
**Next:** Tranche 2 (auth & sync) → 3 (release engineering) → 4 (a11y/perf) → 5 (RC proof) per `docs/PRODUCTION_FINALIZATION_PLAN.md`  
**Do not put service-role, bot, AI, or backup keys in any `VITE_` variable.**

This checklist is the exact set of external accounts and secrets the owner must provision before the next hosted final run can be fully green. Nothing in this list requires code changes; all values are injected via environment.

## 1. GitHub (already configured)

- **Account:** `mariusschober/Goalflow` (private)
- **Branch:** `goalflow-production` is authoritative; `main` is not used for release.
- **CI:** `.github/workflows/ci.yml` runs `verify` (node 22, `npm ci`, `lint`, `test` 102, `build`, `verify:migrations`, `audit`, startup), `secrets` (gitleaks), `migrations` (Postgres 16 + `test:migrations:postgres`), `android` (Capacitor), `native-android` (JDK 21, `test`, `assembleProductionDebugAndroidTest`, APK `diagnose-apk.sh`, emulator `connectedProductionDebugAndroidTest`). Billing must be active — run `33335119616` was blocked by `recent account payments have failed`.
- **What to provide:** ensure GitHub Actions billing/limit is cleared; no new key needed.

## 2. Supabase (required for Tranche 2–3)

- **Where:** https://supabase.com/dashboard — create **separate** `development`, `staging`, `production` projects (free-tier will pause; upgrade to non-pausing plan before beta per `DEPLOYMENT.md:1.7`).
- **Keys to copy (Project Settings → API):**
  - `SUPABASE_URL` → `https://<project-ref>.supabase.co`
  - `SUPABASE_ANON_KEY` (anon public)
  - `SUPABASE_SERVICE_ROLE_KEY` (service_role — **never** in `VITE_`, only Railway server)
  - `VITE_SUPABASE_URL` = same as `SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` = same as anon
  - Database password (for `psql`/migrations) and project ref
- **Migrations to apply (in order, forward-only):** `supabase/migrations/202607170001_foundation.sql`, `202607180001_scheduled_execution.sql`, `202608250001_reliability_hardening.sql`, `202608260001_zero_silent_data_loss.sql` (now fixed at `425f659`), `202608290001_native_task_events.sql`, `202608300001_complete_native_sync_transport.sql`. Use `scripts/test-postgres-migrations.sh` locally; CI uses Postgres 16 service.
- **Auth config (Supabase Dashboard → Auth):**
  - Disable public email signup; set Site URL = `APP_ORIGIN` (e.g., `https://goalflow.example`), add `APP_ORIGIN` and `https://localhost,capacitor://localhost` to allowed redirects/CORS.
  - Add Custom OIDC provider `custom:telegram` (issuer `https://oauth.telegram.org`, PKCE enabled, scopes `openid profile telegram:bot_access`, `email_optional=true`). Callback URL shown by Supabase must be added to BotFather's allowed URLs.
  - Configure Resend as Custom SMTP (for `mris@tuta.io` magic links, recovery email, `aal2`).
  - Confirm every table has RLS enabled; service_role only in Railway.

## 3. Telegram (required for Tranche 2)

- **Where:** BotFather in Telegram (`@BotFather` → `/newbot`), Supabase OIDC, Railway.
- **Steps:**
  1. Create one branded bot, note `TELEGRAM_BOT_USERNAME` (without `@`).
  2. Copy `TELEGRAM_BOT_TOKEN` (from BotFather).
  3. Generate a random webhook secret ≥32 chars → `TELEGRAM_WEBHOOK_SECRET`.
  4. After Railway has a stable HTTPS `APP_ORIGIN`, register webhook: `https://api.telegram.org/bot<token>/setWebhook?url=<APP_ORIGIN>/api/v1/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>`
  5. In Supabase, set OIDC provider `custom:telegram` to request `telegram:bot_access` for that bot; enable manual identity linking so `mris@tuta.io` can link Telegram from Account & Security.
  6. Set `TELEGRAM_OIDC_PROVIDER_ID=custom:telegram` (both server and `VITE_`).
- **Env:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_OIDC_PROVIDER_ID`
- **Behavior:** webhook verifies `X-Telegram-Bot-Api-Secret-Token`, deduplicates `update_id`, rate-limits, bounds voice files, transcribes in-memory via OpenAI, does not retain audio.

## 4. Cloudflare Turnstile (required for Tranche 2)

- **Where:** https://dash.cloudflare.com → Turnstile → Add site (use `APP_ORIGIN` domain).
- **Keys:** `VITE_TURNSTILE_SITE_KEY` (public, browser) + `TURNSTILE_SECRET_KEY` (server, Railway only). Must be set as a pair; never put secret in `VITE_`.

## 5. Resend SMTP (required for owner magic link)

- **Where:** https://resend.com → API Keys + Domains → verify your domain (add DNS).
- **Keys:** SMTP host/user/pass or API key configured as Supabase Custom SMTP. No env in Goalflow repo; configured in Supabase dashboard.

## 6. Railway (required for hosting)

- **Where:** https://railway.app → New Project → Deploy from GitHub `mariusschober/Goalflow`, branch `goalflow-production`, using `railway.json` (`npm ci && npm run build` → `npm start`, healthcheck `/api/v1/health`).
- **Env to set in Railway (from `.env.example`):** `NODE_ENV=production`, `HOST`, `PORT`, `APP_ORIGIN` (your `https://...up.railway.app` or custom domain), `CORS_ORIGINS`, `OWNER_EMAIL=mris@tuta.io`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_ORIGIN` (same as `APP_ORIGIN`), `VITE_TELEGRAM_OIDC_PROVIDER_ID`, `VITE_OWNER_EMAIL`, `VITE_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `BACKUP_MASTER_KEY` (32 random bytes, base64 — generate via `openssl rand -base64 32` — store **outside** Supabase; snapshots cannot be restored without it), `BACKUP_HOUR_UTC`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_OIDC_PROVIDER_ID`, `DEEPSEEK_API_KEY`/`DEEPSEEK_API_BASE`/`DEEPSEEK_MODEL`, `OPENAI_API_KEY`/`OPENAI_API_BASE`/`OPENAI_TRANSCRIPTION_MODEL`, `TELEGRAM_MAX_VOICE_BYTES`, `LOG_LEVEL`. **Do not set `VITE_` for service_role/bot/AI/backup.**
- **After deploy:** copy the stable `APP_ORIGIN` back to Supabase (Site URL, OIDC callback, Turnstile, BotFather webhook).

## 7. AI / Voice (optional for Tranche 2, required for full product)

- **DeepSeek:** https://platform.deepseek.com → API Keys → `DEEPSEEK_API_KEY` (for task breakdown). Env `DEEPSEEK_API_BASE=https://api.deepseek.com`, `DEEPSEEK_MODEL`, limits `AI_OWNER_DAILY_LIMIT`, `AI_BETA_DAILY_LIMIT`, `AI_GLOBAL_DAILY_LIMIT`.
- **OpenAI:** https://platform.openai.com → API Keys → `OPENAI_API_KEY` (for `gpt-4o-mini-transcribe` voice). Env `OPENAI_API_BASE`, `OPENAI_TRANSCRIPTION_MODEL`, `TELEGRAM_MAX_VOICE_BYTES=19000000`. Audio is transcribed in-memory and discarded.
- **If not configured:** AI and voice remain unavailable (gated by server keys) but core PWA/native task execution stays local.

## 8. Android Release Signing (Tranche 3 only)

- **Where:** Local `keytool`/`apksigner` — **never** commit the keystore.
- **Generate (once, offline):** `keytool -genkeypair -keystore goalflow-release.keystore -alias goalflow -keyalg RSA -keysize 4096 -validity 10000`
- **Provide to next run via environment/CI secrets (not repo):** `ANDROID_KEYSTORE_BASE64` (base64 of keystore), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The repo intentionally has no `signingConfigs` with credentials; Tranche 3 will add verification and AAB/raw delivery.

## 9. Google Play Console (Tranche 3)

- **Where:** https://play.google.com/console — create app `com.mariusschober.goalflow` (and `com.mariusschober.goalflow.test` for sandbox).
- **Provide:** Play Console service account JSON for AAB upload (stored as Railway/GitHub secret, not repo).

## 10. Domain & Owner

- **Domain:** register/configure `APP_ORIGIN` (e.g., `https://goalflow.app` or Railway-provided `*.up.railway.app`) with DNS; set `CORS_ORIGINS` accordingly.
- **Owner:** `mris@tuta.io` (magic link via Supabase, then TOTP `aal2` in Settings). Create a beta code in Settings (plaintext shown once, SHA-256 stored) for invite testing.

## 11. Local Tooling for Final Run

- **Node:** 22, `npm ci`
- **Java:** 21 (Temurin), Android SDK 35, `ANDROID_HOME` set — required for `npm run android:sync`, `android:test`, `android:lint`, `android:assembleDebug`, and `android-native` (`./android-native/gradlew -p android-native test lint assembleProductionDebug assembleProductionDebugAndroidTest`)
- **Postgres:** 16 locally or via `scripts/test-postgres-migrations.sh` (uses `createdb`/`psql`); CI uses `postgres:16` service.

## Minimal Set for Next Hosted T1 Re-Run

To re-green the currently blocked hosted run `33335119616`, only **GitHub billing** must be cleared — no new API keys. For the full Tranche 2 hosted drill, provision at minimum: Supabase (staging project + keys), Railway (with Supabase+Turnstile+Telegram+Backup keys), Telegram bot, Turnstile pair, and Resend domain. AI keys can be deferred.

## Where Keys Are Used

- `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TURNSTILE_SECRET_KEY`, `BACKUP_MASTER_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY` → **Railway server only** (and Supabase dashboard for SMTP/OIDC). Never in `VITE_`, never in logs, never in `supabase/migrations` or `android-native` bundles.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_ORIGIN`, `VITE_TURNSTILE_SITE_KEY`, `VITE_TELEGRAM_OIDC_PROVIDER_ID`, `VITE_OWNER_EMAIL` → browser/PWA (safe to expose).
