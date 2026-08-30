# Goalflow macOS Execution Companion — Session Handoff

**Branch:** `feature/macos-execution-companion`  
**Base SHA:** `f93684ac50562c03c99328d98e57eb67f862eb3b` (origin/goalflow-production 2026-08-30)  
**Latest commit at handoff:** `6828a4ec5155c1a419a300a51caeee6aeadda687` (Session B — Focus Engine)  
**Previous slice commit:** `a9f5e41a1edb63b24604c888f89099dccadb27b3` (Session A)  
**Base:** `f93684ac50562c03c99328d98e57eb67f862eb3b` (origin/goalflow-production 2026-08-30, verified via `git merge-base`)  
**Xcode / SDK at build:** Xcode 26.6 (17F113), macOS SDK 26.5, Swift 6.3.3, Target: arm64-apple-macosx26.0, DeploymentTarget 15.0 (Tahoe target per context is 26 — built against 26.5 SDK; plan deploys to 15.0 for broader beta, tighten to 26 at hardening)  
**Status:** Session B complete — focus engine DONE, ready for Session C

---

## Current milestone

**Session B — Focus engine: DONE** (predecessor Session A remains DONE)

**Session A scope (for traceability):** native shell + Current → ACTION → Active Timer via deterministic local/demo data.

**Session B scope:** robust countdown + pause/resume + overtime + +5/+15/+30 + monotonic timing + sleep/away foundation + hardened recovery + sound/TTS slots.

**Implemented in Session B:**
- `ExecutionState` extended: `ExecutionPhase` now `idle|active|paused` + `startedAtMonotonic: UInt64?` + `accumulatedPauseSeconds: Int` + `lastPausedAt: Date?` with `decodeIfPresent` migration; pure `paused(at:)`/`resumed(at:)`/`extended(by:)` + `elapsed/remaining/overtimeSeconds(now:)` derived (no integer decrement)
- `Clock` extended: `MonotonicClock` (`monotonicNow: UInt64` via `mach_continuous_time()`), `SystemClock`, `FixedClock`, `ManualClock(mono)` with `advance(by:)` syncing wall 1e9 ticks/s + `set(_:monotonic:)`; toleranced within 2 s over 2 h
- `FocusSessionStore` hardened: `UserDefaultsFocusSessionStore` retained as WAL mirror; NEW `FileFocusSessionStore` (`Application Support/com.mariusschober.GoalflowMac/execution.json`, `.atomic` + read-back); NEW `CompositeFocusSessionStore` (prefers file, migrates WAL→file once, double-write file+WAL). `AppDelegate` now uses `CompositeFocusSessionStore(File+UserDefaults)`.
- `ExecutionTimer` expanded: handles `active|paused|idle`, `reflectPause/Resume/Extend` (called after `store.save`), `overtimeSeconds` separate tracking, sleep observers via `NSWorkspace.screensDidSleep/WakeNotification` → `tick()` on wake (sleep counts as elapsed unless user paused — Session D will offer reconciliation dialog)
- Sound/TTS slots: `SoundGateway` (`NoopSoundGateway` + `TickSoundGateway` AVAudioEngine 50 ms bandpass 1500 Hz tick at 1 Hz while active) and `TTSGateway` (`NoopTTSGateway` + `AVTTSGateway` disabled by default, en-US)
- UI: `ExecutionViewModel` wired to `timer.$remaining/overtime/isPaused` via Combine (removed poll stub), `pause()`/`resume()`/`add5/15/30()` persist before reflect; panel now shows Pause/Resume toggle + inline `+5 +15 +30` capsules, overtime amber `+mm:ss`, paused orange frozen hint, header shows Paused/Overtime; `MenuBarController` replaces poll timer with Combine sinks, status title shows `● title +mm:ss` / `⏸ title mm:ss` (22-char truncation, orange tint when overtime/paused)
- Tests: SessionB added 13 tests (9 ExecutionStatePause, 1 Monotonic, 3 FileStore) → total 26 tests across 7 suites, all passing (3 runs clean)

**Still deferred (per plan):** 3 s/5 s hold completion + flow-state picker + reward (C), break fullscreen (D), Quick Capture (E), browser auth + real Current (F), final Sync (G), signing/hardening (H). No Web/Android/server changes.

---

## What was learned from audit

- Single pure scheduling domain `src/domain/scheduling.ts` defines invariants; queue head is deterministic. Extra fields via `extraJson` must be preserved. Mac mirrors this.
- Sync is mature (storage.ts WAL + syncProtocol + cloudSync) with deviceId, cursor monotonicity, outbox ordering, conflict ledger. Must not fork. Mac isolates behind `CurrentTaskProvider`/`SyncGateway` etc; final sync last (Session G).
- Web focus timer is wall-clock accumulator (`useFocusTimer.ts`) with localStorage persist; Android anchor is `GoalflowFocusSessionStore` SharedPreferences with read-back verification. Mac adopts same pattern with injected `Clock`.
- Duration lives in `extraJson.duration` web/Android, default 25m. Tasks without duration are stopwatch mode (not needed in v1; default 25).
- Tests/CI: `npm test` (68 web), native 44 JVM tests, no Mac CI yet — added `xcodebuild test` locally.
- Tahoe target is macOS 26, Apple Silicon only, but SDK 26.5 still reports deployment 15.0 as min — keep 15.0 for dev ease, raise to 26 at hardening.

