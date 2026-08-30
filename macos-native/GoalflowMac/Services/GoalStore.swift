import Foundation

final class GoalStore: @unchecked Sendable {
    let fileURL: URL
    private let walKey: String
    private let defaults: UserDefaults
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let syncMetaStore: SyncMetaStore
    private let deviceIdStore: DeviceIdStore
    private let userKey = "localUser"
    private static let orderLock = NSLock()
    private static var orderCounter = 0
    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.goals.v1", syncMetaStore: SyncMetaStore? = nil, deviceIdStore: DeviceIdStore? = nil) {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("goals.json")
        }
        self.defaults = defaults; self.walKey = walKey
        encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
        let dir = self.fileURL.deletingLastPathComponent()
        let syncURL = dir.appendingPathComponent("sync.json")
        self.syncMetaStore = syncMetaStore ?? SyncMetaStore(fileURL: syncURL, defaults: defaults)
        self.deviceIdStore = deviceIdStore ?? DeviceIdStore(defaults: defaults)
    }
    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    }
    func loadAll() -> [Goal] {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL), let g = try? decoder.decode([Goal].self, from: data) { return g }
        }
        if let data = defaults.data(forKey: walKey), let g = try? decoder.decode([Goal].self, from: data) {
            try? saveAll(g); return g
        }
        return []
    }
    func saveAll(_ goals: [Goal]) throws {
        // Stage for sync (best-effort)
        do {
            let prev = loadAll()
            let prevVal: Any? = prev.map { ["id": $0.id, "name": $0.name] as [String: Any] }
            let nextVal: Any? = goals.map { ["id": $0.id, "name": $0.name] as [String: Any] }
            if let tx = try? buildStagedLocalTransaction(storeName: "goals", userKey: userKey, previousValue: prevVal, nextValue: nextVal, order: nextOrder(), now: ISO8601DateFormatter().string(from: Date()), randomUuid: { UUID().uuidString }) {
                var meta = syncMetaStore.load()
                if let newMeta = try? appendStagedTransactions(meta, transactions: [tx], deviceId: deviceIdStore.deviceId) { try? syncMetaStore.save(newMeta) }
            }
        } catch {}
        let data = try encoder.encode(goals)
        try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        guard let read = try? Data(contentsOf: fileURL) else { throw FocusSessionStoreError.writeFailed("missing after write") }
        if read != data { throw FocusSessionStoreError.readBackMismatch }
        defaults.set(data, forKey: walKey)
    }
    private func nextOrder() -> Int {
        Self.orderLock.lock(); defer { Self.orderLock.unlock() }
        Self.orderCounter = (Self.orderCounter + 1) % 1000
        return Int(Date().timeIntervalSince1970 * 1000) * 1000 + Self.orderCounter
    }
}

