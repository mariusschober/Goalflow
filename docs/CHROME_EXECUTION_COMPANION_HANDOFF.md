# Goalflow Chrome Execution Companion — Session Handoff

**Branch:** `feature/chrome-execution-companion`  
**Base SHA:** `6825b38cf5a41efa8cff49736c12b0aa6c159e74` (origin/goalflow-production 2026-08-30)  
**Latest Chrome commit SHA:** (pending — updated after each meaningful commit)  
**Last updated:** 2026-08-30 — Session A start (plan recorded, tranche execution in progress)

---

## 1. Branch & base

- Source-of-truth branch for Chrome: `feature/chrome-execution-companion`.
- Created via `git checkout -b feature/chrome-execution-companion 6825b38cf5a41efa8cff49736c12b0aa6c159e74` after `git fetch origin`.
- Prior snapshot `f93684ac50562c03c99328d98e57eb67f862eb3b` advanced +3 Android diagnostic commits + macOS Session A merge already in production head. Chrome base updated to latest `6825b38`.
- Do not merge `goalflow-production` mid-tranche; re-record with `git rev-parse origin/goalflow-production` at next session start.

## 2. Current tranche (A — Foundation)

**Goal:** Prove MV3 extension can durably host Current→ACTION→timer without Sync, surviving SW suspension, with deterministic tests.

**Scope chosen:**
- Manifest V3 scaffold, Side Panel lifecycle, Vite+TS+Vite test.
- Vendored `scheduling.ts` pure domain, `GoalflowTask`+`ExecutionState`+`Clock`.
- `FocusSessionStore` verified `chrome.storage.local` write + `DemoCurrentTaskProvider` deterministic sorted queue.
- `ExecutionTimer` reference-time derived remaining.
- Background SW (`chrome.sidePanel`, `chrome.alarms`, `chrome.storage`, `runtime.onMessage/onStartup`).
- Side Panel Current-first UI (frog, duration, ACTION hero, CircularProgress, countdown).
- Persistence survives SW suspend / panel close / `chrome.runtime.reload`.
- Unit tests + `tsc --noEmit` + `vite build`.

**Why this slice:** Smallest vertical that proves browser lifecycle assumptions (timestamp not interval), gateway boundaries for later Gmail/Close/Shield, Sync isolation, and reviewable build. Guidance suggested same subset; audit confirmed Sync is hardened and must not be copied yet.

**Deferred:** Gmail/Close, article reading-time, Today, Focus Shield, Break, sound offscreen, real auth/sync, `<all_urls>`.

## 3. Architecture established (session A)

- **Manifest V3** `manifest_version:3, side_panel.default_path=sidepanel/index.html, background.service_worker=src/background/serviceWorker.ts, permissions=[sidePanel, storage, alarms]`, no host permissions yet.
- **Gateways:** `CurrentTaskProvider` → `DemoCurrentTaskProvider`; `FocusSessionStore` → `ChromeFocusSessionStore` (`chrome.storage.local` `goalflow.focus.session.v1`); `GoalflowStore` stub; `SyncGateway` = `NoopSyncGateway`; `AuthGateway` = `StubAuthGateway`.
- **State machine:** `ExecutionState{taskId,phase: idle|active,startedAt: ms, plannedDurationSeconds}`; only `idle--ACTION-->active` in A; `remaining=max(0,planned-floor((now-startedAt)/1000))`.
- **Storage:** `chrome.storage.local` verified `set→get→deepEqual`; fallback in-memory for vitest. Panel derives display on every `storage.onChanged` + `rAF 1s`.
- **Build:** Vite separate from web (`chrome-extension/vite.config.ts`), `tsconfig` `ES2022/bundler`, `vitest`.
- **Files to be created in this session:** `chrome-extension/**` (see plan §4.2), `docs/CHROME_*`.

## 4. Files created/changed (to be filled as commits land)

- `docs/CHROME_EXECUTION_COMPANION_PLAN.md` — master plan (created)
- `docs/CHROME_EXECUTION_COMPANION_HANDOFF.md` — this handoff (created)
- `chrome-extension/manifest.json`
- `chrome-extension/package.json`, `vite.config.ts`, `tsconfig.json`
- `chrome-extension/src/domain/*`, `src/services/*`, `src/providers/*`, `src/gateways/*`, `src/background/*`, `src/sidepanel/*`, `src/components/*`
- `chrome-extension/tests/*`, `public/icons/*`

