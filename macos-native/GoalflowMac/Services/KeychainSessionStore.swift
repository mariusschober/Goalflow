import Foundation
import Security

struct NativeSession: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userId: String
    var sessionId: String
    var assuranceLevel: String
}

struct PendingPKCERequest: Codable, Equatable, Sendable {
    enum Flow: String, Codable, Sendable { case magicLink, browser }
    var state: String
    var verifier: String
    var redirectURL: String
    var createdAt: Date
    var flow: Flow
}

struct AccessTokenClaims: Equatable, Sendable {
    var issuer: String
    var subject: String
    var sessionId: String
    var expiresAt: Date
    var assuranceLevel: String
    var hasAuthenticatedAudience: Bool
}

func parseAccessTokenClaims(_ token: String) -> AccessTokenClaims? {
    let parts = token.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 3,
          let data = decodeBase64URL(String(parts[1])),
          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let issuer = payload["iss"] as? String,
          let subject = payload["sub"] as? String,
          let sessionId = payload["session_id"] as? String,
          UUID(uuidString: subject) != nil,
          UUID(uuidString: sessionId) != nil,
          let expiresAtSeconds = (payload["exp"] as? NSNumber)?.doubleValue else { return nil }
    let audience: Bool
    if let value = payload["aud"] as? String {
        audience = value == "authenticated"
    } else if let values = payload["aud"] as? [String] {
        audience = values.contains("authenticated")
    } else {
        audience = false
    }
    return AccessTokenClaims(
        issuer: issuer.trimmingCharacters(in: CharacterSet(charactersIn: "/")),
        subject: subject.lowercased(),
        sessionId: sessionId.lowercased(),
        expiresAt: Date(timeIntervalSince1970: expiresAtSeconds),
        assuranceLevel: payload["aal"] as? String ?? "aal1",
        hasAuthenticatedAudience: audience
    )
}

