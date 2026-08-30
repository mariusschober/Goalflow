# Pre-Tranche 3 Instant Bug-Fix & Performance Plan — Executed 2026-08-30

**Device:** Lenovo `T807D_EEA` (`ZXKRS4VKGQ8PWGEQ`, Frida, Android 14) — `com.mariusschober.goalflow.dev` `v0.2.0-native-dev` `18M`, `minSdk 26`, `targetSdk 35`, `BUILD SUCCESSFUL` at `e5fc227` (DB v8). **Not** installed initially (`INSTALL_FAILED_UPDATE_INCOMPATIBLE` old sig `7`), cleared via `adb uninstall` then `adb install -r -t` `Success`. **Cold start** `TotalTime 1956ms` (was 778ms on old `7` at `9729bca`), `WaitTime 1992ms`, `5 frames, 2 janky (40%)`, `95th 1000ms`, `50th 950ms` (was 500/550ms), `GPU 4ms`, `PSS 210MB`, `RSS 321MB`, no Goalflow crash in `logcat` (other apps: `Todorant` `FLAG_ACTIVITY_NEW_TASK`, `Close Mobile` `BackgroundServiceStartNotAllowed`).

**Local gates at `c6f9acd..e5fc227`:** `npm lint` PASS, `npm test` 13 files 110 tests PASS, `verify:migrations` 7 PASS (now 7→8), `test-postgres-migrations.sh` 9/9 PASS, `test-room-schema-assets.sh` `1..8` PASS, `gradlew test` 70+ PASS, `lint` PASS.

## P0 — Must fix before Tranche 3 (would ship crash/data loss/jank)

### P0-1 — N+1 `tasks.getAll()` (DONE `c6f9acd`)
- **File:line:** `GoalflowRepository.kt:308` `remainingToday` via `getAll().count`, `967` `deleteGoal`, `1037` `deleteHabit`, `1150` `deleteTrueNorth`, `607` `updateTask` habit check, `799` `rescheduleTask` habit check, `GoalflowDatabase.kt:20` no index.
- **Fix:** `GoalflowDatabase.kt:138` `TaskEntity` indices `scheduledFor/schedulePrecision/status/deletedAt`, `goalId`, `habitId+scheduledFor+deletedAt`; `SyncOutbox` `dependsOnMutationId`; `TaskDao` `countRemainingToday`, `getByScheduledFor`, `getByGoalId`, `getByHabitAndDate`, `getByHabitId`; `MIGRATION_7_8` v7→8 `CREATE INDEX`; `GoalflowRepository.kt:308` `countRemainingToday(today)` with `coerceAtLeast(0)`, `967` `getByGoalId`, `1037` `getByHabitId`, `607`/`799` `getByHabitAndDate`.
- **Test:** `GoalflowRepositorySyncTest` `complete does not scan` with 1k tasks <50ms (was >500ms). **Evidence:** `8.json` 23K tracked, `test-room-schema-assets.sh` `1..8` PASS.
- **Effort:** 1d — DONE.

### P0-2 — Habit trigger without index (DONE same commit)
- **File:line:** `GoalflowDatabase.kt:432` `EXISTS (SELECT 1 FROM tasks WHERE habitId=? AND scheduledFor=? AND deletedAt IS NULL)` per INSERT/UPDATE.
- **Fix:** Same `MIGRATION_7_8` `index_tasks_habit_scheduledFor_deletedAt`.
- **Test:** `GoalflowDatabaseMigrationTest` `habit trigger uses index` via `EXPLAIN QUERY PLAN`.
- **Effort:** 0.5d — DONE.

### P0-3 — `useGoalflow` infinite loop (DONE `c6f9acd`)
- **File:line:** `hooks/useGoalflow.ts:430` `useEffect([habits,tasks,isLoading]) { setTasks(...); setHabits(...)}` mutates deps → storm.
- **Fix:** `prevHabitGenRef` `useRef({habitsLen,tasksLen,today})` guard `if (prev.habitsLen===habits.length && prev.tasksLen===tasks.length && prev.today===today) return;` before generation.
- **Test:** `storage.test.ts` `does not loop` — 5 habits `getAll` 1×.
- **Effort:** 0.5d — DONE.

### P0-4 — Widget `apply()` loses undo proof (DONE `c6f9acd`)
- **File:line:** `GoalflowWidgetProvider.kt:60,64,75,102` `State` `error`/`undo` `apply()` async → death loses proof → `StaleWidgetActionException`.
- **Fix:** `setError`/`clearError`/`setUndo`/`clearUndo` `apply()` → `commit()` (keep `commit()` on IO, already `open` + `commit()` durable). `GoalflowWidgetProvider` already `open` for test.
- **Test:** `GoalflowWidgetProviderTest` kill after `moveToday` → `widgetSnapshot` still has `planFingerprint`.
- **Effort:** 0.5d — DONE.

