# Goalflow Telegram V1 — Tranche 2 Plan: Rich Capture

**Branch:** `feat/telegram-v1` (base `44f2e47`, tip after Tranche 1: `bb5c7af`)  
**Status:** Tranche 1 COMPLETE (2026-08-30) — explicit scheduling clarification, compact Current/Today, idempotent Undo, 79 tests green.  
**Goal of Tranche 2:** Make capture **fast and forgiving** for real-world language, voice, and forwarded messages, without inventing a second task model or Sync engine.  
**Authoritative context:** `docs/TELEGRAM_V1_CONTEXT.md` (product), `docs/PRODUCT_PHILOSOPHY.md` (constitution), `docs/TELEGRAM_V1_STATUS.md` (handoff). Tranche 2 is strictly **Rich capture** — Mini App (Tranche 3) and Production hardening (Tranche 4) remain out of scope.

---

## 1. Tranche 1 recap — what is now true

- `feat/telegram-v1` at `bb5c7af`:
  - `server/telegram/{types,ids,api,queue,formatting,pending}.ts` extracted; `bot.ts:502` orchestrator.
  - `captureText` no longer silently defaults `defaultedToToday:true` → Today. Instead creates `telegram_captures` pending (`kind='text'`, 15m, `uuidv5(updateId,"text-capture")`) and prompts `When? [Today][Tomorrow]/[Pick date][Future month]`.
  - `sch:today/tomorrow` recompute via `profiles.timezone` → `goalflow_create_task_idempotent(taskId=captureId)`; `sch:pick/month` instructional.
  - Undo via `goalflow_drop_task_idempotent` with `source=telegram` guard.
  - Current/Today compact via `formatting.ts` with `[Done][Skip][Open]` / `[Current][Open Planning]`.
- `npm test` 12 suites, 79 tests; `tsc --noEmit` clean.
- `server/routes/telegram.ts` webhook-secret + `telegram_updates` outcome `processing/processed/error` + deterministic mutation keys preserved.
- **Not yet:** natural parsing beyond `YYYY-MM-DD`/`tomorrow`/`in <month>`, duration/time/tags, forward detection, voice hardening, `?taskId` deep links, adversarial retry tests.

---

## 2. Tranche 2 scope — in / out

**In (must ship, in priority order):**

1. **Natural date/time/duration/tag parsing** — deterministic, timezone-aware, no LLM for obvious tokens.
2. **Speech-to-Task production hardening** — download/transcription failure explicit, bounded audio, confirm/cancel idempotency across retries.
3. **Forward-to-Goalflow** — detect `forward_origin`/`forward_from`, preserve original text/caption + exposed source metadata, construct safe `t.me` link if possible, never fabricate hidden fields.
4. **Edit/confirm capture flow** — before durable `goalflow_create_task_idempotent`, user can confirm or cancel without duplicate; pending state `confirmed/cancelled/expired` idempotent.
5. **Exact deep links** — `Open` → exact task (`?taskId=` or `?view=current&taskId=`) + `Open Planning` → `?view=planning`; verify `App.tsx:141` routing, add minimal `?taskId` handler if missing.
6. **Adversarial & retry tests** — duplicate updates, voice-provider failures, partial DB failures, timezone/DST, forwarded-privacy variations.

**Out (explicitly deferred to Tranche 3/4):**

- Mini App (Tranche 3) — no `initData` validation, no Mini App UI in Tranche 2.
- Full Planning/Goals/Habits/Stats, focus timers, Pomodoro, music, AI chat, Sync engine, broad migrations.

---

## 3. Product constraints that govern Tranche 2

- Every task → exact local calendar day (`YYYY-MM-DD`) or future month (`YYYY-MM`). No inbox. `assertSchedule` remains canonical.
- `defaultedToToday:false` is the only path to `goalflow_create_task_idempotent`. If parsing is ambiguous, ask (Tranche 1 `When?`); if deterministic, do not add friction.
- Current = one deterministic queue head via `src/domain/scheduling.ts:buildTodayQueue/getPlanningGate`. Telegram must not reimplement ordering.
- Frog semantics preserved; duration/tags are optional metadata, not scheduling.
- Telegram is optional; failure must not break core. All durable writes via `goalflow_*_idempotent` with `uuidv5(updateId,op)`.

