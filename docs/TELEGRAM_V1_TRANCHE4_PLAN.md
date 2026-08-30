# Goalflow Telegram V1 — Tranche 4 Plan: Production Hardening

**Branch:** `feat/telegram-v1` (base `44f2e47`, tip after Tranche 3: `31bba10`+; Tranche 3 added `miniAppAuth`/`telegramMini`/`telegram-mini-app` + `build:mini`)  
**Status:** Tranche 1 (79 tests) + Tranche 2 (98 tests, rich capture) + Tranche 3 (107 tests, Mini App) COMPLETE.  
**Goal of Tranche 4:** Make Telegram **production-safe** — no silent data loss, no duplicate tasks, no secret leakage — and ship deployment docs. No new product surface.

---

## 1. What Tranche 4 must prove

V1 is not production-complete until `docs/TELEGRAM_V1_CONTEXT.md:15` all true: webhook retries safe, idempotency preserved, no silent data loss/incorrect scheduling, timezone tested, core works if Telegram down. Tranche 4 is the evidence.

---

## 2. Scope — in / out

**In:**

- Webhook chaos / duplicate `update_id` / out-of-order delivery across replicas / process-die after `200` vs `503`.
- Voice provider failures / file-size / timeout / partial DB (capture `insert` vs `tasks` `RPC`).
- Timezone/DST calendar-day rollover.
- Forwarded-privacy variations (hidden_user, empty caption/text, `forward_from_chat` without username).
- Mini App auth attacks / replay / missing `hash` / rate-limit.
- Logging review (no `initData`/`hash`/`title`/`transcript`/`forward_origin`/`BOT_TOKEN` in logs or client bundles).
- Deployment / migration verification / docs.

**Out:**

- New product: focus timers, Pomodoro, music, AI chat, Planning/Goals/Habits, Sync engine, new `tasks` columns (beyond `forward_source` already additive).

---

## 3. Workstreams (each ≤1 commit, ≤150 lines, `npm test` + `tsc --noEmit` green)

### 3.1 Webhook dedup & idempotency chaos

**Current:** `server/routes/telegram.ts:55` `telegram_updates PK update_id` + `outcome` + `503` forces retry, `ids.ts:uuidv5(updateId,op)` → `goalflow_*_idempotent` + `api_mutation_receipts` advisory lock, `pending.ts:state pending→confirmed` check.

**Tranche 4:**

- Add `server/telegram/bot.chaos.test.ts` (or extend `bot.adversarial`):
  - Duplicate `update_id` `text-capture` pending: second `POST /webhook` with same `update_id` → `200 duplicate:true` (no second `telegram_captures` row), first `When?` resent idempotently.
  - Duplicate `sch:today` callback same `update_id` retried (Telegram `answerCallbackQuery` timeout → retry): second `POST` → `200 duplicate:true` (no second `tasks` row, `taskId=captureId` same, `api_mutation_receipts` hit).
  - Process-die after `200` but before `outcome=processed`: simulate `telegram_updates` `outcome=processing` with `processed_at=null`, second `POST` same `update_id` → re-claims `outcome=processing` → reprocesses safely via idempotent `uuidv5` (no `23505` ignore unless `processed`).
  - Out-of-order `update_id` 1002 before 1001 (Telegram does not guarantee order) → both processed, `loadQueue` still deterministic.
- Verify `server/routes/telegram.ts` already handles `previous?.outcome !== "processed"` reprocess; add test that `outcome=error` also reprocesses.

**Files:** `server/telegram/bot.chaos.test.ts` NEW, `server/routes/telegram.test.ts` NEW (if not exists, test webhook secret `401`, `400 invalid_update`, `503 dedup unavailable`).

### 3.2 Voice / provider / partial DB

**Current:** `bot.ts:handleVoice` 19MB pre/post check, `20s` getFile, `45s` transcribe, `audio=undefined` finally, explicit `Voice note could not be ... Try again as text.` + `return` (no throw) — already hardened in Tranche 2, but needs adversarial coverage for partial DB.

**Tranche 4:**

