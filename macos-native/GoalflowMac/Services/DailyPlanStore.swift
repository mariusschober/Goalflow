import Foundation

final class DailyPlanStore: @unchecked Sendable {
    let fileURL: URL
    private let walKey: String
    private let defaults: UserDefaults
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let syncMetaStore: SyncMetaStore
    private let deviceIdStore: DeviceIdStore
    private let userKey = "localUser"

    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.daily_plans.v1", syncMetaStore: SyncMetaStore? = nil, deviceIdStore: DeviceIdStore? = nil) {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("dailyPlans.json")
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

    func loadAll() -> [DailyPlan] {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL), let plans = try? decoder.decode([DailyPlan].self, from: data) { return normalized(plans) }
        }
        if let data = defaults.data(forKey: walKey), let plans = try? decoder.decode([DailyPlan].self, from: data) {
            try? saveAll(plans); return normalized(plans)
        }
        return []
    }

    func load(for date: String) -> DailyPlan? { loadAll().first { $0.localDate == date } }

    func saveAll(_ plans: [DailyPlan]) throws {
        let norm = normalized(plans)
        // Stage for sync
        do {
            let prev = loadAll()
            let prevVal: Any? = prev.map { ["id": $0.localDate, "localDate": $0.localDate, "confirmedAt": $0.confirmedAt, "taskIds": $0.taskIds] as [String: Any] }
            let nextVal: Any? = norm.map { ["id": $0.localDate, "localDate": $0.localDate, "confirmedAt": $0.confirmedAt, "taskIds": $0.taskIds] as [String: Any] }
            if let tx = try? buildStagedLocalTransaction(storeName: "daily_plans", userKey: userKey, previousValue: prevVal, nextValue: nextVal, order: nextOrder(), now: ISO8601DateFormatter().string(from: Date()), randomUuid: { UUID().uuidString }) {
                var meta = syncMetaStore.load()
                if let newMeta = try? appendStagedTransactions(meta, transactions: [tx], deviceId: deviceIdStore.deviceId) {
                    try? syncMetaStore.save(newMeta)
                }
            }
        } catch {}
        let data = try encoder.encode(norm)
        try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        guard let read = try? Data(contentsOf: fileURL) else { throw FocusSessionStoreError.writeFailed("missing after write") }
        if read != data { throw FocusSessionStoreError.readBackMismatch }
        defaults.set(data, forKey: walKey)
    }

    private func nextOrder() -> Int {
        struct C { static var counter = 0 }
        C.counter = (C.counter + 1) % 1000
        return Int(Date().timeIntervalSince1970 * 1000) * 1000 + C.counter
    }

    func save(_ plan: DailyPlan) throws {
        var all = loadAll().filter { $0.localDate != plan.localDate }
        all.append(plan)
        try saveAll(all)
    }

    func clearAll() throws {
        if FileManager.default.fileExists(atPath: fileURL.path) { try FileManager.default.removeItem(at: fileURL) }
        defaults.removeObject(forKey: walKey)
    }

    private func normalized(_ plans: [DailyPlan]) -> [DailyPlan] {
        // Validate shape like normalizeDailyPlans web: localDate real day, taskIds non-empty strings
        plans.filter { isRealDay($0.localDate) && $0.localDate.count == 10 && !$0.taskIds.contains(where: { $0.isEmpty }) }
    }
}
