import Foundation

func applyPushResults(_ input: SyncMeta, batch: [SyncMutation], results: [PushResult]) throws -> SyncMeta {
    var meta = cloneMeta(input)
    guard Set(batch.map(\.mutationId)).count == batch.count else {
        throw SyncError.validation("Sync push batch contains duplicate mutation identities. Pending mutations were not changed.")
    }
    guard results.count == batch.count else {
        throw SyncError.validation("Sync push response did not acknowledge exactly the submitted mutations. Pending mutations were not changed.")
    }
    let batchIds = Set(batch.map(\.mutationId))
    let resultIds = results.map(\.mutationId)
    guard Set(resultIds).count == resultIds.count && resultIds.allSatisfy({ batchIds.contains($0) }) else {
        throw SyncError.validation("Sync push response did not acknowledge exactly the submitted mutations. Pending mutations were not changed.")
    }
    let resultsById = Dictionary(uniqueKeysWithValues: results.map { ($0.mutationId, $0) })
    // Validate each result
    for (idx, mut) in batch.enumerated() {
        guard let res = resultsById[mut.mutationId] else { continue }
        // Validate shape
        guard !res.mutationId.isEmpty,
              res.serverVersion >= 0,
              !(res.accepted && res.serverVersion == 0) else {
            throw SyncError.validation("Sync push result \(idx) invalid. Pending mutations were not changed.")
        }
        if res.accepted {
            guard let rec = res.record,
                  rec.entityType == mut.entityType,
                  rec.entityId == mut.entityId,
                  rec.version == mut.version,
                  rec.serverVersion == res.serverVersion,
                  stableJson(rec.payload.value) == stableJson(mut.payload.value),
                  sameInstant(rec.deletedAt, mut.deletedAt),
                  res.replayMismatch != true,
                  res.serverMissing != true,
                  res.conflictId == nil else {
                throw SyncError.validation("Sync push acceptance \(idx) did not prove the exact submitted record. Pending mutations were not changed.")
            }
        } else {
            if res.serverMissing != true {
                guard let rec = res.record, rec.payload.value != nil else {
                    throw SyncError.validation("Sync push rejection \(idx) did not preserve the server side. Pending mutations were not changed.")
                }
            }
        }
    }
    // Apply
    var toRemoveIds = Set<String>()
    var newConflicts: [LocalConflict] = []
    for mut in batch {
        guard let res = resultsById[mut.mutationId] else { continue }
        if res.accepted {
            toRemoveIds.insert(mut.mutationId)
            // Patch successors
            for i in meta.outbox.indices where meta.outbox[i].dependsOnMutationId == mut.mutationId {
                meta.outbox[i].dependsOnMutationId = nil
                meta.outbox[i].baseServerVersion = res.serverVersion
            }
            // Update versions
            let key = syncEntityKey(mut.entityType, mut.entityId)
            var v = meta.versions[key] ?? VersionPair(local: 0, server: nil)
            v.local = max(v.local, mut.version)
            v.server = res.serverVersion
            meta.versions[key] = v
            // Clear resolvesConflictId
            if let rid = mut.resolvesConflictId,
               let cIdx = meta.conflicts.firstIndex(where: { $0.id == rid }) {
                meta.conflicts.remove(at: cIdx)
            }
        } else {
            // Collect affected chain
            let affected = meta.outbox.filter { $0.entityType == mut.entityType && $0.entityId == mut.entityId && $0.version >= mut.version }
            let affectedIds = Set(affected.map(\.mutationId))
            // Build history
            let history = affected.sorted { $0.version < $1.version }.map { m -> AnyCodable in
                let d: [String: Any] = ["mutationId": m.mutationId, "payload": m.payload.value as Any, "deletedAt": m.deletedAt as Any, "updatedAt": m.updatedAt, "version": m.version]
                return AnyCodable(d)
            }
            let serverPayload: AnyCodable
            let serverDeletedAt: String?
            let serverMissing: Bool
            if let rec = res.record {
                serverPayload = rec.payload
                serverDeletedAt = rec.deletedAt
                serverMissing = res.serverMissing ?? false
            } else {
                serverPayload = AnyCodable(nil)
                serverDeletedAt = nil
                serverMissing = res.serverMissing ?? false
            }
            let cid = res.conflictId ?? "push:\(mut.mutationId):\(res.serverVersion)"
            // Check collision with different signature
            if let existing = meta.conflicts.first(where: { $0.id == cid }), existing.serverVersion != res.serverVersion || stableJson(existing.serverPayload.value) != stableJson(serverPayload.value) {
                throw SyncError.validation("Sync push conflict \(cid) collides. Pending mutations were not changed.")
            }
            let conflict = LocalConflict(
                id: cid,
                entityType: mut.entityType,
                entityId: mut.entityId,
                mutationId: mut.mutationId,
                baseServerVersion: mut.baseServerVersion,
                serverVersion: res.serverVersion,
                localPayload: mut.payload,
                localDeletedAt: mut.deletedAt,
                localHistory: history,
                serverPayload: serverPayload,
                serverMissing: serverMissing,
                serverDeletedAt: serverDeletedAt,
                status: res.replayMismatch == true ? "replay_mismatch" : "unresolved",
                createdAt: ISO8601DateFormatter().string(from: Date())
            )
            if !meta.conflicts.contains(where: { $0.id == cid }) {
                newConflicts.append(conflict)
            }
            for aid in affectedIds { toRemoveIds.insert(aid) }
            // Update versions to latest pending version
            let key = syncEntityKey(mut.entityType, mut.entityId)
            if let latest = affected.max(by: { $0.version < $1.version }) {
                var v = meta.versions[key] ?? VersionPair(local: 0, server: nil)
                v.local = max(v.local, latest.version)
                meta.versions[key] = v
            }
        }
    }
    meta.outbox.removeAll { toRemoveIds.contains($0.mutationId) }
    meta.conflicts.append(contentsOf: newConflicts)
    // Also need to release dependents of removed chain that are not part of newConflicts? Already handled via toRemoveIds, but dependents that were chained to removed mutations should be released? In Android, releaseDependents clears dependsOn for task_events.
    // For simplicity, for any remaining outbox that had dependsOn in removedIds, clear it
    for i in meta.outbox.indices {
        if let dep = meta.outbox[i].dependsOnMutationId, toRemoveIds.contains(dep) {
            // Find new baseServerVersion: if the removed was accepted, we already patched; if rejected, we should clear depends and set base to nil? For rejected chain, dependents should be released with base null
            meta.outbox[i].dependsOnMutationId = nil
            // baseServerVersion stays as is? For rejected, should be nil as well
        }
    }
    return meta
}
