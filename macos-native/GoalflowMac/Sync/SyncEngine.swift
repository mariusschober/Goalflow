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
    private let retrySleeper: @Sendable (UInt64) async throws -> Void
    private let retryJitter: @Sendable (UInt64) -> UInt64

    init(
        metaStore: SyncMetaStore = SyncMetaStore(),
        deviceIdStore: DeviceIdStore = DeviceIdStore(),
        transport: any SyncTransport = URLSessionSyncTransport(),
        storeBridge: any SyncStoreBridge = FileSyncStoreBridge(),
        retrySleeper: @escaping @Sendable (UInt64) async throws -> Void = { try await Task<Never, Never>.sleep(nanoseconds: $0) },
        retryJitter: @escaping @Sendable (UInt64) -> UInt64 = { maximum in
            maximum == 0 ? 0 : UInt64.random(in: 0...maximum)
        }
    ) {
        self.metaStore = metaStore
        self.deviceIdStore = deviceIdStore
        self.transport = transport
        self.storeBridge = storeBridge
        self.retrySleeper = retrySleeper
        self.retryJitter = retryJitter
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

    func bindingState(for userId: String) throws -> WorkspaceBindingState {
        try metaStore.bindingState(for: userId)
    }

    func bindLocalWorkspace(to userId: String) async throws {
        let transportUserId = (try await transport.currentUserId()).lowercased()
        guard transportUserId == userId.lowercased() else { throw SyncError.accountMismatch }
        try metaStore.bind(to: userId)
    }

    func resolveConflict(id: String, useLocal: Bool) throws {
        var meta = try metaStore.load()
        guard let conflictIndex = meta.conflicts.firstIndex(where: { $0.id == id }) else {
            throw SyncError.validation("The selected synchronization conflict no longer exists.")
        }
        let conflict = meta.conflicts[conflictIndex]
        let key = syncEntityKey(conflict.entityType, conflict.entityId)

        if useLocal {
            let current = meta.versions[key] ?? VersionPair(local: 0, server: conflict.serverVersion)
            let historyMax = conflict.localHistory.compactMap {
                ($0.value as? [String: Any])?["version"] as? Int
            }.max() ?? current.local
            let version = max(historyMax, current.local) + 1
            meta.versions[key] = VersionPair(local: version, server: conflict.serverVersion)
            meta.outbox.append(SyncMutation(
                mutationId: UUID().uuidString.lowercased(),
                deviceId: deviceIdStore.deviceId,
                entityType: conflict.entityType,
                entityId: conflict.entityId,
                baseServerVersion: conflict.serverVersion,
                version: version,
                payload: conflict.localPayload,
                updatedAt: ISO8601DateFormatter().string(from: Date()),
                deletedAt: conflict.localDeletedAt,
                dependsOnMutationId: nil,
                resolvesConflictId: conflict.id,
                attemptedAt: nil
            ))
            meta.conflicts[conflictIndex].status = "resolving-local"
            try metaStore.save(meta)
            return
        }

        var values = try storeBridge.loadValues()
        let shouldDelete = conflict.serverMissing || conflict.serverDeletedAt?.isEmpty == false
        if RECORD_LEVEL_STORES.contains(conflict.entityType) {
            var records = values[conflict.entityType] as? [[String: Any]] ?? []
            if shouldDelete {
                records.removeAll { ($0["id"] as? String) == conflict.entityId }
            } else {
                guard var record = conflict.serverPayload.value as? [String: Any] else {
                    throw SyncError.validation("The cloud conflict payload is invalid. Nothing was applied.")
                }
                if let payloadId = record["id"] as? String, payloadId != conflict.entityId {
                    throw SyncError.validation("The cloud conflict identity does not match the selected entity. Nothing was applied.")
                }
                record["id"] = conflict.entityId
                if let index = records.firstIndex(where: { ($0["id"] as? String) == conflict.entityId }) {
                    records[index] = record
                } else {
                    records.append(record)
                }
            }
            values[conflict.entityType] = records
        } else if shouldDelete {
            values.removeValue(forKey: conflict.entityType)
        } else {
            values[conflict.entityType] = conflict.serverPayload.value ?? NSNull()
        }

        var version = meta.versions[key] ?? VersionPair(local: 0, server: nil)
        version.server = conflict.serverVersion
        meta.versions[key] = version
        meta.outbox.removeAll { $0.entityType == conflict.entityType && $0.entityId == conflict.entityId }
        meta.conflicts.remove(at: conflictIndex)
        let writes = try storeBridge.preparedWrites(values, stores: [conflict.entityType])
        try metaStore.commitLocalValues(writes, nextMeta: meta)
    }

    private func synchronizeOnce() async throws {
        let accountUserId = (try await transport.currentUserId()).lowercased()
        switch try metaStore.bindingState(for: accountUserId) {
        case .unbound: throw SyncError.bindingRequired
        case .differentAccount: throw SyncError.accountMismatch
        case .bound: break
        }
        // Ensure staged WAL flushed? For now assume meta already contains staged mutations via TaskStore staging
        // Push loop
        while true {
            let meta = try metaStore.load()
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
            let metaAttempted = markMutationsAttempted(meta, ids: batch.map(\.mutationId), now: now)
            try metaStore.save(metaAttempted)
            let body = try JSONSerialization.data(withJSONObject: ["mutations": wire], options: [])
            let (data, resp) = try await requestWithRetry(path: "/api/v1/sync/push", method: "POST", body: body)
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
            let meta = try metaStore.load()
            let cursorBefore = meta.cursor
            let (data, resp) = try await requestWithRetry(path: "/api/v1/sync/pull?cursor=\(cursorBefore)&limit=100", method: "GET", body: nil)
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
            let currentValues = try storeBridge.loadValues()
            let ownDeviceId = deviceIdStore.deviceId
            let now = ISO8601DateFormatter().string(from: Date())
            let res = try applyRemotePage(meta, currentValues: currentValues, records: records, nextCursor: nextCursor, ownDeviceId: ownDeviceId, now: now)
            let writes = try storeBridge.preparedWrites(res.values, stores: Set(res.changedStores))
            if writes.isEmpty {
                try metaStore.save(res.meta)
            } else {
                try metaStore.commitLocalValues(writes, nextMeta: res.meta)
            }
            hasMore = hasMoreVal
        }
        // Mark successful
        var finalMeta = try metaStore.load()
        finalMeta.lastSuccessfulSync = ISO8601DateFormatter().string(from: Date())
        try metaStore.save(finalMeta)
    }

    private func isValidUUID(_ s: String) -> Bool {
        UUID(uuidString: s) != nil
    }

    private func requestWithRetry(path: String, method: String, body: Data?) async throws -> (Data, HTTPURLResponse) {
        let maximumAttempts = 4
        var attempt = 1
        while true {
            do {
                let result = try await transport.request(path: path, method: method, headers: [:], body: body)
                if Self.isTransientStatus(result.1.statusCode), attempt < maximumAttempts {
                    try await waitBeforeRetry(afterAttempt: attempt)
                    attempt += 1
                    continue
                }
                return result
            } catch {
                guard Self.isTransientTransportError(error), attempt < maximumAttempts else { throw error }
                try await waitBeforeRetry(afterAttempt: attempt)
                attempt += 1
            }
        }
    }

    private func waitBeforeRetry(afterAttempt attempt: Int) async throws {
        let cap: UInt64 = 2_000_000_000
        let exponent = UInt64(max(0, min(attempt - 1, 3)))
        let base = min(cap, 250_000_000 << exponent)
        let jitterMaximum = base / 4
        let jitter = min(retryJitter(jitterMaximum), jitterMaximum)
        try await retrySleeper(min(cap, base + jitter))
    }

    private static func isTransientStatus(_ status: Int) -> Bool {
        status >= 500 || [408, 425, 429].contains(status)
    }

    private static func isTransientTransportError(_ error: Error) -> Bool {
        if let keychainError = error as? KeychainError, case .transient = keychainError { return true }
        guard let urlError = error as? URLError else { return false }
        return [
            .timedOut,
            .cannotFindHost,
            .cannotConnectToHost,
            .networkConnectionLost,
            .dnsLookupFailed,
            .notConnectedToInternet,
            .resourceUnavailable,
            .internationalRoamingOff,
            .callIsActive,
            .dataNotAllowed
        ].contains(urlError.code)
    }
}
