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
        self.encoder.dateEncodingStrategy = .secondsSince1970
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .secondsSince1970
    }
    func load() -> ExecutionState? {
        guard let data = defaults.data(forKey: key) else { return nil }
        do { return try decoder.decode(ExecutionState.self, from: data) } catch { return nil }
    }
    func save(_ state: ExecutionState) throws {
        let data = try encoder.encode(state)
        defaults.set(data, forKey: key)
        guard let read = defaults.data(forKey: key) else { throw FocusSessionStoreError.writeFailed("missing after write") }
        if read != data { throw FocusSessionStoreError.readBackMismatch }
        let decoded = try decoder.decode(ExecutionState.self, from: read)
        if decoded.taskId != state.taskId || decoded.phase != state.phase || decoded.plannedDurationSeconds != state.plannedDurationSeconds || decoded.accumulatedPauseSeconds != state.accumulatedPauseSeconds || abs(decoded.startedAt.timeIntervalSince(state.startedAt)) > 0.001 {
            throw FocusSessionStoreError.readBackMismatch
        }
        if let a = decoded.lastPausedAt, let b = state.lastPausedAt {
            if abs(a.timeIntervalSince(b)) > 0.001 { throw FocusSessionStoreError.readBackMismatch }
        } else if (decoded.lastPausedAt != nil) != (state.lastPausedAt != nil) {
            throw FocusSessionStoreError.readBackMismatch
        }
    }
    func clear() throws {
        defaults.removeObject(forKey: key)
        if defaults.data(forKey: key) != nil { throw FocusSessionStoreError.writeFailed("remove failed") }
    }
    func rawData() -> Data? { defaults.data(forKey: key) }
    func setRawData(_ data: Data) { defaults.set(data, forKey: key) }
}

final class FileFocusSessionStore: FocusSessionStore, @unchecked Sendable {
    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    init(fileURL: URL? = nil) {
        if let u = fileURL {
            self.fileURL = u
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("execution.json")
        }
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .secondsSince1970
        self.encoder.outputFormatting = [.sortedKeys]
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .secondsSince1970
    }
    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
    }
    func load() -> ExecutionState? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        do {
            let data = try Data(contentsOf: fileURL)
            return try decoder.decode(ExecutionState.self, from: data)
        } catch { return nil }
    }
    func save(_ state: ExecutionState) throws {
        try ensureDirectory()
        let data = try encoder.encode(state)
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        guard let read = try? Data(contentsOf: fileURL) else { throw FocusSessionStoreError.writeFailed("missing after atomic write") }
        if read != data { throw FocusSessionStoreError.readBackMismatch }
        let decoded = try decoder.decode(ExecutionState.self, from: read)
        if decoded.taskId != state.taskId || decoded.phase != state.phase || decoded.plannedDurationSeconds != state.plannedDurationSeconds || decoded.accumulatedPauseSeconds != state.accumulatedPauseSeconds || abs(decoded.startedAt.timeIntervalSince(state.startedAt)) > 0.001 {
            throw FocusSessionStoreError.readBackMismatch
        }
        if let a = decoded.lastPausedAt, let b = state.lastPausedAt {
            if abs(a.timeIntervalSince(b)) > 0.001 { throw FocusSessionStoreError.readBackMismatch }
        } else if (decoded.lastPausedAt != nil) != (state.lastPausedAt != nil) {
            throw FocusSessionStoreError.readBackMismatch
        }
    }
    func clear() throws {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            do { try FileManager.default.removeItem(at: fileURL) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        }
    }
    var url: URL { fileURL }
}

final class CompositeFocusSessionStore: FocusSessionStore, @unchecked Sendable {
    private let fileStore: FileFocusSessionStore
    private let walStore: UserDefaultsFocusSessionStore
    init(fileStore: FileFocusSessionStore = FileFocusSessionStore(), walStore: UserDefaultsFocusSessionStore = UserDefaultsFocusSessionStore()) {
        self.fileStore = fileStore
        self.walStore = walStore
    }
    func load() -> ExecutionState? {
        if let fromFile = fileStore.load() { return fromFile }
        if let fromWAL = walStore.load() {
            try? fileStore.save(fromWAL)
            return fromWAL
        }
        return nil
    }
    func save(_ state: ExecutionState) throws {
        try fileStore.save(state)
        do { try walStore.save(state) } catch {
            print("[FocusSessionStore] WAL mirror failed (file authoritative): \(error)")
        }
    }
    func clear() throws {
        try fileStore.clear()
        try? walStore.clear()
    }
}
