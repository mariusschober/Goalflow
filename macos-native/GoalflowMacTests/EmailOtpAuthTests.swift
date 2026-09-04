import XCTest
@testable import GoalflowMac

private final class AuthURLProtocolStub: URLProtocol, @unchecked Sendable {
    static let lock = NSLock()
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        let current = Self.handler
        Self.lock.unlock()
        do {
            guard let current else { throw URLError(.unsupportedURL) }
            let (response, data) = try current(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

final class EmailOtpAuthTests: XCTestCase {
    private let userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    private let sessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    private let attemptToken = String(repeating: "A", count: 43)

    override func tearDown() {
        AuthURLProtocolStub.lock.lock()
        AuthURLProtocolStub.handler = nil
        AuthURLProtocolStub.lock.unlock()
        super.tearDown()
    }

    func test_typed_code_activates_before_keychain_session_becomes_usable() async throws {
        let store = makeStore()
        defer { clear(store) }
        let service = makeService(store: store)
        var paths: [String] = []

        setHandler { request in
            paths.append(request.url!.path)
            switch request.url!.path {
            case "/api/v1/auth/email/preflight":
                let body = try Self.jsonBody(request)
                XCTAssertEqual(body["email"] as? String, "person@example.invalid")
                XCTAssertEqual(body["purpose"] as? String, "activation")
                XCTAssertEqual(body["captchaToken"] as? String, "captcha-proof-token-12345")
                return self.response(request, status: 202, object: [
                    "accepted": true,
                    "attemptToken": self.attemptToken,
                    "expiresInSeconds": 600,
                    "resendAfterSeconds": 60
                ])
            case "/auth/v1/verify":
                let body = try Self.jsonBody(request)
                XCTAssertEqual(body["token"] as? String, "123456")
                XCTAssertEqual(body["type"] as? String, "email")
                return self.response(request, object: self.tokenResponse())
            case "/api/v1/auth/email/activate":
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(self.accessToken())")
                XCTAssertEqual(try Self.jsonBody(request)["attemptToken"] as? String, self.attemptToken)
                return self.response(request, object: ["activated": true])
            case "/api/v1/session":
                return self.response(request, object: [
                    "user": ["id": self.userId, "email": "person@example.invalid", "role": "beta", "status": "active"],
                    "assuranceLevel": "aal1"
                ])
            default:
                throw URLError(.unsupportedURL)
            }
        }

        let pending = try await service.requestEmailCode(
            email: " Person@Example.invalid ",
            purpose: .activation,
            inviteCode: "invite-code",
            captchaToken: "captcha-proof-token-12345"
        )
        XCTAssertEqual(pending.attemptToken, attemptToken)
        XCTAssertEqual(try store.readPendingEmailOtp(), pending)
        XCTAssertFalse(store.isAuthenticated)

        let profile = try await service.verifyEmailCode(email: pending.email, code: "123456")

        XCTAssertEqual(profile.userId, userId)
        XCTAssertEqual(profile.email, "person@example.invalid")
        XCTAssertNil(try store.readPendingEmailOtp())
        XCTAssertTrue(store.isAuthenticated)
        XCTAssertEqual(paths, [
            "/api/v1/auth/email/preflight",
            "/auth/v1/verify",
            "/api/v1/auth/email/activate",
            "/api/v1/session"
        ])
    }

    func test_lost_activation_ack_retries_without_reusing_email_code() async throws {
        let store = makeStore()
        defer { clear(store) }
        let service = makeService(store: store)
        var verifyCount = 0
        var activationCount = 0

        setHandler { request in
            switch request.url!.path {
            case "/api/v1/auth/email/preflight":
                return self.response(request, status: 202, object: [
                    "accepted": true,
                    "attemptToken": self.attemptToken,
                    "expiresInSeconds": 600,
                    "resendAfterSeconds": 60
                ])
            case "/auth/v1/verify":
                verifyCount += 1
                return self.response(request, object: self.tokenResponse())
            case "/api/v1/auth/email/activate":
                activationCount += 1
                return self.response(request, status: activationCount == 1 ? 503 : 200,
                                     object: activationCount == 1 ? ["error": "unavailable"] : ["activated": true])
            default:
                throw URLError(.unsupportedURL)
            }
        }

        _ = try await service.requestEmailCode(
            email: "person@example.invalid",
            purpose: .signIn,
            captchaToken: "captcha-proof-token-12345"
        )
        do {
            _ = try await service.verifyEmailCode(email: "person@example.invalid", code: "123456")
            XCTFail("Expected the first activation acknowledgement to fail")
        } catch AuthError.transient {}

        XCTAssertNotNil(try store.read())
        XCTAssertNotNil(try store.readPendingEmailOtp())
        XCTAssertFalse(store.isAuthenticated)
        let resumed = try await service.resumePendingEmailActivation()
        XCTAssertTrue(resumed)
        XCTAssertEqual(verifyCount, 1)
        XCTAssertEqual(activationCount, 2)
        XCTAssertNil(try store.readPendingEmailOtp())
        XCTAssertTrue(store.isAuthenticated)
    }

    func test_preexisting_session_never_bypasses_typed_email_code_verification() async throws {
        let store = makeStore()
        defer { clear(store) }
        let service = makeService(store: store)
        let existingData = try JSONSerialization.data(withJSONObject: tokenResponse(), options: [.sortedKeys])
        try store.save(parseNativeSessionResponse(
            existingData,
            configuration: MacCloudConfiguration(
                apiOrigin: "https://app.tsurfing.test",
                supabaseURL: "https://project.supabase.co",
                publishableKey: "sb_publishable_tsurfing_test_only_value"
            )
        ))
        try store.savePendingEmailOtp(PendingEmailOtpAttempt(
            attemptToken: attemptToken,
            email: "person@example.invalid",
            purpose: .activation,
            expiresAt: Date().addingTimeInterval(600),
            resendAt: Date().addingTimeInterval(60)
        ))
        var paths: [String] = []
        setHandler { request in
            paths.append(request.url!.path)
            switch request.url!.path {
            case "/auth/v1/verify":
                return self.response(request, object: self.tokenResponse())
            case "/api/v1/auth/email/activate":
                return self.response(request, object: ["activated": true])
            case "/api/v1/session":
                return self.response(request, object: [
                    "user": ["id": self.userId, "email": "person@example.invalid", "role": "beta", "status": "active"],
                    "assuranceLevel": "aal1"
                ])
            default:
                throw URLError(.unsupportedURL)
            }
        }

        _ = try await service.verifyEmailCode(email: "person@example.invalid", code: "123456")

        XCTAssertEqual(paths, ["/auth/v1/verify", "/api/v1/auth/email/activate", "/api/v1/session"])
    }

    private func makeStore() -> KeychainSessionStore {
        KeychainSessionStore(
            service: "tsurfing.email-otp-test.\(UUID().uuidString.lowercased())",
            memoryBackend: KeychainMemoryBackend()
        )
    }

    private func clear(_ store: KeychainSessionStore) {
        try? store.clear()
        try? store.clearPendingEmailOtp()
        try? store.clearPendingRequest()
    }

    private func makeService(store: KeychainSessionStore) -> SupabaseAuthService {
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [AuthURLProtocolStub.self]
        return SupabaseAuthService(
            configuration: MacCloudConfiguration(
                apiOrigin: "https://app.tsurfing.test",
                supabaseURL: "https://project.supabase.co",
                publishableKey: "sb_publishable_tsurfing_test_only_value"
            ),
            keychain: store,
            urlSession: URLSession(configuration: sessionConfiguration)
        )
    }

    private func setHandler(_ handler: @escaping (URLRequest) throws -> (HTTPURLResponse, Data)) {
        AuthURLProtocolStub.lock.lock()
        AuthURLProtocolStub.handler = handler
        AuthURLProtocolStub.lock.unlock()
    }

    private func response(
        _ request: URLRequest,
        status: Int = 200,
        object: [String: Any]
    ) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (response, try! JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]))
    }

    private func tokenResponse() -> [String: Any] {
        [
            "access_token": accessToken(),
            "refresh_token": "refresh-token",
            "expires_in": 3600,
            "user": ["id": userId, "email": "person@example.invalid"]
        ]
    }

    private func accessToken() -> String {
        let payload: [String: Any] = [
            "iss": "https://project.supabase.co/auth/v1",
            "sub": userId,
            "session_id": sessionId,
            "aud": "authenticated",
            "aal": "aal1",
            "exp": 4_102_444_800
        ]
        let data = try! JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        return [Data("{}".utf8).base64URLEncodedString(), data.base64URLEncodedString(), "signature"].joined(separator: ".")
    }

    private static func jsonBody(_ request: URLRequest) throws -> [String: Any] {
        let data: Data
        if let body = request.httpBody {
            data = body
        } else if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var collected = Data()
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4_096)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let count = stream.read(buffer, maxLength: 4_096)
                if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeContentData) }
                if count == 0 { break }
                collected.append(buffer, count: count)
            }
            data = collected
        } else {
            throw URLError(.cannotDecodeContentData)
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}
