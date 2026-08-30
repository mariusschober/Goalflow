import Foundation
import CryptoKit
import AuthenticationServices

final class SupabaseAuthService: NSObject, @unchecked Sendable {
    static let shared = SupabaseAuthService()
    private let supabaseUrl: String
    private let anonKey: String
    private var verifier: String?
    private var state: String?
    private var session: ASWebAuthenticationSession?

    init(supabaseUrl: String? = nil, anonKey: String? = nil) {
        let info = Bundle.main.infoDictionary
        self.supabaseUrl = supabaseUrl ?? (info?["SUPABASE_URL"] as? String) ?? UserDefaults.standard.string(forKey: "supabase_url") ?? ""
        self.anonKey = anonKey ?? (info?["SUPABASE_ANON_KEY"] as? String) ?? UserDefaults.standard.string(forKey: "supabase_anon_key") ?? ""
    }

    var isConfigured: Bool { !supabaseUrl.isEmpty && !anonKey.isEmpty }

    private func generateVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let secStatus = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        if secStatus != errSecSuccess { bytes = (0..<32).map { _ in UInt8.random(in: 0...255) } }
        return Data(bytes).base64URLEncodedString()
    }

    private func challenge(for verifier: String) -> String {
        let data = Data(verifier.utf8)
        let hash = SHA256.hash(data: data)
        return Data(hash).base64URLEncodedString()
    }

    // MARK: - Magic link

    func requestMagicLink(email: String) async throws {
        guard isConfigured else { throw AuthError.notConfigured }
        guard let url = URL(string: "\(supabaseUrl)/auth/v1/otp") else { throw AuthError.requestFailed("Invalid URL") }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "email": email,
            "create_user": false,
            "gotrue_meta_security": [:],
            "options": ["redirect_to": "goalflow://auth/callback"]
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "unknown"
            throw AuthError.requestFailed(msg)
        }
    }

    // MARK: - Browser auth

    func startBrowserAuth(provider: String = "custom:telegram", anchor: ASPresentationAnchor?) {
        guard isConfigured else { return }
        let v = generateVerifier()
        let c = challenge(for: v)
        let s = UUID().uuidString
        verifier = v; state = s
        guard var comps = URLComponents(string: "\(supabaseUrl)/auth/v1/authorize") else { return }
        comps.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "redirect_to", value: "goalflow://auth/callback"),
            URLQueryItem(name: "code_challenge", value: c),
            URLQueryItem(name: "code_challenge_method", value: "s256"),
            URLQueryItem(name: "state", value: s)
        ]
        guard let url = comps.url else { return }
        let sess = ASWebAuthenticationSession(url: url, callbackURLScheme: "goalflow") { callback, err in
            guard let cb = callback else { return }
            Task { await self.handleCallback(url: cb) }
        }
        if let anchor = anchor { sess.presentationContextProvider = PresentationContext(anchor: anchor) }
        sess.start()
        session = sess
    }

    func handleCallback(url: URL) async {
        // url is goalflow://auth/callback?code=...&state=... or #access_token=...
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        // Check PKCE code
        if let code = comps?.queryItems?.first(where: { $0.name == "code" })?.value,
           let st = comps?.queryItems?.first(where: { $0.name == "state" })?.value,
           st == state, let v = verifier {
            await exchangeCode(code: code, verifier: v)
            verifier = nil; state = nil
            return
        }
        // Implicit fragment
        if let frag = url.fragment {
            var dict: [String: String] = [:]
            for pair in frag.split(separator: "&") {
                let kv = pair.split(separator: "=", maxSplits: 1)
                if kv.count == 2 { dict[String(kv[0])] = String(kv[1]).removingPercentEncoding }
            }
            if let access = dict["access_token"], let refresh = dict["refresh_token"] {
                let expiresIn = Int(dict["expires_in"] ?? "3600") ?? 3600
                let session = NativeSession(accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(TimeInterval(expiresIn)), userId: nil)
                try? KeychainSessionStore().save(session)
                NotificationCenter.default.post(name: .authDidChange, object: nil)
            }
        }
    }

    private func exchangeCode(code: String, verifier: String) async {
        guard isConfigured else { return }
        guard let url = URL(string: "\(supabaseUrl)/auth/v1/token?grant_type=pkce") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["auth_code": code, "code_verifier": verifier]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return }
            struct R: Codable { var access_token: String; var refresh_token: String; var expires_in: Int; var user: U?; struct U: Codable { var id: String } }
            let r = try JSONDecoder().decode(R.self, from: data)
            let sess = NativeSession(accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: Date().addingTimeInterval(TimeInterval(r.expires_in)), userId: r.user?.id)
            try? KeychainSessionStore().save(sess)
            NotificationCenter.default.post(name: .authDidChange, object: nil)
        } catch { print("[Auth] exchange failed \(error)") }
    }
}

enum AuthError: Error, LocalizedError {
    case notConfigured, requestFailed(String)
    var errorDescription: String? {
        switch self { case .notConfigured: return "Supabase not configured"; case .requestFailed(let s): return s }
    }
}

extension Notification.Name { static let authDidChange = Notification.Name("goalflow.authDidChange") }

private class PresentationContext: NSObject, ASWebAuthenticationPresentationContextProviding {
    let anchor: ASPresentationAnchor
    init(anchor: ASPresentationAnchor) { self.anchor = anchor }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
