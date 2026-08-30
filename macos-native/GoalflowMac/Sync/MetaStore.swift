import Foundation
import CryptoKit

final class SyncMetaStore: @unchecked Sendable {
    let fileURL: URL
    private let walKey: String
    private let defaults: UserDefaults
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.sync.meta.v2") {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("sync.json")
        }
        self.defaults = defaults; self.walKey = walKey
        encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]; encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
    }

    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    }

    func load() -> SyncMeta {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL),
               let meta = try? decoder.decode(SyncMeta.self, from: data) {
                if let norm = try? normalizeSyncMeta(meta) { return norm }
            }
        }
        if let data = defaults.data(forKey: walKey), let meta = try? decoder.decode(SyncMeta.self, from: data) {
            if let norm = try? normalizeSyncMeta(meta) {
                try? save(norm)
                return norm
            }
        }
        return emptySyncMeta()
    }

    func save(_ meta: SyncMeta) throws {
        let norm = try normalizeSyncMeta(meta)
        let data = try encoder.encode(norm)
        try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw SyncError.writeFailed(error.localizedDescription) }
        guard let read = try? Data(contentsOf: fileURL) else { throw SyncError.writeFailed("missing after write") }
        if read != data { throw SyncError.readBackMismatch }
        defaults.set(data, forKey: walKey)
    }

    // MARK: - Normalize

    func normalizeSyncMeta(_ meta: SyncMeta) throws -> SyncMeta {
        var m = meta
        guard m.schemaVersion == SYNC_META_SCHEMA_VERSION else {
            throw SyncError.validation("Sync meta schema version invalid. The meta was not changed.")
        }
        guard m.cursor >= 0 else { throw SyncError.validation("Sync meta cursor invalid. The meta was not changed.") }
        // Validate versions
        for (k, v) in m.versions {
            guard v.local >= 0 else { throw SyncError.validation("Sync meta versions invalid. The meta was not changed.") }
            if let s = v.server, s < 0 { throw SyncError.validation("Sync meta versions invalid. The meta was not changed.") }
            _ = k
        }
        // Validate outbox
        let ids = m.outbox.map(\.mutationId)
        if Set(ids).count != ids.count { throw SyncError.validation("Sync outbox contains duplicate mutationId. The meta was not changed.") }
        for item in m.outbox {
            guard !item.mutationId.isEmpty, !item.entityType.isEmpty, !item.entityId.isEmpty, item.version > 0 else {
                throw SyncError.validation("Sync outbox damaged. The meta was not changed.")
            }
        }
        // Legacy snapshot explosion: if outbox has singleton array payload for record-level stores, explode
        var newOutbox: [SyncMutation] = []
        for item in m.outbox {
            if RECORD_LEVEL_STORES.contains(item.entityType) && item.entityId == "singleton",
               let payload = item.payload.value as? [[String: Any]], !payload.isEmpty {
                // Check duplicate ids
                let pids = payload.compactMap { $0["id"] as? String }
                if Set(pids).count != pids.count { throw SyncError.validation("Legacy pending snapshot record has duplicate id. The meta was not changed.") }
                for p in payload {
                    guard let pid = p["id"] as? String, !pid.isEmpty else {
                        throw SyncError.validation("Legacy pending snapshot record has no unique identity. The meta was not changed.")
                    }
                    let key = syncEntityKey(item.entityType, pid)
                    let server = m.versions[key]?.server
                    let newId = deterministicUuid("\(item.mutationId):\(pid)")
                    newOutbox.append(SyncMutation(
                        mutationId: newId,
                        deviceId: item.deviceId,
                        entityType: item.entityType,
                        entityId: pid,
                        baseServerVersion: server,
                        version: item.version, // keep? Actually per-entity version should be recomputed but keep original for now
                        payload: AnyCodable(p),
                        updatedAt: item.updatedAt,
                        deletedAt: (p["deletedAt"] as? String)?.isEmpty == false ? p["deletedAt"] as? String : item.deletedAt,
                        dependsOnMutationId: nil,
                        resolvesConflictId: nil,
                        attemptedAt: nil
                    ))
                }
            } else {
                newOutbox.append(item)
            }
        }
        m.outbox = newOutbox
        // Validate conflicts
        let cids = m.conflicts.map(\.id)
        if Set(cids).count != cids.count { throw SyncError.validation("Sync conflicts duplicate id. The meta was not changed.") }
        let outboxIds = Set(m.outbox.map(\.mutationId))
        for c in m.conflicts {
            if outboxIds.contains(c.id) { throw SyncError.validation("Conflict id collides with outbox. The meta was not changed.") }
        }
        // Cross outbox/conflict mutationId collision
        let historyIds = Set(m.conflicts.flatMap { $0.localHistory.compactMap { ($0.value as? [String: Any])?["mutationId"] as? String } })
        if !historyIds.isDisjoint(with: outboxIds) { throw SyncError.validation("A mutation id refers to different durable local changes. The meta was not changed.") }
        return m
    }

    private func deterministicUuid(_ input: String) -> String {
        let digest = Insecure.SHA1.hash(data: Data(input.utf8))
        let bytes = Array(digest.prefix(16))
        var b = bytes
        b[6] = (b[6] & 0x0F) | 0x50
        b[8] = (b[8] & 0x3F) | 0x80
        let tup = (b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],b[8],b[9],b[10],b[11],b[12],b[13],b[14],b[15])
        return UUID(uuid: tup).uuidString.lowercased()
    }
}

enum SyncError: Error, LocalizedError {
    case validation(String)
    case writeFailed(String)
    case readBackMismatch
    var errorDescription: String? {
        switch self {
        case .validation(let s): return s
        case .writeFailed(let s): return "Sync meta write failed \(s)"
        case .readBackMismatch: return "Sync meta read-back mismatch"
        }
    }
}
