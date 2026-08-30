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
        // tasks
        if let data = try? Data(contentsOf: baseDir.appendingPathComponent("goalflow.tasks.json")),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            dict["tasks"] = arr
        }
        if let data = try? Data(contentsOf: baseDir.appendingPathComponent("dailyPlans.json")),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            dict["daily_plans"] = arr
        }
        if let data = try? Data(contentsOf: baseDir.appendingPathComponent("goals.json")),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            dict["goals"] = arr
        }
        // singleton stores
        if let data = try? Data(contentsOf: baseDir.appendingPathComponent("amalgam.json")),
           let val = try? JSONSerialization.jsonObject(with: data) {
            dict["amalgam"] = val
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
            case "amalgam": fileName = "amalgam.json"
            default: continue
            }
            let url = baseDir.appendingPathComponent(fileName)
            let data: Data
            if let arr = value as? [[String: Any]] {
                data = try JSONSerialization.data(withJSONObject: arr, options: [.sortedKeys])
            } else if let dict = value as? [String: Any] {
                data = try JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])
            } else if let str = value as? String {
                data = try JSONSerialization.data(withJSONObject: str, options: [])
            } else {
                data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
            }
            try data.write(to: url, options: [.atomic])
            // Also mirror to UserDefaults WAL for consistency (best-effort)
            let walKey: String
            switch store {
            case "tasks": walKey = "goalflow.demo.tasks.v1"
            case "daily_plans": walKey = "goalflow.daily_plans.v1"
            case "goals": walKey = "goalflow.goals.v1"
            case "amalgam": walKey = "goalflow.amalgam.v1"
            default: walKey = "goalflow.\(store).v1"
            }
            defaults.set(data, forKey: walKey)
        }
    }
}
