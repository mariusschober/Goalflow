import Foundation

final class SyncBackedCurrentTaskProvider: CurrentTaskProvider, @unchecked Sendable {
    let taskStore: any TaskStore
    let dailyPlanStore: DailyPlanStore
    let goalStore: GoalStore
    let trueNorthStore: TrueNorthStore
    let amalgamStore: AmalgamStore
    private let clock: any Clock

    init(taskStore: any TaskStore = LocalTaskStore(),
         dailyPlanStore: DailyPlanStore = DailyPlanStore(),
         goalStore: GoalStore = GoalStore(),
         trueNorthStore: TrueNorthStore = TrueNorthStore(),
         amalgamStore: AmalgamStore = AmalgamStore(),
         clock: any Clock = SystemClock()) {
        self.taskStore = taskStore; self.dailyPlanStore = dailyPlanStore
        self.goalStore = goalStore; self.trueNorthStore = trueNorthStore
        self.amalgamStore = amalgamStore; self.clock = clock
    }

    private func todayString() -> String { makeTodayString(from: clock.now()) }

    func fetchGate() -> PlanningGate {
        let today = todayString()
        let tasks = taskStore.loadAll()
        let plan = dailyPlanStore.load(for: today)
        return getPlanningGate(tasks: tasks, today: today, dailyPlan: plan)
    }

    func fetchCurrent() -> GoalflowTask? {
        switch fetchGate() {
        case .ready(let queue): return queue.first
        default: return nil
        }
    }

    func allDemoTasks(today: String) -> [GoalflowTask] {
        // Keep compatibility: return queue for today regardless of gate
        buildTodayQueue(tasks: taskStore.loadAll(), today: today)
    }

    // Read-only context
    func allGoals() -> [Goal] { goalStore.loadAll() }
    func allTrueNorth() -> [TrueNorthGoal] { trueNorthStore.loadAll() }
    func amalgam() -> String? { amalgamStore.load() }
    func goal(for id: String?) -> Goal? {
        guard let id else { return nil }
        return goalStore.loadAll().first { $0.id == id }
    }
}
