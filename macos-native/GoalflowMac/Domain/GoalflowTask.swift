import Foundation

// Mirrors ScheduledTask + Task union from src/domain/scheduling.ts and types.ts.
// Keeps extraJson losslessly for forward compat.

enum SchedulePrecision: String, Codable, Sendable {
    case day = "day"
    case month = "month"
}

enum TaskStatus: String, Codable, Sendable {
    case open = "open"
    case completed = "completed"
    case brokenDown = "broken_down"
    case dropped = "dropped"
    case archived = "archived"
}

enum TaskSource: String, Codable, Sendable {
    case manual = "manual"
    case habit = "habit"
    case telegram = "telegram"
    case share = "share"
    case ai = "ai"
    case migration = "migration"
}

/// Deterministic Goalflow commitment used by queue / Current.
struct GoalflowTask: Codable, Equatable, Sendable, Identifiable {
    var id: String
    var title: String
    var notes: String
    var tags: [String]
    var schedulePrecision: SchedulePrecision
    var scheduledFor: String // YYYY-MM-DD or YYYY-MM
    var scheduledTime: String? // HH:mm
    var plannedOrder: Int
    var status: TaskStatus
    var isFrog: Bool
    var frogFailures: Int
    var beforeFrog: Bool
    var source: TaskSource
    var parentTaskId: String?
    var habitId: String?
    var createdAt: String // ISO8601
    var updatedAt: String
    var version: Int
    // Duration in minutes (1...1440). Stored in extraJson in web/android, but exposed directly here.
    var durationMinutes: Int
    // Opaque forward-compat JSON.
    var extraJson: String

    init(
        id: String,
        title: String,
        notes: String = "",
        tags: [String] = [],
        schedulePrecision: SchedulePrecision = .day,
        scheduledFor: String,
        scheduledTime: String? = nil,
        plannedOrder: Int = 0,
        status: TaskStatus = .open,
        isFrog: Bool = false,
        frogFailures: Int = 0,
        beforeFrog: Bool = false,
        source: TaskSource = .manual,
        parentTaskId: String? = nil,
        habitId: String? = nil,
        createdAt: String = ISO8601DateFormatter().string(from: Date()),
        updatedAt: String = ISO8601DateFormatter().string(from: Date()),
        version: Int = 1,
        durationMinutes: Int = 25,
        extraJson: String = "{}"
    ) {
        self.id = id
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.notes = notes
        self.tags = tags
        self.schedulePrecision = schedulePrecision
        self.scheduledFor = scheduledFor
        self.scheduledTime = scheduledTime
        self.plannedOrder = plannedOrder
        self.status = status
        self.isFrog = isFrog
        self.frogFailures = frogFailures
        self.beforeFrog = beforeFrog
        self.source = source
        self.parentTaskId = parentTaskId
        self.habitId = habitId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.version = version
        self.durationMinutes = max(1, min(1440, durationMinutes))
        self.extraJson = extraJson
    }
}

extension GoalflowTask {
    var isOpen: Bool { status == .open }
    var plannedDurationSeconds: Int { durationMinutes * 60 }
}

// MARK: - Queue ordering parity with src/domain/scheduling.ts compareQueueCandidates

private func groupRank(_ task: GoalflowTask) -> Int {
    if task.beforeFrog, task.habitId != nil { return 0 }
    if task.isFrog { return 1 }
    return 2
}

private func optionalRank(_ value: Int?) -> Int { value ?? Int.max }

func compareQueueCandidates(_ left: GoalflowTask, _ right: GoalflowTask) -> Int {
    let g = groupRank(left) - groupRank(right)
    if g != 0 { return g }
    if left.plannedOrder != right.plannedOrder { return left.plannedOrder < right.plannedOrder ? -1 : 1 }
    if let lr = left.plannedOrder as Int?, let rr = right.plannedOrder as Int? , false { _ = lr; _ = rr }
    // circadianRank not yet modeled -> use Int.max
    // scheduledTime: "99:99" sentinel sorts last
    let lt = left.scheduledTime ?? "99:99"
    let rt = right.scheduledTime ?? "99:99"
    if lt != rt { return lt < rt ? -1 : 1 }
    // createdAt as ISO string compare (lexicographic ~ chronological for ISO8601)
    if left.createdAt != right.createdAt { return left.createdAt < right.createdAt ? -1 : 1 }
    if left.id != right.id { return left.id < right.id ? -1 : 1 }
    return 0
}

func goalflowTaskComparator(_ left: GoalflowTask, _ right: GoalflowTask) -> Bool {
    compareQueueCandidates(left, right) < 0
}

func buildTodayQueue(tasks: [GoalflowTask], today: String) -> [GoalflowTask] {
    tasks.filter { $0.isOpen && $0.schedulePrecision == .day && $0.scheduledFor == today }
        .sorted(by: goalflowTaskComparator)
}
