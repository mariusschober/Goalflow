# Goalflow beta account and key inventory

This is an inventory of external prerequisites, not a place to record secret
values. `integration/beta` is the current temporary integration source; `main`
remains obsolete until release proof is complete.

## Current external state

- GitHub access and Actions are working. The required aggregate check is
  `beta-gate`.
- A private Railway project named `Goalflow` exists with an empty production
  environment. The isolated staging environment and both services are not yet
  configured or deployed.
- The connected Supabase organization contains an unrelated `Movetrics`
  project. It must not be modified. A separate Goalflow staging project has not
  been created because organization/region/cost confirmation is still required.
- No Goalflow production Supabase project has been proven.
- Telegram, AI, voice, Turnstile, custom SMTP, and Android release signing have
  not passed their live beta gates.

## Supabase staging and production

For each independent project, retain outside the repository:

- project reference and database administration access;
- `SUPABASE_URL`;
- browser-safe `SUPABASE_PUBLISHABLE_KEY`;
- server-only `SUPABASE_SECRET_KEY`;
- exact authentication Site URL and redirect allowlist;
- custom SMTP configuration;
- two synthetic staging identities used by the isolation matrix.

Only the publishable key may enter `VITE_SUPABASE_PUBLISHABLE_KEY` or a native
application configuration. The secret key must exist only in the corresponding
Railway environment. Do not use secret-key behavior as RLS evidence because the
secret key bypasses RLS.

The owner is authorized by immutable Supabase user UUID (`OWNER_USER_ID`), not
email address. Never record test passwords, access codes, recovery links, tokens,
MFA seeds, or key values in this file.

## Railway

Configure the shared variables listed in `DEPLOYMENT.md` independently for
staging and production. Use `.railway/railway.ts`; do not recreate the retired
`railway.json` setup. Staging follows `develop`; production follows `main` but
keeps automatic deploys disabled.

The backup master key is a separately retained 32-byte random secret. It is
server/maintenance-only, never client-exposed, and must be recoverable during a
restore drill.

## Optional features

Keep every optional feature flag false until its own live verification passes.
When enabled, retain these values only in the matching Railway environment:

- Telegram bot token, webhook secret, bot username and OIDC provider details;
- Turnstile secret (site key alone may be client-exposed);
- AI provider key;
- voice/transcription provider key.

Telegram requires a real test bot and complete webhook/replay/account-linking
matrix. AI and voice are not required for core beta task capture and sync.

## Android release signing

The protected manual GitHub workflow requires:

- `ANDROID_KEYSTORE_BASE64`;
- `ANDROID_KEYSTORE_PASSWORD`;
- `ANDROID_KEY_ALIAS`;
- `ANDROID_KEY_PASSWORD`;
- `EXPECTED_CERT_FINGERPRINT`.

The keystore must be generated and retained outside the repository. The release
gate compares the normalized SHA-256 certificate fingerprint and uploads the
signed APK plus checksum/provenance only after `beta-gate` succeeds on `main`.

## Historical credential action

Complete-history scanning still finds one historical Firebase/GCP API-key-shaped
credential associated with an old Firebase project. Its value must never be
printed or copied. Before release, the owner must verify it in Google Cloud,
review usage, and revoke/delete it if unused or rotate/restrict it to the exact
required APIs and application/referrer boundaries. Record only the action and
date in `docs/security/HISTORICAL_CREDENTIAL_ACTIONS.md`.
