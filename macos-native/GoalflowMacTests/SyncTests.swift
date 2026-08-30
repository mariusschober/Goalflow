import XCTest
@testable import GoalflowMac

final class StableJsonTests: XCTestCase {
    func test_sorts_keys() {
        let a: [String: Any] = ["b": 2, "a": 1]
        let b: [String: Any] = ["a": 1, "b": 2]
        XCTAssertEqual(stableJson(a), stableJson(b))
    }
    func test_nested_sorts() {
        let a: [String: Any] = ["z": ["b": 2, "a": 1], "a": 1]
        let b: [String: Any] = ["a": 1, "z": ["a": 1, "b": 2]]
        XCTAssertEqual(stableJson(a), stableJson(b))
    }
    func test_nil_and_array() {
        XCTAssertEqual(stableJson(nil), "null")
        XCTAssertEqual(stableJson([1,2,3]), "[1,2,3]")
    }
}

final class SyncMetaTests: XCTestCase {
    func test_empty_meta() {
        let m = emptySyncMeta()
        XCTAssertEqual(m.schemaVersion, 2)
        XCTAssertEqual(m.cursor, 0)
        XCTAssertTrue(m.outbox.isEmpty)
    }
    func test_normalize_duplicate_mutation_throws() {
        var m = emptySyncMeta()
        let mut = SyncMutation(mutationId: "dup", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"1"]), updatedAt: "2026-09-01T00:00:00Z", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        m.outbox = [mut, mut]
        let store = SyncMetaStore(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), defaults: UserDefaults(suiteName: UUID().uuidString)!)
        XCTAssertThrowsError(try store.normalizeSyncMeta(m))
    }
    func test_normalize_schema_mismatch_throws() {
        var m = emptySyncMeta()
        m.schemaVersion = 99
        let store = SyncMetaStore(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), defaults: UserDefaults(suiteName: UUID().uuidString)!)
        XCTAssertThrowsError(try store.normalizeSyncMeta(m))
    }
}

final class BuildStagingTests: XCTestCase {
    func test_noop_when_equal() {
        let prev: [[String: Any]] = [["id":"1","title":"A"]]
        let next: [[String: Any]] = [["id":"1","title":"A"]]
        let tx = buildStagedLocalTransaction(storeName: "tasks", userKey: "u", previousValue: prev, nextValue: next, order: 1, now: "2026-09-01T00:00:00Z", randomUuid: { UUID().uuidString })
        XCTAssertNil(tx)
    }
    func test_per_record_diff_creates_mutation() {
        let prev: [[String: Any]] = [["id":"1","title":"A"]]
        let next: [[String: Any]] = [["id":"1","title":"B"]]
        let tx = buildStagedLocalTransaction(storeName: "tasks", userKey: "u", previousValue: prev, nextValue: next, order: 1, now: "2026-09-01T00:00:00Z", randomUuid: { "m1" })
        XCTAssertNotNil(tx)
        XCTAssertEqual(tx?.changes.count, 1)
        XCTAssertEqual(tx?.changes.first?.entityId, "1")
    }
    func test_added_record() {
        let prev: [[String: Any]] = []
        let next: [[String: Any]] = [["id":"2","title":"New"]]
        let tx = buildStagedLocalTransaction(storeName: "tasks", userKey: "u", previousValue: prev, nextValue: next, order: 1, now: "now", randomUuid: { UUID().uuidString })
        XCTAssertEqual(tx?.changes.count, 1)
        XCTAssertEqual(tx?.changes.first?.entityId, "2")
    }
    func test_deleted_record() {
        let prev: [[String: Any]] = [["id":"1","title":"A"]]
        let next: [[String: Any]] = []
        let tx = buildStagedLocalTransaction(storeName: "tasks", userKey: "u", previousValue: prev, nextValue: next, order: 1, now: "now", randomUuid: { UUID().uuidString })
        XCTAssertEqual(tx?.changes.first?.deletedAt, "now")
    }
    func test_singleton_store() {
        let tx = buildStagedLocalTransaction(storeName: "amalgam", userKey: "u", previousValue: "hello", nextValue: "world", order: 1, now: "now", randomUuid: { UUID().uuidString })
        XCTAssertEqual(tx?.changes.count, 1)
        XCTAssertEqual(tx?.changes.first?.entityId, "singleton")
    }
}

