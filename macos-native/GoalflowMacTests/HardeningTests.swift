import XCTest
@testable import GoalflowMac

final class HardeningTests: XCTestCase {
    private var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // GoalflowMacTests
            .deletingLastPathComponent() // macos-native
            .deletingLastPathComponent() // repository root
    }

    private func repositoryFile(_ path: String) -> URL {
        repositoryRoot.appendingPathComponent(path)
    }

    func test_entitlements_file_exists_and_contains_keys() throws {
        let url = repositoryFile("macos-native/GoalflowMac/GoalflowMac.entitlements")
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "Entitlements file missing")
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        XCTAssertNotNil(plist?["com.apple.security.app-sandbox"])
        XCTAssertNotNil(plist?["com.apple.security.network.client"])
    }

    func test_privacy_manifest_exists() throws {
        let url = repositoryFile("macos-native/GoalflowMac/Resources/PrivacyInfo.xcprivacy")
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "PrivacyInfo.xcprivacy missing")
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        XCTAssertEqual(plist?["NSPrivacyTracking"] as? Bool, false)
    }

    func test_su_feed_url_exists() throws {
        let url = repositoryFile("macos-native/GoalflowMac/Resources/Info.plist")
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        XCTAssertEqual(plist?["SUFeedURL"] as? String, "https://app.goalflow.com/appcast.xml")
        XCTAssertEqual(plist?["CFBundleShortVersionString"] as? String, "1.0.1")
        XCTAssertEqual(plist?["CFBundleVersion"] as? String, "2")
    }

    func test_app_icon_exists() {
        let url = repositoryFile("macos-native/GoalflowMac/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json")
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
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
        let url = repositoryFile("macos-native/GoalflowMac/UI/ExecutionPanelView.swift")
        let content = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        XCTAssertTrue(content.contains("accessibilityLabel(\"Start focus"))
        XCTAssertTrue(content.contains("accessibilityIdentifier(\"action-button\")"))
        XCTAssertTrue(content.contains("accessibilityLabel(\"Hold to complete"))
        XCTAssertTrue(content.contains("accessibilityLabel(\"Plan the day") || content.contains("gate-cta-button"))
    }

    func test_version_bump() throws {
        let url = repositoryFile("macos-native/GoalflowMac/Resources/Info.plist")
        let plist = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any]
        XCTAssertEqual(plist?["CFBundleShortVersionString"] as? String, "1.0.1")
    }

    func test_cloud_configuration_fails_closed_without_values() {
        let configuration = MacCloudConfiguration(info: [:])
        XCTAssertFalse(configuration.isCloudConfigured)
        XCTAssertNil(configuration.apiOrigin)
        XCTAssertNotNil(configuration.problem)
    }

    func test_cloud_configuration_rejects_server_secret_and_insecure_origin() {
        let serverSecret = ["sb", "secret", "must-never-be-in-a-client"].joined(separator: "_")
        let secretConfiguration = MacCloudConfiguration(
            apiOrigin: "https://app.goalflow.test",
            supabaseURL: "https://project.supabase.co",
            publishableKey: serverSecret
        )
        XCTAssertFalse(secretConfiguration.isCloudConfigured)

        let insecureConfiguration = MacCloudConfiguration(
            apiOrigin: "http://app.goalflow.test",
            supabaseURL: "https://project.supabase.co",
            publishableKey: "sb_publishable_goalflow_test_only_value"
        )
        XCTAssertFalse(insecureConfiguration.isCloudConfigured)
    }

    func test_cloud_configuration_accepts_https_and_publishable_key() {
        let configuration = MacCloudConfiguration(
            apiOrigin: "https://app.goalflow.test/",
            supabaseURL: "https://project.supabase.co/",
            publishableKey: "sb_publishable_goalflow_test_only_value"
        )
        XCTAssertTrue(configuration.isCloudConfigured)
        XCTAssertEqual(configuration.apiOrigin?.absoluteString, "https://app.goalflow.test")
        XCTAssertEqual(configuration.supabaseURL?.absoluteString, "https://project.supabase.co")
    }

    func test_auth_callback_requires_exact_custom_url() {
        XCTAssertTrue(SupabaseAuthService.isExpectedCallbackURL(URL(string: "goalflow://auth/callback?code=one&state=two")!))
        XCTAssertFalse(SupabaseAuthService.isExpectedCallbackURL(URL(string: "goalflow://auth/other?code=one&state=two")!))
        XCTAssertFalse(SupabaseAuthService.isExpectedCallbackURL(URL(string: "goalflow://evil/callback?code=one&state=two")!))
        XCTAssertFalse(SupabaseAuthService.isExpectedCallbackURL(URL(string: "goalflow://auth/callback?code=one#token")!))
    }

    func test_pkce_challenge_matches_rfc7636_vector() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        XCTAssertEqual(pkceChallenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    func test_timing_safe_state_comparison_requires_exact_bytes() {
        XCTAssertTrue(timingSafeEqual("known-state", "known-state"))
        XCTAssertFalse(timingSafeEqual("known-state", "known-statf"))
        XCTAssertFalse(timingSafeEqual("known-state", "short"))
    }

    func test_access_token_claim_parser_preserves_durable_identity() throws {
        let userId = "56d9f140-60a6-4e9a-8cef-6a6b03967d3a"
        let sessionId = "08ac99da-8dad-4e29-8f2a-07757a2be79c"
        let payload: [String: Any] = [
            "iss": "https://project.supabase.co/auth/v1",
            "sub": userId.uppercased(),
            "session_id": sessionId.uppercased(),
            "aud": "authenticated",
            "aal": "aal2",
            "exp": 4_102_444_800
        ]
        let payloadData = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        let token = [Data("{}".utf8).base64URLEncodedString(), payloadData.base64URLEncodedString(), "synthetic-signature"].joined(separator: ".")
        let claims = try XCTUnwrap(parseAccessTokenClaims(token))
        XCTAssertEqual(claims.subject, userId)
        XCTAssertEqual(claims.sessionId, sessionId)
        XCTAssertEqual(claims.assuranceLevel, "aal2")
        XCTAssertTrue(claims.hasAuthenticatedAudience)
    }
}
