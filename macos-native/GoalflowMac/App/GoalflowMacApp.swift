import SwiftUI

@main
struct GoalflowMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        // MenuBarExtra is SwiftUI-native but we use AppKit controller for Tahoe control.
        // Keep a Settings scene for future preferences.
        Settings {
            VStack(spacing: 12) {
                Text("Goalflow — Execution Companion")
                    .font(.headline)
                Text("Preferences arrive in Session F. Current behavior is demo-local.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Quit Goalflow") { NSApplication.shared.terminate(nil) }
                    .keyboardShortcut("q")
            }
            .padding(20)
            .frame(width: 360)
        }
    }
}