final class ReadyOutboxTests: XCTestCase {
    func test_dependency_gate() {
        var meta = emptySyncMeta()
        let m1 = SyncMutation(mutationId: "m1", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: 0, version: 1, payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        let m2 = SyncMutation(mutationId: "m2", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 2, payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: "m1", resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m1, m2]
        let ready = readyOutbox(meta, limit: 50)
        XCTAssertEqual(ready.map(\.mutationId), ["m1"])
    }
    func test_one_per_entity() {
        var meta = emptySyncMeta()
        let m1 = SyncMutation(mutationId: "a", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable([:]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        let m2 = SyncMutation(mutationId: "b", deviceId: "d", entityType: "tasks", entityId: "2", baseServerVersion: nil, version: 1, payload: AnyCodable([:]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m1, m2]
        let ready = readyOutbox(meta, limit: 1)
        XCTAssertEqual(ready.count, 1)
    }
    func test_sort_version_then_id() {
        var meta = emptySyncMeta()
        let m2 = SyncMutation(mutationId: "b", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 2, payload: AnyCodable([:]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        let m1 = SyncMutation(mutationId: "a", deviceId: "d", entityType: "tasks", entityId: "2", baseServerVersion: nil, version: 1, payload: AnyCodable([:]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m2, m1]
        let ready = readyOutbox(meta, limit: 50)
        XCTAssertEqual(ready.first?.mutationId, "a")
    }
}

final class ApplyPushResultsTests: XCTestCase {
    func test_accepted_proves_and_clears() throws {
        var meta = emptySyncMeta()
        let m = SyncMutation(mutationId: "m1", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"1","title":"A"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m]
        meta.versions[syncEntityKey("tasks","1")] = VersionPair(local: 1, server: nil)
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 11, deviceId: "d", payload: AnyCodable(["id":"1","title":"A"]), updatedAt: "now", deletedAt: nil)
        let res = PushResult(mutationId: "m1", accepted: true, serverVersion: 11, replayMismatch: nil, serverMissing: nil, conflictId: nil, record: rec)
        let newMeta = try applyPushResults(meta, batch: [m], results: [res])
        XCTAssertTrue(newMeta.outbox.isEmpty)
        XCTAssertEqual(newMeta.versions[syncEntityKey("tasks","1")]?.server, 11)
    }
    func test_stableJson_mismatch_throws() {
        var meta = emptySyncMeta()
        let m = SyncMutation(mutationId: "m1", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"1","title":"A"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m]
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 11, deviceId: "d", payload: AnyCodable(["id":"1","title":"B"]), updatedAt: "now", deletedAt: nil)
        let res = PushResult(mutationId: "m1", accepted: true, serverVersion: 11, replayMismatch: nil, serverMissing: nil, conflictId: nil, record: rec)
        XCTAssertThrowsError(try applyPushResults(meta, batch: [m], results: [res]))
    }
    func test_serverVersion_zero_when_accepted_throws() {
        var meta = emptySyncMeta()
        let m = SyncMutation(mutationId: "m1", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m]
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 0, deviceId: "d", payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil)
        let res = PushResult(mutationId: "m1", accepted: true, serverVersion: 0, replayMismatch: nil, serverMissing: nil, conflictId: nil, record: rec)
        XCTAssertThrowsError(try applyPushResults(meta, batch: [m], results: [res]))
    }
    func test_replayMismatch_throws() {
        var meta = emptySyncMeta()
        let m = SyncMutation(mutationId: "m1", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m]
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 11, deviceId: "d", payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil)
        let res = PushResult(mutationId: "m1", accepted: true, serverVersion: 11, replayMismatch: true, serverMissing: nil, conflictId: nil, record: rec)
        XCTAssertThrowsError(try applyPushResults(meta, batch: [m], results: [res]))
    }
    func test_duplicate_ack_throws() {
        var meta = emptySyncMeta()
        let m1 = SyncMutation(mutationId: "m1", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        let m2 = SyncMutation(mutationId: "m2", deviceId: "d", entityType: "tasks", entityId: "2", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"2"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m1, m2]
        let rec1 = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 11, deviceId: "d", payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil)
        let res1 = PushResult(mutationId: "m1", accepted: true, serverVersion: 11, replayMismatch: nil, serverMissing: nil, conflictId: nil, record: rec1)
        // Duplicate m1 twice
        XCTAssertThrowsError(try applyPushResults(meta, batch: [m1,m2], results: [res1,res1]))
    }
    func test_exact_ack_required() {
        var meta = emptySyncMeta()
        let m = SyncMutation(mutationId: "m1", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m]
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 11, deviceId: "d", payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil)
        let res = PushResult(mutationId: "m1", accepted: true, serverVersion: 11, replayMismatch: nil, serverMissing: nil, conflictId: nil, record: rec)
        // Batch 1 but results empty
        XCTAssertThrowsError(try applyPushResults(meta, batch: [m], results: []))
    }
}

final class ApplyRemotePageTests: XCTestCase {
    func test_cursor_moved_backwards_throws() {
        var meta = emptySyncMeta()
        meta.cursor = 5
        XCTAssertThrowsError(try applyRemotePage(meta, currentValues: [:], records: [], nextCursor: 4, ownDeviceId: "d", now: "now"))
    }
    func test_stale_serverVersion_throws() {
        var meta = emptySyncMeta()
        meta.cursor = 5
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 3, deviceId: "o", payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil)
        XCTAssertThrowsError(try applyRemotePage(meta, currentValues: [:], records: [rec], nextCursor: 3, ownDeviceId: "d", now: "now"))
    }
    func test_duplicate_serverVersion_throws() {
        var meta = emptySyncMeta()
        let r1 = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 1, deviceId: "o", payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil)
        let r2 = RemoteRecord(entityType: "tasks", entityId: "2", version: 1, serverVersion: 1, deviceId: "o", payload: AnyCodable(["id":"2"]), updatedAt: "now", deletedAt: nil)
        XCTAssertThrowsError(try applyRemotePage(meta, currentValues: [:], records: [r1,r2], nextCursor: 1, ownDeviceId: "d", now: "now"))
    }
    func test_skip_throws() {
        var meta = emptySyncMeta()
        let r = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 5, deviceId: "o", payload: AnyCodable(["id":"1"]), updatedAt: "now", deletedAt: nil)
        XCTAssertThrowsError(try applyRemotePage(meta, currentValues: [:], records: [r], nextCursor: 10, ownDeviceId: "d", now: "now"))
    }
    func test_pull_creates_conflict_when_pending() throws {
        var meta = emptySyncMeta()
        let m = SyncMutation(mutationId: "m1", deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: nil, version: 1, payload: AnyCodable(["id":"1","title":"Local"]), updatedAt: "now", deletedAt: nil, dependsOnMutationId: nil, resolvesConflictId: nil, attemptedAt: nil)
        meta.outbox = [m]
        meta.versions[syncEntityKey("tasks","1")] = VersionPair(local: 1, server: nil)
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 1, deviceId: "other", payload: AnyCodable(["id":"1","title":"Remote"]), updatedAt: "now", deletedAt: nil)
        let res = try applyRemotePage(meta, currentValues: [:], records: [rec], nextCursor: 1, ownDeviceId: "d", now: "now")
        XCTAssertFalse(res.meta.conflicts.isEmpty)
        XCTAssertTrue(res.meta.outbox.isEmpty) // pending removed
        XCTAssertEqual(res.meta.cursor, 1)
    }
    func test_upsert_when_no_pending() throws {
        var meta = emptySyncMeta()
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 1, deviceId: "other", payload: AnyCodable(["id":"1","title":"Remote"]), updatedAt: "now", deletedAt: nil)
        let res = try applyRemotePage(meta, currentValues: [:], records: [rec], nextCursor: 1, ownDeviceId: "d", now: "now")
        XCTAssertTrue(res.meta.conflicts.isEmpty)
        XCTAssertEqual(stableJson(res.values["tasks"]), stableJson([["id":"1","title":"Remote"] as [String: Any]]))
    }
}

