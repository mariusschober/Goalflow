import Foundation

protocol SyncStoreBridge: Sendable {
    func loadValues() -> [String: Any]
    func saveValues(_ values: [String: Any]) throws
}

final class FileSyncStoreBridge: SyncStoreBridge, @unchecked Sendable {
    private let baseDir: URL
    private let defaults: UserDefaults
    init(baseDir: URL? = nil, defaults: UserDefaults = .standard) {
        if let d = baseDir { self.baseDir = d }
        else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.baseDir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
        }
        self.defaults = defaults
    }

    func loadValues() -> [String: Any] {
        var dict: [String: Any] = [:]
        let mapping: [(file: String, store: String, isArray: Bool)] = [
            ("goalflow.tasks.json", "tasks", true),
            ("dailyPlans.json", "daily_plans", true),
            ("goals.json", "goals", true),
            ("habits.json", "habits", true),
            ("truenorth.json", "truenorth", true),
            ("stats.json", "stats", false),
            ("progress.json", "progress", false),
            ("hashtags.json", "hashtags", false),
            ("accountability.json", "accountability", false),
            ("amalgam.json", "amalgam", false),
            ("tracking.json", "tracking", false),
            ("circadian.json", "circadian", false),
            ("settings.json", "settings", false)
        ]
        for m in mapping {
            let url = baseDir.appendingPathComponent(m.file)
            guard let data = try? Data(contentsOf: url),
                  let val = try? JSONSerialization.jsonObject(with: data) else { continue }
            dict[m.store] = val
        }
        return dict
    }

    func saveValues(_ values: [String : Any]) throws {
        try FileManager.default.createDirectory(at: baseDir, withIntermediateDirectories: true)
        for (store, value) in values {
            let fileName: String
            switch store {
            case "tasks": fileName = "goalflow.tasks.json"
            case "daily_plans": fileName = "dailyPlans.json"
            case "goals": fileName = "goals.json"
            case "habits": fileName = "habits.json"
            case "truenorth": fileName = "truenorth.json"
            case "stats": fileName = "stats.json"
            case "progress": fileName = "progress.json"
            case "hashtags": fileName = "hashtags.json"
            case "accountability": fileName = "accountability.json"
            case "amalgam": fileName = "amalgam.json"
            case "tracking": fileName = "tracking.json"
            case "circadian": fileName = "circadian.json"
            case "settings": fileName = "settings.json"
            default: continue
            }
            let url = baseDir.appendingPathComponent(fileName)
            let data: Data
            if let arr = value as? [[String: Any]] {
                data = try JSONSerialization.data(withJSONObject: arr, options: [.sortedKeys])
            } else if let dict = value as? [String: Any] {
                data = try JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])
            } else if let str = value as? String {
                data = try JSONEncoder().encode(str)
            } else if let num = value as? NSNumber {
                data = try JSONEncoder().encode(num.stringValue)
            } else {
                data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
            }
            try data.write(to: url, options: [.atomic])
            let walKey: String
            switch store {
            case "tasks": walKey = "goalflow.demo.tasks.v1"
            case "daily_plans": walKey = "goalflow.daily_plans.v1"
            case "goals": walKey = "goalflow.goals.v1"
            case "habits": walKey = "goalflow.habits.v1"
            case "truenorth": walKey = "goalflow.truenorth.v1"
            case "stats": walKey = "goalflow.stats.v1"
            case "progress": walKey = "goalflow.progress.v1"
            case "hashtags": walKey = "goalflow.hashtags.v1"
            case "accountability": walKey = "goalflow.accountability.v1"
            case "amalgam": walKey = "goalflow.amalgam.v1"
            case "tracking": walKey = "goalflow.tracking.v1"
            case "circadian": walKey = "goalflow.circadian.v1"
            case "settings": walKey = "goalflow.settings.v1"
            default: walKey = "goalflow.\(store).v1"
            }
            defaults.set(data, forKey: walKey)
        }
    }
}