- `bot.voiceFailure.test.ts` (or extend adversarial):
  - `getFile` returns `ok:false` or `file_path` missing → `Voice note could not be retrieved.` + no `telegram_captures` row, `logger.warn` no audio.
  - `fetch file/botTOKEN/path` `ok:false` or `byteLength >19MB` post-download → `Voice note could not be downloaded.` + no row.
  - `speech.transcribe` throws → `Voice note could not be transcribed.` + no row, `audio` cleared.
  - `OPENAI_API_KEY` missing (`speech` undefined) → `Voice capture is not configured` (already).
  - Partial DB: `telegram_captures.insert` succeeds but `sendMessage` `fetch` fails (Telegram 500) → `telegram_updates` `outcome=error` → retry `POST` same `update_id` → second `handleVoice` sees `existingCapture.state=pending` → resends `I heard:` (no duplicate row).
  - `TELEGRAM_MAX_VOICE_BYTES` lower bound (1k) → `file_size` 2k rejected.

**Files:** `server/telegram/bot.voiceFailure.test.ts` NEW, `server/speech/openai.test.ts` NEW (mock `fetch` for `audio/transcriptions`  `401`).

### 3.3 Timezone / DST

**Current:** `queue.ts:localDateFor` `Intl.DateTimeFormat(en-CA, timeZone)` + fallback `toISOString`, `pending.ts:addDays` via `Date.UTC`, `capture.ts:nextWeekday` via `Date.UTC`.

**Tranche 4:**

- `server/telegram/timezone.test.ts` NEW:
  - `localDateFor` with `profiles.timezone="Europe/Berlin"` on `2026-03-29` DST spring-forward (02:00→03:00): `2026-03-29T00:30Z` is `2026-03-29` in UTC but `2026-03-29` in Berlin, `2026-03-29T23:30Z` is `2026-03-30` in Berlin — verify no UTC drift.
  - `addDays("2026-02-28",1)` → `2026-03-01` (already), `addDays` across DST still `YYYY-MM-DD`.
  - `nextWeekday` on Sunday `2026-08-30` → Friday `2026-09-04` deterministic.
- Ensure `supabase/migrations/202608260001...:validate_goalflow_task_schedule()` uses `profiles.timezone` → `local_today` (already), not `current_date`.

### 3.4 Forwarded privacy variations

**Current:** `forward.ts:65` handles `forward_origin`/`forward_from`, `tMeLink` only when `username`+`message_id`, `bot.test.ts` covers hidden_user.

**Tranche 4:**

- `forward.privacy.test.ts` (or extend `forward.test.ts`):
  - `forward_origin.type=hidden_user` (no `chat`, no `message_id`) → `tMeLink=null`, `forwardedText` from `caption` preserved, pending created.
  - `forward_from_chat` with `title` but no `username` and `message_id` → `tMeLink=null` (not `https://t.me/c/...` unless `chat.id` is supergroup `-100...`; test both).
  - `caption` vs `text`: media with `caption` → `forwardedText=caption`, `text` ignored.
  - Empty `text`+`caption` (`forwardedText.trim()==""`) → `isForwarded` false or `extractForwardContext` null → fallback to plain capture (do not create empty task, throw `invalid_title` → user sees `Send an actionable task title.`).
- Verify `handleForward` does not log `forwardedText`.

### 3.5 Mini App auth attacks & rate limiting

**Current:** `miniAppAuth.ts:80` HMAC, `telegramMini.ts:60` `rateLimit 60/min`, `miniAuth` middleware, tests `miniAppAuth.test.ts` 6.

**Tranche 4:**

- `miniAppAuth.attack.test.ts` NEW:
  - Replay: `auth_date` 25h ago → `expired` (401).
  - Tampered `user` JSON (`id` changed) → `invalid_hash`.
  - Missing `hash` → `invalid_format`.
  - `user.id` as string `"12345"` → `invalid_format` (must be number).
  - `Authorization` header `tma` case-insensitive, `initData` via `?initData=` query also accepted, via `?tma=` also.
  - Rate-limit: 61st `GET /mini/current` within 60s → `429`.