---

## 4. Detailed workstreams

### 4.1 Natural parsing — `server/telegram/capture.ts`

**Current:** `explicitDay` (`\d{4}-\d{2}-\d{2}$`), `tomorrow`, `in <month> [year]`. No time/duration/tags.

**Target (deterministic, in this order, all anchored at end of title to avoid title corruption):**

| Token | Examples | Mapping | Notes |
|-------|----------|---------|-------|
| `today` | `Buy paper today` | `scheduledFor=today`, `defaulted=false` | case-insensitive, word-boundary, not inside other words |
| `tomorrow` | `Call Peter tomorrow` | `addDays(today,1)` | already exists, keep |
| `next Friday` / `Friday` | `Order booth next Friday` | next occurrence of weekday after today (if today is Friday, `next Friday` = +7, `Friday` = next Friday) | use `getDay()` Monday=1…Sunday=7, deterministic |
| `YYYY-MM-DD` | `Call Alex 2026-09-14` | explicit day | already exists |
| `in <month> [year]` / `<month>` | `Review in September`, `Review September 2027` | `YYYY-MM` future month, roll year if `<= today.slice(0,7)` | already exists, extend to bare month without `in` if unambiguous |
| `at HH:MM` / `HH:MM` | `Call Peter tomorrow 14:30`, `at 14:30` | `scheduledTime="HH:MM"` | 24h `^(?:[01]\d|2[0-3]):[0-5]\d$`, only if `schedulePrecision=day` |
| `duration` | `20m`, `45 min`, `2h`, `1h 30m`, `90m` | `estimatedMinutes` (1–1440) | parse trailing `(\d+\s*(?:m|min|mins|minutes|h|hours?)\b)+` at end, sum, clamp |
| `tags` | `#movetrics`, `#sales` | `tags: string[]` (1–20, 1–64, dedup, trim, lowercase? preserve as typed but trim) | `/#[^\s#]+/g` at end or inline, compatible with `server/routes/tasks.ts:tags` |

**Implementation:**

- Extend `ParsedCapture` → `{title, schedulePrecision, scheduledFor, scheduledTime?, estimatedMinutes?, tags?: string[], defaultedToToday}`.
- Add helpers: `parseTime`, `parseDuration`, `parseTags`, `weekdayIndex`, `nextWeekday`, `stripTrailingTokens` loop (duration → time → tags → date) to keep title clean. Each strip sets `defaulted=false` if found.
- Validate via `assertSchedule(schedulePrecision, scheduledFor, today, scheduledTime)` + `SchedulingError` for `invalid_time` etc.
- Keep `parseTelegramCapture` pure, deterministic, no LLM. Property tests for round-trip.

**Files:** `server/telegram/capture.ts` (expand to ~150 lines), `server/telegram/capture.test.ts` (extend to ~30 tests), new `server/telegram/capture.property.test.ts` if needed.

**Acceptance:** `npm test` captures `today`, `next Friday`, `2026-09-14`, `14:30`, `20m`/`2h`/`45 min`, `#tags` in any order at end, case-insensitive, with `defaulted=false`; ambiguous `Friday` still deterministic; no silent `Today` for bare title.

### 4.2 Duration/tags → task payload

- Tranche 1 `createTask` hardcodes `estimatedMinutes:25`, `tags:[]`. Tranche 2 must plumb `capture.estimatedMinutes` and `capture.tags` into `task_payload` (`estimatedMinutes`, `tags`) and into `formatAdded`/`formatCurrent` display.
- `server/telegram/formatting.ts:formatAdded` → `Wednesday · 20 min` / `#movetrics` if present.
- `server/telegram/bot.ts:createTask` → pass through.

