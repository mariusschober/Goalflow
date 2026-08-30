import AppKit
import SwiftUI

@MainActor
final class MenuBarController: NSObject {
    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    private var viewModel: ExecutionViewModel!
    private var updateTimer: Timer?
    private var taskProvider: DemoCurrentTaskProvider!

    override init() {
        super.init()
    }

    func start(taskProvider: DemoCurrentTaskProvider, store: any FocusSessionStore, clock: any Clock = SystemClock()) {
        self.taskProvider = taskProvider
        self.viewModel = ExecutionViewModel(provider: taskProvider, store: store, clock: clock)

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "scope", accessibilityDescription: "Goalflow")
            button.imagePosition = .imageOnly
            button.action = #selector(togglePopover)
            button.target = self
            // Show truncated title alongside icon, bounded
            updateStatusTitle()
        }

        popover = NSPopover()
        popover.contentSize = NSSize(width: 400, height: 360)
        popover.behavior = .transient
        popover.animates = true
        let hosting = NSHostingView(rootView: ExecutionPanelView(vm: viewModel))
        // Let SwiftUI determine intro size; wrap in VC
        let vc = NSViewController()
        vc.view = hosting
        popover.contentViewController = vc

        // Poll for title/current updates every 2s and when popover toggles
        updateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.updateStatusTitle(); self?.viewModel.objectWillChange.send() }
        }

        // Observe App activation to restore if needed
        NotificationCenter.default.addObserver(self, selector: #selector(appDidBecomeActive), name: NSApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func togglePopover() {
        guard let button = statusItem.button else { return }
        if popover.isShown {
            popover.performClose(nil)
        } else {
            // Ensure VM fresh
            viewModel.restore()
            updateStatusTitle()
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            // Focus window
            popover.contentViewController?.view.window?.makeKey()
        }
    }

    @objc private func appDidBecomeActive() {
        viewModel.restore()
        updateStatusTitle()
    }

    private func updateStatusTitle() {
        guard let button = statusItem.button else { return }
        let task = taskProvider?.fetchCurrent()
        let baseTitle: String
        if let t = task {
            // Truncate to ~28 chars for menu bar width
            let trimmed = t.title.count > 28 ? String(t.title.prefix(28)) + "…" : t.title
            baseTitle = trimmed
        } else {
            baseTitle = "Plan the day"
        }

        // If active, optionally show mm:ss? For v1 keep task title only to avoid flicker.
        // Concise width: limit to 190pt by truncation already
        let isActive = viewModel?.isActive ?? false
        let icon = isActive ? "● " : "" // subtle active dot
        button.title = "\(icon)\(baseTitle)"
        button.imagePosition = .imageLeading
        button.image = NSImage(systemSymbolName: isActive ? "scope" : "circle.dotted", accessibilityDescription: nil)
        // Make title attributes tighter
        button.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        button.toolTip = task?.title ?? "Goalflow — no tasks planned"
    }
}
