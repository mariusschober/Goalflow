import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var menuBar: MenuBarController!
    private var hotkey: (any HotkeyGateway)?
    private let supabaseAuth = SupabaseAuthService.shared

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "goalflow" && url.host == "auth" && url.path == "/callback" {
            Task { await supabaseAuth.handleCallback(url: url) }
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        let store = CompositeFocusSessionStore(
            fileStore: FileFocusSessionStore(),
            walStore: UserDefaultsFocusSessionStore()
        )
        let provider = DemoCurrentTaskProvider()
        let clock: any Clock = SystemClock()
        let dailyPlanStore = DailyPlanStore()
        let goalStore = GoalStore()
        let trueNorthStore = TrueNorthStore()
        let amalgamStore = AmalgamStore()

        menuBar = MenuBarController()
        menuBar.start(taskProvider: provider, store: store, clock: clock, dailyPlanStore: dailyPlanStore, goalStore: goalStore, trueNorthStore: trueNorthStore, amalgamStore: amalgamStore, gateEnabled: true)

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
