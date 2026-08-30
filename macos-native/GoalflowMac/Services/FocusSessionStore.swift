import Foundation

enum FocusSessionStoreError: Error, LocalizedError {
    case writeFailed(String)
    case readBackMismatch
    case corrupted(String)

    var errorDescription: String? {
        switch self {
        case .writeFailed(let s): return "The focus session could not be stored durably: \(s)"
        case .readBackMismatch: return "The focus session failed read-back verification."
        case .corrupted(let s): return "Stored focus state is corrupted: \(s)"
        }
    }
}

/// Durable store for ExecutionState. v1: UserDefaults + read-back verification.
protocol FocusSessionStore: Sendable {
    func load() -> ExecutionState?
    func save(_ state: ExecutionState) throws
    func clear() throws
}

final class UserDefaultsFocusSessionStore: FocusSessionStore, @unchecked Sendable {
    private let defaults: UserDefaults
    private let key: String
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(defaults: UserDefaults = .standard, key: String = "goalflow.focus.session.v1") {
        self.defaults = defaults
        self.key = key
        self.encoder = JSONEncoder()
        // Use secondsSince1970 to preserve sub-second precision and avoid ISO8601 truncation.
        self.encoder.dateEncodingStrategy = .secondsSince1970
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .secondsSince1970
    }

    func load() -> ExecutionState? {
        guard let data = defaults.data(forKey: key) else { return nil }
        do {
            return try decoder.decode(ExecutionState.self, from: data)
        } catch {
            // Do not discard silently — surface as nil but keep data for debugging.
            // In next launch, caller may choose to clear after inspecting.
            return nil
        }
    }

    func save(_ state: ExecutionState) throws {
        let data = try encoder.encode(state)
        defaults.set(data, forKey: key)
        // synchronize is deprecated but we do a read-back verify which is stronger
        guard let read = defaults.data(forKey: key) else {
            throw FocusSessionStoreError.writeFailed("missing after write")
        }
        if read != data {
            throw FocusSessionStoreError.readBackMismatch
        }
        // Date equality can be lossy due to Double secondsSince1970 precision (sub-ms).
        // Verify with tolerance; execution relies on seconds granularity.
        let decoded = try decoder.decode(ExecutionState.self, from: read)
        if decoded.taskId != state.taskId || decoded.phase != state.phase || decoded.plannedDurationSeconds != state.plannedDurationSeconds || abs(decoded.startedAt.timeIntervalSince(state.startedAt)) > 0.001 {
            throw FocusSessionStoreError.readBackMismatch
        }
    }

    func clear() throws {
        defaults.removeObject(forKey: key)
        if defaults.data(forKey: key) != nil {
            throw FocusSessionStoreError.writeFailed("remove failed")
        }
    }
}
