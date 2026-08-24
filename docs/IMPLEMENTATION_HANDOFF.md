# Goalflow Production Rewrite Handoff

Last updated: August 25, 2026

This branch takes Goalflow from the original AI Studio prototype to a free,
invitation-only, local-first PWA. It preserves the complete product experience
while replacing prototype-only authentication, persistence, AI, and deployment
code with production-oriented foundations.

## Product experience preserved

- Current execution view with one active task at a time.
- Daily and monthly planning with explicit local dates and no unscheduled tasks.
- Habits, frogs, timer and Pomodoro flows, focus music, and circadian planning.
- Goals, True North, Transurfing, Reality Navigator, insights, and gamification.
- AI task breakdown, validation, visualization, habit suggestions, importance
  reduction, and outer-intention coaching.
- Telegram text and voice capture using the same scheduling rules as the web app.

## Production foundation added

- React/Vite installable PWA with offline shell, manifest, install icons, update
  lifecycle, local Inter Variable fonts, responsive safe areas, and reduced-motion
  support.
- IndexedDB local source with versioned storage, rotating recovery snapshots,
  mutation outbox, encrypted export/import, and conflict-safe synchronization.
- Express 5 server with separate browser/server builds, structured request logs,
  request IDs, security headers, rate limits, bounded JSON payloads, health status,
  and environment validation.
- Supabase Auth and Postgres with owner/beta profiles, Row-Level Security,
  single-use hashed invite codes, synchronization revisions, conflict records,
  AI quotas, and backup metadata.
- Mandatory TOTP AAL2 checks for owner administration and protected APIs.
- Telegram Custom OIDC, secure webhook verification, update deduplication, bounded
  voice files, in-memory transcription, and no retained raw audio.
- Provider-neutral server AI interface using DeepSeek by default. Prompts and
  responses are not logged; only operational metadata is recorded.
- Password-protected browser backups using PBKDF2 and AES-256-GCM, plus encrypted
  server snapshot support with a separately managed master key.
- Railway configuration and GitHub Actions for TypeScript, tests, production
  builds, startup checks, dependency audit, and secret scanning.
- Local-only Mac launcher for private use without Supabase, Telegram, SMTP,
  CAPTCHA, or hosted infrastructure.

## Product and UX decisions

- The product is free during the beta. There is no Stripe or payment flow.
- The primary model is schedule-first: every task belongs to an exact day or a
  future month, and Current remains gated until today's order is confirmed.
- The complete Goalflow experience remains available; advanced modules are not
  deleted or replaced by a simplified product.
- AI and location use require explicit consent. AI is disabled when no provider
  key is configured, without disabling the rest of the application.
- Credentials remain server-side and are excluded from browser storage, sync
  records, logs, and backup exports.

## Verification performed

The repository provides these repeatable checks:

```bash
npm run lint
npm test
npm run build
npm audit --audit-level=high
```

CI also starts the compiled production server, checks `/api/v1/health`, and runs
Gitleaks. Production client and server outputs are separated, and browser bundles
must not contain server credentials.

## Remaining before public beta

1. Provision separate staging and production Supabase projects and apply both
   migrations in order.
2. Configure Railway secrets, Resend SMTP, Turnstile, Telegram OIDC, the Telegram
   webhook, DeepSeek, and optional OpenAI voice transcription.
3. Create and verify `mris@tuta.io`, link Telegram if desired, and enroll TOTP.
4. Run cross-user RLS tests with two staging accounts.
5. Complete two-device offline sync and forced-conflict tests.
6. Complete encrypted browser and server restore drills in staging.
7. Verify install/update, mobile safe areas, keyboard navigation, VoiceOver,
   reduced motion, and contrast in Safari and Chrome on real devices.
8. Confirm SomaFM availability and licensing for the intended beta audience.
9. Operate the owner account for seven stable days before issuing beta codes.

Detailed provisioning and recovery steps are in [DEPLOYMENT.md](../DEPLOYMENT.md)
and security boundaries are summarized in [SECURITY.md](../SECURITY.md).
