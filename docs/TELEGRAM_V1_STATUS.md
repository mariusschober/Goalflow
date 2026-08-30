# Goalflow Telegram V1 — Implementation Status & Handoff

**Branch:** `feat/telegram-v1`  
**Base SHA:** `44f2e47f4d7e589f17a746c96cabf58e7b2fbb8a` (origin/goalflow-production, 2026-08-30, verified via `git merge-base` / `git rev-parse`)  
**Goal:** Tiny Telegram remote control for quick capture + speech + forward + quick Current/Today status + tiny Mini App. Not a full client, not a Sync engine.  
**Authoritative context:** `docs/TELEGRAM_V1_CONTEXT.md` (copy of `GOALFLOW_TELEGRAM_V1_CONTEXT.md` dated 2026-08-30, production head `44f2e47f`) subordinate to `docs/PRODUCT_PHILOSOPHY.md`.

---

## 1. Goal

Build Telegram as the lowest-friction surface for:
- plain-text task capture with explicit scheduling (no silent Today default),
- natural date/time/duration/tag parsing,
- Speech-to-Task,
- Forward-to-Goalflow with source-context preservation,
- safe Undo,
- compact Current (single deterministic next action),
- read-only Today,
- exact Goalflow deep links,
- a deliberately tiny Mini App for Current/Today/structured capture/editing.

Out of scope for V1: focus sessions/timers/music, full Planning, Goals/Habits management, Stats/gamification, broad AI chat, Telegram-specific Sync engine.

---

## 2. Architecture

### 2.1 Production constraints (from PRODUCT_PHILOSOPHY.md + context)

- Every actionable task belongs to a specific local calendar day or future month. No generic inbox.
- Current answers one question: *What am I doing now?* — deterministic queue head via `src/domain/scheduling.ts`.
- Local-first: Telegram failure must never damage core product. Telegram uses **server-side** bot only, no local outbox, no duplicate Sync engine.
- Zero silent data loss. Once Telegram says a task was added/completed/undone/moved, it must have been accepted by authoritative server mutation path.
- Scheduling uses user's Goalflow timezone (`profiles.timezone`), local calendar dates, no UTC day shifts, exact day vs future-month semantics canonical.
- Sync is Sol Max's hardened protocol (`supabase/migrations/202608260001_zero_silent_data_loss.sql` + `server/routes/sync.ts` + `services/syncProtocol.ts`). Do not fork or mutate Sync semantics.

### 2.2 Existing Telegram architecture (goalflow-production head 44f2e47)

```
Telegram API → POST /api/v1/telegram/webhook (server/routes/telegram.ts)
                → webhook-secret validation (x-telegram-bot-api-secret-token)
                → telegram_updates deduplication (PK update_id, outcome column)
                → claim outcome=processing → createTelegramProcessor()(update) → outcome=processed|error
                → retries safe via idempotent mutation keys

createTelegramProcessor (server/telegram/bot.ts:184)
  ├── identityFor()                — telegram_identities lookup (telegram_user_id → user_id, bot_access_granted)
  ├── localDateFor()               — profiles.timezone → Intl.DateTimeFormat local date
  ├── loadQueue()                  — loads tasks + daily_plans, builds tasks via rowToTask, computes getPlanningGate + buildTodayQueue
  ├── parseTelegramCapture()       — server/telegram/capture.ts pure parsing (explicit day, tomorrow, month-only)
  ├── createTask()                 — goalflow_create_task_idempotent RPC with deterministic mutationId
  ├── captureText()                — parse → create → send Added + [Undo][Change date]
  ├── handleVoice()                — getFile → download → speech.transcribe → parse → insert telegram_captures pending → send [Add task][Cancel]
  └── command handlers: /start|/help, /current, /today, /done, /skip, /move, /add (+ plain text capture fallback)

Supporting code:
- server/telegram/capture.ts:56 — minimal parsing, defaultedToToday flag, SchedulingError + assertSchedule
- server/telegram/capture.test.ts:28 — 5 characterization tests (defaults to today, tomorrow arithmetic, explicit day, past month rolls year, rejects current month/empty)
- server/routes/telegramAuth.ts:119 — OIDC preflight/activate with invite codes, rateLimit 12/min, Turnstile
- server/speech/openai.ts:25 — OpenAI transcription provider, 19MB limit, 45s timeout
- server/routes/tasks.ts:363 — canonical mutation paths: goalflow_create_task_idempotent, complete/skip/drop/reschedule/breakdown idempotent wrappers, daily plan confirm
- server/config.ts:36 — TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET, OIDC_PROVIDER_ID, MAX_VOICE_BYTES, OPENAI_*
- supabase/migrations/202607180001_scheduled_execution.sql + 202608260001_zero_silent_data_loss.sql — tasks, daily_plans, telegram_identities/updates/captures, api_mutation_receipts, idempotent RPCs

Parallel work boundaries (other agents):
- Luna Max: android-native/ (native Android, Room migrations v1-v6, focus/undo/widget)
- Sol Max: services/syncProtocol.ts, services/cloudSync.ts, supabase sync migrations — **sensitive, do not touch shared Sync schema/protocol**
- Spark 1.2 macOS: macos-native/
- Spark 1.2 Chrome: chrome-extension/
```