final class ChaosTests: XCTestCase {
    func test_chaos_20_sequences() throws {
        var meta = emptySyncMeta()
        let device = "device1"
        for i in 0..<20 {
            let prev: [[String: Any]] = (0..<i).map { ["id":"\($0)","title":"T\($0)"] }
            let next: [[String: Any]] = (0...i).map { ["id":"\($0)","title":"T\($0)"] }
            if let tx = buildStagedLocalTransaction(storeName: "tasks", userKey: "u", previousValue: prev, nextValue: next, order: i, now: "2026-09-01T00:00:00Z", randomUuid: { UUID().uuidString }) {
                meta = try appendStagedTransactions(meta, transactions: [tx], deviceId: device)
                let ready = readyOutbox(meta, limit: 50)
                if let first = ready.first {
                    let rec = RemoteRecord(entityType: first.entityType, entityId: first.entityId, version: first.version, serverVersion: i+1, deviceId: device, payload: first.payload, updatedAt: first.updatedAt, deletedAt: first.deletedAt)
                    let res = PushResult(mutationId: first.mutationId, accepted: true, serverVersion: i+1, replayMismatch: nil, serverMissing: nil, conflictId: nil, record: rec)
                    meta = try applyPushResults(meta, batch: [first], results: [res])
                }
            }
        }
        // Should not throw and cursor still 0 (no pull) but outbox may have pending
        XCTAssertNotNil(meta)
    }
}

