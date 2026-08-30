import Foundation

final class GoalStore: @unchecked Sendable {
    let fileURL: URL
    private let walKey: String
    private let defaults: UserDefaults
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.goals.v1") {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("goals.json")
        }
        self.defaults = defaults; self.walKey = walKey
        encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
    }
    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    }
    func loadAll() -> [Goal] {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL), let g = try? decoder.decode([Goal].self, from: data) { return g }
        }
        if let data = defaults.data(forKey: walKey), let g = try? decoder.decode([Goal].self, from: data) {
            try? saveAll(g); return g
        }
        return []
    }
    func saveAll(_ goals: [Goal]) throws {
        let data = try encoder.encode(goals)
        try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        guard let read = try? Data(contentsOf: fileURL) else { throw FocusSessionStoreError.writeFailed("missing after write") }
        if read != data { throw FocusSessionStoreError.readBackMismatch }
        defaults.set(data, forKey: walKey)
    }
}

final class TrueNorthStore: @unchecked Sendable {
    let fileURL: URL; private let walKey: String; private let defaults: UserDefaults
    private let encoder: JSONEncoder; private let decoder: JSONDecoder
    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.truenorth.v1") {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("truenorth.json")
        }
        self.defaults = defaults; self.walKey = walKey
        encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]; decoder = JSONDecoder()
    }
    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    }
    func loadAll() -> [TrueNorthGoal] {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL), let g = try? decoder.decode([TrueNorthGoal].self, from: data) { return g }
        }
        if let data = defaults.data(forKey: walKey), let g = try? decoder.decode([TrueNorthGoal].self, from: data) { try? saveAll(g); return g }
        return []
    }
    func saveAll(_ goals: [TrueNorthGoal]) throws {
        let data = try encoder.encode(goals); try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        guard let read = try? Data(contentsOf: fileURL) else { throw FocusSessionStoreError.writeFailed("missing after write") }
        if read != data { throw FocusSessionStoreError.readBackMismatch }
        defaults.set(data, forKey: walKey)
    }
}

final class AmalgamStore: @unchecked Sendable {
    let fileURL: URL; private let walKey: String; private let defaults: UserDefaults
    init(fileURL: URL? = nil, defaults: UserDefaults = .standard, walKey: String = "goalflow.amalgam.v1") {
        if let u = fileURL { self.fileURL = u } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
            let dir = base.appendingPathComponent("com.mariusschober.GoalflowMac", isDirectory: true)
            self.fileURL = dir.appendingPathComponent("amalgam.json")
        }
        self.defaults = defaults; self.walKey = walKey
    }
    private func ensureDirectory() throws {
        let dir = fileURL.deletingLastPathComponent()
        if !FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
    }
    func load() -> String? {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            if let data = try? Data(contentsOf: fileURL), let s = try? JSONDecoder().decode(String.self, from: data) { return s }
        }
        if let data = defaults.data(forKey: walKey), let s = try? JSONDecoder().decode(String.self, from: data) { try? save(s); return s }
        return defaults.string(forKey: walKey) // fallback legacy string
    }
    func save(_ value: String) throws {
        let data = try JSONEncoder().encode(value); try ensureDirectory()
        do { try data.write(to: fileURL, options: [.atomic]) } catch { throw FocusSessionStoreError.writeFailed(error.localizedDescription) }
        defaults.set(data, forKey: walKey)
    }
}
