# Goalflow Chrome Execution Companion — Master Implementation Plan

**Branch:** `feature/chrome-execution-companion`  
**Base SHA:** `6825b38cf5a41efa8cff49736c12b0aa6c159e74` (origin/goalflow-production 2026-08-30, tranche1 APK diagnostic fix)  
**Spec constitution:** `Goalflow Chrome — Muse Spark Working Context.md` (browser execution companion)  
**Production snapshot at session start:** `f93684ac50562c03c99328d98e57eb67f862eb3b` → fetched `6825b38` (3 commits ahead, includes macos-native session A)  
**Last updated:** 2026-08-30 — Session A (Foundation)

---

## 1. Base identity & isolation

- Recorded exact SHA at Chrome session start: `6825b38cf5a41efa8cff49736c12b0aa6c159e74`. Confirmed via `git fetch origin && git rev-parse origin/goalflow-production`. Previous snapshot `f93684a` advanced by `6e1530b`, `750eaca`, `6825b38` (Android APK diagnostics) + merged `a9f5e41` macOS Session A already in production head (verified via `git ls-tree -r HEAD | grep macos-native`). Local HEAD before Chrome branch = `6825b38`.
- New branch `feature/chrome-execution-companion` created tip-on `6825b38`. If branch already exists later, verify `git merge-base origin/goalflow-production HEAD == 6825b38` and re-record with `git log --oneline -5`. Do not `git merge` moving production mid-tranche; final integration is deliberate QA merge.
- No direct commits to `goalflow-production`. All Chrome work under `chrome-extension/`. Cross-cutting docs under `docs/CHROME_*`. No modifications to `android-native/`, `android/`, `macos-native/`, or sync server contracts in Sessions A–I. Sync stays authoritative under Sol Max.
- Parallel work: Luna Max (Android), Mac companion (`feature/macos-execution-companion` already merged to production), Sol Max (Sync hardening). Chrome file set is disjoint: `chrome-extension/**` vs `macos-native/**` vs `android-native/**` — no merge conflict expected except `docs/`.

---

## 2. Architecture findings from repository audit

### 2.1 Product invariants (docs/PRODUCT_PHILOSOPHY.md)

- **Schedule-first:** every task belongs to exact local day `YYYY-MM-DD` or future month `YYYY-MM`. No Inbox/Someday swamp. `select date` factory default; user may configure capture default later but v1 must not silently assume `today`.
- **Current = one deterministic queue head.** `groupRank(0=beforeFrog+habit → 1=frog → 2=rest)` then `plannedOrder → circadianRank → scheduledTime → createdAt → id`. No list browsing during execution.
- **Completion durable:** `completedAt` before sync; `broken_down` closes parent, not delete. Completed must not reappear after reload/sync.
- **Local-first:** IndexedDB + WAL + fallback localStorage, Room on Android, `chrome.storage.local` on Chrome. Sync is enhancement.
- **Planning gate** guards execution: `getPlanningGate` returns `monthly_planning_required | daily_planning_required | ready | empty`. Overdue or unconfirmed plan blocks Current.

### 2.2 Scheduling domain — sole source of truth

- Single pure domain `src/domain/scheduling.ts:1-456` (+ mirrored `android-native/.../GoalflowDomain.kt:260` + Swift `macos-native/GoalflowMac/Domain/GoalflowTask.swift:136`). Chrome ports this verbatim in `chrome-extension/src/domain/scheduling.ts`.
- Key exports: `SchedulePrecision`, `ScheduledTask{ id,userId,title,notes,tags,schedulePrecision,scheduledFor,scheduledTime,plannedOrder,status,isFrog,frogFailures,beforeFrog,source,parentTaskId,habitId,createdAt,updatedAt,deletedAt,version,serverVersion,circadianRank }`, `assertSchedule` (validates `isRealDay/isRealMonth`, `current_month_requires_day` for `scheduledFor ≤ monthOf(today)`, `HH:mm` only for `day`), `createScheduledTask`, `compareQueueCandidates / compareCurrentTasks`, `buildTodayQueue(tasks,today)`, `getPlanningGate(tasks,today,plan)`, `skipTask`, `rescheduleTask` (blocks forward move for frogs, promotes after 2 forward reschedules), `breakDownTask`, `dropTask`, `generateHabitInstance`.
- Web extras `types.ts:100-135` `Task{ duration?: minutes, actualDuration, hashtags, flowState, ...}` — duration lives in `extraJson.duration` (default 25) on Android/Room, opaque JSON preserved. Chrome `GoalflowTask` keeps `durationMinutes 1..1440 default 25` + `extraJson="{}"` for round-trip.
- `utils/dateUtils.ts` `toYYYYMMDD` via `getTimezoneOffset`; Chrome uses `Intl` or same offset hack but consistently local day. Never trust server day.