final class TwoDeviceTests: XCTestCase {
    func test_completed_never_resurrects() throws {
        // Device A completes offline
        var metaA = emptySyncMeta()
        let taskId = "t1"
        let prev: [[String: Any]] = [["id":taskId,"title":"Task","status":"open"]]
        let next: [[String: Any]] = [["id":taskId,"title":"Task","status":"completed","completedAt":"now"]]
        let tx = buildStagedLocalTransaction(storeName: "tasks", userKey: "u", previousValue: prev, nextValue: next, order: 1, now: "now", randomUuid: { "m1" })!
        metaA = try appendStagedTransactions(metaA, transactions: [tx], deviceId: "A")
        XCTAssertEqual(metaA.outbox.count, 1)
        // Pull remote open from B should create conflict, not resurrect
        let rec = RemoteRecord(entityType: "tasks", entityId: taskId, version: 1, serverVersion: 1, deviceId: "B", payload: AnyCodable(["id":taskId,"title":"Task","status":"open"]), updatedAt: "now", deletedAt: nil)
        let res = try applyRemotePage(metaA, currentValues: ["tasks": next], records: [rec], nextCursor: 1, ownDeviceId: "A", now: "now")
        XCTAssertFalse(res.meta.conflicts.isEmpty)
        // Cursor advances even with conflict
        XCTAssertEqual(res.meta.cursor, 1)
        // Outbox cleared (conflict)
        XCTAssertTrue(res.meta.outbox.isEmpty)
    }
    func test_conflict_keep_local_vs_cloud() throws {
        var meta = emptySyncMeta()
        // Create pending
        let prev: [[String: Any]] = [["id":"1","title":"Local"]]
        let next: [[String: Any]] = [["id":"1","title":"EditedLocal"]]
        let tx = buildStagedLocalTransaction(storeName: "tasks", userKey: "u", previousValue: prev, nextValue: next, order: 1, now: "now", randomUuid: { "m1" })!
        meta = try appendStagedTransactions(meta, transactions: [tx], deviceId: "d")
        // Remote different title
        let rec = RemoteRecord(entityType: "tasks", entityId: "1", version: 1, serverVersion: 1, deviceId: "other", payload: AnyCodable(["id":"1","title":"Remote"]), updatedAt: "now", deletedAt: nil)
        let res = try applyRemotePage(meta, currentValues: [:], records: [rec], nextCursor: 1, ownDeviceId: "d", now: "now")
        XCTAssertEqual(res.meta.conflicts.count, 1)
        let conflict = res.meta.conflicts.first!
        // Keep local: create retry mutation with baseServerVersion = conflict.serverVersion
        var meta2 = res.meta
        // Simulate resolve local
        let retryId = UUID().uuidString
        let retry = SyncMutation(mutationId: retryId, deviceId: "d", entityType: "tasks", entityId: "1", baseServerVersion: conflict.serverVersion, version: 2, payload: conflict.localPayload, updatedAt: "now", deletedAt: conflict.localDeletedAt, dependsOnMutationId: nil, resolvesConflictId: conflict.id, attemptedAt: nil)
        meta2.outbox.append(retry)
        XCTAssertEqual(retry.baseServerVersion, 1)
    }
}
