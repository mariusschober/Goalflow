# Branch Manifest — Reconciliation 2026-08-31

Pinned remote state verified after `git fetch origin --tags --prune` on 2026-08-31.
All SHAs below are full 40-char; short 7-char in parens for readability.

## Pinned SHAs (exact)

| ref | SHA | short | verification |
|-----|-----|-------|--------------|
| `main` | `84bd036ba25d825b5fae36cb780842d9221ed097` | `84bd036` | `origin/main` matches |
| `goalflow-production` | `2cf39f8227612286957632e095211f6eb1bce2d1` | `2cf39f8` | `origin/goalflow-production` matches |
| `sol/web-production-24h` | `34de3f49aab610fd7a4400c086f02186c1890f6d` | `34de3f4` | `origin/sol/web-production-24h` matches |
| `codex/zero-data-loss-finalization` | `0ee98c87f961a854aa30ad3263542a2d783d1465` | `0ee98c8` | `origin/codex/zero-data-loss-finalization` matches |
| `feat/telegram-v1` | `5477ec362f3f08956706cca82294b3da62f49cc2` | `5477ec3` | `origin/feat/telegram-v1` matches |
| `feature/macos-execution-companion` | `2d30375aa0b76fbae3061b672ce56f2fd313cb50` | `2d30375` | `origin/feature/macos-execution-companion` matches |
| `feature/chrome-execution-companion` | `c4e5d6820303d858831c71c3e22495c4c7195712` | `c4e5d68` | `origin/feature/chrome-execution-companion` matches |
| `goalflow-integrity-checkpoint-20260829-a867470` | `6ca8f8b71b9b34f74d28a709db6e70596710d6ba` | `6ca8f8b` | `origin/goalflow-integrity-checkpoint-20260829-a867470` matches |
| `codex/goalflow-local-worktree-backup-2026-08-29` | `a0cecce49317d516e7a2d29978e658b39b5807ae` | `a0cecce` | `origin/codex/goalflow-local-worktree-backup-2026-08-29` matches |

Ancestor check: `84bd036` is ancestor of `2cf39f8` — **PASS** (`git merge-base --is-ancestor`).

## Merge bases and ahead/behind vs `main` (84bd036)

All branches fork from `84bd036` (the same root). No branch has diverged from `main` beyond that base; `main` itself has not advanced since `84bd036`.

| branch | merge-base | `main` ahead | branch ahead | files changed vs `main` |
|--------|------------|-------------|--------------|-------------------------|
| `goalflow-production` (`2cf39f8`) | `84bd036` | 0 | 148 | 278 files, +45804/-4893 |
| `sol/web-production-24h` (`34de3f4`) | `84bd036` | 0 | 155 | 281 files, +46361/-4886 |
| `codex/zero-data-loss-finalization` (`0ee98c8`) | `84bd036` | 0 | 144 | 268 files, +44348/-4828 |
| `feat/telegram-v1` (`5477ec3`) | `84bd036` | 0 | 114 | 272 files, +42631/-4749 |
| `feature/macos-execution-companion` (`2d30375`) | `84bd036` | 0 | 133 | 331 files, +47853/-4749 |
| `feature/chrome-execution-companion` (`c4e5d68`) | `84bd036` | 0 | 114 | 283 files, +44554/-4749 |
| `goalflow-integrity-checkpoint-20260829-a867470` (`6ca8f8b`) | `84bd036` | 0 | 19 | 212 files, +29473/-4830 |
| `codex/goalflow-local-worktree-backup-2026-08-29` (`a0cecce`) | `84bd036` | 0 | 20 | 213 files, +29587/-4830 |

`git rev-list --left-right --count origin/main...origin/<branch>` used for counts.

## Tree / diff summaries (high-level)

All branches share the `84bd036` base which had only web scheduling basics and no migrations, no native-android hardening, no sync engine.