### 2.3 Task model width & persistence

- Web `services/storage.ts:940` — `STORES={tasks,goals,habits,stats,progress,hashtags,accountability,truenorth,amalgam,tracking,circadian,settings,daily_plans,sync,snapshots}`, `SYNCABLE` = all except snapshots/sync. `GoalflowDB` IndexedDB with WAL `goalflow_wal_v2_*`, `verifiedLocalStorageWrite` + read-back, `fallbackKey/recoveryKey/deletedKey`, `reconcileStagedTransactions` per-entity. Mutations staged via `buildStagedLocalTransaction` splitting `RECORD_LEVEL_STORES` into per-entity `SyncMutation`.
- `services/syncProtocol.ts:848` — `SyncMeta{cursor,versions:{local,server},outbox,conflicts}`, `version` int, `dependsOnMutationId` causal chain, `readyOutbox`, `markMutationsAttempted`, `applyPushResults` (exact fingerprint `stableJson(payload)`+sameInstant), `applyRemotePage` (cursor monotonic `nextCursor==max(serverVersion)`, `hasMore` guard, `push-rejected|remote-vs-local` ledger), `resolveConflictWithLocal/applyConflictCloudValue`. Chrome defers this to Tranche K; v1 uses `NoopSyncGateway`.
- `services/cloudSync.ts:249` `synchronizeCloudOnce` push 50 / pull 100 + `BroadcastChannel+ navigator.locks` 60 s poll + 500 ms debounce. Android mirrors with Room `sync_outbox/sync_meta/sync_conflicts/raw_collections` + `NativeSyncEngine.kt:307` identical. Server `server/routes/sync.ts:172` protocol v2 `goalflow_sync_protocol_version==2`, `server/routes/tasks.ts:363` `GET /current?date=` returns `gate + current=queue[0]`, idempotent `POST /tasks/*/complete|skip|reschedule|breakdown|confirm`.

### 2.4 Web focus / timing

- `hooks/useFocusTimer.ts:213` `PersistedState{taskId,startTime,pausedAt,elapsedBeforePause,isActive,hasExpired}` in `localStorage goalflow_timer_state`, elapsed `elapsedBeforePause+floor((now-startTime)/1000)`, ticker 250 ms, `addTime` rewrites accumulator. `hooks/useTickingSound.ts:71` AudioContext tick 1500 Hz Q20. `components/CurrentView.tsx:979` `CircularTimer` SVG progress, flow labels `<5 entering <20 Deep ≥20 Flow`, expiry alarm+modal.
- Android `data/GoalflowFocusSession.kt:57` `SharedPreferences task_id+startedAt commit+verify` (anchor only, Room task authoritative). Mac `Services/FocusSessionStore.swift:73` `UserDefaults goalflow.focus.session.v1` JSON `secondsSince1970` verified, `ExecutionState.swift:34` `remaining=max(0,planned-floor(now-startedAt))`, `ExecutionTimer.swift:86` `Timer.publish(1).autoconnect`.
- Chrome constraint: service worker suspends after ~30 s, `setInterval` throttled, `localStorage` unavailable in SW. Must use `chrome.storage.local` + `chrome.alarms` + wall-clock reconstruction.

### 2.5 Auth & server surfaces

- `services/authService.ts` `supabase.createClient(VITE_SUPABASE_URL,VITE_ANON_KEY,persistSession)` in `localStorage sb-*`, `authenticatedFetch` bearer `local-demo` or `sb` token, `server/auth.ts` validates `Bearer` + `aal2` for owner, `server/config.ts` `APP_ORIGIN/CORS_ORIGINS/SUPABASE_*`. Extension origin `chrome-extension://` cannot share app origin storage → content-script bridge or re-login via `chrome.identity`. Tranche 1 uses `StubAuthGateway(isAuthenticated:false)`; J will add `ChromeAuthGateway` with `chrome.storage.session` encrypted token, PKCE, `goalflow://auth/callback` equivalent.

