# Goalflow beta provenance

Forensic inventory captured on 2026-09-03 before beta changes. This document is
the authority for branch provenance during the beta reconciliation. It records
remote state after a full fetch; it does not claim that any branch is safe to
deploy.

## Capture method and immutable reference point

- Repository: `mariusschober/Goalflow` (public; authenticated repository access
  reports admin/push permission for `mariusschober`).
- Fetch: `git fetch origin --prune --tags '+refs/heads/*:refs/remotes/origin/*'`.
- Worktree immediately after fetch: clean at
  `main`/`84bd036ba25d825b5fae36cb780842d9221ed097`.
- GitHub default branch: `main`.
- Verified canonical baseline:
  `reconcile/canonical-main-20260831` at
  `6bd503605efe0ba4a92d57a6850e98590c1117a8`.
- Temporary local integration branch: `integration/beta`, created directly from
  that canonical SHA. `main` was not modified.
- Ahead/behind below is `canonical-only / branch-only`, calculated with
  `git rev-list --left-right --count canonical...branch`.
- “Branch delta” means the changed paths between the branch's merge base with
  canonical and the branch head. It is not a recommendation to port those
  paths.

GitHub reports every current branch as `protected: false`; the repository
rulesets collection is empty. The legacy branch-protection detail endpoint is
not readable by the installed GitHub integration, but the branch collection
independently confirms no branch is protected and no required checks are
attached.

## Remote branch ledger

| Remote branch | Exact head | Merge base with canonical | Canonical-only / branch-only | Branch delta | Contract age | Disposition |
| --- | --- | --- | ---: | --- | --- | --- |
| `main` | `84bd036ba25d825b5fae36cb780842d9221ed097` | `84bd036ba25d825b5fae36cb780842d9221ed097` | 152 / 0 | none | Obsolete; predates Supabase migrations and the shared sync contract | **SUPERSEDED**; retain as the production target, replace only after proof |
| `archive/main-pre-canonical-20260831` | `84bd036ba25d825b5fae36cb780842d9221ed097` | `84bd036ba25d825b5fae36cb780842d9221ed097` | 152 / 0 | none | Same obsolete tree as `main` | **DELETE-AFTER-PROOF**; exact head already tagged |
| `goalflow-production` | `2cf39f8227612286957632e095211f6eb1bce2d1` | `2cf39f8227612286957632e095211f6eb1bce2d1` | 4 / 0 | none | Direct ancestor of canonical; canonical adds release-gate and evidence hardening | **SUPERSEDED**, then **DELETE-AFTER-PROOF** |
| `reconcile/canonical-main-20260831` | `6bd503605efe0ba4a92d57a6850e98590c1117a8` | same | 0 / 0 | none | Current shared contract baseline | **ARCHIVE** until beta proof; stale PR #2 must be updated or replaced |
| `codex/goalflow-local-worktree-backup-2026-08-29` | `a0cecce49317d516e7a2d29978e658b39b5807ae` | `3cc0373f821105fb9a80ecf714f09578baf72bad` | 134 / 2 | 47 paths, +9,798/−1,341 | Older Room/sync/backup contract; its useful work is already present in newer form | **SUPERSEDED**, then **DELETE-AFTER-PROOF** |
| `goalflow-integrity-checkpoint-20260829-a867470` | `6ca8f8b71b9b34f74d28a709db6e70596710d6ba` | `3cc0373f821105fb9a80ecf714f09578baf72bad` | 134 / 1 | 46 paths, +9,684/−1,341 | Older checkpoint of the same Room/sync/backup work | **ARCHIVE** as evidence, then **DELETE-AFTER-PROOF** because the tag is durable |
| `codex/zero-data-loss-finalization` | `0ee98c87f961a854aa30ad3263542a2d783d1465` | `7a502cd6908b4ce5dfaad3216bd7a804aa4a1fd8` | 22 / 14 | 27 paths, +2,285/−186 | Based on an earlier shared contract; contains later hardening tests worth evaluating | **PORT** selective tests/session hardening only; never port its old migration blob wholesale; then **DELETE-AFTER-PROOF** |
| `sol/web-production-24h` | `34de3f49aab610fd7a4400c086f02186c1890f6d` | `6885df57dd4c49d68206798125c895474cb0a935` | 5 / 8 | 7 paths, +570/−6 | Web regression work predates canonical; much was already selectively ported | **PORT** only missing tests/diagnostics; reject its security weakening; then **DELETE-AFTER-PROOF** |
| `feature/macos-execution-companion` | `2d30375aa0b76fbae3061b672ce56f2fd313cb50` | `f93684ac50562c03c99328d98e57eb67f862eb3b` | 48 / 29 | 87 paths, +9,166 | Native app is newer isolated work, but its copied sync assumptions predate canonical | **PORT** the app on a branch from stabilized integration; conform to canonical rather than porting shared code backward |
| `feat/telegram-v1` | `5477ec362f3f08956706cca82294b3da62f49cc2` | `44f2e47f4d7e589f17a746c96cabf58e7b2fbb8a` | 44 / 6 | 33 paths, +4,071/−192 | Bot/Mini App work is newer isolated work on an older server/schema contract | **PORT** after core backend proof; migration must be additive and regenerated/reviewed against current migrations |
| `feature/chrome-execution-companion` | `c4e5d6820303d858831c71c3e22495c4c7195712` | `6825b38cf5a41efa8cff49736c12b0aa6c159e74` | 45 / 7 | 38 paths, +5,802 | Isolated demo-backed extension on an older contract | **POST-BETA**; preserve, do not integrate into the beta gate |