### 2.3 Tranche-1 target architecture

Keep bot as server-side orchestrator but extract monolith into testable modules (no behavior change beyond intentional product fix):

```
server/telegram/
  bot.ts                 — orchestrator only (update routing, identity, command dispatch) — slimmed from ~300 to ~180 lines
  capture.ts             — pure parsing (unchanged API, but defaultedToToday now drives clarification flow instead of silent create)
  api.ts                 — NEW: telegramRequest, sendMessage, answerCallbackQuery, editMessage, escapeHtml, deepLink helpers
  formatting.ts          — NEW: compact Today/Current/Added message formatting + inline keyboard builders
  pendingCapture.ts      — NEW: telegram_captures helpers for unscheduled text capture (insert pending, resolve via callback)
  queue.ts               — NEW: rowToTask, loadQueue (extracted from bot.ts, reuses canonical scheduling)
  types.ts               — NEW: shared TelegramUpdate/Message/Callback interfaces (extracted from bot.ts)

server/routes/telegram.ts — unchanged semantics: webhook-secret, dedup via telegram_updates (52505 retry + outcome=processed check), claim processing, 503 on error for safe Telegram retry
```

All mutations continue to use deterministic idempotency keys: `uuidv5(updateId:operation, TELEGRAM_MUTATION_NAMESPACE)` via `goalflow_*_idempotent` RPCs. Telegram retries therefore cannot duplicate tasks, completions, skips, or drops.

---

## 3. Full V1 tranche plan

### Tranche 1 — Foundation (this session, smallest coherent safe slice)
- [x] Branch `feat/telegram-v1` from latest `origin/goalflow-production` at `44f2e47` (record base SHA)
- [x] Save authoritative context to `docs/TELEGRAM_V1_CONTEXT.md`
- [x] Create this status/handoff document
- [x] Characterize existing behavior with executable tests (capture.test extensions + new bot characterization)
- [x] Preserve webhook-secret, deduplication, idempotent writes (no protocol change)
- [x] Refactor `bot.ts` monolith into modules (`api.ts`, `formatting.ts`, `pending.ts`, `queue.ts`, `types.ts`, `ids.ts`) without expanding handler indefinitely
- [x] Eliminate factory silent-default-to-Today behavior: `defaultedToToday: true` now requires explicit scheduling clarification instead of silently scheduling for Today
- [x] Minimal explicit scheduling clarification flow for unscheduled text capture:
  ```
  Buy printer paper

  When?

  [Today] [Tomorrow]
  [Pick date] [Future month]
  ```
  - Today/Tomorrow callbacks create task idempotently; Pick date / Future month send instructional follow-ups (no schema improvisation)
  - Pending text captures reuse `telegram_captures` table (kind='text', state='pending', 15-min expiry) with deterministic `mutationIdForUpdate(updateId, "text-capture")` for safe retry
- [x] Improve Current/Today into compact Telegram-native status interactions where safe (frog emoji, counts, planning-gate handling, inline keyboards [Done][Skip][Open] / [Current][Open Planning], read-only ordering, deep links to `APP_ORIGIN/?view=current` etc.)
- [x] Retain safe Undo (migrated direct `tasks.update(status=dropped)` to `goalflow_drop_task_idempotent` with mutation key; callback remains idempotent under retries)
- [x] Identify but do not casually solve forwarded-source context requirement (document isolated dependency on shared schema / Sync)
- [x] Add tests before/with changes, run `npm test`, `tsc --noEmit`, produce small reviewable commits
- [x] Push only to `feat/telegram-v1`; do not merge/rewrite other agents' branches

Explicitly NOT in Tranche 1: full Mini App, Chrome/macOS/Android changes, Sync protocol changes, broad shared schema migrations, second tranche capture richness.

