# Security Policy

Report security issues privately to the repository owner. Do not open a public issue containing credentials, personal data, or an exploit.

Goalflow keeps authentication, Telegram, AI, speech, backup, and Supabase service-role credentials on the server. Browser bundles may contain only the Supabase anonymous key, public app URL, public Telegram provider id, and Turnstile site key.

`VITE_API_ORIGIN` is a public routing setting for Capacitor/web delivery; it is not a credential. Run `npm run verify:client-secrets` after a production build to scan every client asset for server-secret names and configured secret values.

Production administration requires the owner role and an `aal2` TOTP session. Invite codes are single-use by default, expire, and are stored as hashes. AI requests are schema-bounded, quota-limited, and logged without prompts or responses. Personal data is user-owned through Postgres RLS.

Backups exclude auth secrets and AI credentials. Browser exports use PBKDF2 plus AES-256-GCM. Server snapshots use AES-256-GCM with a separately managed 32-byte key.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for trust boundaries, RLS assumptions, findings, and the live verification steps that require a Supabase staging project.