- **goalflow-production (2cf39f8)** — canonical candidate. Adds 7 Supabase migrations (foundation through telegram_auth_state_pkce), full sync protocol, storage, cloudSync, backupCrypto, native-android (Room 1–8, sync engine, widget, auth), android legacy, server routes (sync/telegram/ai), Vite PWA, CI with verify/secrets/migrations/android/native-android, production security (helmet CSP, rateLimit 180/min, HSTS via Railway handled, not disabled), DIGESTS+RELEASE_METADATA.
- **sol/web-production-24h (34de3f4)** — forks same production line at 6885df5 then adds web-only release gate: Playwright 1.62.1, playwright.config.ts, `web-release` CI job with Chromium+WebKit matrix, report/trace/screenshot/video artifacts, PWA manifest/sw validation. Also carries `server/app.ts` localOnly CSP tweaks (NOT to be ported wholesale).
- **codex/zero-data-loss-finalization (0ee98c8)** — tranche-2 hardening: tranche2 C (health+Mutex), D (nextVersion lock+task_events FK), E (convergence property), plus docs. Hosted run `33338533333` SUCCESS (later `33339648422` also success). Contains tests that are informational superseded, not auto-merged.
- **feat/telegram-v1 (5477ec3)** — 6 unique commits atop base+shared; telegram bot (types/ids/api/queue/formatting), rich capture, forward, voice, Mini App HMAC, /mini static, CSP. Adds `202609010001_telegram_rich_capture.sql` candidate in later commits (check byte-for-byte).
- **feature/macos-execution-companion (2d30375)** — isolated macOS app in `macos/` (Swift), bundle ID `com.mariusschober.goalflow.mac`, Keychain, URL scheme `goalflow`, persistence bindings. Isolated source, not merged.
- **feature/chrome-execution-companion (c4e5d68)** — isolated Chrome MV3 extension in `chrome-extension/` (side panel, service worker). Isolated source, comparator vendored.
- **goalflow-integrity-checkpoint-20260829-a867470 (6ca8f8b)** — 19-commits audit checkpoint, early production freeze.
- **codex/goalflow-local-worktree-backup-2026-08-29 (a0cecce)** — 20-commits local-worktree backup, early docs.

Detailed diffs: `git diff --stat origin/main...origin/<branch>` recorded above; per-file lists available via same command.

## PR and CI evidence (2026-08-31 fetch)