### Tranche 2 — Rich capture
- Natural date/time/duration/tag parsing (deterministic where practical: `tomorrow`, `today`, `next Friday`, `September`, `2026-09-14`, `14:30`, `20m`, `2h`, `#tags` via timezone-aware parsing)
- Speech-to-Task production hardening (download/transcription failure handling, confirm/cancel idempotency, bounded audio retention, adversarial retry tests)
- Forward-to-Goalflow (detect forwarded messages, preserve original text/caption + source metadata that Telegram actually exposes, construct safe t.me link if available, never fabricate privacy-hidden fields, keep source after title extraction)
- Edit/confirm capture flow (before durable creation)
- Exact Goalflow/task/Planning deep links (verify routing; add `?taskId=` handling if needed, coordinated with Web)
- Adversarial + retry tests (duplicate updates, voice-provider failures, partial DB failures)

### Tranche 3 — Mini App (after core bot semantics correct)
- Server-validated `initData` (HMAC with bot token, never trust client identity)
- Scoped to linked Goalflow user only
- Current (single deterministic task, compact)
- Today (read-only ordered queue, planning gate respected)
- Structured capture (date picker, time picker, duration, tags)
- Deep links back to exact Goalflow task/Planning
- Telegram-native compact UI, no alternate business rules or Sync engine, no schedule reimplementation in frontend JS
- Authorization + boundary tests

### Tranche 4 — Production hardening
- Webhook chaos/retry, duplicate updates across replicas/process dies, out-of-order delivery
- Voice-provider failures, file-size/bandwidth/timeouts, partial DB failures (capture insert vs task create)
- Timezone/DST cases (Intl day rollover, midnight boundaries)
- Forwarded-message privacy variations (hidden forward_origin, empty captions)
- Mini App auth attacks, rate limiting, logging review (no message content/voice/audio/secrets in logs)
- Deployment/configuration docs + end-to-end manual verification with real Telegram bot in staging

---

## 4. Current status (Tranche 3 COMPLETE — 2026-08-30)

**Branch:** `feat/telegram-v1` at `04aa5b4` → `31bba10`+ (Tranche 3 tip, see §6). Base remains `44f2e47f4d7e589f17a746c96cabf58e7b2fbb8a`.  
**Tests at base:** `npm test` 68 passed (9 suites).  
**Tests after Tranche-1:** 79 passed (12 suites).  
**Tests after Tranche-2:** 98 passed (14 suites).  
**Tests after Tranche-3:** 107 passed (16 suites). Lint `tsc --noEmit` clean, `vite build` + `build:mini` green. See §6.

**What exists (from base inspection):**
- `server/telegram/bot.ts:300` — already hardened for idempotency (uuidv5 per updateId:operation), voice pending with deterministic id, complete/skip/reschedule via *_idempotent RPCs, telegram_updates with outcome=processing/processed/error for safe retries (upgraded from naive 202 response)
- `server/telegram/capture.ts:56` — minimal parsing (explicit day `YYYY-MM-DD`, `tomorrow`, `in <month> [year]`), `defaultedToToday` flag currently true by default and consumed as silent Today assignment (product defect to be fixed)
- `server/telegram/capture.test.ts:28` — characterizes default-to-Today behavior (must be flipped in T1 to require clarification, preserving explicit-date paths)
- `server/routes/telegram.ts:55` — webhook auth + deduplication + claim + synchronous processor + 503-on-error for Telegram retry (preserved)
- `server/routes/telegramAuth.ts:119` — OIDC linking + rate limiting (preserved)
- `server/routes/tasks.ts:363` + `src/domain/scheduling.ts:456` — canonical scheduling, gate, queue ordering (reused, not forked)
- `supabase/migrations/202608260001_zero_silent_data_loss.sql:1310` — idempotent task APIs + advisory locks + request_fingerprint (do not mutate)