### 4.3 Speech-to-Task hardening — `server/telegram/bot.ts:handleVoice`

**Current:** `getFile` → download (20s) → `speech.transcribe` → `parse` → `telegram_captures` pending → `I heard:` `[Add task][Cancel]`. Already idempotent via `uuidv5(updateId,"voice-capture")` and `state=pending` check. Missing: explicit failure paths, bounded audio, retry tests.

**Tranche 2 hardening:**

- Keep deterministic `captureId = uuidv5(updateId,"voice-capture")`; on duplicate `update_id` with `state=pending` resend `I heard:` (already), with `state=confirmed/cancelled` no-op.
- Download: `AbortSignal.timeout(20_000)`, `file_size` pre-check + post-download `byteLength` check vs `TELEGRAM_MAX_VOICE_BYTES` (19MB), throw `Transcription failed` → `catch` → `send("Voice note could not be transcribed. Try again as text.")` + `logger.warn` (no audio logged).
- Transcription: `speech.transcribe({audio, mimeType, fileName})` already via `server/speech/openai.ts:45s`; add `try/catch` → explicit user message, no pending insert on failure.
- Pending insert: `kind='voice'`, `transcript`, `title=capture.title`, `schedule_precision/scheduled_for` from parsed transcript, `expires_at +15m`. On `23505` duplicate (concurrent), treat as existing pending.
- Confirm/cancel: `findPendingCapture` with `gt(expires_at, now)` + `eq(state,pending)`; `confirm` → `createTask(..., mutationId=uuidv5(updateId,"confirm-voice-task"), taskId=captureId)` → `update state=confirmed where state=pending` (check `error`); `cancel` → `update state=cancelled where state=pending`. Both idempotent under retry.
- Audio lifecycle: `let audio: Uint8Array | undefined = ...; try { transcribe } finally { audio=undefined }` already, keep.

**Tests:** `server/telegram/bot.test.ts` add 4 cases: voice too large, download fails, transcription fails (provider throws), duplicate `update_id` resends pending, confirm after expiry → `Capture expired`, cancel idempotent.

### 4.4 Forward-to-Goalflow — `server/telegram/types.ts` + `bot.ts` + schema ticket

**Telegram surface:** `message.forward_origin` (Bot API 7.0+) replaces `forward_from`/`forward_from_chat`. For privacy, Telegram may withhold `forward_origin` entirely. Must handle both.

**What to preserve (only what Telegram exposes, never fabricate):**

- `forwardedText`: `message.text` / `message.caption` (for media) — original forwarded content, not the forwarder's comment.
- `forwardOrigin`: raw `forward_origin` object as `jsonb` (if present) — contains `type: user|chat|channel|hidden_user`, `sender_user`, `chat`, `message_id`, `date`, `author_signature`.
- `sourceChat`: `chat.title`/`username` if `type=chat|channel` and disclosed.
- `sourceMessageId`: `forward_origin.message_id` if disclosed.
- `tMeLink`: construct `https://t.me/<username>/<message_id>` or `https://t.me/c/<chat_id>/<message_id>` only if `username`/`chat_id` + `message_id` disclosed and `isAutomated`? Never guess.
- `forwardDate`: `forward_origin.date`.

**Do NOT store:** full `forward_from` user objects beyond what is needed, unnecessary chat history, or inferred links.

**Interaction (minimal, deterministic):**

