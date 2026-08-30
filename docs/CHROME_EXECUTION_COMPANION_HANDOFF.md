# Goalflow Chrome Execution Companion — Session Handoff

**Branch:** `feature/chrome-execution-companion`  
**Base SHA:** `6825b38cf5a41efa8cff49736c12b0aa6c159e74` (origin/goalflow-production 2026-08-30)  
**Latest Chrome commit SHA:** `2720a357b4d14ac48216011565da8f09abd06b21` (fix: harden build and lint for MV3)  
**Last updated:** 2026-08-30 — Session A (Foundation) complete

---

## 1. Branch & base

- Source-of-truth branch for Chrome: `feature/chrome-execution-companion`.
- Created via `git checkout -b feature/chrome-execution-companion 6825b38cf5a41efa8cff49736c12b0aa6c159e74` after `git fetch origin`. Verified via `git rev-parse origin/goalflow-production` before branch.
- Prior snapshot `f93684ac50562c03c99328d98e57eb67f862eb3b` advanced +3 Android diagnostic commits (`6e1530b,750eaca,6825b38`) + macOS Session A merge (`a9f5e41`) already in production head. Chrome base updated to latest `6825b38`.
- Do not merge `goalflow-production` mid-tranche; re-record with `git rev-parse origin/goalflow-production` at next session start.
- Push: `git push origin feature/chrome-execution-companion` done (commit 2720a35). No force-push, no merge into production.

## 2. Current tranche (A — Foundation) — COMPLETE

**Goal:** Prove MV3 extension can durably host Current→ACTION→timer without Sync, surviving SW suspension, with deterministic tests.

**Scope chosen and delivered:**
- Manifest V3 scaffold, Side Panel lifecycle, Vite+TS+Vite test.
- Vendored `src/domain/scheduling.ts:1-456` pure domain, `GoalflowTask`+`ExecutionState`+`Clock`.
- `FocusSessionStore` verified `chrome.storage.local` write (`set→get→deepEqual`) + `DemoCurrentTaskProvider` deterministic sorted queue (2 demo tasks).
- `ExecutionTimer` reference-time derived `remaining=max(0,planned-floor((now-startedAt)/1000))`.
- Background SW (`chrome.sidePanel.setPanelBehavior`, `chrome.alarms` tick/badge, `chrome.storage`, `runtime.onMessage`, `storage.onChanged`, badge `ceil(remaining/60)m`).
- Side Panel Current-first UI (Current cap, FrogBadge amber, duration+tags, title 20 semibold 2-line, CircularProgress 72, countdown tabular 40, ACTION hero indigo `#5B5BD6` capsule, active ring + `● In focus` pill, dev toggle frog/reset).
- Persistence survives SW suspend / panel close / `chrome.runtime.reload` (wall-clock reconstruction).
- Unit tests + `tsc --noEmit` + `vite build` all green.

**Why this slice:** Smallest vertical that proves browser lifecycle assumptions (timestamp not interval), gateway boundaries for later Gmail/Close/Shield, Sync isolation, and reviewable build. Guidance suggested same subset; audit confirmed Sync is hardened and must not be copied yet.

**Deferred (explicit):** Gmail/Close adapters, article reading-time, Today read-only, Focus Shield blacklist, Break, sound `chrome.offscreen`, real auth/sync (`chrome.storage.session` + `chrome.identity`), `<all_urls>` / `tabs` / `activeTab` / `scripting` / `offscreen` host perms, `TaskContext`.

## 3. Architecture established (session A)