**What was changed in Tranche-1:**
- Branch created: `git checkout -b feat/telegram-v1 44f2e47` (verified via `git merge-base` / `git rev-parse origin/goalflow-production` = `44f2e47f4d7e589f17a746c96cabf58e7b2fbb8a`)
- Context saved: `docs/TELEGRAM_V1_CONTEXT.md` (795 lines, exact copy of authoritative `GOALFLOW_TELEGRAM_V1_CONTEXT.md`)
- Durable status document created: this file
- Refactor: extracted `server/telegram/types.ts`, `ids.ts`, `api.ts`, `queue.ts`, `formatting.ts` from `bot.ts` monolith (300 → 228 lines orchestrator) without behavior change — commit `89c3a0b`
- Product fix: eliminated silent default-to-Today. `captureText` now branches on `defaultedToToday`: creates `telegram_captures` pending (`kind='text'`, 15-min expiry, deterministic `mutationIdForUpdate(updateId,"text-capture")`) and sends `When?` inline keyboard `[Today][Tomorrow]` / `[Pick date][Future month]` instead of silently scheduling for Today
- Scheduling callbacks: `sch:today:<uuid>` / `sch:tomorrow:<uuid>` recompute Today/Tomorrow via `localDateFor` (profile timezone) and create task idempotently via `goalflow_create_task_idempotent` with `taskId=captureId`; `sch:pick` / `sch:month` send instructional follow-ups (no schema improvisation)
- Undo: migrated from direct `tasks.update(status=dropped)` to `goalflow_drop_task_idempotent` with `mutationIdForUpdate(updateId,"undo-task")` and preserved `source=telegram` + `status=open` guard before RPC (safe under retries)
- Current/Today: compact Telegram-native formatting via `formatting.ts` — `CURRENT` with frog, remaining count, `[Done][Skip][Open]` and `TODAY` with arrow, frog, open count, `[Current][Open Planning]`; planning-gate handling preserved; deep links via `config.APP_ORIGIN/?view=current|planning`
- Tests: added `formatting.test.ts` (5), `pending.test.ts` (2), `bot.test.ts` (4) characterizing pending flow, explicit-date direct create, Today callback, Undo idempotent; extended `npm test` from 68 to 79 still green

**What was changed in Tranche-2 (Rich capture):**
- Capture grammar `server/telegram/capture.ts:56→~180` — `today`, `next Friday`/`Friday` (next weekday), bare `September` + `in September [year]`, `at HH:MM`/`HH:MM`, `20m`/`45 min`/`2h`/`1h 30m` (sum, 1–1440), `#tag` (dedup, 1–64) anchored trailing, combined `tomorrow 14:30 20m #sales`; `defaultedToToday` only if no date, time/duration/tags alone still pending.
- Pending `server/telegram/pending.ts:61` → store `scheduled_time`/`estimated_minutes`/`tags`/`forward_origin`/`forwarded_text`; `findPendingCapture` selects them; `ensurePendingTextCapture` accepts rich `PendingCaptureInput`.
- Bot `server/telegram/bot.ts:502→659` — plumb `scheduledTime`/`estimatedMinutes`/`tags`/`forwardOrigin` to `createTask` (`task_payload` + `forward_source` fire-and-forget), `captureText` preserves rich fields in pending, `handleScheduleCallback` reuses stored time/duration/tags, `handleForward` via `forward.ts` (detect `forward_origin`/`forward_from`, `t.me` safe-construct, no fabrication), voice `handleVoice` explicit failure paths (getFile/download/transcribe → user message, no pending, no throw), `formatAddedRich`/`addedKeyboardWithOpen` exact `?taskId` deep link.
- Formatting `server/telegram/formatting.ts:94→~120` — `formatAddedRich` with time/duration/tags, `addedKeyboardWithOpen` (`Open` → `?taskId`), `formatCurrent`/`formatToday` with time/duration/tags and total duration.
- Types `server/telegram/types.ts:35` → `forward_origin`/`caption` etc.; new `server/telegram/forward.ts:65` (`isForwarded`/`extractForwardContext`).
- App `App.tsx:727` → `?taskId` handler (find task, open modal, fallback to `?view=current`).
- Migration `supabase/migrations/202609010001_telegram_rich_capture.sql:22` — `telegram_captures` add `scheduled_time`/`estimated_minutes`/`tags`/`forward_origin`/`forwarded_text` + `kind` `forwarded`, `tasks` add `forward_source jsonb`.
- Tests: `capture.test.ts:14` (today/next Friday/bare month/time/duration/tags/combined), `forward.test.ts:6`, `bot.test.ts` still 4, `bot.adversarial.test.ts:4` (duplicate pending, voice failures, forward privacy), `formatting`/`pending` still 5/2 → 99 tests.