- **PR #1**: `codex/zero-data-loss-finalization` → `goalflow-production` — DRAFT, OPEN, `CONFLICTING` (as of 2026-08-31). URL https://github.com/mariusschober/Goalflow/pull/1 . Created 2026-08-30T20:34:08Z. This PR is NOT to be merged; Stage 7 will close as superseded after equivalence.
- **Other branches**: no open PRs as of `gh pr list --limit 50 --state all` (only PR #1 listed).

Recent CI runs (from `gh run list --limit 20`):

| run id | branch | conclusion | workflow | event |
|--------|--------|------------|----------|-------|
| 33364369992 | goalflow-production | failure | CI | push (2cf39f8) |
| 33341181690 | sol/web-production-24h | failure | CI | push (34de3f4) |
| 33340871330 | goalflow-production | failure | CI | push |
| 33340811003 | goalflow-production | failure | CI | push |
| 33339896039 | goalflow-production | failure | CI | push |
| 33339648422 | codex/zero-data-loss-finalization | success | CI | workflow_dispatch |
| 33339281792 | goalflow-production | failure | CI | push |
| 33338775290 | goalflow-production | failure | CI | push |
| 33338533333 | codex/zero-data-loss-finalization | success | CI | workflow_dispatch |
| 33338446599 | goalflow-production | failure | CI | push |
... (full list via `gh run list`)

Note: The canonical candidate `2cf39f8` run 33364369992 shows `failure` — investigation pending in Stage 2/5 (may be pre-hardening workflow shape). New reconciliation workflows will be established on `reconcile/canonical-main-*` and must be green before promotion.

CI evidence URLs pattern: `https://github.com/mariusschober/Goalflow/actions/runs/<id>` . Preserve these IDs; new runs after reconciliation will be listed in `docs/CANONICAL_STATUS.md`.

## Intended disposition (Stage 6–7 plan, do not execute yet)

| branch | disposition |
|--------|-------------|
| `main` (`84bd036`) | Archive to `archive/main-pre-canonical-20260831` + tag `main-pre-canonical-20260831`; later fast-forward ONLY to approved canonical candidate after explicit human approval. Protect after. |
| `goalflow-production` (`2cf39f8`) | **Canonical production candidate**. Create `reconcile/canonical-main-20260831` at exactly `2cf39f8` (Stage 1.5). Freeze after `main` promotion; no new work targets it. |
| `sol/web-production-24h` (`34de3f4`) | Frozen after selective equivalence is recorded. Source reference only; do NOT merge wholesale (Stage 3 ports only Playwright/config/matrix/artifacts/validation). |
| `codex/zero-data-loss-finalization` (`0ee98c8`) | Frozen; PR #1 closed as superseded after Stage 7 scenario matrix proves equivalence via real production code. Preserve branch. |
| `feat/telegram-v1` (`5477ec3`) | Retained until develop PR accepted (6 selective commits). Then frozen. |
| `feature/macos-execution-companion` (`2d30375`) | Retained until develop PR accepted (isolated import with provenance). Then frozen. |
| `feature/chrome-execution-companion` (`c4e5d68`) | Retained until develop PR accepted (isolated import with provenance). Then frozen. |
| `goalflow-integrity-checkpoint-20260829-a867470` (`6ca8f8b`) | Permanent historical ref; never merge or delete. Tagged `audit/2026-08-31/...`. |
| `codex/goalflow-local-worktree-backup-2026-08-29` (`a0cecce`) | Permanent historical ref; never merge or delete. Tagged `audit/2026-08-31/...`. |
| `reconcile/canonical-main-20260831` | Created Stage 1 at `2cf39f8`; carries all Stage 2–5 hardening, then PR to `main`. |
| `archive/main-pre-canonical-20260831` | Permanent old-main pointer at `84bd036`. |

## Durable identifiers (must not be renamed)

- **Web DB**: `GoalflowDB` (`services/storage.ts:24` `BASE_DB_NAME`)
- **Native DB**: `goalflow-native.db` (`android-native/app/.../data/GoalflowDatabase.kt:588`)
- **Capacitor appId**: `com.mariusschober.goalflow` (`capacitor.config.ts:4`)
- **Native namespace/appId**: `com.mariusschober.goalflow.nativeapp` (`android-native/app/build.gradle:19`) and applicationId `com.mariusschober.goalflow`
- **Legacy Android**: `com.mariusschober.goalflow` (`android/app/build.gradle`) with `.test`/`.sandbox` suffixes
- **macOS bundle ID**: `com.mariusschober.goalflow.mac` (per `feature/macos-execution-companion` isolated source — preserve when importing)
- **Native mac companion**: earlier candidate `com.mariusschober.goalflow.nativeapp` already covered
- **URL scheme**: `goalflow` (custom scheme, referenced in macOS `Info.plist` and native `AndroidManifest.xml` CAPTURE intent)
- **Keychain service**: `com.mariusschober.goalflow` (native/macos Keychain)
- **Backup format**: `GFB1` header (`server/backups.ts:16`, `server/backups.test.ts`)
- **Storage keys**: existing `goalflow.*` keys in `services/storage.ts` / `android-native/.../GoalflowPreferences.kt` (e.g., `goalflow:tasks`, `goalflow:goals`, etc. — enumerable via grep)
- **Migration filenames**: `202607170001_...` through `202608310001_...` (see below)
- **Room schemas**: `android-native/app/schemas/com.mariusschober.goalflow.nativeapp.data.GoalflowDatabase/1.json` … `8.json`

## Migration SHAs frozen (checked at 2cf39f8)

| file | sha256 |
|------|--------|
| `202607170001_foundation.sql` | `8573c6408f952cac607fdcc364b3130d1008db28cbcfce023dbda9b578280d2e` |
| `202607180001_scheduled_execution.sql` | `0cc0d9cc1d1d7a1f234cd9cf1a3be357d2dc92df6391f6599c8bddf75e1c988f` |
| `202608250001_reliability_hardening.sql` | `978b7d3d51d95cd0d10b4c2e239048be3816eedb2c4ee3665e2b6da2e0fb6c94` |
| `202608260001_zero_silent_data_loss.sql` | `2e965b4632ca88203bad4ce2f37bbbd445b316d23b1b4b5fefbe221e3e974feb` |
| `202608290001_native_task_events.sql` | `4fe88cd8644d92d216a97819cad3f1e7a966ab684a06397750f4a41e07ea10ba` |
| `202608300001_complete_native_sync_transport.sql` | `1ffe9962982326517f1b0e8ad00ebc41a54c74fc7b4874014df4a299dbb0a6b8` |
| `202608310001_telegram_auth_state_pkce.sql` | `bc03354e202602ae111a27c2fa99f6256cee64abe4332882ba2c213f89f3868d` |

Verified: each hash equals `shasum -a 256` of `git show 2cf39f8:supabase/migrations/<file>`.

## Notes on worktree cleanliness

- Stash `stash@{0}` = temp stash for uncommitted `package.json`/`package-lock.json` Playwright addition on `goalflow-production` (+19 commits ahead local). Manifest records dirty state before reconciliation; stash preserves it. Worktree reported clean for `git status --porcelain` excluding `android-native/benchmark/build/` and `test-results/` (ignored).
- No force-push, no rebase, no deletion performed.

## References

- Created: `archive/main-pre-canonical-20260831` branch at `84bd036`, tag `main-pre-canonical-20260831` (annotated), and 8 `audit/2026-08-31/*` tags (annotated, one per non-main audited tip).
- Next: `reconcile/canonical-main-20260831` at `2cf39f8` (push follows this doc commit).
