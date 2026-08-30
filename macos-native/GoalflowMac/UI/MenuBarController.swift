import AppKit
import SwiftUI
import Combine
@MainActor
final class MenuBarController: NSObject {
    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    private var viewModel: ExecutionViewModel!
    private var taskProvider: DemoCurrentTaskProvider!
    private var cancellables: Set<AnyCancellable> = []
    override init() { super.init() }
    func start(taskProvider: DemoCurrentTaskProvider, store: any FocusSessionStore, clock: any Clock = SystemClock()) {
        self.taskProvider = taskProvider; self.viewModel = ExecutionViewModel(provider: taskProvider, store: store, clock: clock)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "scope", accessibilityDescription: "Goalflow"); button.imagePosition = .imageOnly
            button.action = #selector(togglePopover); button.target = self; updateStatusTitle()
        }
        popover = NSPopover(); popover.contentSize = NSSize(width: 400, height: 420); popover.behavior = .transient; popover.animates = true
        let hosting = NSHostingView(rootView: ExecutionPanelView(vm: viewModel))
        let vc = NSViewController(); vc.view = hosting; popover.contentViewController = vc
        viewModel.$remainingSeconds.receive(on: DispatchQueue.main).sink { [weak self] _ in self?.updateStatusTitle() }.store(in: &cancellables)
        viewModel.$overtimeSeconds.receive(on: DispatchQueue.main).sink { [weak self] _ in self?.updateStatusTitle() }.store(in: &cancellables)
        viewModel.$isPaused.receive(on: DispatchQueue.main).sink { [weak self] _ in self?.updateStatusTitle() }.store(in: &cancellables)
        Timer.publish(every: 5, on: .main, in: .common).autoconnect().sink { [weak self] _ in self?.updateStatusTitle() }.store(in: &cancellables)
        NotificationCenter.default.addObserver(self, selector: #selector(appDidBecomeActive), name: NSApplication.didBecomeActiveNotification, object: nil)
    }
    @objc private func togglePopover() {
        guard let button = statusItem.button else { return }
        if popover.isShown { popover.performClose(nil) } else { viewModel.restore(); updateStatusTitle(); popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY); popover.contentViewController?.view.window?.makeKey() }
    }
    @objc private func appDidBecomeActive() { viewModel.restore(); updateStatusTitle() }
    private func updateStatusTitle() {
        guard let button = statusItem.button else { return }
        let task = taskProvider?.fetchCurrent()
        let isPaused = viewModel?.isPaused ?? false; let isOvertime = viewModel?.isOvertime ?? false; let isActive = viewModel?.isActive ?? false
        let display: String
        if let t = task {
            let trimmed = t.title.count > 22 ? String(t.title.prefix(22)) + "…" : t.title
            if isPaused { display = "⏸ \(trimmed) \(viewModel?.displayTime ?? "")" }
            else if isOvertime { display = "● \(trimmed) \(viewModel?.displayTime ?? "")" }
            else if isActive { display = "● \(trimmed) \(viewModel?.displayTime ?? "")" }
            else { display = trimmed }
        } else { display = "Plan the day" }
        let iconName = isPaused ? "pause.circle.fill" : isOvertime ? "exclamationmark.circle.fill" : isActive ? "scope" : "circle.dotted"
        button.title = display; button.imagePosition = .imageLeading; button.image = NSImage(systemSymbolName: iconName, accessibilityDescription: nil)
        button.font = NSFont.systemFont(ofSize: 12, weight: .medium); button.toolTip = task?.title ?? "Goalflow — no tasks planned"
        if isOvertime { button.contentTintColor = .systemOrange } else if isPaused { button.contentTintColor = .systemOrange } else { button.contentTintColor = nil }
    }
}