- Logging review: `grep -R "initData\|hash\|transcript\|forward_origin" server/` → only `miniAppAuth.ts` and tests, no `logger.info` with those. Add `server/logger.test.ts` assert.

### 3.6 Logging review (no secrets/content)

- `grep -R "logger\." server/telegram/` → only `logger.warn("telegram.capture_rejected", {updateId, userId, category})` and `logger.error("telegram.update_failed", {updateId, category})` — no `title`/`transcript`/`initData`/`BOT_TOKEN`.
- Add `server/telegram/logging.test.ts` NEW: mock `logger`, trigger `handleVoice` failure, assert `logger.warn` called without `transcript`.

### 3.7 Deployment & migration verification

**Current:** `supabase/migrations` 6 files (`20260717_foundation`, `20260718_scheduled_execution`, `20260825_reliability`, `20260826_zero_silent`, `20260829_native_task_events`, `20260901_telegram_rich_capture`), `package.json:build` → `build:client`+`build:mini`+`build:server`, `railway.json` `healthcheckPath /api/v1/health`, `scripts/verify-*.mjs` check `dist/client`/`dist/server` secrets.

**Tranche 4:**

- `scripts/verify-telegram-migrations.mjs` NEW (or extend `verify-migrations`): apply migrations in order on ephemeral Postgres (via `supabase/migrations` + `test-postgres-migrations.sh`), assert `telegram_captures` has `scheduled_time`/`estimated_minutes`/`tags`/`forward_origin` and `tasks.forward_source` exists, RLS `telegram_captures` select `auth.uid()=user_id` still, `api_mutation_receipts` still.
- `scripts/scan-client-secrets.mjs` already checks `dist/client` for `SUPABASE_SERVICE_ROLE_KEY`/`TELEGRAM_BOT_TOKEN` — extend to `dist/mini` (ensure `BOT_TOKEN` not bundled).
- `railway.json` verify `build:mini` output `dist/mini` served at `/mini` before SPA fallback (already in `server/app.ts`), `healthcheckPath` still `/api/v1/health` plus `GET /api/v1/telegram/mini/health` → `{ok:true}`.
- `docs/DEPLOYMENT.md:23` add section `Telegram Mini App` (env `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `APP_ORIGIN`, `SUPABASE_*`, set `TELEGRAM_MINIAPP_MAX_AGE_SEC` if used, run `supabase/migrations` in order, set webhook `https://<APP_ORIGIN>/api/v1/telegram/webhook` with `secret_token`).
- Manual checklist (not automated, but documented): two-device Telegram → text `Buy paper` → `When?` → `Today` → `Added` → `Undo` → `Current` → Mini App `Current`/`Today`/`+ Capture` → voice `I heard:` → `Add task` → forward from user/channel/hidden_user → `Forwarded message captured.` → `Open` exact `?taskId`.

---

## 4. What stays, what changes

**Stays:** `syncProtocol.ts`/`cloudSync.ts`/`storage.ts` (Sol), `android-native/` (Luna), `macos-native/`/`chrome-extension/` (Spark), `scheduling.ts` canonical, `server/routes/telegram.ts` dedup (already chaos-tested).

**Changes (additive, ≤8 files):**

```
server/telegram/bot.chaos.test.ts          NEW
server/telegram/bot.voiceFailure.test.ts   NEW
server/telegram/timezone.test.ts           NEW
server/telegram/forward.privacy.test.ts    NEW
server/telegram/miniAppAuth.attack.test.ts NEW
server/telegram/logging.test.ts            NEW
scripts/verify-telegram-migrations.mjs     NEW (or extend)
docs/DEPLOYMENT.md                         +10 (Mini App env + webhook)
docs/TELEGRAM_V1_STATUS.md                 update §6 evidence, §9 Tranche 4 done
```

No new `tasks` columns, no new `telegram_captures` kinds, no new Sync engine.

---

## 5. Implementation sequence (3 small commits)

**Commit 1 — Chaos & voice:** `bot.chaos.test.ts` + `bot.voiceFailure.test.ts` + `bot.ts` no change (just verify existing `throw` → `return` already), `npm test` 107→~115.

**Commit 2 — Timezone/forward/logging:** `timezone.test.ts` + `forward.privacy.test.ts` + `logging.test.ts` + `miniAppAuth.attack.test.ts`, `npm test` →~120.

**Commit 3 — Deployment docs & migration verify:** `scripts/verify-telegram-migrations.mjs` + `docs/DEPLOYMENT.md` + `docs/TELEGRAM_V1_STATUS.md` (Tranche 4 done), `npm run verify:migrations` + `npm run verify:client-secrets` (now also `dist/mini`) + `npm run build` green.

Each ≤150 lines, `git log --oneline` reviewable, `git push` only to `feat/telegram-v1`.

---

## 6. Tests — what must be green for Tranche 4 done

- `npm test` 107→~120 (16→~22 suites), `tsc --noEmit` clean, `npm run build` (client+mini+server) clean.
- `npm run verify:migrations` (ephemeral Postgres) — all 6 migrations apply, `telegram_captures` + `tasks.forward_source` exist.
- `npm run verify:client-secrets` — no `TELEGRAM_BOT_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` in `dist/client` nor `dist/mini`.
- Manual Telegram (staging, real bot): text → `When?` → `Today` → `Added` → `Undo` → `Current`/`Today`, voice → `I heard:` → `Add task`, forward hidden_user → no `t.me` but pending, Mini App `Current`/`Today`/`+ Capture` → `?taskId` opens exact.

---

## 7. Risks & mitigations

- **Webhook `outcome=processing` stuck (process die before `processed`):** existing `telegram_updates` `outcome=processing` + `503` retry already reprocesses via idempotent `uuidv5` — Tranche 4 just adds test, no code.
- **Voice `file_size` lie (Telegram reports 1000 but body is 20MB):** already post-download `byteLength` check — test ensures no pending.
- **DST `2026-03-29` Europe/Berlin:** `addDays` via `Date.UTC` + `localDateFor` via `Intl.DateTimeFormat` — test ensures `YYYY-MM-DD` stable.
- **Forwarded empty text:** `extractForwardContext` returns `null` → fallback to plain capture, `assertSchedule` rejects empty title → user sees `Send an actionable task title.`, no empty task.
- **Mini App rate-limit bypass via `?initData` query:** `miniAuth` checks both `Authorization: tma` and `?initData`, both rate-limited 60/min, `timingSafeEqual` prevents timing attack.
- **Secret leakage to client:** `vite.mini.config.ts` `base:/mini/` + `define: { 'process.env.TELEGRAM_BOT_TOKEN': undefined }` (already not in `dist/mini` via `verify:client-secrets`).

---

## 8. Dependencies — who to coordinate with

- **Sol Max (Sync):** Tranche 4 adds no `tasks` columns, no `sync_records` types — no coordination needed, just verify `verify:migrations` still passes `goalflow_sync_protocol_version()=2`.
- **Web (`App.tsx`):** `?taskId` already in Tranche 2 (`04aa5b4`), no new web code.
- **Luna/Spark:** no `android-native/`/`macos-native/`/`chrome-extension/` changes.

---

## 9. Acceptance for Tranche 4 done (V1 production-complete)

- `docs/TELEGRAM_V1_CONTEXT.md:15` all true (webhook retries safe, idempotency preserved, no silent data loss/incorrect scheduling, timezone tested, core works if Telegram down).
- `npm test` ~120 green, `npm run verify:migrations` green, `npm run verify:client-secrets` green, `npm run build` green.
- Manual staging Telegram (real bot) checklist passes (text/voice/forward/Current/Today/Mini App/`Open` exact/`Undo`).
- `docs/DEPLOYMENT.md` + `docs/TELEGRAM_V1_STATUS.md` updated, `git push origin feat/telegram-v1` (Tranche 4 tip) and PR ready for `goalflow-production`.

---

*Next step for implementer: `git checkout feat/telegram-v1` at `31bba10` (now `origin/feat/telegram-v1`), implement Commit 1 (chaos/voice) first, keep `npm test` green, push only to `feat/telegram-v1`.*
