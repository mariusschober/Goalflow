# Goalflow macOS Execution Companion — Session Handoff

**Branch:** `feature/macos-execution-companion`  
**Base SHA:** `f93684ac50562c03c99328d98e57eb67f862eb3b` (origin/goalflow-production 2026-08-30)  
**Latest commit at handoff:** `eb047e6fcc23d0e6fdd2a09642f43b863037af0b` (Session F — Server Capabilities)  
**Previous slice commit:** `6e836812f7dccafe2672dcefa233eb40eb172a43` (Session E — Quick Capture)  
**Base:** `f93684ac50562c03c99328d98e57eb67f862eb3b` (origin/goalflow-production 2026-08-30, verified via `git merge-base`)  
**Xcode / SDK at build:** Xcode 26.6 (17F113), macOS SDK 26.5, Swift 6.3.3, Target: arm64-apple-macosx26.0, DeploymentTarget 15.0 (Tahoe target per context is 26 — built against 26.5 SDK; plan deploys to 15.0 for broader beta, tighten to 26 at hardening)  
**Status:** Session F complete — server capabilities DONE, ready for Session G

---

## Current milestone

**Session F — Server Capabilities: DONE** (predecessors A, B, C, D, E remain DONE)

**Session A scope (traceability):** native shell + Current → ACTION → Active Timer via deterministic local/demo data.

**Session B scope (traceability):** robust countdown + pause/resume + overtime + +5/+15/+30 + monotonic timing + sleep/away foundation + hardened recovery + sound/TTS slots.

**Session C scope (traceability):** 3 s hold (ordinary) / 5 s Frog + haptic buildup + FlowState distracted/good/high/flow + LocalTaskStore atomic + next Current auto-advance + Everything Done quiet state.

**Session D scope (traceability):** Break selector `5/10/15/20/Open`, fullscreen black cover per-screen `level=.screenSaver` + `.canJoinAllSpaces`, `BreakState`/`BreakTimer` reference-time, alarm `SoundGateway.alarm` looping, `Esc`/`End Early` return, pause-before-break frozen `remaining`.

**Session E scope (traceability):** Global `⌘⇧G` hotkey, centered Spotlight-like `NSPanel` `level=.floating` ultraThin, schedule-first `Select date` invariant via `assertSchedule`, `ADD` vs `ACTION`, parsing `@25m/#tag/2026-09-01/YYYY-MM/14:30/*f/@quick/https://`, `TagRoutingService` + `PrivacyGateway`.

**Session F scope:** Browser PKCE `goalflow://auth/callback` Keychain JWT, real `CurrentTaskProvider` gate `getPlanningGate` `monthly/daily/ready/empty`, read-only `Goal`/`TrueNorth`/`amalgam` + `goalId` dot, shared `ACTION` prep, server `POST /api/v1/ai/breakdown` + local `broken_down` children `parentTaskId` `plannedOrder` tail, `EventKit` read-only overlap `14:30`.

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