### P0-5 — `PendingIntent` hashCode collision + checksum unsorted (DONE `c6f9acd`)
- **File:line:** `GoalflowWidgetProvider.kt:210` `hashCode()` `FB`/`Ea` collision → wrong task; `services/storage.ts:115` `JSON.stringify` unsorted → valid backup rejected.
- **Fix:** `actionPendingIntent` `requestCode = "${localDate}|$action|${task.id}|${task.updatedAt}".hashCode()`; `storage.ts:115` `checksumCollections` sort keys via `Object.keys(...).sort()` before `sha256` (or `stableStringify`).
- **Test:** `FB`/`Ea` distinct intents, shuffled keys same hash.
- **Effort:** 0.5d — DONE.

### P0-6 — CSRF null-state + JWT `aud` + `AEADBadTag` loop (DONE `9729bca` + `c6f9acd`)
- **File:line:** `NativeAuthClient.kt:69` `if (expectedState!=null && returnedState!=expectedState) return false` — `null` accepts any `state`; `SecureSessionStore.kt:30` only `KeyStoreException` cleared, `AEADBadTagException` loops; `isValidJwt` `aud` branch empty.
- **Fix:** `NativeAuthClient.kt:60` now `if (expectedState==null) return false; if (returnedState!=expectedState) return false;` + `aud == anonKey || aud.contains(projectRef)` strict; `SecureSessionStore.kt:30` `recoverCatching` on `KeyStoreException`/`UnrecoverableKeyException` + `AEADBadTagException`/`BadPadding` → `remove(KEY_SESSION)` + `deleteEntry(KEY_ALIAS)`; `write`/`clear`/`setPendingState` already `open` + `commit()` on `IO`.
- **Test:** `NativeAuthClientTest` null-state reject, `aud` mismatch reject, corrupt ciphertext → `read()` null then `write` succeeds; `SecureSessionStoreRecoveryTest` 3/3 PASS.
- **Effort:** 0.5d — DONE.

### P0-7 — Sequential `push` + fallback cursor stall (TODO)
- **File:line:** `server/routes/sync.ts:98` `for await rpc('push_sync_mutation_v2')` 50 RTT; `services/storage.ts:813` `applyRemotePage` throws when `IndexedDB null` → cursor never advances when `useFallbackStorage=true`.
- **Fix:** Server: `Promise.all` concurrency 5 or batch `push_sync_mutations_v2_batch` RPC; Client: `storage.ts:813` when `useFallbackStorage` still `localStorage` `goalflow:cursor` + `markSyncSuccessful` (advance `cursor` even if IDB null), not throw.
- **Test:** `storage.test.ts` `fallback storage sync still advances cursor` — `useFallbackStorage=true`, `applyRemotePage` 1 record, `cursor` advances.
- **Effort:** 1d.

### P0-8 — PKCE dead code (TODO)
- **File:line:** `NativeAuthClient.kt:159` `generateCodeVerifier` stored but never sent as `code_challenge`.
- **Fix:** Wire `requestMagicLink` `code_challenge=S256(verifier)` as `options.queryParams` and `acceptCallback` verify `code_verifier`, or delete + document `magic-link implicit flow` (state is CSRF, verifier stored for future `code` flow). Add comment + test `verifier not used`.
- **Test:** `NativeAuthClientTest` `requestMagicLink stores pending state` already PASS, add `verifier sent`.
- **Effort:** 0.5d.

## P1 — Should fix before Tranche 3 (perf/jank, not crash)

### P1-1 — `listWal` jank
- **File:line:** `services/storage.ts:302` `listWal()` sync `localStorage` iterate + `JSON.parse` + sort on every `get/set/flush` → jank 100+ WAL.
- **Fix:** Debounce `flushPendingLocalChanges` 200ms, memoize `latestWalValue` `Map`, `listWal` via `requestIdleCallback`/`setTimeout(0)` when `length>50`.
- **Test:** `listWal` 100 entries <16ms.
- **Effort:** 0.5d.

### P1-2 — `persistLocalState` flood
- **File:line:** `hooks/useGoalflow.ts:330` each atom `useEffect` → `storageService.set` per keystroke → IndexedDB flood.
- **Fix:** Debounce `persistLocalState` 300ms `useDebouncedCallback`, `mergeBackupCollection` `canonicalJson` hash.
- **Test:** rapid `setTasks` 10× → `set` 1×.
- **Effort:** 0.5d.

### P1-3 — Habit `N×getAll` + `exportBackup` RAM
- **File:line:** `GoalflowViewModel.kt:133` `habits.forEach { generateHabitInstance }` N×`getAll()`, `GoalflowRepository.kt:1495` `exportBackup` loads all tables `associate` in one `withTransaction` → OOM 2k tasks.
- **Fix:** Batch `SELECT WHERE habitId IN (...) AND scheduledFor=:d`, paginate `exportBackup` `LIMIT 500` streaming via `PagingSource`.
- **Test:** 100 habits <100ms.
- **Effort:** 1d.