### 2.6 Build / PWA / tests

- `package.json:71` `type:module`, Vite 6 + React 18 + `vite-plugin-pwa`, `scripts: lint tsc --noEmit, test vitest run, build vite+esbuild`. Web tests 68 + 400 property via vitest. Native 44 JVM tests. Chrome uses separate `chrome-extension/package.json` with Vite build for MV3 (no `vite-plugin-pwa`), `vitest` + `fake-indexeddb` for store tests, `tsc --noEmit` lint.

### 2.7 Platform parallels relevant to Chrome

- Android scheduling invariants (habit uniqueness trigger, `circadianRank` sentinel `MAX_SAFE`, `extraJson` opaque) → Chrome must keep same.
- Mac provider boundary `CurrentTaskProvider` (Demo → SyncBacked) is strongest pattern for Chrome to copy vs Android tight coupling.
- Both Android+Mac store only anchor, not decrement — Chrome must same.

---

## 3. Product invariants to preserve (hard constraints)

1. One Current head only; no backlog/project browser in Side Panel.
2. Day|month precision validated; `Select date` default; no silent `today`.
3. Frog cannot skip or move forward; 5 s vs 3 s hold distinguished (Tranche C).
4. Breakdown closes parent `broken_down`; never delete parent.
5. Completion durable before celebration; no resurrection after reload/sync.
6. Local-first; Side Panel works offline; timer survives kill/restart/ SW suspension.
7. Sound slots not files; tick swappable (Tranche B offscreen).
8. `FlowState` enum `distracted|good|high|flow` canonical.
9. Planning gate: when `daily_planning_required|monthly_planning_required` show CTA not actionable Current.
10. ADD vs ACTION distinct (ADD ordinary ordering, ACTION starts now);Tranche D.
11. Zero silent data loss for every execution transition (§12).

---

## 4. Chrome extension architecture (Session A target + evolution)

### 4.1 Surface topology

- **Primary:** Chrome Side Panel (`chrome.sidePanel` API, Chrome 114+). Default `side_panel.default_path = sidepanel/index.html`, `openPanelOnActionClick: true`. Toolbar `chrome.action` click opens panel; no popup dashboard.
- **Future surfaces (later tranches):** Quick Capture overlay (command `Ctrl+Shift+G`), options page for Focus Shield settings, block screen override, break cover via `chrome.tabs.update` redirect (not OS overlay).
- Session A only installs: manifest, background SW, side panel, options placeholder.

### 4.2 Module boundaries

```
chrome-extension/
  manifest.json
  vite.config.ts
  tsconfig.json
  package.json
  src/
    domain/
      scheduling.ts          # vendored from src/domain/scheduling.ts (pure, no DOM)
      types.ts               # GoalflowTask, ExecutionState, FlowState, TaskContext placeholder
    services/
      Clock.ts               # SystemClock / FixedClock / ManualClock (test)
      FocusSessionStore.ts   # chrome.storage.local verified write
      GoalflowStore.ts       # DemoTaskStore (v1) → LocalGoalflowStore (v2)
      ExecutionTimer.ts      # reference-time derived remaining
    providers/
      CurrentTaskProvider.ts # interface
      DemoCurrentTaskProvider.ts # deterministic 2-task queue sorted, chrome.storage.local persisted
    gateways/
      SyncGateway.ts         # NoopSyncGateway (v1) → NativeSyncEngine parity (K)
      AuthGateway.ts         # StubAuthGateway
      ActionGateway.ts       # local transition (v1) → POST /api/v1/sync/push (J)
      CaptureGateway.ts      # stub (D)
      BreakdownGateway.ts    # stub
    background/
      serviceWorker.ts       # sidePanel behavior, alarms, messaging, startup recovery
    sidepanel/
      SidePanel.tsx          # Current-first view
      SidePanel.css
      index.html
      index.tsx
    components/
      CircularProgress.tsx
      FrogBadge.tsx
  tests/
    scheduling.test.ts
    executionState.test.ts
    executionTimer.test.ts
    focusSessionStore.test.ts
    demoCurrentTaskProvider.test.ts
  public/
    icons/icon16.png ...128
```