- If `message.forward_origin` or `forward_from`/`forward_from_chat` present, treat as forwarded capture, not plain text.
- Derive `titleCandidate` = `message.text` ?? `message.caption` ?? `""`; trim to 240 chars.
- Do NOT blindly create task with full forwarded text as title. Instead:
  1. Create `telegram_captures` pending with `kind='forwarded'`? But table `kind` currently `check (kind in ('text','voice'))`. Tranche 2 must **not** `ALTER TYPE` casually. Instead reuse `kind='text'` with `transcript = forwardedText` and new columns for source — see schema ticket below. For now, store forwarded metadata in a side JSON and keep `title` as `forwardedText` truncated, pending state.
  2. Send: `Forwarded message captured.\n\n${escapeHtml(truncatedForwardedText)}\n\nWhat do you want to do?` with `[Create task]` + `When?` flow if unscheduled. Allow user to reply with `Send revised offer Wednesday 20m` to refine title/schedule (future: reply threading).
  3. On `[Create task]` or `sch:*` callback, create task with `title` = user-refined or `forwardedText` (truncated) and `scheduledFor` from explicit parsing or pending clarification, and persist source context alongside task.

**Schema ticket (do NOT implement in Tranche 2 without review, but characterize):**

Tranche 1 status already documents the dependency. Tranche 2 must **isolate the requirement** and propose the smallest migration, **not** opportunistically `ALTER TABLE tasks`.

**Proposal to coordinate with Sol (Sync owner):**

```sql
-- Option A (preferred, minimal, additive, no backfill required):
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS forward_source jsonb;
-- forward_source: { forwardedText: text, forwardOrigin: jsonb, tMeLink: text, sourceChat: text, capturedAt: timestamptz }
-- RLS: same as tasks (row owner). Sync: included in `goalflow_task_sync_payload` / `project_goalflow_task_sync` automatically via `tasks` row.
-- Alternative Option B (if JSONB on tasks is rejected):
CREATE TABLE IF NOT EXISTS public.telegram_forward_context (
  task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  forwarded_text text NOT NULL,
  forward_origin jsonb,
  t_me_link text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: `auth.uid()=user_id`. Sync: either include via tasks payload or separate sync entity (avoid).
```

Tranche 2 **must not** execute either without explicit owner approval. Instead: for the duration of Tranche  2, store forwarded source **only** in `telegram_captures` (`transcript` + new `forward_origin` JSONB column added via additive migration **if** approved as isolated, or reuse `transcript` to stash JSON string). Document the exact `ALTER` needed and gate it on Sync hardening checkpoint.

**Tranche 2 code (without waiting for tasks.forward_source):**

- Add `server/telegram/forward.ts` helpers: `extractForwardContext(message): { forwardedText, forwardOrigin, tMeLink } | null`, `isForwarded(message): boolean`.
- Extend `server/telegram/types.ts:TelegramMessage` with `forward_origin?: unknown`, `forward_from?: unknown`, `forward_from_chat?: unknown`, `forward_date?: number`, `caption?: string`.
- In `createTelegramProcessor`, before `handleVoice`/`captureText`, check `isForwarded(message)`. If true, create `telegram_captures` pending with `kind='text'` (or new `'forwarded'` if migration approved) and `forward_origin` JSON, then send `Forwarded message captured.` prompt with same `When?` keyboard. Reuse `ensurePendingTextCapture` extended to accept `forwardContext`.
- Tests: forwarded from user (disclosed), from channel (with username), hidden_user (no username), no forward_origin (privacy) → all handled without fabricating.

**Acceptance:** `npm test` covers disclosed/hidden/no-origin, link construction only when safe, no duplicate tasks on retry, source JSON preserved.

### 4.5 Edit/confirm capture flow

- Voice already has `[Add task][Cancel]` confirm. Text pending `When?` is confirm via `sch:*`. Extend both to allow **edit before durable create**:
  - After `I heard:` or `When?`, user can reply with new text that updates the pending `title`/`schedule` in place (via `update telegram_captures set title=..., scheduled_for=... where id=captureId and state=pending`).
  - For Tranche 2, minimal: on `sch:pick`/`sch:month` instructional, user sends new message like `Buy paper 2026-09-14`; processor should detect that the user has an open pending (`select * from telegram_captures where user_id=... and state=pending and expires_at>now order by created_at desc limit 1`) and treat the new text as refinement rather than new pending? **Decision: do NOT auto-associate free-text replies to pending** (stateful conversation tracking is fragile). Instead, keep Tranche 1 model: `Pick date` is instructional, user sends a **new** message with explicit date that creates a task directly. Document this as intentional friction, revisit in Tranche 2 if needed with explicit `edit:<captureId>` callback.