Snapshot differences against canonical are respectively: `main`/archive 302
paths; `goalflow-production` 48; local backup 147; integrity checkpoint 146;
zero-data-loss 95; web-production 52; macOS 201; Telegram 145; Chrome 152.
These large differences are why no divergent branch may be merged wholesale.

## Pull requests and last canonical CI

- PR #1, `codex/zero-data-loss-finalization` → `goalflow-production`, is open,
  draft, conflicting, and unmergeable at head
  `0ee98c87f961a854aa30ad3263542a2d783d1465`. It is superseded, but must not be
  closed until useful work is mapped to replacement commits.
- PR #2, `reconcile/canonical-main-20260831` → `main`, is open and mergeable at
  head `6bd503605efe0ba4a92d57a6850e98590c1117a8`, but its description and evidence
  still cite older candidate SHAs. Treat it as stale and do not merge it.
- CI run `33396021775` for PR #2 at the exact canonical head failed. `verify`,
  PostgreSQL migrations, and legacy Android passed. Full-history secrets,
  native Android instrumentation, WebKit, and therefore the aggregate
  `canonical-gate` failed. It is evidence for triage, not release evidence.
- Hosted account/RLS testing is still absent. No Railway or Supabase deployment
  is proven by repository or GitHub evidence.

## Audit-tag verification

Every pre-existing annotated audit tag peels to the exact recorded branch head:

| Preserved head | Peeling tag |
| --- | --- |
| `84bd036ba25d825b5fae36cb780842d9221ed097` | `main-pre-canonical-20260831` |
| `2cf39f8227612286957632e095211f6eb1bce2d1` | `audit/2026-08-31/goalflow-production` |
| `34de3f49aab610fd7a4400c086f02186c1890f6d` | `audit/2026-08-31/sol/web-production-24h` |
| `0ee98c87f961a854aa30ad3263542a2d783d1465` | `audit/2026-08-31/codex/zero-data-loss-finalization` |
| `5477ec362f3f08956706cca82294b3da62f49cc2` | `audit/2026-08-31/feat/telegram-v1` |
| `2d30375aa0b76fbae3061b672ce56f2fd313cb50` | `audit/2026-08-31/feature/macos-execution-companion` |
| `c4e5d6820303d858831c71c3e22495c4c7195712` | `audit/2026-08-31/feature/chrome-execution-companion` |
| `6ca8f8b71b9b34f74d28a709db6e70596710d6ba` | `audit/2026-08-31/goalflow-integrity-checkpoint-20260829-a867470` |
| `a0cecce49317d516e7a2d29978e658b39b5807ae` | `audit/2026-08-31/codex/goalflow-local-worktree-backup-2026-08-29` |

The canonical reconciliation head was the only untagged current remote head.
It is preserved by the new annotated tag
`audit/2026-09-03/reconcile/canonical-main-20260831`, which must peel to
`6bd503605efe0ba4a92d57a6850e98590c1117a8`. The integration branch does not
receive a second tag while it points to the same object.

## Branch-specific evidence and port boundaries

### Obsolete main and archive

There are no branch-only commits or paths after their merge base. Their tree
contains no `supabase/migrations` directory and no current cross-client sync
contract. The old head is provenance only; it is not a viable code source.

### `goalflow-production`