Core protocols declared now, stubbed:

```ts
interface CurrentTaskProvider { fetchCurrent(today: string): Promise<GoalflowTask | null>; allTasks(today: string): Promise<GoalflowTask[]>; setFrogDemo(isFrog: boolean): Promise<void>; }
interface FocusSessionStore { load(): Promise<ExecutionState | null>; save(state: ExecutionState): Promise<void>; clear(): Promise<void>; }
interface GoalflowStore { loadTasks(): Promise<GoalflowTask[]> } // v1 local only
interface SyncGateway { synchronize(): Promise<void> } // noop
interface AuthGateway { isAuthenticated: boolean }
interface ActionGateway { start(taskId: string): Promise<ExecutionState> }
interface BreakdownGateway { suggest(task: GoalflowTask): Promise<BreakdownChild[]> }
interface Clock { now(): Date }
```

Implementations:
- `DemoCurrentTaskProvider` v1: stores `goalflow.demo.tasks.v1` JSON in `chrome.storage.local` (fallback to in-memory for tests), seeds `demo-1 Draft Q4 roadmap — outline three bets 25m order0`, `demo-2 Review weekly goals 15m order1` for `todayStr`, returns `buildTodayQueue(all,today)[0]`. Keeps deterministic order via vendored comparator.
- `ChromeTaskStore` later → IndexedDB `GoalflowDB` extension origin.
- Production `SyncBackedCurrentTaskProvider` reads `GoalflowStore` + `DailyPlan` gate (J).

### 4.3 Domain port

TS `GoalflowTask` mirrors `ScheduledTask` + web `Task` union:

```ts
type SchedulePrecision = 'day'|'month';
type TaskStatus = 'open'|'completed'|'broken_down'|'dropped'|'archived';
type TaskSource = 'manual'|'habit'|'telegram'|'share'|'ai'|'migration';
interface GoalflowTask {
  id: string; title: string; notes: string; tags: string[];
  schedulePrecision: SchedulePrecision; scheduledFor: string; scheduledTime?: string;
  plannedOrder: number; status: TaskStatus; isFrog: boolean; frogFailures: number;
  beforeFrog: boolean; source: TaskSource; parentTaskId?: string; habitId?: string;
  createdAt: string; updatedAt: string; version: number; durationMinutes: number; // 1..1440 default 25
  extraJson: string;
}
```

`durationMinutes` lives outside `extraJson` for UI convenience but round-trips via `extraJson` in sync future.

### 4.4 Execution style

- TypeScript 5, React 18 for side panel (reuse web tokens), Vite build separate from web.
- No external runtime deps in v1 (stay zero-dep besides React). Later: `idb` for IndexedDB.
- MV3, `chrome.storage.local` async verified write, `chrome.alarms` for heartbeat, `chrome.sidePanel` for panel.
- Least privilege from day one.

---

## 5. State machine for execution (authoritative)

Deterministic FSM, persisted at transition boundaries (before announcing success). Single source of truth: `ExecutionState`.

```ts
type ExecutionPhase = 'idle' | 'active' // 'paused'|'overtime' added in B
interface ExecutionState {
  taskId: string;
  phase: ExecutionPhase;
  startedAt: number;               // Date.now() ms wall-time of ACTION
  plannedDurationSeconds: number;  // durationMinutes*60
}
function remainingSeconds(state: ExecutionState, now: Date): number {
  if (state.phase==='idle') return state.plannedDurationSeconds;
  return Math.max(0, state.plannedDurationSeconds - Math.floor((now.getTime() - state.startedAt)/1000));
}
```

Transitions (v1):
- `idle --ACTION--> active`: validate task exists+open+today, write `ExecutionState{phase:active,startedAt:Date.now(),plannedDurationSeconds:task.duration*60}` durably via `FocusSessionStore.save` → read-back verify → then publish to UI and start `ExecutionTimer`. On failure, no UI transition.
- No other transitions in v1. Kill & relaunch / SW suspension / panel close: `FocusSessionStore.load()` → if present and `taskId` still in `buildTodayQueue` open and `scheduledFor==todayStr` then reconstruct `remaining`; else `clear`.