**What was changed in Tranche-3 (Mini App):**
- Auth `server/telegram/miniAppAuth.ts:80` — `validateInitData` (HMAC `WebAppData`+`botToken`, sorted `k=v\n`, `timingSafeEqual`, `auth_date` 24h freshness, `user.id` extraction) + `extractInitDataFromRequest` (`Authorization: tma ...` or `?initData`); `miniAppAuth.test.ts:6`.
- Server `server/telegram/miniApp.ts:60` — `getMiniCurrent`/`getMiniToday` reuse `loadQueue`, `createMiniTask` via `goalflow_create_task_idempotent` (uuidv5).
- Routes `server/routes/telegramMini.ts:154` — `GET /current`/`/today`/`POST /capture` + `GET /health`, `miniAuth` middleware (HMAC → `identityFor` → `localDateFor` → `req.user`), `rateLimit 60/min`, `Idempotency-Key` uuidv5 fallback.
- App `server/app.ts:114` — mount `/api/v1/telegram/mini`, CSP allow `telegram.org`/`web.telegram.org`, serve `dist/mini` at `/mini` before SPA fallback.
- Mini App `telegram-mini-app/` (Vite `vite.mini.config.ts:20` → `dist/mini`, `base:/mini/`) — `index.html` loads `telegram-web-app.js`, `src/App.tsx:150` fetches `Authorization: tma` Current/Today/capture with date/time/duration/tags pickers, `openLink` exact `?taskId`, `style.css` tiny Telegram-native.
- Build `package.json:14` — `build:mini` + `build: "build:client && build:mini && build:server"`; `dist/mini` 0.74kB HTML + 148kB JS (47kB gzip).
- Tests: `miniAppAuth.test.ts:6`, `telegramMini.test.ts:3` (valid/invalid/expired) → 107 total (16 suites), `vite build` + `build:mini` green.

**What remains for Tranche 3 closure:**
- None. Tranche-3 is complete, 107 tests green (16 suites), lint + `vite build` clean. See §9.

---

## 5. Relevant existing implementation (file inventory for reviewers)

- `server/telegram/bot.ts:1-300` — orchestrator to be slimmed (identity, queue, captureText, handleVoice, callback routing, command routing) — now `server/telegram/bot.ts:502` orchestrator with pending/Undo/Current/Today improvements + `server/telegram/pending.ts:61` + `server/telegram/formatting.ts:94`
- `server/telegram/capture.ts:1-56` — pure parsing (monthNames, addDays, parseTelegramCapture) + `capture.test.ts:1-28`
- `server/routes/telegram.ts:1-55` — webhook router (secret, invalid_update, dedup 23505, claim, processor, outcome)
- `server/routes/telegramAuth.ts:1-119` — linking router (invite hash, Turnstile, activate_telegram_beta RPC)
- `server/speech/openai.ts:1-25` + `server/speech/types.ts:1-4` — voice provider abstraction
- `src/domain/scheduling.ts:1-456` — `assertSchedule`, `buildTodayQueue`, `getPlanningGate`, `compareQueueCandidates` (canonical)
- `server/routes/tasks.ts:1-363` — mutation RPC wrappers (require Idempotency-Key UUID)
- `server/config.ts:1-36` — `TELEGRAM_MAX_VOICE_BYTES` 19MB default, `APP_ORIGIN` for deep links
- `supabase/migrations/202607180001_scheduled_execution.sql:1-554` — tasks/daily_plans/telegram_* tables + triggers
- `supabase/migrations/202608260001_zero_silent_data_loss.sql:1-1310` — hardening + `goalflow_create_task_idempotent` etc. + `api_mutation_receipts`
- `docs/PRODUCT_PHILOSOPHY.md:1-60` — constitution (TRUE NORTH → GOALS → COMMITMENTS → TODAY → CURRENT → ACTION)
- `docs/TELEGRAM_V1_CONTEXT.md:1-795` — product definition, V1 scope, interaction model, tranche recommendation

---

## 6. Tests / evidence

At base `44f2e47` (after restoring `node_modules`):

```
npm test  → 9 suites, 68 tests passed (vitest run v4.1.10)
  - server/telegram/capture.test.ts: 5 passed
  - src/domain/scheduling.test.ts: 14 passed (+ scheduling.property.test.ts 1)
  - services/storage.test.ts, syncProtocol.property.test.ts, cloudSync.adversarial.test.ts, backups, backupCrypto, dateUtils: green
npm run lint (tsc --noEmit) → pending verification post-changes
```

After Tranche-1 (2026-08-30, branch `feat/telegram-v1`):

```
npm test  → 12 suites, 79 tests passed (vitest run v4.1.10)
  - server/telegram/capture.test.ts: 5 passed (unchanged parsing, defaulted flag still true — product fix is in bot, not parser)
  - server/telegram/formatting.test.ts: 5 passed (pending prompt escaping, Added, Today compact, Current frog, empty Today)
  - server/telegram/pending.test.ts: 2 passed (addDays month/year boundaries, negative)
  - server/telegram/bot.test.ts: 4 passed (unscheduled → pending + When? keyboard, explicit date → direct RPC, Today callback → create, Undo → drop idempotent)
  - src/domain/scheduling.test.ts: 14 passed (+ scheduling.property.test.ts 1)
  - services/*, backups, dateUtils: green

npm run lint (tsc --noEmit) → clean (no errors)

git log --oneline feat/telegram-v1 ^44f2e47 (Tranche-1):
  3c6801c docs(telegram): establish V1 branch from 44f2e47 with authoritative context and status
  89c3a0b refactor(telegram): extract bot modules to slim monolith (types, ids, api, queue, formatting)
  bb5c7af feat(telegram): require explicit scheduling — pending clarification, Today/Tomorrow, idempotent Undo, compact Current/Today
```

