import SwiftUI

struct SignInView: View {
    @State private var email = ""
    @State private var message = ""
    @State private var isSending = false
    @State private var mfaCode = ""
    @State private var requiresMFA = false
    var onClose: (() -> Void)?

    private let auth = SupabaseAuthService.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Sign in").font(.system(size: 16, weight: .semibold, design: .rounded))
                Spacer()
                if let close = onClose {
                    Button(action: { close() }) { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }.buttonStyle(.plain)
                }
            }
            Text("Enter your approved Goalflow email to receive a device-bound PKCE sign-in link.")
                .font(.system(size: 11, weight: .regular)).foregroundStyle(.secondary).lineLimit(3)

            HStack(spacing: 8) {
                TextField("email@example.com", text: $email).textFieldStyle(.roundedBorder).font(.system(size: 13))
                Button(action: { Task { await sendLink() } }) {
                    if isSending { ProgressView().scaleEffect(0.7) } else { Text("Send link").font(.system(size: 12, weight: .bold, design: .rounded)) }
                }.buttonStyle(.borderedProminent).controlSize(.small).disabled(email.isEmpty || isSending)
            }
            if !auth.isConfigured {
                Text(auth.configurationProblem ?? "Cloud authentication is not configured. Local changes remain on this Mac.")
                    .font(.system(size: 10, weight: .medium)).foregroundStyle(.orange).lineLimit(2)
            }

            if requiresMFA {
                Divider()
                Text("Owner verification")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                HStack(spacing: 8) {
                    SecureField("6-digit authenticator code", text: $mfaCode)
                        .textFieldStyle(.roundedBorder)
                    Button("Verify") { Task { await verifyMFA() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(mfaCode.count != 6 || isSending)
                }
            }

            if !message.isEmpty {
                Text(message).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary).lineLimit(2)
            }
            Text("Closing this panel keeps the app local-first; it never pretends that cloud synchronization is active.")
                .font(.system(size: 10, weight: .regular)).foregroundStyle(.secondary).lineLimit(2)
        }.padding(16).frame(width: 360)
         .background(RoundedRectangle(cornerRadius: 14).fill(.ultraThinMaterial))
         .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.primary.opacity(0.08), lineWidth: 1))
         .task { await refreshSessionState() }
         .onReceive(NotificationCenter.default.publisher(for: .authDidChange)) { _ in
             Task { await refreshSessionState() }
         }
    }

    private func sendLink() async {
        isSending = true; defer { isSending = false }
        do {
            try await auth.requestMagicLink(email: email)
            message = "Link sent — check email, then click to return via goalflow://auth/callback"
        } catch {
            message = "Failed: \(error.localizedDescription)"
        }
    }

    private func refreshSessionState() async {
        guard auth.isConfigured else { return }
        do {
            let profile = try await auth.validateCurrentSession()
            requiresMFA = profile.requiresMFA
            if !profile.requiresMFA {
                message = "Signed in as \(profile.email)."
                onClose?()
            }
        } catch KeychainError.noSession {
            requiresMFA = false
        } catch {
            message = error.localizedDescription
        }
    }

    private func verifyMFA() async {
        isSending = true; defer { isSending = false }
        do {
            let profile = try await auth.completeMFA(code: mfaCode)
            requiresMFA = profile.requiresMFA
            message = "Signed in as \(profile.email)."
            onClose?()
        } catch {
            message = error.localizedDescription
        }
    }
}