Future B–C:
- `active --pause--> paused`, `paused --resume--> active`, `active --expiry--> overtime` (display negative distinct).
- `active/paused --COMPLETE(3s/5s)--> completed` then next Current.

Invariant: any `phase != idle` has `taskId` and `startedAt`; no orphan phase.

---

## 6. Local persistence strategy (v1 + evolution)

### v1 (demo-actionable, MV3-correct)

- `FocusSessionStore` backed by `chrome.storage.local` key `goalflow.focus.session.v1` JSON `ExecutionState` + `goalflow.demo.tasks.v1` for queue. Fallback `inMemory` for `vitest` where `chrome` undefined.
- Write protocol: `JSON.stringify(state) → chrome.storage.local.set({key:value}) → chrome.storage.local.get(key) → JSON deepEqual + decode assert equal else throw ReadBackMismatch`. On failure surface error, do not mutate phase/UI. Mirrors web `verifiedLocalStorageWrite` and Android `commit+verify`, Mac `readBackMismatch`.
- Task persistence: `DemoCurrentTaskProvider` writes single queue; demo tasks survive `chrome.storage.local` clear only via seed.
- Why not IndexedDB yet: keep v1 review surface minimal; `chrome.storage.local` is durable across SW suspension/restart and panel close, and already async. Promote to IndexedDB before sync scale (quota, outbox).

### v2-B (session B hardened)

- Promote to IndexedDB `GoalflowDB` extension origin `goalflow-chrome` with objectStores `tasks, focus_session, sync_meta` + atomic write + WAL mirror in `chrome.storage.local` for double-write, reconcile on launch (like web fallback). Add `monotonicClock` field (performance.timeOrigin) for sleep detection. `chrome.alarms` 1 s tick kept but derivation still wall-clock.

### vFinal (session K prep)

- Prepare mapping to shared sync schema: entity `tasks` collection with same `version` bump, `extraJson` opaque preserved. Focus state stays local-only; Sync only carries `status/completedAt` mutations via `SyncGateway`. Chrome will write `completed` via `ActionGateway` server semantic, not invent version.

---

## 7. Timer / execution engine (reference-time-derived)

- Authority: `startedAt` wall-time ms, not tick counter.
- Engine: `ExecutionTimer` class injected with `Clock` for testability. `now:()=>Date` defaults to `new Date()`. Observes `chrome.alarms` `tick` + `chrome.runtime.onStartup` for recompute.
- Display derivation: `remaining = plannedDurationSeconds - max(0, floor((now - startedAt)/1000) - accumulatedPause)`. Clamped ≥0 for countdown; expiry `remaining==0` will fire callback in B (v1 holds 0).
- Ticker: side panel visible uses `requestAnimationFrame` / `setInterval 1000` to recompute from `now - startedAt`; background SW uses `chrome.alarms.create('tick',{periodInMinutes:1/60})` heartbeat to update badge and persist heartbeat where allowed. No decrement int persisted.
- Relaunch recovery test: `startedAt=now-47s`, planned 25 m → `remaining=1500-47=1453`. Verified.

---

## 8. Interface boundaries & eventual final Sync

| Gateway | v1 impl | vFinal (Tranche K) | Notes |
|---|---|---|---|
| `CurrentTaskProvider` | `DemoCurrentTaskProvider` deterministic 2-task queue sorted | `SyncBackedCurrentTaskProvider` reading `GoalflowStore` + `DailyPlan` gate | Filter `status open && day && scheduledFor==today`, reuse `buildTodayQueue/planningGate`. |
| `GoalflowStore` | `DemoTaskStore` (`chrome.storage.local`) | `LocalGoalflowStore` (IndexedDB) + `SyncEngine.applyRemotePage` | Must retain opaque `extraJson`. |
| `FocusSessionStore` | `ChromeFocusSessionStore` (`chrome.storage.local` verified) | `IndexedDBFocusSessionStore` with WAL | Always verified write. |
| `AuthGateway` | `StubAuthGateway` always demo | `ChromeAuthGateway` `chrome.storage.session` + `chrome.identity` Supabase PKCE | No secrets in bundle now. |
| `SyncGateway` | `NoopSyncGateway` | `ChromeSyncEngine` port of `syncProtocol.ts` with cursor monotonicity, stableJson, conflict ledger | Strictly replicate web/android; property tests. |
| `ActionGateway` | local state transition only | `POST /api/v1/sync/push` or `/tasks/:id/complete` via `authenticatedFetch` | Must not invent server semantics; interface captures `taskId,start,planned`. |
| `BreakdownGateway` | `StubBreakdownGateway` | `ServerBreakdownGateway` via `authenticatedFetch /api/v1/ai/breakdown` | |

