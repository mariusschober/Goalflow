import Foundation
import CryptoKit
import Security

struct GoalflowSessionProfile: Equatable, Sendable {
    var userId: String
    var email: String
    var role: String
    var assuranceLevel: String

    var requiresMFA: Bool { role == "owner" && assuranceLevel != "aal2" }
}

func pkceChallenge(_ verifier: String) -> String {
    Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
}

func timingSafeEqual(_ left: String, _ right: String) -> Bool {
    let lhs = Array(left.utf8)
    let rhs = Array(right.utf8)
    guard lhs.count == rhs.count else { return false }
    var difference: UInt8 = 0
    for index in lhs.indices { difference |= lhs[index] ^ rhs[index] }
    return difference == 0
}

final class SupabaseAuthService: @unchecked Sendable {
    static let shared = SupabaseAuthService()

    private let configuration: MacCloudConfiguration
    private let keychain: KeychainSessionStore
    private let urlSession: URLSession

    init(
        configuration: MacCloudConfiguration = .current,
        keychain: KeychainSessionStore = KeychainSessionStore(),
        urlSession: URLSession? = nil
    ) {
        self.configuration = configuration
        self.keychain = keychain
        if let urlSession {
            self.urlSession = urlSession
        } else {
            let sessionConfiguration = URLSessionConfiguration.ephemeral
            sessionConfiguration.timeoutIntervalForRequest = 15
            sessionConfiguration.timeoutIntervalForResource = 20
            sessionConfiguration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            self.urlSession = URLSession(
                configuration: sessionConfiguration,
                delegate: NoRedirectURLSessionDelegate(),
                delegateQueue: nil
            )
        }
    }

    var isConfigured: Bool { configuration.isCloudConfigured }
    var configurationProblem: String? { configuration.problem }

    func requestMagicLink(email: String) async throws {
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard cleanEmail.count <= 254,
              cleanEmail.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil else {
            throw AuthError.invalidEmail
        }
        let auth = try requireAuthenticationConfiguration()
        let state = try secureRandomValue()
        let verifier = try secureRandomValue()
        var redirect = URLComponents(string: MacCloudConfiguration.authRedirectURL)!
        redirect.queryItems = [URLQueryItem(name: "state", value: state)]
        guard let redirectURL = redirect.url?.absoluteString else { throw AuthError.notConfigured }
        let pending = PendingPKCERequest(
            state: state,
            verifier: verifier,
            redirectURL: redirectURL,
            createdAt: Date(),
            flow: .magicLink
        )
        // Persist before delivery. If the request acknowledgement is lost, an
        // arriving link still has its verifier after an app restart.
        try keychain.savePendingRequest(pending)

        var endpoint = URLComponents(url: auth.url.appendingPathComponent("auth/v1/otp"), resolvingAgainstBaseURL: false)!
        endpoint.queryItems = [URLQueryItem(name: "redirect_to", value: redirectURL)]
        guard let url = endpoint.url else { throw AuthError.notConfigured }
        let body: [String: Any] = [
            "email": cleanEmail,
            "create_user": false,
            "gotrue_meta_security": [:],
            "code_challenge": pkceChallenge(verifier),
            "code_challenge_method": "s256"
        ]
        let (data, response) = try await request(
            url: url,
            method: "POST",
            body: JSONSerialization.data(withJSONObject: body),
            publishableKey: auth.key
        )
        guard data.count <= 64 * 1024 else { throw AuthError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            // Preserve pending state because delivery may have succeeded while
            // the response was lost or an intermediary returned an error.
            throw AuthError.deliveryUnconfirmed
        }
    }

    func handleCallback(url: URL) async throws -> GoalflowSessionProfile {
        guard Self.isExpectedCallbackURL(url), url.fragment == nil else {
            throw AuthError.invalidCallback
        }
        let pending = try keychain.readPendingRequest()
        guard let pending,
              pending.flow == .magicLink,
              pending.createdAt >= Date().addingTimeInterval(-15 * 60),
              pending.verifier.count >= 43, pending.verifier.count <= 128 else {
            throw AuthError.callbackNotRequested
        }
        var expectedRedirect = URLComponents(string: MacCloudConfiguration.authRedirectURL)!
        expectedRedirect.queryItems = [URLQueryItem(name: "state", value: pending.state)]
        guard pending.redirectURL == expectedRedirect.url?.absoluteString else {
            throw AuthError.callbackNotRequested
        }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let codes = components?.queryItems?.filter { $0.name == "code" }.compactMap(\.value) ?? []
        let states = components?.queryItems?.filter { $0.name == "state" }.compactMap(\.value) ?? []
        guard codes.count == 1, states.count == 1,
              !codes[0].isEmpty, codes[0].count <= 2_048,
              timingSafeEqual(states[0], pending.state) else {
            throw AuthError.invalidCallback
        }
        let auth = try requireAuthenticationConfiguration()
        var endpoint = URLComponents(url: auth.url.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false)!
        endpoint.queryItems = [URLQueryItem(name: "grant_type", value: "pkce")]
        guard let tokenURL = endpoint.url else { throw AuthError.notConfigured }
        let body = try JSONSerialization.data(withJSONObject: [
            "auth_code": codes[0],
            "code_verifier": pending.verifier
        ])
        let (data, response) = try await request(
            url: tokenURL,
            method: "POST",
            body: body,
            publishableKey: auth.key
        )
        guard (200..<300).contains(response.statusCode) else {
            if Self.isRetryable(response.statusCode) { throw AuthError.transient }
            try keychain.clearPendingRequest()
            throw AuthError.invalidOrExpiredLink
        }
        let session = try parseNativeSessionResponse(data, configuration: configuration)
        try keychain.save(session)
        try keychain.clearPendingRequest()
        NotificationCenter.default.post(name: .authDidChange, object: nil)
        return try await validateCurrentSession()
    }

