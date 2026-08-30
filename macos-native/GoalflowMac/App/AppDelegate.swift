import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var menuBar: MenuBarController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Menu-bar-only: hide dock? LSUIElement handles it, but also ensure no main window activation lingers
        NSApp.setActivationPolicy(.accessory)

        let store = UserDefaultsFocusSessionStore()
        let provider = DemoCurrentTaskProvider()

        menuBar = MenuBarController()
        menuBar.start(taskProvider: provider, store: store)

        // Optional: show popover on first launch for review
        // DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.menuBar.togglePopover() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Execution state already persisted before termination.
    }
}
