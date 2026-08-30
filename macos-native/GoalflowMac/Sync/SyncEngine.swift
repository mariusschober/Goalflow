import Foundation

private actor SyncGate {
    private var busy = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    func acquire() async {
        if !busy { busy = true; return }
        await withCheckedContinuation { c in waiters.append(c) }
    }
    func release() {
        if !waiters.isEmpty { let w = waiters.removeFirst(); w.resume() } else { busy = false }
    }
}

final class SyncEngine: @unchecked Sendable {
    static let shared = SyncEngine()
    private let metaStore: SyncMetaStore
    private let deviceIdStore: DeviceIdStore
    private let transport: any SyncTransport
    private let storeBridge: any SyncStoreBridge
    private let gate = SyncGate()

    init(metaStore: SyncMetaStore = SyncMetaStore(), deviceIdStore: DeviceIdStore = DeviceIdStore(), transport: any SyncTransport = URLSessionSyncTransport(), storeBridge: any SyncStoreBridge = FileSyncStoreBridge()) {
        self.metaStore = metaStore; self.deviceIdStore = deviceIdStore; self.transport = transport; self.storeBridge = storeBridge
    }

    func synchronize() async throws {
        await gate.acquire()
        do {
            try await synchronizeOnce()
            await gate.release()
        } catch {
            await gate.release()
            throw error
        }
    }

