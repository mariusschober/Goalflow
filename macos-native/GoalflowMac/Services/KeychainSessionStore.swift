import Foundation
import Security

struct NativeSession: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userId: String?
}

final class KeychainSessionStore: AuthGateway, @unchecked Sendable {
    private let service = "com.mariusschober.goalflow.mac"
    private let account = "session"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    var isAuthenticated: Bool {
        guard let s = read() else { return false }
        return s.expiresAt > Date().addingTimeInterval(60)
    }

    func read() -> NativeSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseDataProtectionKeychain as String: true
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try? decoder.decode(NativeSession.self, from: data)
    }

    func save(_ session: NativeSession) throws {
        let data = try encoder.encode(session)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        var status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            let addAttrs: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                kSecUseDataProtectionKeychain as String: true
            ]
            status = SecItemAdd(addAttrs as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError.saveFailed(status) }
        // Verify read-back
        guard let read = read(), read.accessToken == session.accessToken else { throw KeychainError.readBackMismatch }
    }

    func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Token refresh

    func currentAccessToken(supabaseUrl: String?, anonKey: String?) async throws -> String {
        guard let s = read() else { throw KeychainError.noSession }
        if s.expiresAt > Date().addingTimeInterval(60) { return s.accessToken }
        // Try refresh
        guard let urlStr = supabaseUrl, let key = anonKey, !urlStr.isEmpty, !key.isEmpty else {
            throw KeychainError.noRefreshConfig
        }
        let url = URL(string: "\(urlStr)/auth/v1/token?grant_type=refresh_token")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = ["refresh_token": s.refreshToken]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            clear()
            throw KeychainError.refreshFailed
        }
        struct Resp: Codable { var access_token: String; var refresh_token: String; var expires_in: Int; var user: CodableUser? }
        struct CodableUser: Codable { var id: String }
        let decoded = try decoder.decode(Resp.self, from: data)
        let newSession = NativeSession(accessToken: decoded.access_token, refreshToken: decoded.refresh_token, expiresAt: Date().addingTimeInterval(TimeInterval(decoded.expires_in)), userId: decoded.user?.id ?? s.userId)
        try save(newSession)
        return newSession.accessToken
    }
}

enum KeychainError: Error, LocalizedError {
    case saveFailed(OSStatus)
    case readBackMismatch
    case noSession
    case noRefreshConfig
    case refreshFailed
    var errorDescription: String? {
        switch self {
        case .saveFailed(let s): return "Keychain save failed \(s)"
        case .readBackMismatch: return "Keychain read-back mismatch"
        case .noSession: return "No session"
        case .noRefreshConfig: return "Missing Supabase config for refresh"
        case .refreshFailed: return "Refresh failed"
        }
    }
}