    func validateCurrentSession() async throws -> GoalflowSessionProfile {
        let auth = try requireAuthenticationConfiguration()
        guard let apiOrigin = configuration.apiOrigin,
              let url = URL(string: "/api/v1/session", relativeTo: apiOrigin)?.absoluteURL else {
            throw AuthError.notConfigured
        }
        let session = try await keychain.currentSession(configuration: configuration, urlSession: urlSession)
        let (data, response) = try await request(
            url: url,
            method: "GET",
            body: nil,
            publishableKey: auth.key,
            bearerToken: session.accessToken
        )
        let current = try keychain.read()
        guard current?.userId == session.userId else { throw AuthError.sessionChanged }
        if response.statusCode == 401 || response.statusCode == 403 {
            try keychain.clearIfAccessTokenMatches(session.accessToken)
            NotificationCenter.default.post(name: .authDidChange, object: nil)
            throw AuthError.revoked
        }
        guard (200..<300).contains(response.statusCode), data.count <= 64 * 1024,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let user = object["user"] as? [String: Any],
              let userId = user["id"] as? String,
              let email = user["email"] as? String,
              let role = user["role"] as? String,
              user["status"] as? String == "active",
              let assuranceLevel = object["assuranceLevel"] as? String,
              userId.lowercased() == session.userId else {
            if Self.isRetryable(response.statusCode) { throw AuthError.transient }
            throw AuthError.invalidResponse
        }
        return GoalflowSessionProfile(
            userId: userId.lowercased(),
            email: email,
            role: role,
            assuranceLevel: assuranceLevel
        )
    }

    func completeMFA(code: String) async throws -> GoalflowSessionProfile {
        let cleanCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanCode.range(of: #"^[0-9]{6}$"#, options: .regularExpression) != nil else {
            throw AuthError.invalidMFACode
        }
        let auth = try requireAuthenticationConfiguration()
        let session = try await keychain.currentSession(configuration: configuration, urlSession: urlSession)
        let userURL = auth.url.appendingPathComponent("auth/v1/user")
        let (userData, userResponse) = try await request(
            url: userURL,
            method: "GET",
            body: nil,
            publishableKey: auth.key,
            bearerToken: session.accessToken
        )
        guard (200..<300).contains(userResponse.statusCode),
              let user = try? JSONSerialization.jsonObject(with: userData) as? [String: Any],
              let factors = user["factors"] as? [[String: Any]],
              let factorId = factors.first(where: {
                  $0["factor_type"] as? String == "totp" && $0["status"] as? String == "verified"
              })?["id"] as? String,
              UUID(uuidString: factorId) != nil else {
            if userResponse.statusCode == 401 || userResponse.statusCode == 403 {
                try keychain.clearIfAccessTokenMatches(session.accessToken)
                NotificationCenter.default.post(name: .authDidChange, object: nil)
                throw AuthError.revoked
            }
            throw AuthError.mfaNotEnrolled
        }
        let factorURL = auth.url.appendingPathComponent("auth/v1/factors/\(factorId)")
        let challengeURL = factorURL.appendingPathComponent("challenge")
        let (challengeData, challengeResponse) = try await request(
            url: challengeURL,
            method: "POST",
            body: JSONSerialization.data(withJSONObject: ["factorId": factorId]),
            publishableKey: auth.key,
            bearerToken: session.accessToken
        )
        guard (200..<300).contains(challengeResponse.statusCode),
              let challenge = try? JSONSerialization.jsonObject(with: challengeData) as? [String: Any],
              let challengeId = challenge["id"] as? String, UUID(uuidString: challengeId) != nil else {
            if challengeResponse.statusCode == 401 || challengeResponse.statusCode == 403 {
                try keychain.clearIfAccessTokenMatches(session.accessToken)
                NotificationCenter.default.post(name: .authDidChange, object: nil)
                throw AuthError.revoked
            }
            throw Self.isRetryable(challengeResponse.statusCode) ? AuthError.transient : AuthError.invalidMFACode
        }
        let verifyURL = factorURL.appendingPathComponent("verify")
        let (verifyData, verifyResponse) = try await request(
            url: verifyURL,
            method: "POST",
            body: JSONSerialization.data(withJSONObject: ["challenge_id": challengeId, "code": cleanCode]),
            publishableKey: auth.key,
            bearerToken: session.accessToken
        )
        guard (200..<300).contains(verifyResponse.statusCode) else {
            if verifyResponse.statusCode == 401 || verifyResponse.statusCode == 403 {
                try keychain.clearIfAccessTokenMatches(session.accessToken)
                NotificationCenter.default.post(name: .authDidChange, object: nil)
                throw AuthError.revoked
            }
            throw Self.isRetryable(verifyResponse.statusCode) ? AuthError.transient : AuthError.invalidMFACode
        }
        let elevated = try parseNativeSessionResponse(
            verifyData,
            configuration: configuration,
            fallbackRefreshToken: session.refreshToken,
            expectedUserId: session.userId
        )
        guard elevated.assuranceLevel == "aal2" else { throw AuthError.invalidResponse }
        try keychain.save(elevated)
        NotificationCenter.default.post(name: .authDidChange, object: nil)
        let profile = try await validateCurrentSession()
        guard !profile.requiresMFA else { throw AuthError.invalidResponse }
        return profile
    }

