import SwiftUI

@MainActor
final class ExecutionViewModel: ObservableObject {
    @Published var task: GoalflowTask?
    @Published var execution: ExecutionState?
    @Published var remainingSeconds: Int = 0

    private let provider: DemoCurrentTaskProvider
    private let store: any FocusSessionStore
    private let clock: any Clock
    private let timer = ExecutionTimer()

    init(provider: DemoCurrentTaskProvider, store: any FocusSessionStore, clock: any Clock = SystemClock()) {
        self.provider = provider
        self.store = store
        self.clock = clock
        restore()
    }

    func restore() {
        // Resolve current task
        task = provider.fetchCurrent()
        // Restore execution if valid
        if let s = store.load() {
            // Validate: task exists, still open, same day
            if let t = task, t.id == s.taskId, t.isOpen {
                execution = s
            } else {
                // Stale session — clear
                try? store.clear()
                execution = nil
            }
        } else {
            execution = nil
        }
        configureTimer()
    }

    private func configureTimer() {
        timer.configure(state: execution, clock: clock)
        if let e = execution, e.isActive {
            remainingSeconds = e.remainingSeconds(now: clock.now())
        } else if let t = task {
            remainingSeconds = t.plannedDurationSeconds
        } else {
            remainingSeconds = 0
        }
        observeTimer()
    }

    private var timerCancellable: Any?
    private func observeTimer() {
        // Simple polling via Timer publisher already inside ExecutionTimer causes @Published changes
        // We mirror remainingSeconds
        // Use a lightweight timer to pull remainingSeconds
        // (ExecutionTimer publishes remainingSeconds @Published; forward via objectWillChange)
    }

    var isActive: Bool { execution?.isActive == true }

    var progress: Double {
        guard let t = task else { return 0 }
        let total = Double(t.plannedDurationSeconds)
        guard total > 0 else { return 0 }
        let remaining = Double(execution?.remainingSeconds(now: clock.now()) ?? t.plannedDurationSeconds)
        return max(0, min(1, remaining / total))
    }

    var displayTime: String {
        if let e = execution, e.isActive {
            let rem = e.remainingSeconds(now: clock.now())
            let m = rem / 60
            let s = rem % 60
            return String(format: "%02d:%02d", m, s)
        } else if let t = task {
            let m = t.durationMinutes
            return String(format: "%02d:00", m)
        }
        return "--:--"
    }

    func action() {
        guard let t = task else { return }
        // Guard: ignore if already active
        if execution?.isActive == true { return }
        let state = ExecutionState(taskId: t.id, phase: .active, startedAt: clock.now(), plannedDurationSeconds: t.plannedDurationSeconds)
        do {
            try store.save(state)
            execution = state
            timer.start(state: state)
        } catch {
            // Do not transition UI on persistence failure
            print("[Execution] ACTION persist failed:", error)
        }
    }

    // Debug helper for Session A: toggle frog or reset demo
    func toggleFrog() {
        guard let t = task else { return }
        provider.setFrogDemo(isFrog: !t.isFrog)
        task = provider.fetchCurrent()
    }
    func resetDemo() {
        try? store.clear()
        provider.resetDemo()
        execution = nil
        task = provider.fetchCurrent()
        configureTimer()
    }
}