    private func synchronizeOnce() async throws {
        // Ensure staged WAL flushed? For now assume meta already contains staged mutations via TaskStore staging
        // Push loop
        while true {
            let meta = metaStore.load()
            let batch = readyOutbox(meta, limit: 50)
            if batch.isEmpty { break }
            let wire = batch.map { m -> [String: Any] in
                var d: [String: Any] = [
                    "mutationId": m.mutationId,
                    "deviceId": m.deviceId,
                    "entityType": m.entityType,
                    "entityId": m.entityId,
                    "version": m.version,
                    "payload": m.payload.value as Any,
                    "updatedAt": m.updatedAt
                ]
                if let b = m.baseServerVersion { d["baseServerVersion"] = b } else { d["baseServerVersion"] = NSNull() }
                if let dep = m.dependsOnMutationId { d["dependsOnMutationId"] = dep }
                if let del = m.deletedAt { d["deletedAt"] = del } else { d["deletedAt"] = NSNull() }
                if let rid = m.resolvesConflictId, isValidUUID(rid) { d["resolvesConflictId"] = rid }
                return d
            }
            // Mark attempted
            let now = ISO8601DateFormatter().string(from: Date())
            var metaAttempted = markMutationsAttempted(meta, ids: batch.map(\.mutationId), now: now)
            try metaStore.save(metaAttempted)
            let body = try JSONSerialization.data(withJSONObject: ["mutations": wire], options: [])
            let (data, resp) = try await transport.request(path: "/api/v1/sync/push", method: "POST", headers: [:], body: body)
            guard (200..<300).contains(resp.statusCode) else {
                throw SyncError.validation("Sync push failed HTTP \(resp.statusCode)")
            }
            guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let resultsArr = obj["results"] as? [[String: Any]] else {
                throw SyncError.validation("Sync push failed: invalid results")
            }
            if resultsArr.count != batch.count { throw SyncError.validation("Sync push response did not acknowledge exactly the submitted mutations. Pending mutations were not changed.") }
            // Parse results
            var results: [PushResult] = []
            for r in resultsArr {
                guard let mid = r["mutationId"] as? String, !mid.isEmpty,
                      let accepted = r["accepted"] as? Bool,
                      let sv = r["serverVersion"] as? Int, sv >= 0 else {
                    throw SyncError.validation("Sync push result invalid. Pending mutations were not changed.")
                }
                if accepted && sv == 0 { throw SyncError.validation("Sync push result invalid. Pending mutations were not changed.") }
                let rec: RemoteRecord? = {
                    guard let recObj = r["record"] as? [String: Any] else { return nil }
                    return RemoteRecord(
                        entityType: recObj["entityType"] as? String ?? "",
                        entityId: recObj["entityId"] as? String ?? "",
                        version: recObj["version"] as? Int ?? 0,
                        serverVersion: recObj["serverVersion"] as? Int ?? 0,
                        deviceId: recObj["deviceId"] as? String,
                        payload: AnyCodable(recObj["payload"]),
                        updatedAt: recObj["updatedAt"] as? String,
                        deletedAt: recObj["deletedAt"] as? String
                    )
                }()
                let pr = PushResult(
                    mutationId: mid,
                    accepted: accepted,
                    serverVersion: sv,
                    replayMismatch: r["replayMismatch"] as? Bool,
                    serverMissing: r["serverMissing"] as? Bool,
                    conflictId: r["conflictId"] as? String,
                    record: rec
                )
                results.append(pr)
            }
            let newMeta = try applyPushResults(metaAttempted, batch: batch, results: results)
            try metaStore.save(newMeta)
        }
        // Pull loop
        var hasMore = true
        while hasMore {
            let meta = metaStore.load()
            let cursorBefore = meta.cursor
            let (data, resp) = try await transport.request(path: "/api/v1/sync/pull?cursor=\(cursorBefore)&limit=100", method: "GET", headers: [:], body: nil)
            guard (200..<300).contains(resp.statusCode) else { throw SyncError.validation("Sync pull failed HTTP \(resp.statusCode)") }
            guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let recordsArr = obj["records"] as? [[String: Any]],
                  let nextCursorAny = obj["nextCursor"],
                  let hasMoreVal = obj["hasMore"] as? Bool else {
                throw SyncError.validation("Sync pull invalid cursor envelope")
            }
            let nextCursor: Int
            if let n = nextCursorAny as? Int { nextCursor = n }
            else if let d = nextCursorAny as? Double { nextCursor = Int(d) }
            else { throw SyncError.validation("Sync pull invalid cursor envelope") }
            if nextCursor < cursorBefore || (hasMoreVal && nextCursor == cursorBefore) {
                throw SyncError.validation("Remote synchronization cursor did not make safe progress. The cursor was not advanced.")
            }
            var records: [RemoteRecord] = []
            for r in recordsArr {
                guard let et = r["entityType"] as? String, !et.isEmpty,
                      let eid = r["entityId"] as? String, !eid.isEmpty,
                      let payload = r["payload"] else {
                    throw SyncError.validation("Remote synchronization page contains invalid, stale, or duplicate information. The cursor was not advanced.")
                }
                let ver = (r["version"] as? Int) ?? Int((r["version"] as? Double) ?? 0)
                let sv = (r["serverVersion"] as? Int) ?? Int((r["serverVersion"] as? Double) ?? 0)
                records.append(RemoteRecord(
                    entityType: et,
                    entityId: eid,
                    version: ver,
                    serverVersion: sv,
                    deviceId: r["deviceId"] as? String,
                    payload: AnyCodable(payload),
                    updatedAt: r["updatedAt"] as? String,
                    deletedAt: r["deletedAt"] as? String
                ))
            }
            let highest = records.map(\.serverVersion).max() ?? cursorBefore
            if nextCursor != highest {
                throw SyncError.validation("Remote synchronization cursor would skip or discard information. The cursor was not advanced.")
            }
            let currentValues = storeBridge.loadValues()
            let ownDeviceId = deviceIdStore.deviceId
            let now = ISO8601DateFormatter().string(from: Date())
            let res = try applyRemotePage(meta, currentValues: currentValues, records: records, nextCursor: nextCursor, ownDeviceId: ownDeviceId, now: now)
            try storeBridge.saveValues(res.values)
            try metaStore.save(res.meta)
            hasMore = hasMoreVal
        }
        // Mark successful
        var finalMeta = metaStore.load()
        finalMeta.lastSuccessfulSync = ISO8601DateFormatter().string(from: Date())
        try metaStore.save(finalMeta)
    }

    private func isValidUUID(_ s: String) -> Bool {
        UUID(uuidString: s) != nil
    }
}