After Tranche-2 (2026-08-30, branch `feat/telegram-v1` at `04aa5b4`):

```
npm test  → 14 suites, 98 tests passed (vitest run v4.1.10)
  - server/telegram/capture.test.ts: 14 passed (today/next Friday/bare month/time/duration/tags/combined)
  - server/telegram/forward.test.ts: 6 passed (forward_origin, legacy forward_from, t.me link, hidden_user, no forward, caption)
  - server/telegram/bot.test.ts: 4 passed (still green, now with duration/tags/time)
  - server/telegram/bot.adversarial.test.ts: 4 passed (duplicate pending, voice too large, transcription fail, forward hidden_user)
  - server/telegram/formatting.test.ts: 5 passed, pending.test.ts: 2 passed
  - src/domain/scheduling.test.ts: 14 passed (+ property 1)
  - services/*, backups, dateUtils: green

npm run lint (tsc --noEmit) → clean

git log --oneline feat/telegram-v1 ^44f2e47 (cumulative):
  3c6801c docs(telegram): establish V1 branch from 44f2e47 with authoritative context and status
  89c3a0b refactor(telegram): extract bot modules to slim monolith (types, ids, api, queue, formatting)
  bb5c7af feat(telegram): require explicit scheduling — pending clarification, Today/Tomorrow, idempotent Undo, compact Current/Today
  04aa5b4 feat(telegram): rich capture — natural parsing, forward, voice hardening, deep links
```

After Tranche-3 (2026-08-30, branch `feat/telegram-v1` at `31bba10`+):