    func signOut() async throws {
        let current = try keychain.read()
        // Stop authenticated requests first. Local task files and the durable
        // outbox are deliberately untouched.
        try keychain.clear()
        NotificationCenter.default.post(name: .authDidChange, object: nil)
        guard let current else { return }
        let auth = try requireAuthenticationConfiguration()
        var endpoint = URLComponents(url: auth.url.appendingPathComponent("auth/v1/logout"), resolvingAgainstBaseURL: false)!
        endpoint.queryItems = [URLQueryItem(name: "scope", value: "local")]
        guard let url = endpoint.url else { throw AuthError.remoteLogoutUnconfirmed }
        do {
            let (_, response) = try await request(
                url: url,
                method: "POST",
                body: nil,
                publishableKey: auth.key,
                bearerToken: current.accessToken
            )
            guard (200..<300).contains(response.statusCode) || [401, 403, 404].contains(response.statusCode) else {
                throw AuthError.remoteLogoutUnconfirmed
            }
        } catch {
            throw AuthError.remoteLogoutUnconfirmed
        }
    }

    static func isExpectedCallbackURL(_ url: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return components.scheme?.lowercased() == "goalflow"
            && components.host?.lowercased() == "auth"
            && components.path == "/callback"
            && components.user == nil
            && components.password == nil
            && components.port == nil
            && components.fragment == nil
    }

    private func requireAuthenticationConfiguration() throws -> (url: URL, key: String) {
        guard configuration.isCloudConfigured,
              let url = configuration.supabaseURL,
              let key = configuration.publishableKey else { throw AuthError.notConfigured }
        return (url, key)
    }

    private func request(
        url: URL,
        method: String,
        body: Data?,
        publishableKey: String,
        bearerToken: String? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let bearerToken { request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization") }
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        request.httpBody = body
        do {
            let (data, response) = try await urlSession.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw AuthError.transient }
            return (data, http)
        } catch let error as AuthError {
            throw error
        } catch {
            throw AuthError.transient
        }
    }

    private func secureRandomValue() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw AuthError.randomnessUnavailable
        }
        return Data(bytes).base64URLEncodedString()
    }

    private static func isRetryable(_ status: Int) -> Bool {
        status >= 500 || [408, 425, 429].contains(status)
    }
}

enum AuthError: Error, LocalizedError {
    case notConfigured
    case invalidEmail
    case deliveryUnconfirmed
    case invalidCallback
    case callbackNotRequested
    case invalidOrExpiredLink
    case invalidResponse
    case transient
    case revoked
    case sessionChanged
    case randomnessUnavailable
    case mfaNotEnrolled
    case invalidMFACode
    case remoteLogoutUnconfirmed

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Cloud authentication is not configured for this build."
        case .invalidEmail: return "Enter a valid email address."
        case .deliveryUnconfirmed: return "Sign-in delivery could not be confirmed. Use the link if it arrives, or request a new one."
        case .invalidCallback: return "The sign-in callback was invalid. Request a new link."
        case .callbackNotRequested: return "This sign-in link was not requested on this Mac, or it expired."
        case .invalidOrExpiredLink: return "The sign-in link is invalid or expired. Request a new link."
        case .invalidResponse: return "The authentication service returned invalid data. Local changes were not modified."
        case .transient: return "Authentication is temporarily unavailable. Local changes remain on this Mac."
        case .revoked: return "This cloud session was revoked or the account is inactive. Local changes remain on this Mac."
        case .sessionChanged: return "The account changed while authentication was being verified."
        case .randomnessUnavailable: return "A secure sign-in request could not be created."
        case .mfaNotEnrolled: return "The owner account has no verified authenticator factor. Enroll MFA in the web app first."
        case .invalidMFACode: return "The authenticator code was not accepted."
        case .remoteLogoutUnconfirmed: return "Signed out on this Mac, but server sign-out could not be confirmed."
        }
    }
}

extension Notification.Name {
    static let authDidChange = Notification.Name("goalflow.authDidChange")
}

private final class NoRedirectURLSessionDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