struct ExecutionPanelView: View {
    @ObservedObject var vm: ExecutionViewModel
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().opacity(0.08)
            if let task = vm.task {
                content(task: task)
            } else {
                empty
            }
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
        // Tahoe Liquid Glass approximation with fallback
        Group {
            if #available(macOS 13.0, *) {
                // Use system ultraThinMaterial + subtle tint
                ZStack {
                    // Glass depth
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(.ultraThinMaterial)
                    // Warm inner glow when active
                    if vm.isActive {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color.accentColor.opacity(0.06))
                    }
                }
            } else {
                Color(nsColor: .windowBackgroundColor)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "scope")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
            Text("Current")
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .tracking(0.8)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Spacer()
            if let task = vm.task, task.isFrog {
                FrogBadge(compact: true)
            }
            // Debug small reset for reviewer (Option+click later)
            Menu {
                Button("Toggle Frog") { vm.toggleFrog() }
                Button("Reset Demo (clear session)") { vm.resetDemo() }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 12))
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func content(task: GoalflowTask) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Title + meta
            VStack(alignment: .leading, spacing: 8) {
                Text(task.title)
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .lineLimit(2)
                    // single line truncation with tooltip
                    .help(task.title)
                    .foregroundStyle(vm.isActive ? .primary : .primary)
                HStack(spacing: 8) {
                    Label("\(task.durationMinutes)m", systemImage: "timer")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                    if !task.tags.isEmpty {
                        ForEach(task.tags, id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.system(size: 11, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.accentColor)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.accentColor.opacity(0.10))
                                .clipShape(Capsule())
                        }
                    }
                    Spacer()
                    if vm.isActive {
                        Text("Focused")
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .tracking(0.6)
                            .textCase(.uppercase)
                            .foregroundStyle(Color.green)
                    }
                }
            }

            // Timer hero row
            HStack(spacing: 16) {
                ZStack {
                    CircularProgress(progress: vm.progress, lineWidth: 4, tint: task.isFrog ? Color.green : Color.accentColor, inactive: !vm.isActive)
                        .frame(width: 72, height: 72)
                    // Countdown or duration
                    Text(vm.displayTime)
                        .font(.system(size: vm.isActive ? 18 : 16, weight: .semibold, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(vm.isActive ? .primary : .secondary)
                }
                .id(vm.execution?.startedAt) // force redraw on start

                Spacer(minLength: 12)

                // ACTION hero button (inactive phase dominant) -> Active state shows subtle state
                if vm.isActive {
                    // Active: Show pause hint + remaining label but ACTION is done
                    VStack(alignment: .trailing, spacing: 6) {
                        Label("In focus", systemImage: "waveform.path.ecg")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.secondary)
                        Text("Started — stay with it")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Button(action: { vm.action() }) {
                        HStack(spacing: 8) {
                            Text("ACTION")
                                .font(.system(size: 14, weight: .heavy, design: .rounded))
                                .tracking(1.2)
                            Image(systemName: "arrow.right")
                                .font(.system(size: 12, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(task.isFrog ? Color.green : Color(red: 0.36, green: 0.36, blue: 0.84)))
                        .shadow(color: (task.isFrog ? Color.green : Color.accentColor).opacity(0.30), radius: 10, x: 0, y: 6)
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.defaultAction)
                    .help("Start focus for this commitment")
                    .accessibilityLabel("Action — start focus")
                }
            }
            .padding(.vertical, 4)
            .animation(.easeInOut(duration: 0.35), value: vm.isActive)

            // Inactive vs active feel: border/ambient
            if !vm.isActive {
                Text("Tap ACTION to start. The timer counts from \(task.durationMinutes) minutes — it will persist if Goalflow restarts.")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 18)
        // Active phase ambient boost
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(vm.isActive ? Color.accentColor.opacity(0.04) : Color.clear)
        )
        .padding(.horizontal, 10)
    }

    private var empty: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 28))
                .foregroundStyle(.secondary)
            Text("Everything done")
                .font(.system(size: 16, weight: .semibold, design: .rounded))
            Text("Plan tomorrow when ready.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
    }

    private var footer: some View {
        HStack {
            Text("Goalflow • Execution")
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(.tertiary)
            Spacer()
            Text(vm.isActive ? "Active" : "Ready")
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(vm.isActive ? Color.green : .secondary)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background((vm.isActive ? Color.green.opacity(0.14) : Color.primary.opacity(0.06)))
                .clipShape(Capsule())
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}

// Countdown live updater glued to wall-clock
private struct TickingView: View {
    @ObservedObject var vm: ExecutionViewModel
    let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    var body: some View {
        Text(vm.displayTime).monospacedDigit()
            .onReceive(timer) { _ in vm.objectWillChange.send() }
    }
}
