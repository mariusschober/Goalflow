import Foundation

let SYNC_META_SCHEMA_VERSION = 2
let RECORD_LEVEL_STORES: Set<String> = ["tasks","goals","habits","truenorth","daily_plans"]
let LEGACY_MUTATION_NAMESPACE = "384d2580-c159-4f6a-97d4-f4e94809538b"

struct VersionPair: Codable, Equatable, Sendable { var local: Int; var server: Int? }

struct SyncMutation: Codable, Equatable, Sendable {
    var mutationId: String
    var deviceId: String
    var entityType: String
    var entityId: String
    var baseServerVersion: Int?
    var version: Int
    var payload: AnyCodable
    var updatedAt: String
    var deletedAt: String?
    var dependsOnMutationId: String?
    var resolvesConflictId: String?
    var attemptedAt: String?
}

struct LocalConflict: Codable, Equatable, Sendable {
    var id: String
    var entityType: String
    var entityId: String
    var mutationId: String
    var baseServerVersion: Int?
    var serverVersion: Int
    var localPayload: AnyCodable
    var localDeletedAt: String?
    var localHistory: [AnyCodable] // stored as array of history entries each with mutationId,payload,deletedAt,updatedAt,version
    var serverPayload: AnyCodable
    var serverMissing: Bool
    var serverDeletedAt: String?
    var status: String // unresolved, resolving-local, replay_mismatch, etc.
    var createdAt: String?
}

struct SyncMeta: Codable, Equatable, Sendable {
    var schemaVersion: Int = SYNC_META_SCHEMA_VERSION
    var cursor: Int = 0
    var versions: [String: VersionPair] = [:]
    var outbox: [SyncMutation] = []
    var conflicts: [LocalConflict] = []
    var lastSuccessfulSync: String?
}

func syncEntityKey(_ entityType: String, _ entityId: String) -> String { "\(entityType):\(entityId)" }

func emptySyncMeta() -> SyncMeta { SyncMeta(schemaVersion: SYNC_META_SCHEMA_VERSION, cursor: 0, versions: [:], outbox: [], conflicts: [], lastSuccessfulSync: nil) }

// MARK: - AnyCodable

struct AnyCodable: Codable, Equatable, Sendable {
    var value: Any?

    init(_ value: Any?) { self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { value = nil; return }
        if let b = try? c.decode(Bool.self) { value = b; return }
        if let i = try? c.decode(Int.self) { value = i; return }
        if let d = try? c.decode(Double.self) { value = d; return }
        if let s = try? c.decode(String.self) { value = s; return }
        if let a = try? c.decode([AnyCodable].self) { value = a.map(\.value); return }
        if let d = try? c.decode([String: AnyCodable].self) { value = d.mapValues(\.value); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "AnyCodable cannot decode")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        guard let v = value else { try c.encodeNil(); return }
        switch v {
        case let b as Bool: try c.encode(b)
        case let i as Int: try c.encode(i)
        case let d as Double: try c.encode(d)
        case let s as String: try c.encode(s)
        case let a as [Any]: try c.encode(a.map { AnyCodable($0) })
        case let d as [String: Any]: try c.encode(d.mapValues { AnyCodable($0) })
        default:
            // Try JSONSerialization fallback
            if let data = try? JSONSerialization.data(withJSONObject: v, options: []),
               let obj = try? JSONSerialization.jsonObject(with: data, options: []) {
                try c.encode(AnyCodable(obj))
            } else {
                try c.encodeNil()
            }
        }
    }

    static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        // Compare via stableJson
        return stableJson(lhs.value) == stableJson(rhs.value)
    }
}

// MARK: - Push/ Pull types

struct PushResult: Codable, Equatable, Sendable {
    var mutationId: String
    var accepted: Bool
    var serverVersion: Int
    var replayMismatch: Bool?
    var serverMissing: Bool?
    var conflictId: String?
    var record: RemoteRecord?
}

struct RemoteRecord: Codable, Equatable, Sendable {
    var entityType: String
    var entityId: String
    var version: Int
    var serverVersion: Int
    var deviceId: String?
    var payload: AnyCodable
    var updatedAt: String?
    var deletedAt: String?
}

struct StagedEntityChange: Sendable {
    var mutationId: String
    var entityType: String
    var entityId: String
    var payload: Any? // Any JSON value
    var updatedAt: String
    var deletedAt: String?
}

struct StagedLocalTransaction: Sendable {
    var id: String
    var userKey: String
    var storeName: String
    var storageKey: String
    var previousValue: Any?
    var hasPreviousValue: Bool
    var value: Any?
    var changes: [StagedEntityChange]
    var order: Int
    var createdAt: String
}
