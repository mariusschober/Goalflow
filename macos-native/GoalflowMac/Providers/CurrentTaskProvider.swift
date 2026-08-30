import Foundation
protocol CurrentTaskProvider: Sendable { func fetchCurrent() -> GoalflowTask?; func allDemoTasks(today: String) -> [GoalflowTask] }
protocol TaskStore: Sendable {
    func loadAll() -> [GoalflowTask]; func saveAll(_ tasks: [GoalflowTask]) throws
    func completeTask(id: String, actualDurationMinutes: Int, flowState: FlowState?) throws -> GoalflowTask
    func updateTask(_ task: GoalflowTask) throws; func queueCount(today: String) -> Int; func completedCount(today: String) -> Int
}
final class LocalTaskStore: TaskStore, @unchecked Sendable {
    let fileURL: URL; private let walKey: String; let defaults: UserDefaults
    private let encoder: JSONEncoder; private let decoder: JSONDecoder
    private let syncMetaStore: SyncMetaStore
    private let deviceIdStore: DeviceIdStore
    private let userKey = "localUser"
    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.demo.tasks.v1", syncMetaStore: SyncMetaStore? = nil, deviceIdStore: DeviceIdStore? = nil) {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("goalflow.tasks.json")
        }
        self.defaults = defaults; self.walKey = walKey
        self.encoder = JSONEncoder(); self.encoder.dateEncodingStrategy = .iso8601; self.encoder.outputFormatting = [.sortedKeys]
        self.decoder = JSONDecoder(); self.decoder.dateDecodingStrategy = .iso8601
        if let s = syncMetaStore { self.syncMetaStore = s }
        else {
            let dir = self.fileURL.deletingLastPathComponent()
            let syncURL = dir.appendingPathComponent("sync.json")
            self.syncMetaStore = SyncMetaStore(fileURL: syncURL, defaults: defaults)
        }
        self.deviceIdStore = deviceIdStore ?? DeviceIdStore(defaults: defaults)
    }
    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    }
    func loadAll() -> [GoalflowTask] {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL), let tasks = try? decoder.decode([GoalflowTask].self, from: data) { return tasks.sorted(by: goalflowTaskComparator) }
        }
        if let data = defaults.data(forKey: walKey), let tasks = try? decoder.decode([GoalflowTask].self, from: data) {
            try? saveAll(tasks); return tasks.sorted(by: goalflowTaskComparator)
        }
        return []
    }
    func saveAll(_ tasks: [GoalflowTask]) throws {
        let sorted = tasks.sorted(by: goalflowTaskComparator)
        // Stage for sync before durable write (best-effort, never throw)
        do {
            let prevData: [GoalflowTask]
            if FileManager.default.fileExists(atPath: fileURL.path),
               let d = try? Data(contentsOf: fileURL),
               let decoded = try? decoder.decode([GoalflowTask].self, from: d) {
                prevData = decoded
            } else if let d = defaults.data(forKey: walKey), let decoded = try? decoder.decode([GoalflowTask].self, from: d) {
                prevData = decoded
            } else {
                prevData = []
            }
            let previousValue: Any? = prevData.map { $0.toDictionary() }
            let nextValue: Any? = sorted.map { $0.toDictionary() }
            if let tx = try? buildStagedLocalTransaction(storeName: "tasks", userKey: userKey, previousValue: previousValue, nextValue: nextValue, order: nextOrder(), now: ISO8601DateFormatter().string(from: Date()), randomUuid: { UUID().uuidString }) {
                var meta = syncMetaStore.load()
                if let newMeta = try? appendStagedTransactions(meta, transactions: [tx], deviceId: deviceIdStore.deviceId) {
                    try? syncMetaStore.save(newMeta)
                }
            }
        } catch { /* staging is best-effort, never block durable write */ }
        let data = try encoder.encode(sorted)
        try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        guard let read = try? Data(contentsOf: fileURL) else { throw FocusSessionStoreError.writeFailed("missing after write") }
        if read != data { throw FocusSessionStoreError.readBackMismatch }
        defaults.set(data, forKey: walKey)
        guard let walRead = defaults.data(forKey: walKey), walRead == data else {
            print("[TaskStore] WAL mirror mismatch (file authoritative)"); return
        }
    }

    private func nextOrder() -> Int {
        // Simple order: Date.now *1000 + counter
        struct C { static var counter = 0 }
        C.counter = (C.counter + 1) % 1000
        return Int(Date().timeIntervalSince1970 * 1000) * 1000 + C.counter
    }
    func completeTask(id: String, actualDurationMinutes: Int, flowState: FlowState?) throws -> GoalflowTask {
        var tasks = loadAll(); guard let idx = tasks.firstIndex(where: { $0.id == id }) else { throw TaskStoreError.notFound }
        guard tasks[idx].isOpen else { throw TaskStoreError.notOpen }
        let completed = tasks[idx].withCompleted(at: Date(), actualDurationMinutes: actualDurationMinutes, flowState: flowState)
        tasks[idx] = completed; try saveAll(tasks); return completed
    }
    func updateTask(_ task: GoalflowTask) throws {
        var tasks = loadAll(); guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { throw TaskStoreError.notFound }
        tasks[idx] = task; try saveAll(tasks)
    }
    func queueCount(today: String) -> Int { buildTodayQueue(tasks: loadAll(), today: today).count }
    func completedCount(today: String) -> Int { loadAll().filter { $0.status == .completed && $0.scheduledFor == today }.count }
    func seedIfEmpty(today: String) {
        if !loadAll().isEmpty { return }
        let nowISO = ISO8601DateFormatter().string(from: Date())
        let tasks = [
            GoalflowTask(id: "demo-1", title: "Draft Q4 roadmap — outline three bets", notes: "", tags: ["focus"], schedulePrecision: .day, scheduledFor: today, plannedOrder: 0, status: .open, isFrog: false, beforeFrog: false, source: .manual, createdAt: nowISO, updatedAt: nowISO, version: 1, durationMinutes: 25),
            GoalflowTask(id: "demo-2", title: "Review weekly goals and prune one", tags: [], schedulePrecision: .day, scheduledFor: today, plannedOrder: 1, status: .open, isFrog: false, createdAt: nowISO, updatedAt: nowISO, version: 1, durationMinutes: 15)
        ]
        try? saveAll(tasks)
    }
    func clearAll() throws {
        if FileManager.default.fileExists(atPath: fileURL.path) { try FileManager.default.removeItem(at: fileURL) }
        defaults.removeObject(forKey: walKey)
    }
}
enum TaskStoreError: Error, LocalizedError {
    case notFound; case notOpen
    var errorDescription: String? {
        switch self { case .notFound: return "Task not found."; case .notOpen: return "Only an open task can be completed." }
    }
}
final class DemoCurrentTaskProvider: CurrentTaskProvider, @unchecked Sendable {
    let taskStore: any TaskStore
    private let defaults: UserDefaults
    init(taskStore: any TaskStore = LocalTaskStore(), defaults: UserDefaults = .standard) {
        self.taskStore = taskStore; self.defaults = defaults
        let today = todayString()
        if taskStore.loadAll().isEmpty { (taskStore as? LocalTaskStore)?.seedIfEmpty(today: today) }
    }
    init(defaults: UserDefaults = .standard) {
        let store = LocalTaskStore(defaults: defaults)
        self.taskStore = store; self.defaults = defaults
        let today = todayString()
        if store.loadAll().isEmpty { store.seedIfEmpty(today: today) }
    }
    func allDemoTasks(today: String) -> [GoalflowTask] {
        return taskStore.loadAll().filter { $0.scheduledFor == today }.sorted(by: goalflowTaskComparator)
    }
    func allTasks() -> [GoalflowTask] { taskStore.loadAll() }
    func fetchCurrent() -> GoalflowTask? {
        let today = todayString()
        let queue = buildTodayQueue(tasks: taskStore.loadAll(), today: today)
        return queue.first
    }
    func queueCount(today: String) -> Int { taskStore.queueCount(today: today) }
    func completedCount(today: String) -> Int { taskStore.completedCount(today: today) }
    func completeCurrent(actualDurationMinutes: Int, flowState: FlowState?) throws -> GoalflowTask {
        guard let cur = fetchCurrent() else { throw TaskStoreError.notFound }
        return try taskStore.completeTask(id: cur.id, actualDurationMinutes: actualDurationMinutes, flowState: flowState)
    }
    func completeTask(id: String, actualDurationMinutes: Int, flowState: FlowState?) throws -> GoalflowTask {
        try taskStore.completeTask(id: id, actualDurationMinutes: actualDurationMinutes, flowState: flowState)
    }
    func updateFlowState(taskId: String, flow: FlowState) throws {
        var tasks = taskStore.loadAll()
        guard let idx = tasks.firstIndex(where: { $0.id == taskId }) else { throw TaskStoreError.notFound }
        tasks[idx] = tasks[idx].withFlowState(flow)
        try taskStore.saveAll(tasks)
    }
    func resetDemo() {
        try? (taskStore as? LocalTaskStore)?.clearAll()
        let today = todayString()
        (taskStore as? LocalTaskStore)?.seedIfEmpty(today: today)
    }
    func setFrogDemo(isFrog: Bool) {
        var tasks = taskStore.loadAll()
        let today = todayString()
        let queue = buildTodayQueue(tasks: tasks, today: today)
        guard let firstId = queue.first?.id, let idx = tasks.firstIndex(where: { $0.id == firstId }) else { return }
        tasks[idx].isFrog = isFrog
        tasks[idx].updatedAt = ISO8601DateFormatter().string(from: Date())
        tasks[idx].version += 1
        try? taskStore.saveAll(tasks)
    }
    private func todayString() -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = .current; f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: Date())
    }
}
protocol SyncGateway: Sendable { func synchronize() async throws }
struct NoopSyncGateway: SyncGateway { func synchronize() async throws {} }
protocol AuthGateway: Sendable { var isAuthenticated: Bool { get } }
struct StubAuthGateway: AuthGateway { var isAuthenticated: Bool { false } }
protocol ActionGateway: Sendable { func start(taskId: String) async throws -> ExecutionState }
struct LocalActionGateway: ActionGateway { func start(taskId: String) async throws -> ExecutionState { fatalError("unused in v1") } }
struct BreakdownSuggestion: Codable, Equatable, Sendable { var title: String; var estimatedDuration: Int }
protocol BreakdownGateway: Sendable { func suggest(for task: GoalflowTask) async throws -> [BreakdownSuggestion] }
struct StubBreakdownGateway: BreakdownGateway { func suggest(for task: GoalflowTask) async throws -> [BreakdownSuggestion] { [] } }