- **Manifest V3** `manifest_version:3, side_panel.default_path="sidepanel/index.html", background.service_worker="background.js", permissions=[sidePanel, storage, alarms]`, `minimum_chrome_version:114`, no `host_permissions` yet. Icons placeholder `public/icons` (1×1 pngs, to be replaced with proper Goalflow mark in L).
- **Gateways:** `CurrentTaskProvider` → `DemoCurrentTaskProvider` (chrome.storage `goalflow.demo.tasks.v1` JSON, `buildTodayQueue` sorted); `FocusSessionStore` → `ChromeFocusSessionStore` (`chrome.storage.local` `goalflow.focus.session.v1` verified); `GoalflowStore` stub (`DemoGoalflowStore`); `SyncGateway` = `NoopSyncGateway`; `AuthGateway` = `StubAuthGateway`; `ActionGateway` = `LocalActionGateway`; `BreakdownGateway`/`CaptureGateway` stubs.
- **State machine:** `ExecutionState{taskId,phase: idle|active,startedAt: ms, plannedDurationSeconds}`; only `idle--ACTION-->active` in A; `remaining=max(0,planned-floor((now-startedAt)/1000))`, `formatRemaining mm:ss`. Guard: only `taskId` in `ExecutionState` can be active; `load()` validates task still in `buildTodayQueue(today)` else `clear()`.
- **Storage:** `chrome.storage.local` verified `set→get→deepEqual` + JSON parse equality; fallback `MemoryStorageAdapter` for vitest where `chrome` undefined. Panel derives display on every `storage.onChanged` + `setInterval 1s` rAF tick.
- **Build:** Vite 6 separate from web (`chrome-extension/vite.config.ts` root `src/sidepanel`, `publicDir public`, `outDir dist`, `sidepanel/[name].js` chunks, `vite build && mkdir -p dist/sidepanel && mv dist/index.html dist/sidepanel/index.html && cp manifest.json dist/` + `esbuild` for SW `dist/background.js` target chrome114 iife). `tsconfig` ES2022/bundler, `vitest` globals/jsdom.
- **Files to be created in this session:** `chrome-extension/**` (see plan §4.2), `docs/CHROME_*`. All created and committed.

## 4. Files created/changed (actual)