**Implemented in Session E:**
- `SchedulingBridge` (`Domain/SchedulingBridge.swift:1`) `isRealDay/isRealMonth/monthOf/assertSchedule` port of `scheduling.ts:92` `DAY/MONTH/TIME` regex, UTC calendar, `SchedulingError invalidDay|invalidMonth|currentMonthRequiresDay|invalidTime|invalidTitle`.
- `CaptureParser` (`Domain/CaptureParser.swift:1`) `ParsedCapture` plus accumulative `@25m`/`1h 15m`/`for 2 hours`/`2-minute`, `#tag`, `https://`, `*f`/`@quick`, `YYYY-MM-DD`/`YYYY-MM` future, `HH:mm` first only, collapse whitespace, `month+time` drops time.
- `CaptureService` (`Domain/CaptureService.swift:1`) `LocalCaptureService(taskStore:clock:idGenerator)` validates title+`assertSchedule`, tail `plannedOrder = max(siblings)+1`, `duration ??25`, merges notes+urls, `version=1` atomic+WAL, `TagRoutingService.shared.handleTags`.
- `TagRoutingService` (`Domain/CaptureService.swift:1`) `UserDefaults goalflow.hashtag.routes.v1` → `NSWorkspace.open` main async lowercased lookup.
- `PrivacyGateway` (`Domain/CaptureService.swift:1`) `CGWindowListCopyWindowInfo(.optionOnScreenOnly)` owners `zoom/teams/webex/meet` with `share` window.
- `HotkeyGateway` (`Services/HotkeyGateway.swift:1`) `CarbonHotkeyGateway RegisterEventHotKey kVK_ANSI_G cmd+shift 'GF01' kEventHotKeyPressed` + `NoopHotkeyGateway`.
- `CaptureViewModel` (`UI/CaptureViewModel.swift:1`) `@MainActor` `rawText/parsed/notes/showNotes/showDatePicker/selectedDate/selectedMonth/isMonthMode/isScreenSharing/errorMessage`, `effectiveScheduledFor/Precision/Time`, `needsDate` factory `Select date`, `handleEnter(intent:)` shows picker on `Enter` without date else `createTask`+`onCreated`+reset, `toggleNotes/checkPrivacy`.
- `CaptureOverlayView` (`UI/CaptureOverlayView.swift:1`) 520pt `ultraThinMaterial` `16` shadow 24, header `bolt` `FROG` `Esc`, field `pencil` `What needs doing? e.g. Draft proposal @25m #focus 2026-09-01` `submit ADD`, notes `TextEditor` `⌘↵`, date picker `Segmented Exact day/Future month` graphical/`Picker` 12 months `>currentMonth`, chips `25m/#tag/scheduledFor/Select date` red, `HH:mm/🔗`, action `ADD accent` `ACTION green ⌘A` disabled when `!canSubmit`, hint `Enter→ADD • ⌘↵→Notes • ⌘A→ACTION`.
- `CaptureWindowController` (`UI/CaptureWindowController.swift:1`) `NSPanel 520x260 borderless nonactivatingPanel isFloatingPanel level=.floating canJoinAllSpaces+fullScreenAuxiliary clear isOpaque false` `configure(taskProvider:store:clock:executionVM:taskStore)` → `CaptureViewModel` `ScreenSharingPrivacyGateway`, `show()` guards `!isOnBreak` `CACurrentMediaTime` `<200ms` `makeKeyAndOrderFront NSApp.activate`, `hide/toggle` `orderOut cancel`, `ensurePanel NSHostingView` + `Esc 53` monitor, `handleCreated` `restore()` then `ACTION` only if idle + `day && scheduledFor==today` else `ADD` deferred, `startFocus` save `ExecutionState`.
- `MenuBarController` (`UI/MenuBarController.swift:1`) adds `captureController/store/clock`, `setupCapture()`+`toggleCapture/showCapture/handleCaptureMenu`, `DemoCurrentTaskProvider.taskStore` made `let` for sharing.
- `AppDelegate` (`App/AppDelegate.swift:1`) adds `hotkey: (any HotkeyGateway)?` and registers `CarbonHotkeyGateway { menuBar.toggleCapture() }` after `menuBar.start`.
- Tests: SessionE added 33 tests (SchedulingBridge 7, CaptureParser 13, CaptureService 6, CaptureViewModel 7) → total 78 tests across 13 suites, all passing (3 runs clean)

