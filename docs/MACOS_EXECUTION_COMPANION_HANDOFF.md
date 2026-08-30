# Goalflow macOS Execution Companion — Session Handoff

**Branch:** `feature/macos-execution-companion`  
**Base SHA:** `f93684ac50562c03c99328d98e57eb67f862eb3b` (origin/goalflow-production 2026-08-30)  
**Latest commit at handoff:** `499a0e19f94b9ffde2329d6de4db4b6f07e1a3c2` (Session D — Break Environment)  
**Previous slice commit:** `739ad5af59a8b74f1824d97cfb944943867f7085` (Session C — Accomplishment Loop)  
**Base:** `f93684ac50562c03c99328d98e57eb67f862eb3b` (origin/goalflow-production 2026-08-30, verified via `git merge-base`)  
**Xcode / SDK at build:** Xcode 26.6 (17F113), macOS SDK 26.5, Swift 6.3.3, Target: arm64-apple-macosx26.0, DeploymentTarget 15.0 (Tahoe target per context is 26 — built against 26.5 SDK; plan deploys to 15.0 for broader beta, tighten to 26 at hardening)  
**Status:** Session D complete — break environment DONE, ready for Session E

---

## Current milestone

**Session D — Break environment: DONE** (predecessors A, B, C remain DONE)

**Session A scope (traceability):** native shell + Current → ACTION → Active Timer via deterministic local/demo data.

**Session B scope (traceability):** robust countdown + pause/resume + overtime + +5/+15/+30 + monotonic timing + sleep/away foundation + hardened recovery + sound/TTS slots.

**Session C scope (traceability):** 3 s hold (ordinary) / 5 s Frog + haptic buildup + FlowState distracted/good/high/flow + LocalTaskStore atomic + next Current auto-advance + Everything Done quiet state.

**Session D scope:** Break selector `5/10/15/20/Open`, fullscreen black cover per-screen `level=.screenSaver` + `.canJoinAllSpaces`, `BreakState`/`BreakTimer` reference-time, alarm `SoundGateway.alarm` looping, `Esc`/`End Early` return, pause-before-break frozen `remaining`.

**Implemented in Session D:**
- `BreakState` (`Domain/BreakState.swift:1`) `durationSeconds: Int? (nil=Open)`, `startedAt`, `startedAtMonotonic`, `sourcePhase`, `taskId`, `elapsed/remaining/isExpired/isOpenEnded`, `max(60, duration)` clamp.
- `BreakSessionStore` (`Services/BreakSessionStore.swift:1`) `FileBreakSessionStore(fileURL: break.json Data.write(.atomic)+read-back)`, `load` nil if missing, `save` atomic+verify, `clear` removes. Not in `SyncMeta`.
- `BreakTimer` (`Services/BreakTimer.swift:1`) `@MainActor ObservableObject @Published elapsed/remaining/isActive/isExpired`, `configure/start/stop/tick()` 1 s `Timer.publish`, `clock: any Clock` injectable.
- `SoundGateway` extended (`Services/SoundGateway.swift:1`) `alarm(loop:Bool)`/`stopAlarm()` 6-beep `880 Hz square 0.15 s` burst via `AVAudioEngine`, loops 2× if `loop:true`; `Noop` no-ops.
- `BreakCoverWindowController` (`UI/BreakCoverWindowController.swift:1`) per-screen `NSPanel` `frame=screen.frame`, `level=.screenSaver`, `collectionBehavior [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]`, `orderFrontRegardless`, `NSApp.activate(ignoringOtherApps:true)`, `show(breakState:onEndEarly:)`, `update(remaining:elapsed:)`, `closeAll()`, observes `didChangeScreenParameters`.
- `BreakOverlayView` (`UI/BreakOverlayView.swift:1`) `RECHARGE` vs `BREAK TIME` 28pt tracking 6, `12rem` mono `mm:ss` gradient, subtitle `Breathe…` vs `Taking a moment…`, `Esc` hint, button `End Break Early` / `Back to Flow` (Open), `keyboardShortcut .cancelAction`.
- `ExecutionViewModel` (`UI/ExecutionPanelView.swift:1`) added `@Published breakState/breakRemaining/breakElapsed/isOnBreak/breakPickerVisible`, `breakStore: BreakSessionStore`, `breakTimer: BreakTimer`, `restoreBreak()` loads `breakStore` on init, `startBreak(durationMinutes: Int?)` pauses `active` execution first (`store.save(paused)`), creates `BreakState`, `breakStore.save`, `breakTimer.start`, `isOnBreak=true`; `endBreakEarly()` stops `breakTimer`, clears `breakStore`, `sound.stopAlarm()`, recomputes `remaining`; `handleBreakExpiredIfNeeded()` triggers `sound.alarm`.
- `ExecutionPanelView` now `breakPicker` `Take a break — leave the Mac` chips `5 10 15 20 Open` `1-5` shortcuts, `breakActiveView` `On Break` teal `mm:ss` 36pt, `Covering all displays • Esc` hint, `Take Break` button (teal capsule) when `isActive||isPaused` and not on break, header shows `On Break` teal `cup.and.saucer.fill` when `isOnBreak`, body `if isOnBreak { breakActiveView } else if flowPickerVisible ...`.
- `MenuBarController` (`UI/MenuBarController.swift:1`) added `breakCover = BreakCoverWindowController()`, sinks `viewModel.$isOnBreak`, `$breakRemaining`, `$breakElapsed`, `handleBreakChange` closes `popover` if shown, `breakCover.show` when true else `closeAll()`, `updateBreakCover()` on remaining/elapsed, `updateStatusTitle()` now handles `isOnBreak` first: `☕ mm:ss` teal `cup.and.saucer.fill` tooltip `On Break`, suppresses popover toggle when on break.
- `AppDelegate` (`App/AppDelegate.swift:1`) no extra wiring needed for break (ViewModel creates default `BreakSessionStore`); `restoreBreak()` called in `init` after `restore()`; `MenuBarController` owns cover lifecycle.
- Tests: SessionD added 9 tests (BreakState 3, BreakSessionStore 2, BreakTimer 2, BreakReturn 2) → total 45 tests across 9 suites, all passing (3 runs clean)

