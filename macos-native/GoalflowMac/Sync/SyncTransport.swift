import Foundation

protocol SyncTransport: Sendable {
    func request(path: String, method: String, headers: [String: String], body: Data?) async throws -> (Data, HTTPURLResponse)
}

final class URLSessionSyncTransport: SyncTransport, @unchecked Sendable {
    private let baseURL: String
    private let keychain: KeychainSessionStore
    private let supabaseUrl: String?
    private let anonKey: String?
    init(baseURL: String? = nil, keychain: KeychainSessionStore = KeychainSessionStore(), supabaseUrl: String? = nil, anonKey: String? = nil) {
        let info = Bundle.main.infoDictionary
        self.baseURL = baseURL ?? (info?["API_ORIGIN"] as? String) ?? "https://app.goalflow.com"
        self.keychain = keychain
        self.supabaseUrl = supabaseUrl ?? (info?["SUPABASE_URL"] as? String)
        self.anonKey = anonKey ?? (info?["SUPABASE_ANON_KEY"] as? String)
    }
    func request(path: String, method: String, headers: [String : String] = [:], body: Data?) async throws -> (Data, HTTPURLResponse) {
        let token: String
        do {
            token = try await keychain.currentAccessToken(supabaseUrl: supabaseUrl, anonKey: anonKey)
        } catch {
            // Try local-demo fallback
            token = "local-demo"
        }
        let urlStr = baseURL.hasSuffix("/") ? String(baseURL.dropLast()) + path : baseURL + path
        guard let url = URL(string: urlStr) else { throw SyncError.validation("Invalid URL") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        for (k,v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        req.httpBody = body
        req.timeoutInterval = 20
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw SyncError.validation("Invalid response") }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw SyncError.validation("AuthenticationExpiredDuringSync")
        }
        return (data, http)
    }
}

final class MockSyncTransport: SyncTransport, @unchecked Sendable {
    var pushHandler: ((Data) async throws -> (Data, HTTPURLResponse))?
    var pullHandler: ((String) async throws -> (Data, HTTPURLResponse))?
    func request(path: String, method: String, headers: [String : String], body: Data?) async throws -> (Data, HTTPURLResponse) {
        if path.hasPrefix("/api/v1/sync/push") {
            if let h = pushHandler, let b = body { return try await h(b) }
        }
        if path.hasPrefix("/api/v1/sync/pull") {
            if let h = pullHandler { return try await h(path) }
        }
        throw SyncError.validation("Mock no handler for \(path)")
    }
}
