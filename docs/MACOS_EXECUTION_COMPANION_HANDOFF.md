# Goalflow macOS Execution Companion — Session Handoff

**Branch:** `feature/macos-execution-companion`  
**Base SHA:** `f93684ac50562c03c99328d98e57eb67f862eb3b` (origin/goalflow-production 2026-08-30)  
**Latest commit at handoff:** `642db9ace7a03088dbdc241484b0a97c2eacab3b` (macos: session A slice — amended)  
**Original slice commit:** `407e0ff96b8df0dd93636c3e5763d75ccd2e4e96`  
**Base:** `f93684a`  
**Xcode / SDK at build:** Xcode 26.6 (17F113), macOS SDK 26.5, Swift 6.3.3, Target: arm64-apple-macosx26.0, DeploymentTarget 15.0 (Tahoe target per context is 26 — built against 26.5 SDK; plan deploys to 15.0 for broader beta, tighten to 26 at hardening)  
**Status:** Session A complete — foundation milestonestone DONE, ready for Session B

---

## Current milestone

**Session A — Foundation and proof of native execution shell: DONE**

Scope was: native shell + Current → ACTION → Active Timer via deterministic local/demo data.

**Implemented:**
- Menu-bar-only lifecycle (`LSUIElement=YES`, `NSStatusItem`, `NSPopover` transient detached panel)
- Execution state machine `ExecutionState(taskId, phase, startedAt, plannedDurationSeconds)` with `remainingSeconds(now:)` derived (no integer decrement)
- `FocusSessionStore` (UserDefaults + secondsSince1970 + millisecond-tolerant read-back verification)
- `DemoCurrentTaskProvider` with deterministic queue sorted by parity with `src/domain/scheduling.ts` `compareQueueCandidates` (frog group ranks, plannedOrder, scheduledTime, createdAt, id) and persisted to UserDefaults
- Demo queue: 2 tasks seeded for today (one Current head shown), demo reset + frog toggle via panel ellipsis menu
- `ExecutionTimer` reference-time engine (1s publisher recomputes `now - startedAt`) with `ExecutionViewModel` glue and restore-on-launch recovery
- Tahoe calm UI: glass `.ultraThinMaterial` panel 380pt, rounded 18, inactive shows ACTION hero capsule (indigo `#5B5BD6`/green for frog), active shows ring progress + countdown 72pt circle + "In focus" tag + subtle accent glow; inactive→active is meaningfully different, text primary vs secondary, progress ring hidden when idle
- Tests: 13 tests across 4 suites, all passing (3 consecutive runs clean)

**Not included (deferred per plan):** overtime full UX, +5/+15/+30, TTS, 3/5s hold completion, flow selector, reward, Everything Done polish, break mode, Quick Capture, NLP, global shortcut, context launch, calendar, auth, breakdown, final sync, Web/Android edits.

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
git fetch origin                             # ok, recorded f93684a
git checkout -b feature/macos-execution-companion f93684a  # created

xcodegen install (brew, 2.46.0)
xcodegen generate --spec macos-native/project.yml --project macos-native
  => Created project at macos-native/GoalflowMac.xcodeproj

xcodebuild -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -configuration Debug build
  => BUILD SUCCEEDED (arm64, signed Sign to Run Locally)

xcodebuild -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -configuration Release build
  => BUILD SUCCEEDED

xcodebuild test -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -destination 'platform=macOS'
  => Test Suite 'All tests' passed — Executed 13 tests, 0 failures (3 runs clean)
  Suites:
    ExecutionStateTests: 5 passed (remaining, idle, action, relaunch, monotonic)
    ExecutionTimerTests: 2 passed (reference derivation, relaunch tolerance)
    FocusSessionStoreTests: 3 passed (persist/recover, overwrite, clear)
    SchedulingTests: 3 passed (frog rank, queue filter, plannedOrder)

# Flake note: FocusSessionStore overwrite initially flaked due to Double secondsSince1970 truncation (1e-7) — fixed via tolerant verify + accuracy 0.001 in assertion.
```

- Not run: manual UI launch (LSUIElement appearance) requires user to run `.app` and inspect menu bar; `xcodebuild` proves compilation. Subsequent manual smoke recommended but not automated.
- `npm test` not re-run for web (out of scope Session A). Can verify `npm test` still passes if desired.

---

## Known defects / limitations (Session A)

- Deployment target currently 15.0 not 26.0 (plan says macOS 26 Tahoe). SDK is 26.5, so APIs available; raising to 26 will restrict testers without Tahoe — intentionally left at 15.0 until hardening. Record as targeted tightening in Session H.
- `xcodegen` is required to regenerate `.xcodeproj` after `project.yml` edits. `.xcodeproj` is committed for convenience but should be regenerated via `xcodegen generate` in next session.
- Timer display `displayTime` recomputes on `objectWillChange` via VM's `clock.now()` — currently driven by status title timer poll (1s). In active phase, the inner `ExecutionTimer` publisher ticks, but `ExecutionPanelView` does not directly subscribe to it — it reads `execution?.remainingSeconds(now: clock.now())` on each 1s status poll. Slightly coupled; still reference-derived. Will wire dedicated Combine in B.
- Date codec uses `secondsSince1970` Double — tolerant to 1ms. Not atomic file; still UserDefaults. Upgrade to file + WAL in B per plan.
- No AppIcon asset catalog — `AppIcon` placeholder not provided; build succeeds with warning fallback. Add real icon in H.
- No overtime display yet; timer clamps at 0 (correct per v1 spec — hold at zero until B).

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

## Exact recommended scope for Session B

**Session B — Focus engine** (bounded, do not bleed into C):

1. Promote persistence to atomic file `Application Support/com.mariusschober.GoalflowMac/execution.json` with UserDefaults WAL mirror (like web fallback), verify write-then-read; migrate existing UserDefaults key on launch.
2. Introduce `monotonicClock` field (mach_continuous_time) alongside wall time, for sleep drift detection; add `NSWorkspace` sleep/wake observers.
3. Add pause/resume to `ExecutionPhase` (`paused` with `accumulatedPauseSeconds` + `lastResumedAt`), persisted before UI change; UI toggle becomes pause/resume when active.
4. Add overtime distinction: when `remaining == 0`, continue counting `elapsed - planned` as positive overtime seconds, display distinct tint (amber vs indigo), keep persisted `startedAt` unchanged.
5. Wire `ExecutionPanelView` to `ExecutionTimer` publisher directly (remove poll indirection), 1s tick drives `displayTime` without status timer hack.
6. Add sound architecture slot protocol `SoundGateway` with no-op tick implementation (defer real `AVAudioEngine` tick to Session B stretch, but define slot).
7. Extend tests: pause/resume additive (10 cycles), overtime split, sleep mock via `ManualClock` advance 2h with tolerance ≤2s, migration test from UserDefaults→file.

**Session B definition of done:** pause/resume stable, overtime visible, kill→recover within 1s, monotonic check, file-backed persistence, 15-20 unit tests passing, build succeeded, no new surfaces beyond timer controls.

Do not start in this session.

---

## Handoff checklist for next agent

- [ ] Verify branch `feature/macos-execution-companion` tip is `f93684a` + Mac commits; if not, record new SHA.
- [ ] Run `xcodegen generate` if `project.yml` changed.
- [ ] Run `xcodebuild test` and expect 13 passing (may need 2nd run if flake — should now be stable).
- [ ] Do not modify `android-native/`, `syncProtocol.ts`, `cloudSync.ts`, or `supabase/migrations`.
- [ ] Read `docs/MACOS_EXECUTION_COMPANION_PLAN.md` §10/12 before coding.

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