### 4.6 Deep links — `App.tsx` + `server/telegram/formatting.ts`

**Current routing (`App.tsx:141`):**

```ts
const params = new URLSearchParams(window.location.search);
if (params.get('view') === 'current') setCurrentView('current');
if (params.get('capture') === 'task' ...) { // share target
}
```

No `?taskId=` handler. `formatting.ts` currently links `Open in Goalflow` → `${APP_ORIGIN}/?view=current` and `Open Planning` → `?view=planning`.

**Tranche 2:**

- Add `App.tsx` handler: `if (params.get('taskId')) { setCurrentView('current'); setTaskToEdit(tasks.find(t=>t.id===params.get('taskId')) ?? null); setIsTaskModalOpen(true) }` or highlight. Keep `view=current` as fallback.
- `formatting.ts:addedKeyboard(taskId)` already has `undo:<taskId>` + `date:<taskId>`; extend `formatAdded` to include `Open` button with `url: ${APP_ORIGIN}/?taskId=${taskId}&view=current` (exact task) alongside `Undo`.
- `formatCurrent`/`formatToday` already have `Open in Goalflow`; keep, but ensure `Open` for `formatAdded` is exact.

**Files:** `App.tsx:141` (+5 lines), `server/telegram/formatting.ts` (+1 button).

**Tests:** `App.test.tsx` (if exists) or manual verification; `formatting.test.ts` add `Open` URL assertion.

### 4.7 Adversarial & retry tests

Add `server/telegram/bot.adversarial.test.ts` (or extend `bot.test.ts`):

- Duplicate `update_id` for `text-capture` pending → no duplicate `telegram_captures`, resends `When?`.
- Duplicate `sch:today` callback (same `update_id` retried) → no duplicate task (idempotent `taskId=captureId` + `uuidv5`).
- Voice `getFile` fails / download `file_size` > limit / `transcribe` throws → explicit user message, no pending.
- `telegram_captures` `state=confirmed` on second `confirm` → no-op.
- Timezone/DST: `addDays` across `2026-03-29` DST (Europe) still calendar day via `Date.UTC`.
- Forwarded privacy: `forward_origin.type=hidden_user` → no `tMeLink`, still creates pending.

---

## 5. Architecture — what changes, what stays

**Stays:**

- `server/routes/telegram.ts` — webhook-secret, `telegram_updates` dedup, claim, `503` retry.
- `server/routes/sync.ts` / `services/syncProtocol.ts` — no Sync engine fork.
- `src/domain/scheduling.ts` — canonical `assertSchedule`/`buildTodayQueue`.

**Changes:**

```
server/telegram/capture.ts      +80  (time/duration/tags/weekday)
server/telegram/capture.test.ts +20  (new tokens)
server/telegram/forward.ts      NEW  (extractForwardContext, isForwarded)
server/telegram/bot.ts          +120 (forward branch, duration/tags plumbed, deep-link Open)
server/telegram/formatting.ts   +10  (Added Open exact, duration/tags display)
server/telegram/types.ts        +10  (forward_origin/caption)
App.tsx                         +5   (?taskId)
supabase/migrations/202609XX_forward_source.sql  NEW (only if approved, additive, RLS same as tasks)
```

No new table for Mini App, no Sync table.

---

## 6. Implementation sequence (small, reviewable commits)

**Commit 1 — Capture grammar (pure, no bot):**
- `server/telegram/capture.ts` + `capture.test.ts` + `capture.property.test.ts`.
- Verify `npm test` 79→~95, `tsc --noEmit`.

**Commit 2 — Forward helpers (pure, no DB):**
- `server/telegram/forward.ts` + `forward.test.ts` + `types.ts` extension.
- `npm test`.