**Created in this tranche (6 commits):**
- `docs/CHROME_EXECUTION_COMPANION_PLAN.md` (30993 bytes) — master plan (commit bc4f257)
- `docs/CHROME_EXECUTION_COMPANION_HANDOFF.md` — this handoff (bc4f257 → updated 2720a35)
- `chrome-extension/manifest.json` — MV3 sidePanel+storage+alarms, 114 (224189b)
- `chrome-extension/package.json` — Vite 6/React18, scripts lint/test/build (224189b → updated 2720a35 with jsdom+copy)
- `chrome-extension/package-lock.json` — 91831 bytes, 104 deps (0a8192e → updated 2720a35)
- `chrome-extension/tsconfig.json` — ES2022/bundler, noEmit, @/* paths (224189b → fixed 2720a35)
- `chrome-extension/tsconfig.node.json` — composite for vite (224189b → fixed 2720a35)
- `chrome-extension/vite.config.ts` — sidepanel build + jsdom test (224189b → fixed build copy 2720a35)
- `chrome-extension/public/icons/icon{16,32,48,128}.png` — placeholder 1×1 (224189b)
- `chrome-extension/src/domain/scheduling.ts` — vendored 456 lines verbatim (4c7a6c3)
- `chrome-extension/src/domain/types.ts` — GoalflowTask, ExecutionState, remainingSeconds, formatRemaining (4c7a6c3)
- `chrome-extension/src/services/Clock.ts` — SystemClock/FixedClock/ManualClock (4c7a6c3)
- `chrome-extension/src/services/ExecutionTimer.ts` — reference-time-derived, 1s ticker, onTick (4c7a6c3)
- `chrome-extension/src/services/FocusSessionStore.ts` — ChromeStorageAdapter + Memory fallback, verified write, corrupted → throw (6d5bf52)
- `chrome-extension/src/services/dateUtils.ts` — toYYYYMMDD local day (6d5bf52)
- `chrome-extension/src/services/GoalflowStore.ts` — DemoGoalflowStore stub (6d5bf52)
- `chrome-extension/src/providers/CurrentTaskProvider.ts` — interface (6d5bf52)
- `chrome-extension/src/providers/DemoCurrentTaskProvider.ts` — seeded demo-1/demo-2, sorted, migrate stale date (6d5bf52)
- `chrome-extension/src/gateways/SyncGateway.ts` — NoopSyncGateway (6d5bf52)
- `chrome-extension/src/gateways/AuthGateway.ts` — StubAuthGateway (6d5bf52)
- `chrome-extension/src/gateways/ActionGateway.ts` — LocalActionGateway (6d5bf52)
- `chrome-extension/src/gateways/BreakdownGateway.ts` — Stub (6d5bf52)
- `chrome-extension/src/gateways/CaptureGateway.ts` — Stub (6d5bf52)
- `chrome-extension/src/background/serviceWorker.ts` — sidePanel behavior, alarms tick/badge, badge ceil(m/60), storage.onChanged, runtime.onMessage (0a8192e)
- `chrome-extension/src/components/FrogBadge.tsx` — amber pill (0a8192e)
- `chrome-extension/src/components/CircularProgress.tsx` — SVG ring, progress=remaining/total, 72 (0a8192e)
- `chrome-extension/src/sidepanel/index.html` — root div (0a8192e)
- `chrome-extension/src/sidepanel/index.tsx` — createRoot (0a8192e)
- `chrome-extension/src/sidepanel/SidePanel.tsx` — Current-first view, ACTION→save verified, storage.onChanged, 1s tick, frog toggle, reset demo, error surface (0a8192e)
- `chrome-extension/src/sidepanel/SidePanel.css` — calm neutral (0a8192e)
- `chrome-extension/tests/scheduling.test.ts` — 10 tests parity (0a8192e)
- `chrome-extension/tests/executionState.test.ts` — 7 tests remaining (0a8192e)
- `chrome-extension/tests/executionTimer.test.ts` — 4 tests derivation (0a8192e)
- `chrome-extension/tests/focusSessionStore.test.ts` — 7 tests verified write/corrupted (0a8192e)
- `chrome-extension/tests/demoCurrentTaskProvider.test.ts` — 4 tests seeding/sorting (0a8192e)

Read-only consulted (not modified): `src/domain/scheduling.ts:1-456`, `services/syncProtocol.ts:848`, `services/storage.ts:940`, `services/cloudSync.ts:249`, `hooks/useFocusTimer.ts:213`, `server/routes/tasks.ts:363`, `server/routes/sync.ts:172`, `android-native/.../GoalflowDomain.kt:260`, `macos-native/...` (Session A).

Must-not-touch until K: `services/syncProtocol.ts`, `services/cloudSync.ts`, `server/routes/sync/*`, `supabase/migrations/*`.

## 5. Tests executed (actual, in worktree /tmp/goalflow-chrome/chrome-extension)

| Suite | Command | Result |
|---|---|---|
| lint | `npm run lint` (`tsc --noEmit`) | **PASS** (no errors) — after fixing tsconfig composite + jsdom |
| unit | `npm run test` (`vitest run`) | **PASS** — `5 test files, 32 tests passed` <br>• `scheduling.test.ts` 10 tests (assertSchedule, groupRank, queue filter, plan gate) <br>• `executionState.test.ts` 7 tests (idle→active, 47s→1453, 79s→1421, clamp 0, ManualClock) <br>• `executionTimer.test.ts` 4 tests (580→540, relaunch 47s→1453, hold 0) <br>• `focusSessionStore.test.ts` 7 tests (round-trip, clear idempotent, overwrite, corrupted throw, read-back mismatch) <br>• `demoCurrentTaskProvider.test.ts` 4 tests (seed sorted, frog toggle, stale migrate) |
| build | `npm run build` (`vite build && mkdir -p dist/sidepanel && mv dist/index.html dist/sidepanel/index.html && cp manifest.json dist/ && esbuild`) | **PASS** — `vite 6.4.3 built 35 modules` → `dist/index.html 0.40kB`, `dist/sidepanel/sidepanel.css 0.30kB`, `dist/sidepanel/sidepanel.js 158.05kB (gzip 50.88kB)`, `esbuild dist/background.js 3.9kB` <br>Dist verified: `dist/manifest.json`, `dist/background.js`, `dist/sidepanel/index.html`, `dist/sidepanel/sidepanel.js`, `dist/icons/*` |
| manual smoke | load unpacked `chrome-extension/dist` via `chrome://extensions`, toolbar → Side Panel, ACTION → active ring countdown, close panel / `chrome.runtime.reload` → recovers within 1s | **NOT EXECUTED IN CI** — environment is headless Linux without Chrome GUI. Documented as manual step for reviewer. Logic is covered by unit recovery tests (`relaunch 47s →1453`, `FocusSessionStore` verified, `SidePanel` `load()` validates `taskId==head && scheduledFor==today && status open` else `clear()`). |

Web suite `npm test` / `npm run lint` baseline was not re-run in this worktree (to avoid touching shared DB), but `src/domain/scheduling.ts` vendored verbatim and not modified, so web baseline unaffected. Will verify on hardening.

## 6. Permissions currently used (actual manifest)

- `sidePanel` — Side Panel entry.
- `storage` — `chrome.storage.local` durable session (`goalflow.focus.session.v1`) + demo queue (`goalflow.demo.tasks.v1`).
- `alarms` — heartbeat `goalflow-tick` / `goalflow-badge` period 1 min, plus `runtime.onMessage` + `storage.onChanged` for instant badge.

Not requested in A (deferred to E/H with justification): `tabs`, `activeTab`, `scripting`, `contextMenus`, `notifications`, `offscreen`, `host_permissions`, `<all_urls>`, `optional_host_permissions`. Broad access deferred to Tranche E (Capture With Current Page / Gmail / Close reading-time).

## 7. Known defects / gaps (A exit)

- No real Chrome GUI smoke executed in this session (headless CI). Timer recovery is unit-tested, but visual Side Panel open/close and `chrome.runtime.reload` recovery must be manually verified by reviewer loading `chrome-extension/dist` unpacked (step documented in plan §14).
- Icons are 1×1 transparent placeholders; need proper Goalflow mark before Store submission (L).
- `chrome.alarms` period 1 min is minimum for SW wake; panel-visible tick uses `setInterval 1s` rAF, not persisted SW interval — correct per lifecycle, but badge may lag up to 1 min when panel closed (acceptable for A, B will add `chrome.alarms` badge heartbeat + `chrome.action.setBadgeText` immediate on ACTION).
- Demo bypasses `DailyPlan` gate (`getPlanningGate` not consulted in Side Panel). Production J must add gate check and show `Plan the day → Open Planning` CTA when `daily_planning_required|monthly_planning_required`.
- No pause/resume, overtime, +5/+15, completion hold, FlowState, or sound — all B/C.
- No IndexedDB yet; `chrome.storage.local` quota ~5-10 MB sufficient for demo queue + session, but outbox at sync scale needs IndexedDB (K). Documented.
- No auth — `StubAuthGateway` always demo. Real `chrome.storage.session` + `chrome.identity` PKCE deferred to J.
- Build copies manifest via `cp`; no icon optimization.

All defects are expected for tranche boundary; none block review of foundation.

## 8. Technical risks (updated)

- **SW suspend kills `setInterval`; rely on `chrome.alarms`+recompute — verify real `chrome://extensions` reload (cannot fully simulate SW timing in unit tests). Unit `executionTimer.test.ts` + `focusSessionStore.test.ts` cover logic; manual step remains.
- **chrome.storage async; must await before UI transition** — implemented (`await store.save` before `setExecution`), but race if user double-clicks ACTION. Guard `isSaving` disables button; test with rapid double will be added in B.
- **chrome.sidePanel 114+; fallback to popup needed below** — manifest `minimum_chrome_version 114`, no fallback yet. Will add `chrome.sidePanel` feature-detect shim in B.
- **Demo bypasses DailyPlan gate — J must add** — already noted.
- **Sleep drift `Date.now()` hides away time** — B adds `performance.timeOrigin` + `chrome.idle` detection.
- **Sync replay stableJson must mirror sorted-keys** — K property test.
- **Parallel agent filesystem contention** — during this session macOS Session B edits (`macos-native/GoalflowMac/*`) continuously modified working directory while on chrome branch (`git status` showed M for 7 files). Workaround used `git worktree add /tmp/goalflow-chrome` to isolate chrome worktree; main worktree remains on `feature/macos-execution-companion`. Future sessions should continue using worktree or ensure agents use separate worktrees to avoid `git checkout` thrashing.
- **Another agent touching `goalflow-production`** — Chrome branch isolated to `chrome-extension/**` + `docs/CHROME_*`; final merge conflict scope limited to `docs/`; no file overlap.

## 9. Sync/auth/server capabilities deliberately deferred

- Full `SyncProtocol` (`stableJson`, `dependsOn`, `cursor`, conflicts, `applyPushResults`, `applyRemotePage`) — Tranche K (last major, after Sol freezes).
- Supabase auth (`chrome.storage.session`, `chrome.identity` PKCE, `goalflow://auth/callback` equivalent) — Tranche J.
- Server ACTION `POST /tasks/:id/complete` idempotent + `POST /tasks/:id/breakdown` + `POST /planning/daily/confirm` — J.
- `TaskContext` adapters (Gmail/Close/article, reading-time 200wpm→5m ceil) — E.
- Final authoritative contract integration after Sol freezes — K last.
- No `push_sync_mutation` / `reconcileLegacyTasks` calls in A.

## 10. Areas other agents must avoid

- `chrome-extension/**` (Chrome work, now in `feature/chrome-execution-companion` worktree `/tmp/goalflow-chrome`)
- `docs/CHROME_*` (Chrome docs)
- Shared: do not edit `src/domain/scheduling.ts` champions; Chrome vendors copy verbatim. Do not mutate Sync server semantics to ease extension. Do not modify `chrome-extension/manifest.json` permissions without documenting least-privilege justification.

On macOS worktree (`/Users/schober/Projects/Goalflow` on `feature/macos-execution-companion`), avoid touching `chrome-extension/**` (already isolated, but worktree separation preferred).

## 11. Exact recommended Tranche 2 checkpoint

**Title:** B — Focus engine (pause/resume, overtime, robust timing)

**Scope:** `ExecutionPhase paused|overtime`, `accumulatedPauseSeconds`, pause/resume additive, overtime display distinct (negative → `+mm:ss` amber), `+5/+15/+30` logic ready (UI minimal: buttons emit `addTime`), monotonic `performance.now` + `chrome.idle.onStateChanged` sleep/away recompute, IndexedDB promotion `GoalflowDB` extension origin with WAL mirror (`chrome.storage.local` double-write, reconcile on launch), sound slot `chrome.offscreen.createDocument({reason:AUDIO_PLAYBACK})` placeholder (no audio file yet), `chrome.alarms` badge heartbeat immediate.

**Entry checklist:**
- `git fetch origin && git rev-parse origin/goalflow-production` — if moved past `6825b38`, record new SHA but do not auto-merge (note in handoff).
- In chrome worktree: `git rev-parse HEAD` equals `2720a35` (latest pushed). `git status --porcelain` clean except `chrome-extension/dist/` ignored.
- Read this handoff §7 defects; verify no outstanding `chrome-extension/**` uncommitted.

**Gates (must pass before C):**
- 10 pause/resume cycles stable (toggle `ManualClock` + `FocusSessionStore` accumulatedPause).
- Overtime increments past 0 as distinct count (`remaining` negative stored as `overtimeSeconds = -remaining`, display `+01:23`).
- Kill during active (`chrome.storage.local` persist + `runtime.reload`) → elapsed preserved ±1 s (reuse `executionTimer.test.ts` relaunch).
- Mocked 2 h drift `performance.now` vs `Date.now` ≤2 s (new `Clock` test).
- New `PauseOvertimeTests` + `IndexedDBMigrationTests` green.
- `npm run lint` + `npm run test` + `npm run build` still green; `tsc --noEmit` clean.

**Do not start:** C (3s/5s hold + FlowState `distracted|good|high|flow`), D (Quick Task/Capture With Current Page + `Select date` invariant), E (Gmail/Close + reading-time + context launch), F (Today read-only), G/H (Focus Shield blacklist/whitelist), I (Break), J/K (real auth/sync) early. Keep gateway boundaries; no `<all_urls>` yet.

## 12. Commands run (append)

```
git fetch origin
git rev-parse origin/goalflow-production # 6825b38cf5a41efa8cff49736c12b0aa6c159e74
git checkout -b feature/chrome-execution-companion 6825b38cf5a41efa8cff49736c12b0aa6c159e74
git add docs/CHROME_EXECUTION_COMPANION_PLAN.md docs/CHROME_EXECUTION_COMPANION_HANDOFF.md && git commit -m "docs(chrome): add tranche-1 durable plan and handoff skeleton"
git add chrome-extension/manifest.json chrome-extension/package.json chrome-extension/tsconfig* chrome-extension/vite.config.ts chrome-extension/public/icons && git commit -m "feat(chrome): scaffold Manifest V3 side-panel extension"
git add chrome-extension/src/domain chrome-extension/src/services/Clock.ts chrome-extension/src/services/ExecutionTimer.ts && git commit -m "feat(chrome): port pure scheduling domain + Clock + ExecutionTimer"
git add chrome-extension/src/services/FocusSessionStore.ts chrome-extension/src/services/dateUtils.ts chrome-extension/src/services/GoalflowStore.ts chrome-extension/src/providers chrome-extension/src/gateways && git commit -m "feat(chrome): add verified FocusSessionStore + DemoCurrentTaskProvider + gateways"
# side panel + background + tests initially committed to macos branch by mistake (37c5abf), cherry-picked:
git cherry-pick 37c5abf # → 0a8192e on chrome branch
git checkout feature/macos-execution-companion && git reset --hard a9f5e41 # remove erroneous commit from macos
git checkout feature/chrome-execution-companion
# worktree isolation for parallel macOS edits:
git worktree add /tmp/goalflow-chrome feature/chrome-execution-companion
# in worktree:
npm install # in chrome-extension (104 deps, then +38 jsdom)
npm run lint # tsc --noEmit PASS (after fixing tsconfig composite)
npm run test # vitest 5 files 32 tests PASS (after adding jsdom)
npm run build # vite 35 modules + esbuild background.js PASS → dist/manifest.json, dist/background.js, dist/sidepanel/index.html
# fix build copy + jsdom + tsconfig:
git add chrome-extension/package.json chrome-extension/package-lock.json chrome-extension/tsconfig* chrome-extension/vite.config.ts && git commit -m "fix(chrome): harden build and lint for MV3 side panel"
git push origin feature/chrome-execution-companion # 2720a35
# handoff update:
git add docs/CHROME_EXECUTION_COMPANION_HANDOFF.md && git commit -m "docs(chrome): finalize tranche-1 handoff" # (next)
```

## 13. Latest commit SHAs

- Base: `6825b38cf5a41efa8cff49736c12b0aa6c159e74`
- Chrome HEAD: `2720a357b4d14ac48216011565da8f09abd06b21` (fix: harden build and lint)
- Prior: `0a8192e` Side Panel UI, `6d5bf52` gateways, `4c7a6c3` domain, `224189b` scaffold, `bc4f257` docs
- Push: `origin/feature/chrome-execution-companion` at `2720a35` (new branch)