Final sync integration (Tranche K, last major):
- Implement `ChromeSyncEngine` with identical invariants: `mutationId UUID, version chain, baseServerVersion, dependsOnMutationId, cursor` checks, `stableJson` sorted keys, replay mismatch, conflict ledger. Reuse translation with adversarial tests (round-trip, duplicate id, cursor regress).
- Never advance cursor over unapplied page; local `completed` stays in outbox until ack'd.
- Conflict UX explicit keep-local vs use-cloud; never auto-merge.

---

## 9. Testing strategy

### v1 (foundation)

- Unit: `executionState.test.ts` — idle→active, faked `ManualClock`, `remainingSeconds` full/expiry, relaunch `-47s →1453`, monotonic.
- Timer: `executionTimer.test.ts` — `configure(active, start-20s) → 1480`, hold at 0, `now` derivation.
- Persistence: `focusSessionStore.test.ts` — save→load→clear, corrupted JSON → `corrupted` error not discard, read-back mismatch detection via injected storage double.
- Domain parity: `scheduling.test.ts` — `compareQueueCandidates` groupRank, `buildTodayQueue` today filter, `assertSchedule` rejects past month & HH:mm on month, `plannedOrder` tiebreak, `DailyPlan` gate.
- Provider: `demoCurrentTaskProvider.test.ts` — seeds deterministic, sorted, `fetchCurrent` returns head.
- Build verify: `npm run lint` (`tsc --noEmit`), `vitest run` (Chrome suite), `npm run build` Vite MV3 (no errors), manual smoke: toolbar → Side Panel demo task, ACTION → active ring countdown, close panel / `chrome.runtime.reload` → recovers within 1 s.
- No network/keychain in v1.

### Session B+

- `FakeClock` sleep simulation, pause/resume additive, overtime distinct.
- Property queue tests (fast-check).
- Migration tests v1 `chrome.storage.local` → v2 IndexedDB.
- Sync adversarial tests (replay validation, duplicate id, cursor regress).

---

## 10. Multi-session milestone breakdown (revised after audit)

Constraints: one bounded tranche per session, sync-last.