**Still deferred (per plan):** Quick Capture (E), browser auth + real Current (F), final Sync (G), signing/hardening (H). No Web/Android/server changes.

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
xcodebuild -project ... -scheme GoalflowMac -configuration Debug build  # Session A
  => BUILD SUCCEEDED (arm64)
xcodebuild test ... -destination 'platform=macOS'  # Session A
  => Executed 13 tests, 0 failures

# Session B (verified 2026-08-30 on Xcode 26.6 / SDK 26.5 / Swift 6.3.3 / arm64)
xcodegen generate --spec macos-native/project.yml --project macos-native
xcodebuild -project ... -configuration Debug build => BUILD SUCCEEDED
xcodebuild -project ... -configuration Release build => BUILD SUCCEEDED
xcodebuild test ... -destination 'platform=macOS'
  => Executed 26 tests, 0 failures (ExecutionStatePause 9, ExecutionState 5, Timer 2, FileStore 3, Store 3, Monotonic 1, Scheduling 3)

# Session C (verified 2026-08-30 on Xcode 26.6 / SDK 26.5 / Swift 6.3.3 / arm64)
xcodegen generate --spec macos-native/project.yml --project macos-native
  => Created project at macos-native/GoalflowMac.xcodeproj
xcodebuild -project ... -configuration Debug build => BUILD SUCCEEDED
xcodebuild -project ... -configuration Release build => BUILD SUCCEEDED
xcodebuild test ... -destination 'platform=macOS'
  => Executed 36 tests, 0 failures (3 runs clean)
  Suites:
    CompletionHoldTests: 4 passed (3s/5s, progress, cancel, frog 5s)
    FlowStateTests: 3 passed (allCases, withCompleted preserves, withFlowState merges)
    TaskCompletionPersistenceTests: 3 passed (complete persists before next, no resurrection, only open)
    ExecutionStatePauseTests: 9 passed
    ExecutionStateTests: 5 passed
    ExecutionTimerTests: 2 passed
    FileFocusSessionStoreTests: 3 passed
    FocusSessionStoreTests: 3 passed
    MonotonicClockTests: 1 passed
    SchedulingTests: 3 passed

# Session D (verified 2026-08-30 on Xcode 26.6 / SDK 26.5 / Swift 6.3.3 / arm64)
xcodegen generate --spec macos-native/project.yml --project macos-native
  => Created project at macos-native/GoalflowMac.xcodeproj
xcodebuild -project ... -configuration Debug build => BUILD SUCCEEDED
xcodebuild -project ... -configuration Release build => BUILD SUCCEEDED
xcodebuild test ... -destination 'platform=macOS'
  => Executed 45 tests, 0 failures (3 runs clean)
  Suites:
    BreakStateTests: 3 passed (durations, remaining/expired, open never expired)
    BreakSessionStoreTests: 2 passed (file persists, open persists)
    BreakTimerTests: 2 passed (counts, open elapsed)
    BreakReturnTests: 2 passed (pause-before-break freeze, break does not bleed)
    CompletionHoldTests: 4 passed
    FlowStateTests: 3 passed
    TaskCompletionPersistenceTests: 3 passed
    ExecutionStatePauseTests: 9 passed
    ExecutionStateTests: 5 passed
    ExecutionTimerTests: 2 passed
    FileFocusSessionStoreTests: 3 passed
    FocusSessionStoreTests: 3 passed
    MonotonicClockTests: 1 passed
    SchedulingTests: 3 passed