**Commit 3 — Bot wiring (Tranche 2 product):**
- `server/telegram/bot.ts` (forward branch, duration/tags, `Open` exact), `formatting.ts`, `pending.ts` (forward context), `App.tsx` deep link.
- `npm test` + `bot.test.ts` + `bot.adversarial.test.ts`.

**Commit 4 — Hardening & docs:**
- Voice failure paths, `bot.adversarial.test.ts` duplicate/retry, `docs/TELEGRAM_V1_STATUS.md` update, `supabase/migrations/...` only as isolated proposal (not applied until approval).

Each commit ≤150 lines, `git log --oneline` reviewable, `git push` only to `feat/telegram-v1`.

---

## 7. Tests — what must be green

- `server/telegram/capture.test.ts` + `.property.test.ts`: `today`, `next Friday`, `Friday`, `2026-09-14`, `14:30`, `at 14:30`, `20m`/`45 min`/`2h`/`1h 30m`, `#tag`/`#Movetrics`, combined `Call Peter tomorrow 14:30 20m #sales`.
- `server/telegram/forward.test.ts`: disclosed user, channel with username → `t.me`, hidden_user → no link, no forward → null.
- `server/telegram/bot.test.ts` (existing 4) + 4 new: voice failures, duplicate pending, `sch:today` idempotent, `sch:pick` instructional.
- `server/telegram/bot.adversarial.test.ts` (new 4): duplicate `update_id` pending, duplicate `sch:today`, voice `getFile` fail, forward privacy.
- `src/domain/scheduling.test.ts` unchanged, `npm test` 79→~95.

---

## 8. Risks & mitigations

- **Natural parsing false positives** (`May` as month vs verb): anchor date/time/duration/tags to **trailing tokens only** (`\s+...$`), require `assertSchedule` to reject past month, keep title intact.
- **Duration/tags title corruption** (`Buy paper #`): `tags` regex `#[A-Za-z0-9_-]{1,64}` at end, dedup, no `source` change.
- **Forward `forward_origin` absent** (privacy): treat as plain text capture, do not fabricate, still allow `When?` flow.
- **Schema for forward source** (Sync hardening): do NOT `ALTER TABLE tasks` in Tranche 2 without owner sign-off. Keep Tranche 2 code working with `telegram_captures` JSON stash; migration is additive and gated.
- **Deep link fragility** (`?taskId`): guard `App.tsx` with `tasks.find` existence check, fallback to `?view=current`.

---

## 9. Dependencies — who to coordinate with

- **Sol Max (Sync):** approve `tasks.forward_source jsonb` or side table before migration; otherwise keep Tranche 2 behind `telegram_captures` JSON.
- **Web (App.tsx):** `?taskId` handler — 5 lines, no Sync impact.
- **Luna Max (Android):** no `android-native/` changes.
- **Spark macOS/Chrome:** no `macos-native/`/`chrome-extension/` changes.

---

## 10. Acceptance for Tranche 2 done

- `npm test` 79→~95 green, `tsc --noEmit` clean.
- `Send revised offer Wednesday 20m` creates `Wednesday` `20m` correctly; `#movetrics` preserved.
- Voice `I heard:` → `[Add task]` → idempotent, no duplicate on retry, explicit failure.
- Forwarded `forward_origin=user` with `t.me` link preserved as JSON, hidden_user not fabricated, no duplicate.
- `Added: … [Undo][Open]` opens exact task via `?taskId=`.
- No new Sync engine, no silent `Today`, no broad migration without approval.

---

## 11. What is NOT Tranche 2

- Mini App `initData` validation, UI, date pickers (Tranche 3).
- Webhook chaos/rate-limit/deployment docs (Tranche 4).

---

*Next step for implementer: `git checkout feat/telegram-v1` at `bb5c7af`, branch already at `origin/feat/telegram-v1`, implement Commit 1 (capture grammar) first, keep `npm test` green, push only to `feat/telegram-v1`.*
