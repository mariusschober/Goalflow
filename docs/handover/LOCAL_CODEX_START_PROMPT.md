# Goalflow personal-beta local Codex start prompt

Copy the prompt below into a fresh local Codex session opened at the Goalflow
repository root. Select the strongest available Codex Sol model and maximum
reasoning effort for this long-running implementation task.

---

You are taking over Goalflow and must implement, verify, publish, deploy, and
document the remaining work needed for a safe personal beta. Use the computer,
terminal, repository, GitHub, and available authenticated tools. Do not merely
produce a plan. Continue autonomously through every safe task and stop only for
a genuine owner-only console action, cost approval, or retained secret.

Start by fetching every branch and tag without changing history:

```bash
git fetch origin '+refs/heads/*:refs/remotes/origin/*' --tags --prune
git status --short --branch
git rev-parse origin/chore/railway-beta-gate
git merge-base --is-ancestor 01f864720df7acfa211745e64edec8b5163ab612 origin/chore/railway-beta-gate
git rev-list --left-right --count origin/integration/beta...origin/chore/railway-beta-gate
```

The handover evidence base is
`01f864720df7acfa211745e64edec8b5163ab612` on
`origin/chore/railway-beta-gate`. At handover, that branch was the complete
candidate and was 86 commits ahead of `integration/beta`. If the remote tip has
advanced, inspect every intervening commit and its CI before accepting it. Do
not reset a newer proven tip back to the handover SHA.

Create or continue a short-lived branch named
`codex/personal-beta-finalization-20260904` from the reviewed candidate. Do not
advance `integration/beta` until its hosted staging and signing requirements can
run honestly. Do not merge or deploy `main` until the complete release ledger
is green.

Read these files fully before editing:

1. `AGENTS.md`
2. `docs/handover/LOCAL_CODEX_PERSONAL_BETA_CONTEXT.md`
3. `docs/BETA_READINESS.md`
4. `docs/reconciliation/BETA_PROVENANCE.md`
5. `docs/operations/BETA_RUNBOOK.md`
6. `docs/ACCOUNTS_AND_KEYS.md`
7. `docs/security/HISTORICAL_CREDENTIAL_ACTIONS.md`
8. `DEPLOYMENT.md`

Treat older `STARTER_PROMPT*`, production-readiness, release-report, and
finalization files as historical evidence only when they conflict with the
active context or current code.

The required product outcome is a deployed personal beta with:

- sign-in by a typed email code or Telegram OIDC on Web, native Android, and
  native macOS;
- a securely linked Telegram Bot and authenticated Telegram Mini App;
- normally sub-two-second convergence between active Web, Android, macOS, Bot,
  and Mini App sessions;
- a 30-second foreground polling fallback and immediate catch-up on reconnect,
  focus, or network recovery;
- the existing durable outbox, exact receipt, cursor, conflict, tombstone, and
  retry protocol remaining authoritative;
- no false success, silent data loss, cross-user access, replay acceptance, or
  credential exposure;
- proven encrypted backup and destructive restore in staging;
- a signed Android internal-beta APK, verified macOS beta build, green CI,
  isolated staging and production deployments, protected branches, and the
  exact `v0.4.0-beta.1` release tag.

Implement in this order unless repository evidence establishes a safer
dependency order:

1. Re-run the baseline tests and confirm no uncommitted or unpublished work.
2. Add typed email OTP request/verification and secure session persistence to
   Web, Android, and macOS, retaining account approval and owner AAL2 checks.
3. Finish Telegram OIDC sign-in and explicit identity linking on those three
   clients. Never merge identities by email, username, phone, or mutable
   metadata.
4. Add a migration-backed realtime wake-up mechanism. A wake-up contains no
   task payload and only causes the existing cursor pull. Give each user access
   only to their own wake-up state. Clients must not be able to forge another
   user's signal or bypass the sync protocol.
5. Subscribe Web, Android, and macOS with reconnect/focus/network recovery and a
   30-second foreground fallback. Add a short-lived authenticated relay for the
   Mini App if direct Realtime authorization cannot safely use its session. The
   Bot must read committed server state.
6. Add adversarial, property, migration, protocol, native, browser, and workflow
   tests. Extend the hosted matrix so all five real surfaces exchange one
   durable record and verify create/edit/complete/delete, duplicates, lost
   acknowledgments, conflicts, offline restart, revocation, and cross-user
   denial.
7. Push small, reviewed commits. Monitor the exact-head GitHub run and repair
   genuine failures without weakening gates.
8. Complete owner-assisted staging setup, live auth/sync/Telegram tests,
   backup/restore, signed artifacts, production promotion, and smoke tests as
   described in the active context.

Use current official Supabase and Telegram documentation before implementing
provider behavior. Email `signInWithOtp` sends a link by default; configure the
template with `{{ .Token }}` and verify the typed OTP. Use a custom Supabase
OIDC provider such as `custom:telegram` and Telegram Authorization Code + PKCE.
Validate Mini App raw `initData` server-side; never accept query-string
credentials.

Supabase safety requirements:

- use a new isolated Goalflow project; never touch `Movetrics`;
- use current publishable and secret keys in the correct trust boundaries;
- add explicit Data API grants and RLS for every exposed object;
- authorize by immutable `auth.uid()`/Supabase UUID;
- make existing migrations immutable and add new migrations with hash-ledger
  updates;
- keep private-channel authorization and Realtime policies user-scoped;
- validate every live assumption in staging before production.

When blocked, give the owner one precise action at a time and never request a
secret value in chat. For historical-key remediation, request only disposition,
date, and a one-way fingerprint. For Supabase creation, present the exact
project/region/cost before any paid action. For Android signing, use the
protected GitHub environment and externally retained signer described in
`docs/ACCOUNTS_AND_KEYS.md`.

After each checkpoint:

- run relevant local checks;
- inspect the diff and `git diff --check`;
- commit with a narrow message and push without force;
- record the exact SHA, Actions run URL, job outcomes, artifacts, checksums,
  honest skips, and blockers in `docs/BETA_READINESS.md`;
- keep the working tree and remote aligned.

Do not call the project ready until the Definition of Done in `AGENTS.md` and
every required row in the active context are proven against the exact promoted
commit.

---

The active detailed context is
[`LOCAL_CODEX_PERSONAL_BETA_CONTEXT.md`](./LOCAL_CODEX_PERSONAL_BETA_CONTEXT.md).