---

## Files / directories created

```
macos-native/
  project.yml                         # XcodeGen spec (generates .xcodeproj)
  GoalflowMac.xcodeproj/              # Generated — do not hand-edit; re-run `xcodegen generate`
  GoalflowMac/
    Resources/Info.plist
    App/AppDelegate.swift
    App/GoalflowMacApp.swift
    Domain/GoalflowTask.swift
    Domain/ExecutionState.swift
    Services/Clock.swift
    Services/ExecutionTimer.swift
    Services/FocusSessionStore.swift
    Providers/CurrentTaskProvider.swift
    UI/ExecutionPanelView.swift       # ViewModel + Panel (Tahole calm)
    UI/MenuBarController.swift
    UI/Components/FrogBadge.swift
    UI/Components/CircularProgress.swift
  GoalflowMacTests/
    ExecutionStateTests.swift
    FocusSessionStoreTests.swift
    ExecutionTimerTests.swift
    SchedulingTests.swift
docs/
  MACOS_EXECUTION_COMPANION_PLAN.md  # Master plan (13 sections)
  MACOS_EXECUTION_COMPANION_HANDOFF.md # This file
```

- Removed spurious `/macos-native/.ids.json` if present (was temp). `GoalflowMac.xcodeproj` is generated; commit it (or note to regenerate via xcodegen).
- No Web/Android/server files touched.

---

## Tests / build commands run and results

```bash
# Session A
git fetch origin                             # ok, recorded f93684a
git checkout -b feature/macos-execution-companion f93684a  # created

xcodegen install (brew, 2.46.0)
xcodegen generate --spec macos-native/project.yml --project macos-native
  => Created project at macos-native/GoalflowMac.xcodeproj

xcodebuild -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -configuration Debug build  # Session A
  => BUILD SUCCEEDED (arm64)

xcodebuild test ... -destination 'platform=macOS'  # Session A
  => Executed 13 tests, 0 failures (ExecutionState 5, Timer 2, Store 3, Scheduling 3)

# Session B (verified 2026-08-30 on Xcode 26.6 / SDK 26.5 / Swift 6.3.3 / arm64)
xcodegen generate --spec macos-native/project.yml --project macos-native
  => Created project at macos-native/GoalflowMac.xcodeproj

xcodebuild -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -configuration Debug build
  => BUILD SUCCEEDED

xcodebuild -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -configuration Release build
  => BUILD SUCCEEDED

xcodebuild test -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -destination 'platform=macOS'
  => Test Suite 'All tests' passed — Executed 26 tests, 0 failures (3 runs clean)
  Suites:
    ExecutionStatePauseTests: 9 passed (pause freeze, resume adds interval, 10 cycles additive, overtime, extend, extend while paused, cap 1440, idempotent guard, skew clamped)
    ExecutionStateTests: 5 passed (remaining, idle, action, relaunch, monotonic)
    ExecutionTimerTests: 2 passed (reference derivation, relaunch tolerance)
    FileFocusSessionStoreTests: 3 passed (file persists, composite migrates WAL, double-write)
    FocusSessionStoreTests: 3 passed (persist/recover, overwrite, clear)
    MonotonicClockTests: 1 passed (wall vs monotonic 2h within 2s)
    SchedulingTests: 3 passed (frog rank, queue filter, plannedOrder)
```

- Not run: manual UI launch (LSUIElement appearance) requires user to run `.app` and inspect menu bar; `xcodebuild` proves compilation. Subsequent manual smoke recommended but not automated.
- `npm test` not re-run for web (out of scope Session A). Can verify `npm test` still passes if desired.

---

## Known defects / limitations (Session A remains) + B updates

- Deployment target still 15.0 not 26.0 — intentional (see plan §17, user chose stability). All 26.5 SDK APIs used are @available-guarded or fallback-compatible.
- `xcodegen` still required to regenerate `.xcodeproj` after `project.yml` edits.
- Timer now correctly wired via Combine: `ExecutionViewModel` subscribes to `timer.$remaining/$overtime/$isPaused`; `MenuBarController` subscribes via Combine sinks (no poll timer leak). Previous poll indirection removed.
- Persistence now atomic file `Application Support/com.mariusschober.GoalflowMac/execution.json` + WAL mirror; migration from UserDefaults verified. Previous UserDefaults-only limitation resolved.
- Overtime now distinct: `+mm:ss` orange ring + inline `+5/+15/+30`; not yet a dedicated modal (per §10 B, overtime full UX polish deferred).
- Sleep observers installed via `NSWorkspace.screensDidSleep/WakeNotification`; they recompute on wake (sleep counts as elapsed unless paused). No reconciliation dialog yet (planned D).
- Sound `TickSoundGateway` generates per-tick AVAudioEngine buffer at 1 Hz while active — volume 0.6 default; no background audio entitlement needed. Not yet auto-muted on pause? It respects `isActive` only.
- TTS `AVTTSGateway` disabled by default to avoid privacy leaks; slot ready for C/B.
- No AppIcon asset catalog — still deferred to H.
- `ExecutionTimer.deinit` removes NSWorkspace observers directly (MainActor-isolated removal not allowed in deinit — workaround removed via direct center).

