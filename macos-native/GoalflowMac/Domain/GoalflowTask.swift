import Foundation
enum SchedulePrecision: String, Codable, Sendable { case day = "day"; case month = "month" }
enum TaskStatus: String, Codable, Sendable { case open = "open"; case completed = "completed"; case brokenDown = "broken_down"; case dropped = "dropped"; case archived = "archived" }
enum TaskSource: String, Codable, Sendable { case manual = "manual"; case habit = "habit"; case telegram = "telegram"; case share = "share"; case ai = "ai"; case migration = "migration" }
enum FlowState: String, Codable, Sendable, CaseIterable { case distracted = "distracted"; case good = "good"; case high = "high"; case flow = "flow" }
extension FlowState {
    var displayTitle: String {
        switch self { case .distracted: return "I felt distracted"; case .good: return "My focus was good"; case .high: return "I felt highly focused"; case .flow: return "I experienced \"flow\"" }
    }
    var shortLabel: String {
        switch self { case .distracted: return "Distracted"; case .good: return "Good"; case .high: return "High"; case .flow: return "Flow" }
    }
}
struct GoalflowTask: Codable, Equatable, Sendable, Identifiable {
    var id: String; var title: String; var notes: String; var tags: [String]; var schedulePrecision: SchedulePrecision; var scheduledFor: String; var scheduledTime: String?; var plannedOrder: Int; var status: TaskStatus; var isFrog: Bool; var frogFailures: Int; var beforeFrog: Bool; var source: TaskSource; var parentTaskId: String?; var habitId: String?; var createdAt: String; var updatedAt: String; var version: Int; var durationMinutes: Int; var extraJson: String
    init(id: String, title: String, notes: String = "", tags: [String] = [], schedulePrecision: SchedulePrecision = .day, scheduledFor: String, scheduledTime: String? = nil, plannedOrder: Int = 0, status: TaskStatus = .open, isFrog: Bool = false, frogFailures: Int = 0, beforeFrog: Bool = false, source: TaskSource = .manual, parentTaskId: String? = nil, habitId: String? = nil, createdAt: String = ISO8601DateFormatter().string(from: Date()), updatedAt: String = ISO8601DateFormatter().string(from: Date()), version: Int = 1, durationMinutes: Int = 25, extraJson: String = "{}") {
        self.id = id; self.title = title.trimmingCharacters(in: .whitespacesAndNewlines); self.notes = notes; self.tags = tags; self.schedulePrecision = schedulePrecision; self.scheduledFor = scheduledFor; self.scheduledTime = scheduledTime; self.plannedOrder = plannedOrder; self.status = status; self.isFrog = isFrog; self.frogFailures = frogFailures; self.beforeFrog = beforeFrog; self.source = source; self.parentTaskId = parentTaskId; self.habitId = habitId; self.createdAt = createdAt; self.updatedAt = updatedAt; self.version = version; self.durationMinutes = max(1, min(1440, durationMinutes)); self.extraJson = extraJson
    }
    func withCompleted(at now: Date, actualDurationMinutes: Int, flowState: FlowState?) -> GoalflowTask {
        var copy = self; copy.status = .completed; let iso = ISO8601DateFormatter().string(from: now); copy.updatedAt = iso; copy.version = version + 1
        var dict: [String: Any] = [:]
        if let data = extraJson.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { dict = obj }
        dict["actualDuration"] = max(1, actualDurationMinutes); dict["completedAt"] = iso
        if let flow = flowState { dict["flowState"] = flow.rawValue }
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]), let str = String(data: data, encoding: .utf8) { copy.extraJson = str }
        return copy
    }
    func withFlowState(_ flow: FlowState) -> GoalflowTask {
        var copy = self; copy.updatedAt = ISO8601DateFormatter().string(from: Date()); copy.version = version + 1
        var dict: [String: Any] = [:]
        if let data = extraJson.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { dict = obj }
        dict["flowState"] = flow.rawValue
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]), let str = String(data: data, encoding: .utf8) { copy.extraJson = str }
        return copy
    }
    var flowState: FlowState? {
        guard let data = extraJson.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let raw = obj["flowState"] as? String else { return nil }
        return FlowState(rawValue: raw)
    }
    var actualDurationMinutes: Int? {
        guard let data = extraJson.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let v = obj["actualDuration"] as? Int else { return nil }
        return v
    }
}
extension GoalflowTask {
    var isOpen: Bool { status == .open }
    var isCompleted: Bool { status == .completed }
    var plannedDurationSeconds: Int { durationMinutes * 60 }
}
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
    let lt = left.scheduledTime ?? "99:99"
    let rt = right.scheduledTime ?? "99:99"
    if lt != rt { return lt < rt ? -1 : 1 }
    if left.createdAt != right.createdAt { return left.createdAt < right.createdAt ? -1 : 1 }
    if left.id != right.id { return left.id < right.id ? -1 : 1 }
    return 0
}
func goalflowTaskComparator(_ left: GoalflowTask, _ right: GoalflowTask) -> Bool { compareQueueCandidates(left, right) < 0 }
func buildTodayQueue(tasks: [GoalflowTask], today: String) -> [GoalflowTask] {
    tasks.filter { $0.isOpen && $0.schedulePrecision == .day && $0.scheduledFor == today }.sorted(by: goalflowTaskComparator)
}
