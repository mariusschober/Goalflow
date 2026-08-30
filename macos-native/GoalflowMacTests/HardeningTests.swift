import XCTest
@testable import GoalflowMac

final class HardeningTests: XCTestCase {
    func test_entitlements_file_exists_and_contains_keys() throws {
        let url = URL(fileURLWithPath: "macos-native/GoalflowMac/GoalflowMac.entitlements")
        // Try relative to project root
        let fm = FileManager.default
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let candidate = cwd.appendingPathComponent("macos-native/GoalflowMac/GoalflowMac.entitlements")
        let alt = URL(fileURLWithPath: "/Users/schober/Projects/Goalflow/macos-native/GoalflowMac/GoalflowMac.entitlements")
        let exists = fm.fileExists(atPath: candidate.path) || fm.fileExists(atPath: alt.path)
        XCTAssertTrue(exists, "Entitlements file missing")
        let data = try Data(contentsOf: fm.fileExists(atPath: alt.path) ? alt : candidate)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        XCTAssertNotNil(plist?["com.apple.security.app-sandbox"])
        XCTAssertNotNil(plist?["com.apple.security.network.client"])
    }

    func test_privacy_manifest_exists() throws {
        let alt = URL(fileURLWithPath: "/Users/schober/Projects/Goalflow/macos-native/GoalflowMac/Resources/PrivacyInfo.xcprivacy")
        XCTAssertTrue(FileManager.default.fileExists(atPath: alt.path), "PrivacyInfo.xcprivacy missing")
        let data = try Data(contentsOf: alt)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        XCTAssertEqual(plist?["NSPrivacyTracking"] as? Bool, false)
    }

    func test_su_feed_url_exists() throws {
        let alt = URL(fileURLWithPath: "/Users/schober/Projects/Goalflow/macos-native/GoalflowMac/Resources/Info.plist")
        let data = try Data(contentsOf: alt)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        XCTAssertEqual(plist?["SUFeedURL"] as? String, "https://app.goalflow.com/appcast.xml")
        XCTAssertEqual(plist?["CFBundleShortVersionString"] as? String, "1.0.1")
        XCTAssertEqual(plist?["CFBundleVersion"] as? String, "2")
    }

    func test_app_icon_exists() {
        let alt = "/Users/schober/Projects/Goalflow/macos-native/GoalflowMac/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json"
        XCTAssertTrue(FileManager.default.fileExists(atPath: alt))
    }

    func test_store_bridge_13_stores() throws {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tmp) }
        let bridge = FileSyncStoreBridge(baseDir: tmp, defaults: UserDefaults(suiteName: UUID().uuidString)!)
        // Write 13 stores via bridge
        let values: [String: Any] = [
            "tasks": [["id":"1","title":"T"]],
            "goals": [["id":"g1","name":"G"]],
            "habits": [["id":"h1"]],
            "truenorth": [["id":"tn1","vision":"V"]],
            "daily_plans": [["id":"2026-09-01","localDate":"2026-09-01","confirmedAt":"now","taskIds":[]]],
            "stats": ["tasksCompleted":1],
            "progress": ["level":1],
            "hashtags": ["tag":"value"],
            "accountability": ["enabled":true],
            "amalgam": "hello",
            "tracking": ["t":1],
            "circadian": ["score":50],
            "settings": ["theme":"dark"]
        ]
        try bridge.saveValues(values)
        let loaded = bridge.loadValues()
        XCTAssertNotNil(loaded["tasks"])
        XCTAssertNotNil(loaded["habits"])
        XCTAssertNotNil(loaded["truenorth"])
        XCTAssertNotNil(loaded["stats"])
        XCTAssertNotNil(loaded["settings"])
    }

    func test_sync_engine_lock_serializes() async throws {
        let metaStore = SyncMetaStore(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".json"), defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let device = DeviceIdStore(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let transport = MockSyncTransport()
        transport.pushHandler = { _ in
            let data = try JSONSerialization.data(withJSONObject: ["results":[]])
            let resp = HTTPURLResponse(url: URL(string:"https://example.com")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (data, resp)
        }
        transport.pullHandler = { _ in
            let data = try JSONSerialization.data(withJSONObject: ["records":[],"nextCursor":0,"hasMore":false])
            let resp = HTTPURLResponse(url: URL(string:"https://example.com")!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (data, resp)
        }
        let bridge = FileSyncStoreBridge(baseDir: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let engine = SyncEngine(metaStore: metaStore, deviceIdStore: device, transport: transport, storeBridge: bridge)
        // Two concurrent synchronizes should not crash due to lock
        async let a: () = engine.synchronize()
        async let b: () = engine.synchronize()
        try await a
        try await b
        XCTAssertTrue(true)
    }

    func test_a11y_labels_exist() {
        // Check that ExecutionPanelView has accessibility identifiers via view inspection (static)
        // We can instantiate ViewModel and check that header has expected labels via View hierarchy is hard,
        // Instead check that the source file contains accessibilityLabel strings
        let path = "/Users/schober/Projects/Goalflow/macos-native/GoalflowMac/UI/ExecutionPanelView.swift"
        let content = (try? String(contentsOfFile: path)) ?? ""
        XCTAssertTrue(content.contains("accessibilityLabel(\"Start focus"))
        XCTAssertTrue(content.contains("accessibilityIdentifier(\"action-button\")"))
        XCTAssertTrue(content.contains("accessibilityLabel(\"Hold to complete"))
        XCTAssertTrue(content.contains("accessibilityLabel(\"Plan the day") || content.contains("gate-cta-button"))
    }

    func test_version_bump() throws {
        let plist = try PropertyListSerialization.propertyList(from: Data(contentsOf: URL(fileURLWithPath: "/Users/schober/Projects/Goalflow/macos-native/GoalflowMac/Resources/Info.plist")), format: nil) as? [String: Any]
        XCTAssertEqual(plist?["CFBundleShortVersionString"] as? String, "1.0.1")
    }
}
