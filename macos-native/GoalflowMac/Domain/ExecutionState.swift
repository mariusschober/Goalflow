import Foundation

/// Deterministic execution state machine.
/// Single task at a time; transitions are persisted before UI success.
enum ExecutionPhase: String, Codable, Sendable, Equatable {
    case idle
    case active
}

struct ExecutionState: Codable, Sendable, Equatable {
    var taskId: String
    var phase: ExecutionPhase
    var startedAt: Date
    var plannedDurationSeconds: Int

    init(taskId: String, phase: ExecutionPhase, startedAt: Date, plannedDurationSeconds: Int) {
        self.taskId = taskId
        self.phase = phase
        self.startedAt = startedAt
        self.plannedDurationSeconds = max(60, plannedDurationSeconds)
    }

    /// Reference-time-derived remaining seconds.
    func remainingSeconds(now: Date) -> Int {
        switch phase {
        case .idle: return plannedDurationSeconds
        case .active:
            let elapsed = max(0, Int(now.timeIntervalSince(startedAt).rounded(.down)))
            return max(0, plannedDurationSeconds - elapsed)
        }
    }

    var isActive: Bool { phase == .active }
}