final class TrueNorthStore: @unchecked Sendable {
    let fileURL: URL; private let walKey: String; private let defaults: UserDefaults
    private let encoder: JSONEncoder; private let decoder: JSONDecoder
    private let syncMetaStore: SyncMetaStore
    private let deviceIdStore: DeviceIdStore
    private let userKey = "localUser"
    private static let orderLock = NSLock()
    private static var orderCounter = 0
    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.truenorth.v1", syncMetaStore: SyncMetaStore? = nil, deviceIdStore: DeviceIdStore? = nil) {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("truenorth.json")
        }
        self.defaults = defaults; self.walKey = walKey
        encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]; decoder = JSONDecoder()
        let dir = self.fileURL.deletingLastPathComponent()
        let syncURL = dir.appendingPathComponent("sync.json")
        self.syncMetaStore = syncMetaStore ?? SyncMetaStore(fileURL: syncURL, defaults: defaults)
        self.deviceIdStore = deviceIdStore ?? DeviceIdStore(defaults: defaults)
    }
    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    }
    func loadAll() -> [TrueNorthGoal] {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL), let g = try? decoder.decode([TrueNorthGoal].self, from: data) { return g }
        }
        if let data = defaults.data(forKey: walKey), let g = try? decoder.decode([TrueNorthGoal].self, from: data) { try? saveAll(g); return g }
        return []
    }
    func saveAll(_ goals: [TrueNorthGoal]) throws {
        do {
            let prev = loadAll()
            let prevVal: Any? = prev.map { ["id": $0.id, "vision": $0.vision] as [String: Any] }
            let nextVal: Any? = goals.map { ["id": $0.id, "vision": $0.vision] as [String: Any] }
            if let tx = try? buildStagedLocalTransaction(storeName: "truenorth", userKey: userKey, previousValue: prevVal, nextValue: nextVal, order: nextOrder(), now: ISO8601DateFormatter().string(from: Date()), randomUuid: { UUID().uuidString }) {
                var meta = syncMetaStore.load()
                if let newMeta = try? appendStagedTransactions(meta, transactions: [tx], deviceId: deviceIdStore.deviceId) { try? syncMetaStore.save(newMeta) }
            }
        } catch {}
        let data = try encoder.encode(goals); try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        guard let read = try? Data(contentsOf: fileURL) else { throw FocusSessionStoreError.writeFailed("missing after write") }
        if read != data { throw FocusSessionStoreError.readBackMismatch }
        defaults.set(data, forKey: walKey)
    }
    private func nextOrder() -> Int {
        Self.orderLock.lock(); defer { Self.orderLock.unlock() }
        Self.orderCounter = (Self.orderCounter + 1) % 1000
        return Int(Date().timeIntervalSince1970 * 1000) * 1000 + Self.orderCounter
    }
}

final class AmalgamStore: @unchecked Sendable {
    let fileURL: URL; private let walKey: String; private let defaults: UserDefaults
    private let syncMetaStore: SyncMetaStore
    private let deviceIdStore: DeviceIdStore
    private let userKey = "localUser"
    private static let orderLock = NSLock()
    private static var orderCounter = 0
    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.amalgam.v1", syncMetaStore: SyncMetaStore? = nil, deviceIdStore: DeviceIdStore? = nil) {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("amalgam.json")
        }
        self.defaults = defaults; self.walKey = walKey
        let dir = self.fileURL.deletingLastPathComponent()
        let syncURL = dir.appendingPathComponent("sync.json")
        self.syncMetaStore = syncMetaStore ?? SyncMetaStore(fileURL: syncURL, defaults: defaults)
        self.deviceIdStore = deviceIdStore ?? DeviceIdStore(defaults: defaults)
    }
    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    }
    func load() -> String? {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL), let s = try? JSONDecoder().decode(String.self, from: data) { return s }
        }
        if let data = defaults.data(forKey: walKey), let s = try? JSONDecoder().decode(String.self, from: data) { try? save(s); return s }
        return defaults.string(forKey: walKey) // fallback legacy string
    }
    func save(_ value: String) throws {
        do {
            let prev = load()
            let prevVal: Any? = prev
            let nextVal: Any? = value
            if let tx = try? buildStagedLocalTransaction(storeName: "amalgam", userKey: userKey, previousValue: prevVal, nextValue: nextVal, order: nextOrder(), now: ISO8601DateFormatter().string(from: Date()), randomUuid: { UUID().uuidString }) {
                var meta = syncMetaStore.load()
                if let newMeta = try? appendStagedTransactions(meta, transactions: [tx], deviceId: deviceIdStore.deviceId) { try? syncMetaStore.save(newMeta) }
            }
        } catch {}
        let data = try JSONEncoder().encode(value); try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        defaults.set(data, forKey: walKey)
    }
    private func nextOrder() -> Int {
        Self.orderLock.lock(); defer { Self.orderLock.unlock() }
        Self.orderCounter = (Self.orderCounter + 1) % 1000
        return Int(Date().timeIntervalSince1970 * 1000) * 1000 + Self.orderCounter
    }
}