There are no branch-only commits or paths. It is an exact ancestor of canonical
and already contains the seven ordered SQL migrations from
`202607170001_foundation.sql` through
`202608310001_telegram_auth_state_pkce.sql`. Canonical is newer by four commits
covering reconciliation documentation, migration/Room hash guards, golden
fixtures, PWA/WebKit gates, and fail-closed CI. Nothing should be ported from
this branch.

### Local-worktree backup and integrity checkpoint

The backup has two unique commits (`23d430c`, `a0cecce`); the checkpoint has one
(`6ca8f8b`). Both introduce an early form of the same 46-path integrity tranche:
Room database/repository/sync/session changes, the
`202608260001_zero_silent_data_loss.sql` migration, backup/restore scripts,
server sync routes, and TypeScript property/adversarial tests. The backup adds
one extra handover document. No test path exists there but not in canonical.
Canonical has materially newer schema, Room versions, account binding, and
protocol behavior; direct porting would regress durable contracts.

Branch-delta paths common to both (the backup also adds
`docs/AI_CONTEXT_HANDOVER.md`):

```text
.github/workflows/ci.yml
App.tsx
AppWrapper.tsx
DATA_INTEGRITY_HANDOVER.md
android-native/app/build.gradle
android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/{GoalflowApplication.kt,MainActivity.kt}
android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/data/{GoalflowBackup.kt,GoalflowDatabase.kt,GoalflowJson.kt,GoalflowRepository.kt}
android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/sync/{NativeSyncEngine.kt,NativeSyncWorker.kt,SecureSessionStore.kt}
android-native/app/src/main/java/com/mariusschober/goalflow/nativeapp/ui/{GoalflowRoot.kt,GoalflowViewModel.kt}
android-native/app/src/test/java/com/mariusschober/goalflow/nativeapp/data/{GoalflowBackupTest.kt,GoalflowDatabaseMigrationTest.kt,GoalflowRepositorySyncTest.kt}
android-native/app/src/test/java/com/mariusschober/goalflow/nativeapp/sync/NativeSyncEngineTest.kt
components/SyncStatus.tsx
hooks/useGoalflow.ts
package.json
scripts/{migration-current-seed.sql,migration-integrity-assertions.sql,restore-production-backup.ts,supabase-test-bootstrap.sql,test-postgres-migrations.sh,verify-data-integrity-migrations.mjs}
server/{app.ts,backups.test.ts,backups.ts,taskReconciliation.ts}
server/routes/{sync.test.ts,sync.ts,tasks.ts,telegram.ts}
server/telegram/bot.ts
services/{backupCrypto.test.ts,cloudSync.adversarial.test.ts,cloudSync.ts,storage.test.ts,storage.ts,syncProtocol.property.test.ts,syncProtocol.ts}
supabase/migrations/202608260001_zero_silent_data_loss.sql
```

### `codex/zero-data-loss-finalization`

Fourteen unique commits range from documentation through PostgreSQL/Room fixes
to session and fault-injection hardening. It directly modifies an already named
historical SQL migration; that blob must never overwrite canonical migration
history. Its eight tests absent from canonical are candidates for semantic
porting:

```text
android-native/app/src/test/java/com/mariusschober/goalflow/nativeapp/sync/Tranche2ConformanceTest.kt
server/auth/secureCallback.test.ts
server/routes/telegram.secure.test.ts
server/telegram/miniApp.secure.test.ts
services/crossClient.test.ts
services/faultInjection.test.ts
services/sessionRecovery.test.ts
services/syncHealth.test.ts
```

The full branch delta is those tests plus CI/docs; Room schema 7 and migration
instrumentation; `GoalflowDatabase.kt` and `GoalflowRepositorySyncTest.kt`;
`scripts/test-postgres-migration-case-regression.sh`;
`server/auth/secureCallback.ts`; `services/authService.ts`; and the historical
`202608260001` SQL blob. Each test must be checked against real current code;
source-string, fake-map, or obsolete-contract assertions are not release proof.

### `sol/web-production-24h`

Eight unique commits add a web handover and the first Chromium/WebKit release
journey. The seven branch-delta paths are:

```text
.github/workflows/ci.yml
docs/WEB_PRODUCTION_24H_HANDOVER.md
package-lock.json
package.json
playwright.config.ts
server/app.ts
tests/e2e/web-critical.spec.ts
```

Canonical already has independently ported Playwright configuration and the
critical spec, so no test path exists only on this branch. The branch's
`server/app.ts` weakens HSTS/CSP/rate-limit behavior and is explicitly rejected.
Only missing diagnostics or assertions may be ported after line-by-line review.