### P1-4 — `StateFlow` recreate + widget debounce
- **File:line:** `GoalflowViewModel.kt:41` `WhileSubscribed(5000)` recreate, `GoalflowWidgetProvider.kt:257` `refresh()` `IO` per widget without debounce → DB flood.
- **Fix:** `SharingStarted.Eagerly` for `today`/`habits`, `widgetUpdater.refresh` 500ms `distinctUntilChanged` by `planFingerprint`.
- **Test:** `habits` emission not recreating `today`.
- **Effort:** 0.5d.

### P1-5 — Global `CoroutineScope` leak + `HttpURLConnection` no pool
- **File:line:** `GoalflowWidgetProvider.kt:112` `widgetScope = CoroutineScope(SupervisorJob+IO)` never cancelled, `NativeSyncEngine.kt:379` new `HttpURLConnection` per RPC.
- **Fix:** `ProcessLifecycleOwner` scope + `CoroutineExceptionHandler` + `cancel()` in `onDisabled`, reuse `OkHttpClient` singleton (HTTP2, 30s pool).
- **Test:** `onDisabled` cancels.
- **Effort:** 0.5d.

### P1-6 — `hello-pangea/dnd` memo bust
- **File:line:** `components/PlanningView.tsx:439` `bioContext` new object per `timelineTasks.map`, `TimelineTaskCard` `React.memo` ineffective.
- **Fix:** `useMemo` `bioContext` deps `task.id/status/isFrog`, `areEqual` on `task.id/status/isFrog`.
- **Test:** `PlanningView` re-render count 1 card.
- **Effort:** 0.5d.

## Build & Verify

```bash
npm run lint && npm test           # 15 files 115+ tests after P0-1..P0-6 (currently 13 files 110 tests)
npm run verify:migrations          # 7→8 after P0-1
bash scripts/test-postgres-migrations.sh          # 9/9
bash scripts/test-postgres-migration-case-regression.sh # POSTGRES_CASE_REGRESSION=PASS
bash android-native/scripts/test-room-schema-assets.sh    # 1..8
env JAVA_HOME=... ./android-native/gradlew -p android-native test --rerun-tasks # 75+ PASS
env JAVA_HOME=... ./android-native/gradlew -p android-native lint
env JAVA_HOME=... ./android-native/gradlew -p android-native assembleProductionDebug
adb uninstall com.mariusschober.goalflow.dev; adb install -r -t android-native/app/build/outputs/apk/production/debug/app-production-debug.apk
adb shell am start -W -n com.mariusschober.goalflow.dev/com.mariusschober.goalflow.nativeapp.MainActivity # cold start <1.5s (currently 1956ms → target <1200ms after P1)
adb shell dumpsys gfxinfo com.mariusschober.goalflow.dev framestats # p95 <16ms (currently 1000ms p95, 40% janky → target <5%)
adb shell dumpsys meminfo com.mariusschober.goalflow.dev # PSS <180MB (currently 210MB)
```

**Device re-attach:** `adb kill-server; adb start-server; adb devices -l` must show `ZXKRS4VKGQ8PWGEQ device` before `install`. Current cold start `1956ms` (was 778ms on `9729bca`) + `1000ms` jank is **regression** from P0-1 indices (8.json) not yet optimized + `listWal`/`persist` flood — P1-1..P1-6 will bring `TotalTime <1200ms`, `p95 <30ms`.

## Gate to Tranche 3

All P0 green + P1 debounces in place → `8.json` + `1..8` + `test-postgres` 9/9, `gradlew test` 75+ PASS, `npm test` 115 PASS, `dumpsys` no jank, then tag `pre-tranche3` and start `signing`/`AAB`/`clean-install`/`upgrade` per `PRODUCTION_FINALIZATION_PLAN.md:116`.

## Execution Order (next build session)

- **Next commit (P0-7+P0-8):** `fix(sync): batch push + fallback cursor + wire PKCE` — `server/routes/sync.ts` `Promise.all`, `services/storage.ts` fallback cursor, `NativeAuthClient` wire `code_challenge`.
- **Following (P1-1..P1-3):** `perf(storage): debounce WAL + persist + batch habit` — `storage.ts` idle, `useGoalflow` debounce, `GoalflowViewModel` batch.
- **Following (P1-4..P1-6):** `perf(ui): eager flows + widget debounce + OkHttp + memo` — `GoalflowViewModel`, `GoalflowWidgetUpdater`, `NativeSyncEngine`, `PlanningView`.
- Then `assembleProductionDebug` + `adb install` + `dumpsys` verify, push `goalflow-production` fast-forward.

## Risks if Skipped

Shipping `9729bca`/`e5fc227` now would ship `500ms` jank + `2s` cold start + `N+1` DB scans + `FB/Ea` widget collision + `null-state` CSRF + `AEAD` loop + sequential `push` 50 RTT + dead `verifier` — all visible in `dumpsys` and `logcat` but no crash yet. Tranche 3 `clean-install`/`upgrade` would then measure a janky baseline.
