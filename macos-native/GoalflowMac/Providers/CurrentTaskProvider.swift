import Foundation

/// Abstraction for Current. v1 is deterministic demo data; later Sync-backed.
protocol CurrentTaskProvider: Sendable {
    func fetchCurrent() -> GoalflowTask?
    func allDemoTasks(today: String) -> [GoalflowTask]
}

// MARK: - Demo provider

final class DemoCurrentTaskProvider: CurrentTaskProvider, @unchecked Sendable {
    private let storeKey = "goalflow.demo.tasks.v1"
    private let defaults: UserDefaults
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        decoder.dateDecodingStrategy = .iso8601
        encoder.dateEncodingStrategy = .iso8601
    }

    /// Deterministic demo queue sorted with same rules as web.
    func allDemoTasks(today: String) -> [GoalflowTask] {
        if let data = defaults.data(forKey: storeKey),
           let saved = try? decoder.decode([GoalflowTask].self, from: data),
           saved.allSatisfy({ $0.scheduledFor == today }) {
            // Ensure sorted deterministically
            return saved.sorted(by: goalflowTaskComparator)
        }
        // Seed deterministic demo — two tasks so we can prove ordering, but only head is shown.
        // Title is human and actionable.
        let nowISO = ISO8601DateFormatter().string(from: Date())
        let tasks = [
            GoalflowTask(
                id: "demo-1",
                title: "Draft Q4 roadmap — outline three bets",
                notes: "",
                tags: ["focus"],
                schedulePrecision: .day,
                scheduledFor: today,
                plannedOrder: 0,
                status: .open,
                isFrog: false,
                beforeFrog: false,
                source: .manual,
                createdAt: nowISO,
                updatedAt: nowISO,
                version: 1,
                durationMinutes: 25
            ),
            GoalflowTask(
                id: "demo-2",
                title: "Review weekly goals and prune one",
                tags: [],
                schedulePrecision: .day,
                scheduledFor: today,
                plannedOrder: 1,
                status: .open,
                isFrog: false,
                createdAt: nowISO,
                updatedAt: nowISO,
                version: 1,
                durationMinutes: 15
            )
        ]
        if let data = try? encoder.encode(tasks) {
            defaults.set(data, forKey: storeKey)
        }
        return tasks.sorted(by: goalflowTaskComparator)
    }

    func fetchCurrent() -> GoalflowTask? {
        let today = todayString()
        let queue = buildTodayQueue(tasks: allDemoTasks(today: today), today: today)
        return queue.first
    }

    func resetDemo() {
        defaults.removeObject(forKey: storeKey)
    }

    func setFrogDemo(isFrog: Bool) {
        let today = todayString()
        var tasks = allDemoTasks(today: today)
        if var first = tasks.first {
            first.isFrog = isFrog
            tasks[0] = first
            if let data = try? encoder.encode(tasks) {
                defaults.set(data, forKey: storeKey)
            }
        }
    }

    private func todayString() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: Date())
    }
}



// MARK: - Stub gateways (placeholders for later sessions)

protocol SyncGateway: Sendable { func synchronize() async throws }
struct NoopSyncGateway: SyncGateway { func synchronize() async throws {} }

protocol AuthGateway: Sendable { var isAuthenticated: Bool { get } }
struct StubAuthGateway: AuthGateway { var isAuthenticated: Bool { false } }

protocol ActionGateway: Sendable { func start(taskId: String) async throws -> ExecutionState }
struct LocalActionGateway: ActionGateway {
    func start(taskId: String) async throws -> ExecutionState { fatalError("unused in v1") }
}

protocol BreakdownGateway: Sendable { func suggest(for task: GoalflowTask) async throws -> [String] }
struct StubBreakdownGateway: BreakdownGateway { func suggest(for task: GoalflowTask) async throws -> [String] { [] } }