```

- Not run: manual UI launch (LSUIElement appearance) requires user to run `.app` and inspect menu bar; `xcodebuild` proves compilation. Subsequent manual smoke recommended but not automated.
- `npm test` not re-run for web (out of scope Session A). Can verify `npm test` still passes if desired.

---

## Known defects / limitations (A+B+C remain) + D updates

- Deployment target still 15.0 not 26.0 — intentional (see plan §19).
- `xcodegen` still required to regenerate `.xcodeproj` after `project.yml` edits.
- Timer wired via Combine (B); hold/flow via `CompletionHoldController` 50 Hz; break via `BreakTimer` 1 s.
- Persistence now triple: `execution.json` (Composite WAL) + `goalflow.tasks.json` (LocalTaskStore) + `break.json` (FileBreakSessionStore atomic+read-back, not in SyncMeta). All verified.
- Overtime distinct `+mm:ss` orange; completion via hold 3 s/5 s Frog; flow picker blocks next until `1-4`/`Esc`.
- Break: `Take Break` teal capsule when active/paused; picker `5/10/15/20/Open`; cover per-screen `level=.screenSaver` `.canJoinAllSpaces` `.stationary` `.fullScreenAuxiliary`, `frame=screen.frame` (covers menu bar), `orderFrontRegardless`, `NSApp.activate`. Alarm `alarm(loop:true)` 6-beep 880 Hz square, loops 2×; `stopAlarm` on early end. Sleep during break counts for break but not focus (paused freeze).
- No `undo` after completion; no break stats `trackBreak` local-only (not in `STORES.STATS`).
- No capture/auth/sync — still deferred (E/F/G). No idle/away reconciliation dialog yet (stretch for D, B observers already recompute).
- AppIcon still deferred to H.

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

## Exact recommended scope for Session D — DONE

**Completed 2026-08-30 — verified above (45 tests, BUILD SUCCEEDED, DoD met).**

Next scope moves to **Session E — Quick Capture and context launch** (bounded, do not bleed into F):

1. Global customizable shortcut (e.g., `⌘+Shift+G` or `Ctrl+Space` fallback) — `CGEventTap`/`MASShortcut` style, `Hardened Runtime` TCC prompt deferred but design `HotkeyGateway` now.
2. Centered Spotlight/Raycast-like native overlay — borderless `NSPanel` `level=.floating`, `collectionBehavior .canJoinAllSpaces`, `NSVisualEffectView` ultraThin, one dominant input field, very fast keyboard-first flow (`Esc` dismiss, `Enter` confirm, `⌘Enter` reveal note field).
3. Scheduling invariant — `Select date` factory default, `Enter` transitions to inline date/month picker if no date parsed; no Inbox/Someday; `CreateScheduledTask` validation via `assertSchedule` parity.
4. Natural-language parsing (title, exact date `YYYY-MM-DD`, future month `YYYY-MM`, time `HH:mm`, duration `25m`/`1h`, hashtags `#tag`, URLs `https://…`) — share parser with Web `utils/timeAndTagParser.ts` + future AI breakdown placeholder.
5. Notes text + URLs, `⌘Enter` to reveal note field, `ADD` vs `ACTION` abstraction (create vs create+start), hashtag→app/URL mappings via `NSWorkspace.open` (user-configurable), privacy mode (hide task text during screen sharing where reliable).

**Session E definition of done:** global shortcut opens overlay in <200 ms, typing `Title @25m #tag 2026-09-01` parses correctly, `Enter` creates task with exact day, `Select date` fallback works, `ADD` creates under ordering, `ACTION` creates and starts focus, no unscheduled queue, tests for parsing + scheduling invariant + ADD vs ACTION.

---

## Handoff checklist for next agent (Session E)

- [ ] Verify branch `feature/macos-execution-companion` tip (check `git merge-base` equals `f93684ac50562c03c99328d98e57eb67f862eb3b`); record `git rev-parse HEAD`.
- [ ] Run `xcodegen generate --spec macos-native/project.yml --project macos-native/` if `project.yml` changed.
- [ ] Run `xcodebuild test -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -destination 'platform=macOS'` and expect 45 passing.
- [ ] Do not modify `android-native/`, `services/syncProtocol.ts`, `services/cloudSync.ts`, `supabase/migrations/*`, `server/routes/sync/*` — still before Sync (G).
- [ ] Read `docs/MACOS_EXECUTION_COMPANION_PLAN.md` §10 (Session E) and §19 before coding; respect `LSUIElement` + break cover `Esc` handling.

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
