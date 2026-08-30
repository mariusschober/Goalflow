import SwiftUI
import Combine
@MainActor
final class ExecutionViewModel: ObservableObject {
    @Published var task: GoalflowTask?
    @Published var execution: ExecutionState?
    @Published var remainingSeconds: Int = 0
    @Published var overtimeSeconds: Int = 0
    @Published var isPaused: Bool = false
    private let provider: DemoCurrentTaskProvider
    private let store: any FocusSessionStore
    private let clock: any Clock
    private let timer = ExecutionTimer()
    private let sound: any SoundGateway
    private var cancellables: Set<AnyCancellable> = []
    private var lastTickOvertime: Int = 0
    init(provider: DemoCurrentTaskProvider, store: any FocusSessionStore, clock: any Clock = SystemClock(), sound: any SoundGateway = NoopSoundGateway()) {
        self.provider = provider; self.store = store; self.clock = clock; self.sound = sound
        setupTimerBindings(); restore()
    }
    private func setupTimerBindings() {
        timer.$remainingSeconds.receive(on: DispatchQueue.main).sink { [weak self] v in self?.remainingSeconds = v }.store(in: &cancellables)
        timer.$overtimeSeconds.receive(on: DispatchQueue.main).sink { [weak self] v in
            guard let self else { return }; self.overtimeSeconds = v
            if self.execution?.isActive == true && v != self.lastTickOvertime { self.sound.tick(volume: 0.6) }
            self.lastTickOvertime = v
        }.store(in: &cancellables)
        timer.$isPaused.receive(on: DispatchQueue.main).sink { [weak self] v in self?.isPaused = v }.store(in: &cancellables)
        timer.$isActive.receive(on: DispatchQueue.main).sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &cancellables)
    }
    func restore() {
        task = provider.fetchCurrent()
        if let s = store.load() {
            if let t = task, t.id == s.taskId, t.isOpen { execution = s } else { try? store.clear(); execution = nil }
        } else { execution = nil }
        configureTimer()
    }
    private func configureTimer() {
        timer.configure(state: execution, clock: clock)
        if let e = execution { remainingSeconds = e.remainingSeconds(now: clock.now()); overtimeSeconds = e.overtimeSeconds(now: clock.now()); isPaused = e.isPaused }
        else if let t = task { remainingSeconds = t.plannedDurationSeconds; overtimeSeconds = 0; isPaused = false }
        else { remainingSeconds = 0; overtimeSeconds = 0; isPaused = false }
    }
    var isActive: Bool { execution?.isActive == true }
    var isOvertime: Bool { overtimeSeconds > 0 }
    var progress: Double {
        guard let t = task else { return 0 }
        let total = Double(t.plannedDurationSeconds); guard total > 0 else { return 0 }
        if isOvertime { return 1.0 }
        return max(0, min(1, Double(remainingSeconds) / total))
    }
    var displayTime: String {
        if isOvertime { let m = overtimeSeconds / 60; let s = overtimeSeconds % 60; return String(format: "+%02d:%02d", m, s) }
        if let e = execution, e.isActive || e.isPaused {
            let rem = e.isPaused ? e.remainingSeconds(now: clock.now()) : remainingSeconds
            return String(format: "%02d:%02d", rem / 60, rem % 60)
        } else if let t = task { return String(format: "%02d:00", t.durationMinutes) }
        return "--:--"
    }
    func action() {
        guard let t = task else { return }
        if execution?.isActive == true || execution?.isPaused == true { return }
        let monotonic: UInt64? = (clock as? any MonotonicClock)?.monotonicNow
        let state = ExecutionState(taskId: t.id, phase: .active, startedAt: clock.now(), startedAtMonotonic: monotonic, plannedDurationSeconds: t.plannedDurationSeconds)
        do { try store.save(state); execution = state; timer.start(state: state) } catch { print("[Execution] ACTION persist failed:", error) }
    }
    func pause() {
        guard let e = execution, e.isActive else { return }
        guard let next = e.paused(at: clock.now()) else { return }
        do { try store.save(next); execution = next; timer.reflectPause(next) } catch { print("[Execution] pause persist failed:", error) }
    }
    func resume() {
        guard let e = execution, e.isPaused else { return }
        guard let next = e.resumed(at: clock.now()) else { return }
        do { try store.save(next); execution = next; timer.reflectResume(next) } catch { print("[Execution] resume persist failed:", error) }
    }
    func extend(by seconds: Int) {
        guard let e = execution, let next = e.extended(by: seconds) else { return }
        do { try store.save(next); execution = next; timer.reflectExtend(next) } catch { print("[Execution] extend persist failed:", error) }
    }
    func add5() { extend(by: 5*60) }; func add15() { extend(by: 15*60) }; func add30() { extend(by: 30*60) }
    func toggleFrog() { guard let t = task else { return }; provider.setFrogDemo(isFrog: !t.isFrog); task = provider.fetchCurrent() }
    func resetDemo() { try? store.clear(); provider.resetDemo(); execution = nil; task = provider.fetchCurrent(); configureTimer() }
}
struct ExecutionPanelView: View {
    @ObservedObject var vm: ExecutionViewModel
    @Environment(\.colorScheme) var colorScheme
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().opacity(0.08)
            if let task = vm.task { content(task: task) } else { empty }
            footer
        }
        .frame(width: 380)
        .background(panelBackground)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.primary.opacity(0.06), lineWidth: 1))
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.5 : 0.18), radius: 18, x: 0, y: 10)
        .padding(10)
    }
    private var panelBackground: some View {
        Group {
            if #available(macOS 13.0, *) {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.ultraThinMaterial)
                    if vm.isActive || vm.isPaused || vm.isOvertime {
                        RoundedRectangle(cornerRadius: 18, style: .continuous).fill((vm.isOvertime ? Color.orange.opacity(0.08) : Color.accentColor.opacity(0.06)))
                    }
                }
            } else { Color(nsColor: .windowBackgroundColor) }
        }
    }
    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: vm.isPaused ? "pause.circle.fill" : vm.isOvertime ? "exclamationmark.circle.fill" : "scope")
                .font(.system(size: 12, weight: .semibold)).foregroundStyle(vm.isOvertime ? Color.orange : .secondary)
            Text(vm.isPaused ? "Paused" : vm.isOvertime ? "Overtime" : "Current")
                .font(.system(size: 11, weight: .semibold, design: .rounded)).tracking(0.8).textCase(.uppercase)
                .foregroundStyle(vm.isOvertime ? Color.orange : .secondary)
            Spacer()
            if let task = vm.task, task.isFrog { FrogBadge(compact: true) }
            Menu {
                Button(vm.isPaused ? "Resume" : "Pause") { if vm.isPaused { vm.resume() } else { vm.pause() } }.disabled(!(vm.isActive || vm.isPaused))
                Divider()
                Button("+5 min") { vm.add5() }.disabled(vm.execution == nil)
                Button("+15 min") { vm.add15() }.disabled(vm.execution == nil)
                Button("+30 min") { vm.add30() }.disabled(vm.execution == nil)
                Divider()
                Button("Toggle Frog") { vm.toggleFrog() }
                Button("Reset Demo (clear session)") { vm.resetDemo() }
            } label: { Image(systemName: "ellipsis.circle").foregroundStyle(.secondary).font(.system(size: 12)) }
            .menuStyle(.borderlessButton).fixedSize()
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }
    private func content(task: GoalflowTask) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text(task.title).font(.system(size: 20, weight: .semibold, design: .rounded)).lineLimit(2).help(task.title)
                HStack(spacing: 8) {
                    Label("\(task.durationMinutes)m", systemImage: "timer").font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                    if !task.tags.isEmpty { ForEach(task.tags, id: \.self) { tag in Text("#\(tag)").font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(Color.accentColor).padding(.horizontal, 6).padding(.vertical, 2).background(Color.accentColor.opacity(0.10)).clipShape(Capsule()) } }
                    Spacer()
                    if vm.isActive || vm.isPaused {
                        Text(vm.isPaused ? "Paused" : vm.isOvertime ? "Overtime \(vm.displayTime)" : "Focused")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).tracking(0.6).textCase(.uppercase)
                            .foregroundStyle(vm.isOvertime ? Color.orange : vm.isPaused ? Color.orange : Color.green)
                    }
                }
            }
            HStack(spacing: 16) {
                ZStack {
                    CircularProgress(progress: vm.progress, lineWidth: 4, tint: vm.isOvertime ? Color.orange : task.isFrog ? Color.green : Color.accentColor, inactive: !(vm.isActive || vm.isPaused || vm.isOvertime))
                        .frame(width: 72, height: 72)
                    Text(vm.displayTime).font(.system(size: vm.isActive || vm.isPaused ? 18 : 16, weight: .semibold, design: .monospaced)).monospacedDigit().foregroundStyle((vm.isActive || vm.isPaused || vm.isOvertime) ? (vm.isOvertime ? Color.orange : .primary) : .secondary)
                }.id(vm.execution?.startedAt)
                Spacer(minLength: 8)
                if vm.isActive || vm.isPaused {
                    HStack(spacing: 8) {
                        if vm.isPaused {
                            Button(action: { vm.resume() }) {
                                HStack(spacing: 6) { Image(systemName: "play.fill").font(.system(size: 11, weight: .bold)); Text("Resume").font(.system(size: 12, weight: .bold, design: .rounded)) }
                                .foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 10).background(Capsule().fill(Color.green)).shadow(color: Color.green.opacity(0.25), radius: 8, x: 0, y: 4)
                            }.buttonStyle(.plain)
                        } else {
                            Button(action: { vm.pause() }) {
                                HStack(spacing: 6) { Image(systemName: "pause.fill").font(.system(size: 11, weight: .bold)); Text("Pause").font(.system(size: 12, weight: .bold, design: .rounded)) }
                                .foregroundStyle(.white).padding(.horizontal, 14).padding(.vertical, 10).background(Capsule().fill(Color.orange)).shadow(color: Color.orange.opacity(0.25), radius: 8, x: 0, y: 4)
                            }.buttonStyle(.plain)
                        }
                        HStack(spacing: 6) {
                            ForEach([(5,"+5"),(15,"+15"),(30,"+30")], id: \.0) { sec, label in
                                Button(action: { if sec==5 { vm.add5() } else if sec==15 { vm.add15() } else { vm.add30() } }) {
                                    Text(label).font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(.secondary).padding(.horizontal, 8).padding(.vertical, 6).background(Capsule().fill(Color.primary.opacity(0.08)))
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                } else {
                    Button(action: { vm.action() }) {
                        HStack(spacing: 8) { Text("ACTION").font(.system(size: 14, weight: .heavy, design: .rounded)).tracking(1.2); Image(systemName: "arrow.right").font(.system(size: 12, weight: .bold)) }
                        .foregroundStyle(.white).padding(.horizontal, 22).padding(.vertical, 12).background(Capsule().fill(task.isFrog ? Color.green : Color(red: 0.36, green: 0.36, blue: 0.84))).shadow(color: (task.isFrog ? Color.green : Color.accentColor).opacity(0.30), radius: 10, x: 0, y: 6)
                    }.buttonStyle(.plain).keyboardShortcut(.defaultAction)
                }
            }.padding(.vertical, 4).animation(.easeInOut(duration: 0.35), value: vm.isActive).animation(.easeInOut(duration: 0.35), value: vm.isPaused).animation(.easeInOut(duration: 0.35), value: vm.isOvertime)
            if !(vm.isActive || vm.isPaused || vm.isOvertime) {
                Text("Tap ACTION to start. The timer counts from \(task.durationMinutes) minutes — it will persist if Goalflow restarts. Pause is low friction; overtime counts separately.")
                    .font(.system(size: 11, weight: .regular)).foregroundStyle(.secondary).lineLimit(3)
            } else if vm.isPaused {
                Text("Paused — elapsed frozen. Resume to continue, or add time.").font(.system(size: 11, weight: .regular)).foregroundStyle(.secondary)
            } else if vm.isOvertime {
                Text("Overtime — planned time elapsed. Keep flowing or add +5/+15/+30.").font(.system(size: 11, weight: .medium)).foregroundStyle(Color.orange)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 18)
        .background(RoundedRectangle(cornerRadius: 14).fill((vm.isActive || vm.isPaused || vm.isOvertime) ? (vm.isOvertime ? Color.orange.opacity(0.06) : Color.accentColor.opacity(0.04)) : Color.clear))
        .padding(.horizontal, 10)
    }
    private var empty: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark.seal.fill").font(.system(size: 28)).foregroundStyle(.secondary)
            Text("Everything done").font(.system(size: 16, weight: .semibold, design: .rounded))
            Text("Plan tomorrow when ready.").font(.system(size: 12)).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity).padding(28)
    }
    private var footer: some View {
        HStack {
            Text("Goalflow • Execution").font(.system(size: 10, weight: .medium, design: .rounded)).foregroundStyle(.tertiary)
            Spacer()
            Text(vm.isPaused ? "Paused" : vm.isOvertime ? "Overtime" : vm.isActive ? "Active" : "Ready")
                .font(.system(size: 10, weight: .semibold, design: .rounded)).tracking(0.6).textCase(.uppercase)
                .foregroundStyle(vm.isOvertime ? Color.orange : vm.isPaused ? Color.orange : vm.isActive ? Color.green : .secondary)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background((vm.isOvertime ? Color.orange.opacity(0.14) : vm.isPaused ? Color.orange.opacity(0.12) : vm.isActive ? Color.green.opacity(0.14) : Color.primary.opacity(0.06)))
                .clipShape(Capsule())
        }.padding(.horizontal, 14).padding(.vertical, 10)
    }
}