### `feature/macos-execution-companion`

Twenty-nine unique commits create an isolated Swift application. There are no
shared server or SQL branch-delta paths. Its 87 paths comprise `appcast.xml`,
`scripts/package-dmg.sh`, seven macOS documents, Xcode project/configuration and
assets, 51 production Swift files, and these 15 tests:

```text
macos-native/GoalflowMacTests/BreakTests.swift
macos-native/GoalflowMacTests/BreakdownTests.swift
macos-native/GoalflowMacTests/CalendarTests.swift
macos-native/GoalflowMacTests/CaptureServiceTests.swift
macos-native/GoalflowMacTests/CaptureTests.swift
macos-native/GoalflowMacTests/CaptureViewModelTests.swift
macos-native/GoalflowMacTests/ExecutionStateTests.swift
macos-native/GoalflowMacTests/ExecutionTimerTests.swift
macos-native/GoalflowMacTests/FocusSessionStoreTests.swift
macos-native/GoalflowMacTests/HardeningTests.swift
macos-native/GoalflowMacTests/PlanningGateTests.swift
macos-native/GoalflowMacTests/SchedulingTests.swift
macos-native/GoalflowMacTests/SessionBTests.swift
macos-native/GoalflowMacTests/SessionCTests.swift
macos-native/GoalflowMacTests/SyncTests.swift
```

Protocol-relevant app paths are `macos-native/GoalflowMac/Sync/*`,
`Services/SupabaseAuthService.swift`, `Services/KeychainSessionStore.swift`,
`Services/DailyPlanStore.swift`, `Services/GoalStore.swift`, and
`Providers/SyncBackedCurrentTaskProvider.swift`. These definitions must be
adapted to canonical schema/protocol behavior; they are not a competing source
of truth. Preserve bundle ID `com.mariusschober.goalflow.mac`, URL scheme
`goalflow`, durable IDs, and Keychain identity.

### `feat/telegram-v1`

Six unique commits create modular bot capture, scheduling/pending state,
forward/voice handling, Mini App authentication/UI, and one proposed migration.
The schema delta is
`supabase/migrations/202609010001_telegram_rich_capture.sql`; it is absent from
canonical and follows a branch that lacks canonical migration
`202608300001_complete_native_sync_transport.sql` and
`202608310001_telegram_auth_state_pkce.sql`. It therefore requires additive
reconciliation rather than copying into the chain unexamined.

Tests existing only on this branch:

```text
server/routes/telegramMini.test.ts
server/telegram/bot.adversarial.test.ts
server/telegram/bot.test.ts
server/telegram/formatting.test.ts
server/telegram/forward.test.ts
server/telegram/miniAppAuth.test.ts
server/telegram/pending.test.ts
```

Other branch-delta paths are `App.tsx`, four Telegram planning/status documents,
`package.json`, `server/app.ts`, the corresponding server modules under
`server/routes/` and `server/telegram/`, `telegram-mini-app/*`, and
`vite.mini.config.ts`. Production remains disabled until live Telegram proof.

### `feature/chrome-execution-companion`

Seven unique commits add an isolated Manifest V3 extension and two documents.
All 38 branch-delta paths are under `chrome-extension/` except the documents.
There is no shared schema/server delta. Its only-branch tests are:

```text
chrome-extension/tests/demoCurrentTaskProvider.test.ts
chrome-extension/tests/executionState.test.ts
chrome-extension/tests/executionTimer.test.ts
chrome-extension/tests/focusSessionStore.test.ts
chrome-extension/tests/scheduling.test.ts
```

The presence of `DemoCurrentTaskProvider` and absent canonical account/sync
integration makes this post-beta work, not a beta dependency.

## Non-negotiable reconciliation decisions

1. `integration/beta` starts at exactly the verified canonical SHA; no merge was
   used to construct it.
2. No remote branch is deleted until its head has a verified peeling tag, its
   useful work is proven present or deliberately deferred, and this document is
   updated with the replacement commit.
3. Existing migration filenames and contents remain frozen. Any schema repair
   is a new additive migration created with the current Supabase CLI workflow.
4. Canonical shared TypeScript/Kotlin/server contracts win over copied contracts
   on macOS, Telegram, Chrome, or old hardening branches.
5. Synthetic tests can qualify code for hosted testing but cannot establish the
   hosted account-isolation, cross-client, backup, or restore claims required
   for beta release.