Read-only consulted: `src/domain/scheduling.ts`, `services/syncProtocol.ts:848`, `services/storage.ts:940`, `services/cloudSync.ts`, `hooks/useFocusTimer.ts:213`, `server/routes/tasks.ts:363`, `server/routes/sync.ts:172`, `android-native/...`, `macos-native/...`.

Must-not-touch until K: `services/syncProtocol.ts`, `services/cloudSync.ts`, `server/routes/sync/*`.

## 5. Tests executed (to be filled after implementation)

| Suite | File | Result |
|---|---|---|
| lint | `tsc --noEmit` (chrome-extension) | pending |
| unit | `vitest run` (scheduling/state/timer/store/provider) | pending |
| build | `vite build` | pending |
| manual smoke | load unpacked `dist/`, ACTION transition, close/reopen, `runtime.reload` recovery ±1s | pending |

Web suite `npm test` / `npm run lint` baseline not broken (not run in this tranche build but should pass; will verify on hardening).

## 6. Permissions currently used

- `sidePanel` — Side Panel entry.
- `storage` — `chrome.storage.local` durable session + demo queue.
- `alarms` — heartbeat wake for badge/panel refresh (1 min; 1 s where permitted via rAF in visible panel).

Not requested in A: `tabs`, `activeTab`, `scripting`, `contextMenus`, `notifications`, `offscreen`, `host_permissions`, `<all_urls>`. Broad access deferred to Tranche E with justification.

## 7. Known defects / gaps (A exit)

- (to be filled after implementation — any failing test, SW suspend edge, badge lag, panel flicker)

## 8. Technical risks

- SW suspend kills `setInterval`; rely on `chrome.alarms`+recompute — verify real `chrome://extensions` reload (cannot fully simulate SW timing in unit tests).
- `chrome.storage.local` async; must await before UI transition.
- `chrome.sidePanel` 114+; fallback needed below.
- Demo bypasses `DailyPlan` gate — J must add.

## 9. Sync/auth/server capabilities deliberately deferred

- Full `SyncProtocol` (`stableJson`, `dependsOn`, `cursor`, conflicts) — Tranche K.
- Supabase auth (`chrome.storage.session`, `chrome.identity` PKCE, `goalflow://auth/callback` equivalent) — Tranche J.
- Server ACTION `POST /tasks/:id/complete` idempotent + Breakdown — J.
- `TaskContext` adapters (Gmail/Close/article) — E.
- Final authoritative contract integration after Sol freezes — K last.

## 10. Areas other agents must avoid

- `chrome-extension/**` (Chrome work)
- `docs/CHROME_*` (Chrome docs)
- Shared: do not edit `src/domain/scheduling.ts` champions; Chrome vendors copy. Do not mutate Sync server semantics to ease extension.

## 11. Exact recommended Tranche 2 checkpoint

**Title:** B — Focus engine (pause/resume, overtime, robust timing)

**Scope:** `ExecutionPhase paused|overtime`, `accumulatedPauseSeconds`, pause/resume additive, overtime display distinct, `+5/+15/+30` logic ready (UI minimal), monotonic `performance.now` + `chrome.idle` sleep/away recompute, IndexedDB promotion with WAL mirror verified, sound slot `chrome.offscreen` placeholder, `chrome.alarms` heartbeat.

**Entry checklist:**
- `git fetch origin && git rev-parse origin/goalflow-production` — if moved past `6825b38`, record new SHA but do not auto-merge.
- `git rev-parse HEAD` equals latest pushed Chrome SHA below.
- Read this handoff §7 defects.

**Gates:**
- 10 pause/resume cycles stable.
- Overtime increments past 0 as distinct count.
- Kill during active → elapsed preserved ±1 s.
- Mocked 2 h drift ≤2 s.
- New `PauseOvertimeTests` green.

**Do not start:** C (completion hold/Flow), D (Capture), E (Gmail/Close), J/K (auth/sync) early.

## 12. Commands run (append)

```
git fetch origin
git rev-parse origin/goalflow-production # 6825b38cf5a41efa8cff49736c12b0aa6c159e74
git checkout -b feature/chrome-execution-companion 6825b38cf5a41efa8cff49736c12b0aa6c159e74
# (further chrome commits below)
```

## 13. Latest commit SHAs

- Base: `6825b38cf5a41efa8cff49736c12b0aa6c159e74`
- Chrome HEAD: (pending)