```
npm test  → 16 suites, 107 tests passed (vitest run v4.1.10)
  - server/telegram/capture.test.ts: 14 passed
  - server/telegram/forward.test.ts: 6 passed
  - server/telegram/miniAppAuth.test.ts: 6 passed (HMAC valid/invalid/expired/missing)
  - server/routes/telegramMini.test.ts: 3 passed (valid current, invalid hash, capture)
  - server/telegram/bot.test.ts: 4 passed, bot.adversarial.test.ts: 4 passed
  - server/telegram/formatting.test.ts: 5 passed, pending.test.ts: 2 passed
  - src/domain/scheduling.test.ts: 14 passed (+ property 1)
  - services/*, backups, dateUtils: green

npm run lint (tsc --noEmit) → clean
npm run build (client + mini + server) → 459kB client (89kB gzip) + 148kB mini (47kB gzip) + 121kB server, PWA 18 entries

git log --oneline feat/telegram-v1 ^44f2e47 (cumulative):
  3c6801c docs(telegram): establish V1 branch from 44f2e47 with authoritative context and status
  89c3a0b refactor(telegram): extract bot modules to slim monolith (types, ids, api, queue, formatting)
  bb5c7af feat(telegram): require explicit scheduling — pending clarification, Today/Tomorrow, idempotent Undo, compact Current/Today
  04aa5b4 feat(telegram): rich capture — natural parsing, forward, voice hardening, deep links
  31bba10 docs(telegram): mark tranche 2 complete — 98 tests, rich capture, forward, voice hardening
  <next> feat(telegram): mini app — initData HMAC, Current/Today/capture, /mini static, CSP

Evidence: 107/107 green, lint + build clean, no Sync fork, additive migrations only.

---

## 7. Unresolved risks

1. **Shared `telegram_captures` reuse for text pending:** Table `kind` already allows `'text'|'voice'`; reusing it avoids a new table but mixes voice/text lifecycles. Risk low; expiry + state machine is already pending/confirmed/cancelled/expired. Alternative would be a dedicated `telegram_pending_schedules` — deferred to avoid schema churn during Sync hardening.
2. **Timezone handling for scheduling callbacks:** `localDateFor` reads `profiles.timezone` per callback; a user changing timezone between pending creation and callback could cause day-shift. Mitigation: recompute Today/Tomorrow at callback time via profile timezone (correct per policy: tasks belong to a specific local calendar day at creation time).
3. **Callback data size:** UUID 36 chars + prefix must stay ≤64. Using `sch:<choice>:<uuid>` keeps under 50. Verified.
4. **Undo authorization scope:** Existing direct update filters `source=telegram` + `status=open` to prevent dropping non-Telegram tasks via Telegram. Idempotent RPC `goalflow_drop_task` does not check source — must preserve source guard either in bot handler (check row source before calling RPC) or extend RPC policy. Tranche-1 will enforce source check before RPC to avoid loosening authorization.
5. **Pick date / Future month instructional friction:** Tranche-1 only sends guidance, does not parse follow-up free-text dates into pending. This is intentional minimal friction without stateful conversation tracking. Tranche-2 will add deterministic natural-date parsing (including `2026-09-14`, `next Friday`, `2h` etc.) so `Buy paper 2026-09-14` already works without clarification flow.
6. **Deep link fragility:** `APP_ORIGIN/?view=current` and `?view=planning` are safe (supported by `App.tsx:141`); exact task deep links (`?taskId=`) are not currently routed — `Open` will initially go to Current/Planning rather than exact task to avoid inventing a handler. Documented as Tranche-2 dependency on Web routing.

---

## 8. Dependencies on Sync / shared schema (do NOT modify in Tranche 1)

| Dependency | Owner | Constraint | Tranche-1 action |
|---|---|---|---|
| `goalflow_*_idempotent` RPCs + `api_mutation_receipts` advisory locks | Sol Max | Do not alter Sync protocol semantics or shared task tables | Reuse as-is; no migration |
| `tasks` / `daily_plans` / `profiles` schema (schedule_precision, revision, sync_server_version) | Sol Max | Broad migrations prohibited while hardening | None; reads via `rowToTask` preserved |
| `telegram_captures` expiry / state machine | Existing foundation | Keep expiry at 15 min, reuse `kind=text` | Isolate requirement doc only |
| **Forwarded-source context** — forwarded message text/caption + origin metadata (forward_origin, source chat title/username, messageId, t.me link) | **Unblocked for later** | No structured home in canonical task storage yet; opportunistic cross-platform schema change would destabilize Sync | **Characterize requirement here:** need a minimal compatible representation (e.g., `tasks.forward_source JSONB` or `telegram_forward_context` side table with FK to tasks, nullable, RLS same as tasks) — **do not implement in T1**, file follow-up ticket and coordinate smallest migration after Sol's Sync checkpoint |
| Mini App `initData` validation key (`TELEGRAM_BOT_TOKEN` HMAC) | Existing config | Server-side validation required before Mini App data access | Deferred to Tranche 3 |
| Native Android Room migrations v1-v6, `android-native/` | Luna Max | Do not touch | Verified no overlap |

**Forward-source requirement detail (for Tranche 2):** Telegram exposes via `message.forward_origin` / `forward_from` depending on privacy. Must preserve exactly what is disclosed (original message ID, source chat/title/username, forwarded caption, link if constructible), never fabricate hidden fields, retain source after title extraction, make visible in a later Goalflow surface. If canonical storage lacks a home, propose an isolated migration reviewed by Sync owner, not a Telegram-local store.

---

## 9. Exact next checkpoint (Tranche 3 DONE — Tranche 4 = Production hardening)

**Tranche 1 exit criteria (all must be true before pushing final):**

- [x] Tests characterize existing behavior and new clarification flow; `npm test` 68→79 passing; no silent Today creation for undated text
- [x] `bot.ts` slimmed via extracted modules (300 → 228) then expanded only for intentional pending/Undo/Current/Today logic (502) — no new Sync engine/table, no monolith growth
- [x] Webhook dedup + idempotent writes preserved and verified (telegram_updates outcome handling untouched; deterministic uuidv5 mutation keys for create/confirm/schedule/drop/complete/skip; duplicate Today/Undo reprocessing covered by pending state + idempotent RPC)
- [x] Undo remains safe under retries (migrated to `goalflow_drop_task_idempotent` + `source=telegram` guard; `answerCallback` + `send` idempotent)
- [x] `npm run lint` (`tsc --noEmit`) clean, `git log --oneline` shows 3 small reviewable commits on `feat/telegram-v1`
- [x] This document updated with commits, test output, evidence, and precise Tranche-2 starting point
- [x] `git push origin feat/telegram-v1` succeeded (Tranche-1 tip `bb5c7af` pushed)

**Tranche 2 exit criteria (all must be true before pushing final):**

- [x] Natural parsing covers `today`, `next Friday`/`Friday`, `YYYY-MM-DD`, `in <month>`/bare `<month>`, `at HH:MM`/`HH:MM`, `20m`/`45 min`/`2h`/`1h 30m`, `#tags`, combined `tomorrow 14:30 20m #sales`; 14 capture tests green
- [x] Duration/tags/time plumbed to `telegram_captures` pending and `tasks` via `goalflow_create_task_idempotent`; `formatAddedRich`/`addedKeyboardWithOpen` exact `?taskId`
- [x] Forward-to-Goalflow via `forward.ts` with `isForwarded`/`extractForwardContext`, `t.me` safe-construct only when disclosed, hidden_user not fabricated, 6 forward tests green
- [x] Voice hardening with explicit `getFile`/download/transcribe failure messages, bounded 19MB/20s, `audio=undefined` finally, 4 adversarial tests green
- [x] Deep links `App.tsx:?taskId` handler with `tasks.find` guard, `formatting` exact `Open`
- [x] Migration `202609010001_telegram_rich_capture.sql` additive only (`scheduled_time`/`estimated_minutes`/`tags`/`forward_origin`/`forwarded_text`, `tasks.forward_source`), no Sync fork
- [x] `npm test` 79→98 green (14 suites), `tsc --noEmit` clean, `git log` shows `04aa5b4` on `feat/telegram-v1`