**Implemented in Session F:**
- `PlanningGate` (`Domain/PlanningGate.swift:1`) `DailyPlan {localDate,confirmedAt,taskIds}` `PlanningGate` `getPlanningGate(tasks:today:dailyPlan)` precedence monthly `scheduledFor<=currentMonth` → `monthlyPlanningRequired`, overdue `<today` or `queue>0 && !planMatches` → `dailyPlanningRequired`, ready/empty. `planMatches` filters `taskIds` to `plannedIds` order+length eq.
- `GoalModels` (`Domain/GoalModels.swift:1`) `Goal {id,name,description,color,createdAt}`, `TrueNorthGoal {id,vision,isMoneyGoal,tangibleReality,sensoryDetails,planB,importance,anchorHabit,anchorTask,createdAt}`.
- `DailyPlanStore` (`Services/DailyPlanStore.swift:1`) `dailyPlans.json` `UserDefaults goalflow.daily_plans.v1` normalized atomic+read-back. `GoalStore` `goals.json`, `TrueNorthStore` `truenorth.json`, `AmalgamStore` `amalgam.json` each atomic+WAL.
- `SyncBackedCurrentTaskProvider` (`Providers/SyncBackedCurrentTaskProvider.swift:1`) `fetchGate`/`fetchCurrent` only when `ready`, `allGoals/allTrueNorth/amalgam/goal(for:)`.
- `GoalflowTask` (`Domain/GoalflowTask.swift:14`) added `goalId: String?` optional Codable missing→nil.
- `KeychainSessionStore` (`Services/KeychainSessionStore.swift:1`) `NativeSession {accessToken,refreshToken,expiresAt,userId?}` `SecItemCopyMatching/Add/Delete` `service com.mariusschober.goalflow.mac` `isAuthenticated > now+60` `currentAccessToken` refresh `POST /auth/v1/token?grant_type=refresh_token`.
- `SupabaseAuthService` (`Services/SupabaseAuthService.swift:1`) `shared` `generateVerifier 32B base64url` `challenge SHA256` `requestMagicLink(email)` `POST /auth/v1/otp`, `startBrowserAuth(provider:custom:telegram)` `ASWebAuthenticationSession` `goalflow://auth/callback` `handleCallback` `?code&state` → `POST /auth/v1/token?grant_type=pkce` vs `#access_token` fragment, saves `NativeSession` `authDidChange`.
- `SignInView` (`UI/SignInView.swift:1`) 360pt `ultraThinMaterial 14` `TextField email` `Send link` `ProgressView` `Sign in with browser (Telegram OAuth) globe` `Continue offline`.
- `Info.plist` (`Resources/Info.plist:1`) added `CFBundleURLTypes [goalflow]` `NSCalendarsUsageDescription` `NSCalendarsFullAccessUsageDescription` `SUPABASE_URL/ANON_KEY/API_ORIGIN`.
- `AppDelegate` (`App/AppDelegate.swift:1`) added `supabaseAuth = SupabaseAuthService.shared` `application(_:open:)` `goalflow://auth/callback` → `handleCallback`, creates `dailyPlanStore/goalStore/trueNorthStore/amalgamStore` then `menuBar.start(..., dailyPlanStore, goalStore, trueNorthStore, amalgamStore, gateEnabled:true)`.
- `MenuBarController` (`UI/MenuBarController.swift:1`) `start(..., dailyPlanStore, goalStore, trueNorthStore, amalgamStore, gateEnabled)` creates `ExecutionViewModel(..., gateEnabled)`, `updateStatusTitle` checks `viewModel.gate` first: monthly → `Plan monthly` orange `calendar.badge.exclamationmark`, daily → `Plan the day` orange.
- `ExecutionViewModel` (`UI/ExecutionPanelView.swift:1`) added `@Published gate, goals, amalgam, trueNorth, calendarCollision, showBreakdown/breakdownSuggestions/breakdownChildren/breakdownLoading/breakdownError, showSignIn/isAuthenticated` `NotificationCenter authDidChange`, stores `dailyPlanStore/goalStore/trueNorthStore/amalgamStore/calendarService/breakdownGateway/localBreakdown/gateEnabled/appOrigin`, `init` sets `localBreakdown = LocalBreakdownService(taskStore)`, `restore()` loads `goals/amalgam/trueNorth`, computes `gate` via `getPlanningGate(tasks: provider.taskStore.loadAll(), today, dailyPlanStore.load)`, sets `task` nil when gated, `checkCalendarCollision` async, `requestCalendarAccess/openWebPlan/goal(for:)`, `openBreakdown/stageSuggestion/stageManual/removeStaged/confirmBreakdown` via `localBreakdown.breakdown` clearing `store` if `taskId==execution`, `restore()`, `Color(hex:)` ext.
- `ExecutionPanelView` header shows `checkmark.shield` vs `Sign in` button + `FrogBadge`, `Menu` adds `Sign in…/Sign out` divider, `body` `if let am amalgamBanner` top `indigo 10px tracking 1.2 uppercase` + `isGateWall gateWall` else `content` else `empty` + `trueNorthFooter` collapsed 2 visions, `.sheet breakdown` + `.sheet signIn`, `isGateWall gateTitle/gateMessage/gateCounts/gateCTA` orange wall `Plan monthly` vs `Resolve overdue` vs `Open today’s plan` `Capsule`, `amalgamBanner`, `trueNorthFooter`, `content` adds `goal dot Color(hex:goal.color) ?? blue 8` + `goal.name`, `calendar warning` amber `Overlaps calendar: “Sprint” 14:00–15:00` else `Check calendar` button, `Take Break` + `Break down into next actions indigo` button.
- `BreakdownService` (`Services/BreakdownService.swift:1`) `BreakdownSuggestion {title, estimatedDuration}` `ServerBreakdownGateway(supabaseUrl,apiOrigin,anonKey)` `suggest` `keychain.currentAccessToken` fallback `[]`, `POST {apiOrigin}/api/v1/ai/breakdown {"taskTitle"}` `Bearer` handles 429/503, decode `subtasks 1..8`; `BreakdownChildInput {title, notes="", durationMinutes=25}` `LocalBreakdownService(taskStore,clock,dailyPlanStore)` `breakdown(taskId:children:)` validates 1..50 title 1..240 duration 1..1440 `assertSchedule(.day,today)` tail `plannedOrder parent+index`, closes parent `brokenDown version+1 updatedAt extraJson completedAt`, creates children `UUID parentTaskId version1`, plan-preservation replaces parent id with children ids when `previousPlan.taskIds==previousQueueIds` else deletes plan, `saveAll` txn.
- `BreakdownSheet` (`UI/BreakdownSheet.swift:1`) 420pt `AI suggestions` `ProgressView` when loading, orange error, `BreakdownSuggestions` chip `+ Add`, `Next actions` list `trash`, `TextField title` + `duration m` `Add`, `Cancel` + `Break down` disabled when empty.
- `CalendarCollisionService` (`Services/CalendarCollisionService.swift:1`) `CalendarCollision {eventTitle,start,end}` `CalendarCollisionService` `collision(for:today)` `requestAccessIfNeeded`, `NoopCalendarService` nil/false, `EKCalendarCollisionService` `EKEventStore` `requestFullAccessToEvents` else `requestAccess(to:.event)`, collision parses `today 14:30` via `DateFormatter YYYY-MM-dd HH:mm current` `start+duration 25` `dayStart/end` `predicateForEvents` filter `!isAllDay && start < taskEnd && end > taskStart` first match.
- Tests: SessionF added 20 tests (PlanningGate 8, LocalBreakdown 6, Calendar 6) → total 98 tests across 16 suites, all passing (3 runs clean)

