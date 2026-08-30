import Foundation
import AppKit
import CoreGraphics

enum CaptureIntent: String, Sendable { case add, action }

struct CaptureContext: Sendable {
    var today: String
    var now: Date
    var id: @Sendable () -> String
}

protocol CaptureService: Sendable {
    func createTask(from parsed: ParsedCapture, notes: String?, scheduledFor: String, precision: SchedulePrecision, scheduledTime: String?, intent: CaptureIntent) throws -> GoalflowTask
}

final class LocalCaptureService: CaptureService, @unchecked Sendable {
    private let taskStore: any TaskStore
    private let clock: any Clock
    private let idGenerator: () -> String

    init(taskStore: any TaskStore, clock: any Clock = SystemClock(), idGenerator: @escaping () -> String = { UUID().uuidString }) {
        self.taskStore = taskStore
        self.clock = clock
        self.idGenerator = idGenerator
    }

    func createTask(from parsed: ParsedCapture, notes: String?, scheduledFor: String, precision: SchedulePrecision, scheduledTime: String?, intent: CaptureIntent) throws -> GoalflowTask {
        let title = parsed.cleanTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else {
            throw SchedulingError(code: .invalidTitle, message: "A task needs an actionable title.")
        }
        let today = makeTodayString(from: clock.now())
        // Validate schedule via bridge before persisting
        try assertSchedule(precision: precision, scheduledFor: scheduledFor, today: today, scheduledTime: scheduledTime)

        // Compute plannedOrder tail for that scheduledFor
        let existing = taskStore.loadAll()
        let siblings = existing.filter { $0.scheduledFor == scheduledFor }
        let maxOrder = siblings.map(\.plannedOrder).max() ?? -1
        let plannedOrder = maxOrder + 1

        let duration = parsed.durationMinutes ?? 25
        let tags = parsed.tags
        // Combine notes + urls
        var notesCombined = notes?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let urlPart = parsed.urls.joined(separator: "\n")
        if !urlPart.isEmpty {
            if !notesCombined.isEmpty { notesCombined += "\n" }
            notesCombined += urlPart
        }
        let nowISO = ISO8601DateFormatter().string(from: clock.now())
        let task = GoalflowTask(
            id: idGenerator(),
            title: title,
            notes: notesCombined,
            tags: tags,
            schedulePrecision: precision,
            scheduledFor: scheduledFor,
            scheduledTime: scheduledTime,
            plannedOrder: plannedOrder,
            status: .open,
            isFrog: parsed.isFrog,
            frogFailures: 0,
            beforeFrog: false,
            source: .manual,
            createdAt: nowISO,
            updatedAt: nowISO,
            version: 1,
            durationMinutes: duration,
            extraJson: "{}"
        )
        var all = existing
        all.append(task)
        try taskStore.saveAll(all)

        // Hashtag routing — fire-and-forget
        TagRoutingService.shared.handleTags(tags)

        return task
    }
}

// MARK: - Tag routing

final class TagRoutingService: @unchecked Sendable {
    static let shared = TagRoutingService()

    private let defaults: UserDefaults
    private let key = "goalflow.hashtag.routes.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func routes() -> [String: String] {
        guard let data = defaults.data(forKey: key),
              let dict = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return dict
    }

    func setRoutes(_ routes: [String: String]) {
        if let data = try? JSONEncoder().encode(routes) { defaults.set(data, forKey: key) }
    }

    func handleTags(_ tags: [String]) {
        let routes = routes()
        for tag in tags {
            if let urlString = routes[tag.lowercased()] ?? routes["#\(tag.lowercased())"],
               let url = URL(string: urlString) {
                DispatchQueue.main.async { _ = NSWorkspace.shared.open(url) }
            }
        }
    }
}

// MARK: - Privacy

protocol PrivacyGateway: Sendable { var isScreenSharing: Bool { get } }

struct ScreenSharingPrivacyGateway: PrivacyGateway {
    var isScreenSharing: Bool {
        guard let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else { return false }
        for win in info {
            if let owner = win[kCGWindowOwnerName as String] as? String {
                let lower = owner.lowercased()
                if lower.contains("zoom") || lower.contains("teams") || lower.contains("webex") || lower.contains("meet") {
                    if let name = win[kCGWindowName as String] as? String, name.lowercased().contains("share") { return true }
                }
            }
        }
        return false
    }
}

struct NoopPrivacyGateway: PrivacyGateway { var isScreenSharing: Bool { false } }