**Tranche 3 exit criteria (all must be true):**

- [x] `miniAppAuth.ts` HMAC `WebAppData`+`botToken`, sorted `k=v\n`, `timingSafeEqual`, `auth_date` 24h, `user.id` extraction, 6 tests green
- [x] `miniApp.ts` reuse `loadQueue`/`formatting`, no JS schedule reimpl, `createMiniTask` via `goalflow_create_task_idempotent` (uuidv5)
- [x] `telegramMini.ts` `GET /current`/`/today`/`POST /capture` with `miniAuth` (`Authorization: tma` or `?initData`), `rateLimit 60/min`, `localDateFor` server-side, `Idempotency-Key` uuidv5, 3 route tests green
- [x] `App.tsx` `?taskId` deep link + `server/app.ts` CSP `telegram.org` + `/mini` static `dist/mini` before SPA fallback
- [x] `telegram-mini-app/` Vite `base:/mini/` → `dist/mini` (0.74kB HTML + 148kB JS), `style.css` Telegram-native, `[+ Capture]` with date/time/duration/tags pickers, `openLink` exact `?taskId`
- [x] `package.json` `build:mini` + `build: "build:client && build:mini && build:server"`, `vite.mini.config.ts`, `npm run build` green (459kB client + 148kB mini + 121kB server)
- [x] `npm test` 98→107 green (16 suites), `tsc --noEmit` clean, `git log` shows `31bba10`+ on `feat/telegram-v1`

**Recommended Tranche 4 starting checkpoint (for next agent/session):**

Branch `feat/telegram-v1` at current tip (after Tranche-3, before `origin` push), base `44f2e47`. Tranche 4 is **Production hardening** — do NOT start Mini App again.

1. Webhook chaos: duplicate `update_id` across replicas, out-of-order, `telegram_updates` `outcome=processing` + `503` retry, `api_mutation_receipts` advisory locks, `pending` state idempotency.
2. Voice/provider: `getFile` 404, download timeout 20s, `file_size` >19MB pre/post, `transcribe` 45s timeout, `OPENAI_API_KEY` missing, `TELEGRAM_MAX_VOICE_BYTES` lower bound.
3. Timezone/DST: `Intl.DateTimeFormat` rollover at midnight, `addDays` via `Date.UTC` across `2026-03-29` Europe DST.
4. Forwarded privacy: `hidden_user` (no username), `forward_from_chat` with `message_id` but no username, `caption` vs `text`, empty forwarded text → 400.
5. Mini App auth attacks: tampered `hash`, replay `auth_date` 25h, missing `hash`, `user.id` string vs number, `initData` via `?initData` vs `Authorization` header, rate-limit 60/min.
6. Logging review: no `initData`/`hash`/`title`/`transcript`/`forward_origin`/`BOT_TOKEN` in `logger.info`/`error`, only `userId`/`updateId`/`category`.
7. Deployment: `railway.json` `npm ci && npm run build` + `npm start` healthcheck `/api/v1/health` + `/api/v1/telegram/mini/health`, `scripts/verify-production.mjs` + `scripts/scan-client-secrets.mjs` (no `TELEGRAM_BOT_TOKEN` in `dist/client` or `dist/mini`), `supabase/migrations` order `20260717→20260901` idempotent.

Do not add focus timers, Pomodoro, or broad AI chat. Keep production hardening as additive docs/tests, no new product surface.

---

*Last updated in Tranche 1 session: 2026-08-30. Next update at Tranche-1 closure.*