| Session | Milestone | Scope (must-complete) | Done |
|---|---|---|---|
| **A — Foundation (this)** | Chrome MV3 shell + Current→ACTION→Timer | Audit, plan+handoff, branch at `6825b38`, Vite MV3 scaffold (manifest, SW, sidePanel, storage, alarms), vendored `scheduling.ts`, `GoalflowTask`+`ExecutionState`+`Clock`+`FocusSessionStore` verified + `DemoCurrentTaskProvider` sorted + `ExecutionTimer` derived, Current-first UI (frog, duration, ACTION hero, CircularProgress), persistence survives SW suspend/panel close/restart, unit tests, build | ☐ |
| **B — Focus engine** | Robust timing | `paused|overtime` phases, pause/resume additive `accumulatedPause`, overtime display, `+5/+15/+30` logic ready, `chrome.alarms` heartbeat, `chrome.idle` sleep/away recompute, IndexedDB promotion with WAL, sound slot via `chrome.offscreen`, monotonic `performance.now` | |
| **C — Accomplishment loop** | Completion ritual | 3 s hold ordinary, 5 s frog, visual buildup + audio slot, canonical FlowState picker `distracted/good/high/flow`, reward, next Current auto-advance, `Everything Done` quiet | |
| **D — Capture** | Entry without drift | Quick Task command `Ctrl+Shift+G`, Capture With Current Page, keyboard-first overlay, `Select date` invariant + inline date/month chooser, `#hashtag` parsing, generic current-tab context, contextMenus, ADD vs ACTION gateway | |
| **E — Browser context** | Integrations | `TaskContext` formal, Gmail adapter (`goalflow` chip near thread), Close adapter, generic page capture, reading-time estimation (`readable text → wordCount → 5 m ceil`), context launch on ACTION via `chrome.tabs.create` | |
| **F — Today read-only** | Map not plan | Read-only Today timeline parity with web (temporal cost visible), completed/current/break visualization, no reorder, `Open Planning` deep-link | |
| **G — Focus Shield** | Blacklist | User blacklist, scheduled work-hours baseline, ACTION-based blocking, `chrome.declarativeNetRequest` or `tabs.onUpdated` redirect to calm block screen, deliberate 5 s emergency unlock | |
| **H — Execution Context whitelist** | Hashtable policy | Hashtag/context `allowedDomains`, strict task context, `Allow once / Allow for this task`, policy tests, privacy audit | |
| **I — Browser Break Mode** | Rest | Break duration, `chrome.alarms` break countdown cover, browsing blocked, break-finished cue, deliberate exit | |
| **J — Account/server capabilities** | Real data read | Real auth `chrome.identity` + `chrome.storage.session`, real `CurrentTaskProvider` over local store, shared ACTION `POST /api/v1/tasks/:id/complete` idempotent, server Breakdown, read-only TrueNorth | |
| **K — Final Sync** | Last integration | `ChromeSyncEngine` parity, durable outbox/cursor/conflict IndexedDB txn, offline execution/completion convergence, resurrection guard, two-client property | |
| **L — Hardening** | Ship | Permission minimization, CSP, content-script isolation, Gmail/Close resilience, a11y/keyboard, lifecycle edge (SW suspend, panel close, restart), performance, Chrome Web Store packaging, update behavior, final merge to production | |

Deferred explicitly until their sessions: broad `<all_urls>`, `tabs`/`activeTab`/`scripting` host perms, `<all_urls>` justification, automatic Gmail/Close ingestion, bidirectional sync, TTS, native Windows/Linux, history scoring, surveillance.

If audit had shown sync local-only, J/K would swap — but remote cursor protocol exists, so keep J before K (need auth to exercise sync).

---

## 11. Product quality for Slice A (how to feel real, not scaffolding)

- Panel 380–420 × full height, `chrome.sidePanel` narrow, background `#f8f7f5` neutral + `UltraThin` feel via CSS `backdrop-filter`, 16 px radius card, 1 px stroke. No list chrome, no project nav, no analytics. Only: `CURRENT` label caps 11 px tracking, FrogBadge amber, title 20 semibold 2-line truncate with tooltip, meta `45 min` + `#hashtag` chips, hero `ACTION` saturated indigo `#5B5BD6` capsule shadow, ring `CircularProgress` 72.
- Inactive: calm stroke `border-zinc-200`, ACTION saturated, title dominates.
- Active: ring collapses `strokeDashoffset ∝ remaining/total`, blur intensify, title stays but countdown dominates 48 tabular, `● In focus — stay with it` pill.
- No placeholder text like "Task description". Empty shows nothing extra; `Everything done` not yet.
- Demo data: actionable Current `Draft Q4 roadmap — outline three bets` 25 m non-frog default (toggle in debug menu hidden behind Option equivalent `chrome.storage` frog flag).

---

## 12. Engineering quality — zero silent data loss Slice A checklist

Persisted before UI success:
- on ACTION: `ExecutionState{taskId,phase:active,startedAt,plannedDurationSeconds}` atomically `chrome.storage.local.set → get → deepEqual` verify. On failure throw, do not mutate UI.

Not lost on SW suspend / panel close / restart:
- `serviceWorker.onInstalled/onStartup` + `SidePanel` mount both call `FocusSessionStore.load()` → if `phase active` and task still in `buildTodayQueue(today)` and not deleted then recompute `remaining = planned - floor((now - startedAt)/1000)`. Label correct within 1 s. Else clear.

Derivation check:
- Timer display always `planned - floor(now - startedAt)`. No decrement int stored.

State machine validity:
- Only `ACTION` from `idle` can create `active`. `active` preserved across launches until future complete or dev `clear`. No bool spaghetti.