---

## Architectural decisions made

- Use `XcodeGen` (installed via brew) to keep `project.yml` as source of truth, avoiding hand-edit `pbxproj` fragility.
- Adopt injected `Clock` + `ManualClock` for deterministic tests; production uses `SystemClock` (`Date()`).
- Use `UserDefaults(suite)` for demo persistence to avoid entitlements/file coordination in v1.
- Keep `GoalflowTask` `durationMinutes` explicit int (not buried in `extraJson`) for timer logic, but retain `extraJson` field for round-trip preservation when sync arrives.
- LSUIElement accessory policy set in `AppDelegate.applicationDidFinishLaunching` (`NSApp.setActivationPolicy(.accessory)`) to ensure no Dock icon even if Info.plist fallback.
- Keep `GoalflowMacTests` as bundle unit-test with `GENERATE_INFOPLIST_FILE=YES` to satisfy code-sign requirement.

---

## Cross-platform contracts discovered

- Task queue order must match `compareQueueCandidates` exactly; Swift port verified with frog ranking test (beforeFrog habit = 0, frog =1, ordinary =2). Future property test should expand.
- Duration default 25m; stored opaque in web/android but exposed for timer. Preserve not to rewrite.
- Completion semantics not implemented yet; placeholder — when added must bump `version`, write `completedAt`, enqueue mutation before celebration, per Android `completeTask`.
- No server ACTION semantics yet — local transition only. Gateway `NoopSyncGateway`/`StubAuthGateway` placeholders in place.

---

## What could not be tested

- Visual pixel correctness of Tahoe glass (requires manual screenshot on Tahoe 26).
- Actual menu-bar truncation on small notch vs ultra-wide.
- Sleep/wake recomputation fidelity (no sleep simulation harness in v1).
- Process kill recovery across real `SIGKILL` vs XCTest UserDefaults suite (tested with separate suite domain but not with real app termination).

---

## Exact recommended scope for Session B — DONE

**Completed 2026-08-30 — verified above (26 tests, BUILD SUCCEEDED, DoD met).**

Next scope moves to **Session C — Accomplishment loop** (bounded, do not bleed into D):

1. Ordinary 3-second deliberate hold + Frog 5-second hold completion (distinct visual/haptic buildup, `NSHapticFeedbackManager`).
2. Canonical flow-state picker immediately after completion — `distracted|good|high|flow` (1-second, no typing), persisted before next task.
3. Reward animation (tasteful, stronger for frog, not engagement loop) + subtle haptic/audio.
4. Next Current auto-advice after completion (deterministic queue head); respect planning gate.
5. `Everything Done` quiet state (brief strong accomplishment, then calm).
6. Completion must be durably persisted before celebration; no resurrection after reload/sync.

**Session C definition of done:** 3 s/5 s holds stable (no accidental triggers), flow picker appears within 500 ms of hold success and persists, next task appears automatically, Everything Done appears when queue empty, all persisted before UI success, tests for hold duration + flow values + no-resurrection.

---

## Handoff checklist for next agent (Session C)

- [ ] Verify branch `feature/macos-execution-companion` tip (check `git merge-base` equals `f93684ac50562c03c99328d98e57eb67f862eb3b`); record `git rev-parse HEAD`.
- [ ] Run `xcodegen generate --spec macos-native/project.yml --project macos-native/` if `project.yml` changed.
- [ ] Run `xcodebuild test -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -destination 'platform=macOS'` and expect 26 passing.
- [ ] Do not modify `android-native/`, `services/syncProtocol.ts`, `services/cloudSync.ts`, `supabase/migrations/*`, `server/routes/sync/*` — still before Sync (G).
- [ ] Read `docs/MACOS_EXECUTION_COMPANION_PLAN.md` §10 (Session C) and §17 before coding; respect `LSUIElement` + popover activation quirks.

---

## Commands for quick start (copy-paste)

```bash
git fetch origin
git rev-parse origin/goalflow-production # confirm still f93684a or note drift
git checkout feature/macos-execution-companion

xcodegen generate --spec macos-native/project.yml --project macos-native/
xcodebuild -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -configuration Debug build
xcodebuild test -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -destination 'platform=macOS'

open macos-native/GoalflowMac.xcodeproj # manual UI smoke
# Then Product > Run, check menu bar "scope" icon appears top-right, click → panel shows "Draft Q4 roadmap…", press ACTION → active ring counts down, quit and reopen → timer recovers
```