**Still deferred (per plan):** final Sync (G), signing/hardening (H). No Web/Android/server changes.

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

# Session E (verified 2026-08-30 on Xcode 26.6 / SDK 26.5 / Swift 6.3.3 / arm64)
xcodegen generate --spec macos-native/project.yml --project macos-native
  => Created project at macos-native/GoalflowMac.xcodeproj
xcodebuild -project ... -configuration Debug build => BUILD SUCCEEDED
xcodebuild -project ... -configuration Release build => BUILD SUCCEEDED
xcodebuild test ... -destination 'platform=macOS'
  => Executed 78 tests, 0 failures (3 runs clean)
  Suites:
    CaptureViewModelTests: 7 passed (needsDate, parsed date, picker ADD, month future, notes+URL, privacy blank, empty title)
    CaptureServiceTests: 6 passed (ADD persists+no resurrection, empty title, tail, month future+time validation, URL notes tags, day time validation)
    CaptureParserTests: 13 passed (@25m, 1h 15m, natural, #tag, https, *f/@quick, day, future month, current month nil, 14:30, month drops time, collapse, empty title)
    SchedulingBridgeTests: 7 passed (day valid/invalid, month future/currentRequiresDay, month+time invalid, time format, isRealDay/isRealMonth/monthOf)

# Session F (verified 2026-08-30 on Xcode 26.6 / SDK 26.5 / Swift 6.3.3 / arm64)
xcodegen generate --spec macos-native/project.yml --project macos-native
  => Created project at macos-native/GoalflowMac.xcodeproj
xcodebuild -project ... -configuration Debug build => BUILD SUCCEEDED
xcodebuild -project ... -configuration Release build => BUILD SUCCEEDED
xcodebuild test ... -destination 'platform=macOS'
  => Executed 98 tests, 0 failures (3 runs clean)
  Suites:
    PlanningGateTests: 8 passed (monthly blocks, future month not, overdue, queue without plan, ready when matches, ignores completed, empty, order mismatch)
    LocalBreakdownTests: 6 passed (closes parent+2 children plannedOrder 0/1, empty fails, >50 fails, preserves plan, parent not open fails, stub suggest empty)
    CalendarTests: 6 passed (no time nil, month nil, mock overlap 14:30, no collision, interval 14:30-14:55, requestAccess false)
    CaptureViewModelTests: 7 passed
    CaptureServiceTests: 6 passed
    CaptureParserTests: 13 passed
    SchedulingBridgeTests: 7 passed
    BreakStateTests: 3 passed
    BreakSessionStoreTests: 2 passed
    BreakTimerTests: 2 passed
    BreakReturnTests: 2 passed
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

## Known defects / limitations (A+B+C+D+E remain) + F updates

- Deployment target still 15.0 not 26.0 — intentional (see plan §21).
- `xcodegen` still required to regenerate `.xcodeproj` after `project.yml` edits.
- Timer via Combine (B); hold `CompletionHoldController` 50 Hz; break `BreakTimer` 1 s; capture `CaptureViewModel` + `CarbonHotkey` `RegisterEventHotKey`; gate `getPlanningGate` + `DailyPlanStore` + `Keychain` `SecItem`; breakdown `Server+Local` + `Calendar` `EKEventStore`.
- Persistence 7 files: `execution.json` (Composite WAL) + `goalflow.tasks.json` (LocalTaskStore) + `break.json` (FileBreakSessionStore) + `dailyPlans.json`/`goals.json`/`truenorth.json`/`amalgam.json` each atomic+WAL. Capture reuses `plannedOrder` tail. All verified.
- Overtime distinct `+mm:ss` orange; completion via hold 3 s/5 s Frog; flow picker blocks next until `1-4`/`Esc`.
- Break: `Take Break` teal capsule when active/paused; picker `5/10/15/20/Open`; cover per-screen `level=.screenSaver` `.canJoinAllSpaces` `.stationary` `.fullScreenAuxiliary`, `frame=screen.frame` (covers menu bar), `orderFrontRegardless`, `NSApp.activate`. Alarm `alarm(loop:true)` 6-beep 880 Hz square, loops 2×; `stopAlarm` on early end. Sleep during break counts for break but not focus (paused freeze).
- Capture: `⌘⇧G` Carbon `RegisterEventHotKey` `kVK_ANSI_G cmd+shift` summons centered `NSPanel` `level=.floating` `canJoinAllSpaces` `ultraThin` `520pt` `<200ms` `CACurrentMediaTime`; `Esc` hides, break suppresses capture. `Select date` factory until `Enter` → inline `DatePicker.graphical` / month `Picker 12` `>currentMonth`. Chips preview `25m/#tag/date/14:30/🔗`. `ADD` accent `ACTION` green deferred if active or future month. Notes `⌘↵` reveals `TextEditor` merged with `https://`. `TagRoutingService` `UserDefaults goalflow.hashtag.routes.v1` → `NSWorkspace.open` lowercased. `PrivacyGateway` blanks `••••` when `CGWindowListCopyWindowInfo` finds sharing.
- Gate wall blocks `ACTION`/`Break` when `monthly/daily` required; `Open Web Plan` `NSWorkspace.open` `?view=planning`; no local plan edit yet (web only).
- Breakdown: `Break down into next actions` indigo capsule → sheet `AI suggestions` `ProgressView` 429/503 orange, staged `trash`, `Confirm` closes `broken_down` `parentTaskId` `plannedOrder` tail, preserves plan when `taskIds==queueIds` else deletes; `ACTION` while gated does not preempt.
- Calendar: `Check calendar` button when `scheduledTime` but `notDetermined`; amber `Overlaps calendar` capsule when `requestFullAccessToEvents` authorized and `!isAllDay && start < taskEnd && end > taskStart`; denied shows nothing.
- Auth: `Sign in` vs `checkmark.shield` header, `Menu Sign in…/Sign out` `KeychainSessionStore.clear`, `ASWebAuthenticationSession` `goalflow://auth/callback` `code_verifier` `PKCE` vs `#access_token` fragment fallback, `local-demo` Bearer when `ENABLE_LOCAL_DEMO` and no Keychain.
- No `undo` after completion; no break stats `trackBreak` local-only (not in `STORES.STATS`).
- No sync — still deferred (G). No idle/away reconciliation dialog yet (stretch for D, B observers already recompute).
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

## Exact recommended scope for Session F — DONE

**Completed 2026-08-30 — verified above (98 tests, BUILD SUCCEEDED, DoD met).**

Next scope moves to **Session G — Final Sync (last integration)** (bounded, do not bleed into H):

1. Swift Sync adapter parity with `syncProtocol.ts` — `SyncMeta {cursor, versions, outbox, conflicts}` per-entity `version` chain, `dependsOnMutationId`, `stableJson` sorted keys, `buildStagedLocalTransaction` splitting `STORES.TASKS/GOALS/DAILY_PLANS` into per-entity mutations, `readyOutbox` ordering, `applyPushResults` + `applyRemotePage` cursor monotonicity + `LocalConflict` ledger.
2. Durable `sync_meta` + `sync_outbox` file txn `~/Library/Application Support/com.mariusschober.GoalflowMac/sync.json` atomic+WAL+read-back, plus `raw_collections` mirror for replay validation (never cherry-pick push result, never advance cursor over unapplied page).
3. Offline `completed`/`broken_down` convergence — local `completedAt` before celebration remains pending in outbox until ack'd, resurrection guard (`completed` never reappears as `open` after reload/sync), two-device property test: device A completes while B edits title → conflict explicit choice, no auto-merge.
4. `GET /api/v1/sync/pull?cursor&limit=100` + `POST /api/v1/sync/push` loops `authenticatedFetch` `Bearer` `keychain.currentAccessToken`, handle 401 refresh + `mfa_required` 403 → `authDidChange` sign out, `navigator.locks` equivalent via `NSLock` `queueMutation` serialization.
5. Tests: adversarial replay (duplicate id rejection, cursor regress, stableJson mismatch), chaos 400 sequences, convergence after offline, `verify:server` still green.

**Session G definition of done:** `POST /sync/push` + `GET /sync/pull` loops converge, local `completed`/`broken_down` survives offline and never resurrects, conflict ledger explicit, cursor never regresses over unapplied page, `stableJson` parity, adversarial + two-device property tests green, `npm test` still green, no silent data loss.

---

## Handoff checklist for next agent (Session G)

- [ ] Verify branch `feature/macos-execution-companion` tip (check `git merge-base` equals `f93684ac50562c03c99328d98e57eb67f862eb3b`); record `git rev-parse HEAD`.
- [ ] Run `xcodegen generate --spec macos-native/project.yml --project macos-native/` if `project.yml` changed.
- [ ] Run `xcodebuild test -project macos-native/GoalflowMac.xcodeproj -scheme GoalflowMac -destination 'platform=macOS'` and expect 98 passing.
- [ ] Do not modify `android-native/`, `services/syncProtocol.ts`, `services/cloudSync.ts`, `supabase/migrations/*`, `server/routes/sync/*` — Sync implementation is next (G) with strict parity.
- [ ] Read `docs/MACOS_EXECUTION_COMPANION_PLAN.md` §10 (Session G) and §21 before coding; respect `LSUIElement` + `goalflow://auth/callback` Keychain + `getPlanningGate` wall + `EventKit` read-only.

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