Test evidence:
- `executionState.test.ts: test_relaunchRecoversRemaining` asserts 47 s offset →1453.
- `focusSessionStore.test.ts: persistsAndRecovers` passes verified write.

---

## 13. Risks / unknowns captured for future sessions

1. **Side Panel availability** — `chrome.sidePanel` requires Chrome 114+. Fallback to `chrome.action` popup if missing. Mitigation: feature-detect `chrome.sidePanel` and degrade gracefully; isolate to `sidePanel/shim.ts`.
2. **Service worker suspension** — SW killed after ~30 s idle, `setInterval` throttled. Mitigation: wall-clock derivation + `chrome.alarms` heartbeat, not interval as source of truth.
3. **chrome.storage async vs sync WAL** — Web WAL is synchronous `verifiedLocalStorageWrite` before setState. Chrome `chrome.storage.local` is promise-based; gap between `set` and UI could race. Mitigation: `await save` before publishing state; tests mock storage delay.
4. **Duration source** — web stores `duration` in `extraJson`, Android in `TaskEntity.extraJson`. Chrome `durationMinutes` keeps opaque `extraJson` round-trip; if server changes shape preservation guard prevents drop.
5. **Planning gate vs demo** — demo synthesis bypasses `DailyPlan` gate; production must respect `daily_plans.confirmedAt`. Risk: showing actionable Current when Web says planning_required. J will read gate and show `Plan the day → Open Planning` CTA.
6. **Sleep drift** — `Date.now()` re-derives but lid-close hides elapsed away. B adds `performance.timeOrigin` + `chrome.idle` detection.
7. **Sync replay stableJson** — must exactly mirror sorted-keys to avoid mismatch; property test in K.
8. **Audio** — SW cannot play audio; `chrome.offscreen` required for tick/alarm. Keep slot protocol now.
9. **Permissions** — `<all_urls>` for generic capture resists review. Defer and collect `optional_host_permissions` per site in E; document why.
10. **Another agent touching `goalflow-production`** — Chrome branch isolated to `chrome-extension/**` + `docs/CHROME_*`; final merge conflict scope limited to `docs/`; no file overlap.

---

## 14. Definition of Done per milestone

### A (this tranche)
- Branch exists at `6825b38`, history shows plan + scaffold + implementation in small commits.
- `chrome-extension/` builds with `npm run build` (Vite) — no errors, emits `dist/manifest.json + background.js + sidepanel`.
- `npm test` (Chrome vitest) passes (scheduling/state/timer/store/provider).
- `npm run lint` (`tsc --noEmit`) passes.
- Manual smoke: load unpacked `chrome-extension/dist` via `chrome://extensions`, toolbar → Side Panel demo task, ACTION → active ring countdown, close panel + reopen / `chrome.runtime.reload` → timer recovers within 1 s ±1 s.
- No secrets, no `android-native/`/`macos-native/`/`services/syncProtocol.ts` touched.

### B
- Pause/resume stable 10 cycles; overtime counter increments past 0 distinct; kill during active → elapsed preserved ±1 s; `chrome.alarms` heartbeat verified.

### C—K etc
Each with explicit UI/behavior + test gate + no data loss case; see §§10/12 extended.

---

## 15. Files & invariants touched/untouched ledger

Created in A: `chrome-extension/**`, `docs/CHROME_*`.
Read-only in A: `src/domain/*` (vendored copy, not edit), `services/*`, `android-native/**`, `macos-native/**`, `server/**`, `types.ts`.
Must-not-touch until K: `services/syncProtocol.ts`, `services/cloudSync.ts`, `server/routes/sync/*`, `supabase/migrations/*`.
Handoff tracks exact commands run.

---

## 16. Exact next-session recommendation

Session B scope: robust countdown + pause/resume + overtime (+5/+15/+30 logic ready but UI minimal), monotonic clock, `chrome.idle` sleep/away recompute, IndexedDB promotion with WAL mirror, sound slot via `chrome.offscreen`. Keep interfaces; no completion loop yet.

Entry criteria: verify no Sync-breaking change on `origin/goalflow-production`; reread `docs/CHROME_EXECUTION_COMPANION_HANDOFF.md` current branch SHA and defects. Do not start J/K early.
