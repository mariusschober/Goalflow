import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var menuBar: MenuBarController!
    private var hotkey: (any HotkeyGateway)?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        let store = CompositeFocusSessionStore(
            fileStore: FileFocusSessionStore(),
            walStore: UserDefaultsFocusSessionStore()
        )
        let provider = DemoCurrentTaskProvider()
        let clock: any Clock = SystemClock()

        menuBar = MenuBarController()
        menuBar.start(taskProvider: provider, store: store, clock: clock)

        // Global capture hotkey Cmd+Shift+G
        let hk = CarbonHotkeyGateway()
        hk.register { [weak self] in
            Task { @MainActor in self?.menuBar.toggleCapture() }
        }
        hotkey = hk
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Execution state already persisted before termination.
    }
}