func parseNativeSessionResponse(
    _ data: Data,
    configuration: MacCloudConfiguration,
    fallbackRefreshToken: String? = nil,
    expectedUserId: String? = nil
) throws -> NativeSession {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let accessToken = object["access_token"] as? String, !accessToken.isEmpty,
          let expiresIn = (object["expires_in"] as? NSNumber)?.doubleValue,
          expiresIn >= 60, expiresIn <= 86_400,
          let claims = parseAccessTokenClaims(accessToken),
          let supabaseURL = configuration.supabaseURL else {
        throw KeychainError.invalidSession
    }
    guard let userId = (object["user"] as? [String: Any])?["id"] as? String else {
        throw KeychainError.invalidSession
    }
    guard UUID(uuidString: userId) != nil,
          claims.subject == userId.lowercased(),
          expectedUserId.map({ $0.lowercased() == userId.lowercased() }) ?? true,
          claims.issuer == supabaseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/auth/v1",
          claims.hasAuthenticatedAudience,
          claims.expiresAt > Date() else {
        throw KeychainError.invalidSession
    }
    let responseRefreshToken = (object["refresh_token"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let refreshToken = responseRefreshToken?.isEmpty == false ? responseRefreshToken : fallbackRefreshToken
    guard let refreshToken, !refreshToken.isEmpty else { throw KeychainError.invalidSession }
    return NativeSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresAt: min(Date().addingTimeInterval(expiresIn), claims.expiresAt),
        userId: userId.lowercased(),
        sessionId: claims.sessionId,
        assuranceLevel: claims.assuranceLevel
    )
}

final class KeychainSessionStore: AuthGateway, @unchecked Sendable {
    private let service: String
    private let sessionAccount: String
    private let pendingAccount: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(
        service: String = "tsurfing",
        sessionAccount: String = "session",
        pendingAccount: String = "pending-pkce"
    ) {
        precondition(!service.isEmpty && !sessionAccount.isEmpty && !pendingAccount.isEmpty)
        self.service = service
        self.sessionAccount = sessionAccount
        self.pendingAccount = pendingAccount
    }

    var isAuthenticated: Bool {
        guard let session = try? read() else { return false }
        return session.expiresAt > Date().addingTimeInterval(60)
    }

    func read() throws -> NativeSession? {
        guard let data = try readData(account: sessionAccount) else { return nil }
        guard let session = try? decoder.decode(NativeSession.self, from: data),
              UUID(uuidString: session.userId) != nil,
              UUID(uuidString: session.sessionId) != nil,
              !session.accessToken.isEmpty, !session.refreshToken.isEmpty,
              let claims = parseAccessTokenClaims(session.accessToken),
              claims.subject == session.userId,
              claims.sessionId == session.sessionId else {
            throw KeychainError.corruptSession
        }
        return session
    }

    func save(_ session: NativeSession) throws {
        guard UUID(uuidString: session.userId) != nil,
              UUID(uuidString: session.sessionId) != nil,
              !session.accessToken.isEmpty, !session.refreshToken.isEmpty,
              let claims = parseAccessTokenClaims(session.accessToken),
              claims.subject == session.userId,
              claims.sessionId == session.sessionId else { throw KeychainError.invalidSession }
        try writeData(encoder.encode(session), account: sessionAccount)
        guard try read() == session else { throw KeychainError.readBackMismatch }
    }

    func clear() throws {
        try delete(account: sessionAccount)
        guard try read() == nil else { throw KeychainError.deleteFailed(errSecInternalError) }
    }

    func clearIfAccessTokenMatches(_ accessToken: String) throws {
        if try read()?.accessToken == accessToken { try clear() }
    }

    func readPendingRequest() throws -> PendingPKCERequest? {
        guard let data = try readData(account: pendingAccount) else { return nil }
        guard let pending = try? decoder.decode(PendingPKCERequest.self, from: data) else {
            throw KeychainError.corruptPendingRequest
        }
        return pending
    }

    func savePendingRequest(_ pending: PendingPKCERequest) throws {
        try writeData(encoder.encode(pending), account: pendingAccount)
        guard try readPendingRequest() == pending else { throw KeychainError.readBackMismatch }
    }

    func clearPendingRequest() throws { try delete(account: pendingAccount) }

    func currentSession(
        configuration: MacCloudConfiguration,
        urlSession: URLSession = URLSession.shared
    ) async throws -> NativeSession {
        guard let current = try read() else { throw KeychainError.noSession }
        if current.expiresAt > Date().addingTimeInterval(5 * 60) { return current }
        if current.expiresAt > Date().addingTimeInterval(60) {
            do { return try await refresh(current, configuration: configuration, urlSession: urlSession) }
            catch KeychainError.transient { return current }
        }
        return try await refresh(current, configuration: configuration, urlSession: urlSession)
    }

    private func refresh(
        _ current: NativeSession,
        configuration: MacCloudConfiguration,
        urlSession: URLSession
    ) async throws -> NativeSession {
        guard configuration.isCloudConfigured,
              let supabaseURL = configuration.supabaseURL,
              let key = configuration.publishableKey,
              let url = URL(string: "/auth/v1/token?grant_type=refresh_token", relativeTo: supabaseURL)?.absoluteURL else {
            throw KeychainError.noRefreshConfig
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(key, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": current.refreshToken])
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw KeychainError.transient
        }
        guard let http = response as? HTTPURLResponse else { throw KeychainError.transient }
        guard (200..<300).contains(http.statusCode) else {
            if Self.isRetryable(http.statusCode) { throw KeychainError.transient }
            try clearIfAccessTokenMatches(current.accessToken)
            throw KeychainError.revoked
        }
        let refreshed = try parseNativeSessionResponse(
            data,
            configuration: configuration,
            fallbackRefreshToken: current.refreshToken,
            expectedUserId: current.userId
        )
        try save(refreshed)
        return refreshed
    }

    private static func isRetryable(_ status: Int) -> Bool {
        status >= 500 || [408, 425, 429].contains(status)
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true
        ]
    }

    private func readData(account: String) throws -> Data? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw KeychainError.readFailed(status) }
        return data
    }

    private func writeData(_ data: Data, account: String) throws {
        let query = baseQuery(account: account)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var addition = query
            addition.merge(attributes) { _, replacement in replacement }
            status = SecItemAdd(addition as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError.saveFailed(status) }
    }

    private func delete(account: String) throws {
        let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError.deleteFailed(status) }
    }
}

enum KeychainError: Error, LocalizedError {
    case saveFailed(OSStatus)
    case readFailed(OSStatus)
    case deleteFailed(OSStatus)
    case readBackMismatch
    case corruptSession
    case corruptPendingRequest
    case invalidSession
    case noSession
    case noRefreshConfig
    case transient
    case revoked

    var errorDescription: String? {
        switch self {
        case .saveFailed(let status): return "The secure session could not be saved (\(status))."
        case .readFailed(let status): return "The secure session could not be read (\(status))."
        case .deleteFailed(let status): return "The secure session could not be removed (\(status))."
        case .readBackMismatch: return "Secure storage did not verify its write."
        case .corruptSession: return "Secure session data is damaged. Local tasks were not changed."
        case .corruptPendingRequest: return "The pending sign-in request is damaged. Request a new link."
        case .invalidSession: return "The authentication response did not contain a valid Tsurfing session."
        case .noSession: return "Sign in to synchronize. Local changes remain on this Mac."
        case .noRefreshConfig: return "Session refresh is not safely configured."
        case .transient: return "Session refresh is temporarily unavailable. Local changes remain pending."
        case .revoked: return "This cloud session has expired or was revoked. Local changes remain on this Mac."
        }
    }
}
