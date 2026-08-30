// Auth gateway — tranche 1 stub. Real Supabase session (chrome.storage.session + chrome.identity PKCE) in J.

export interface AuthGateway {
  readonly isAuthenticated: boolean;
  readonly userId: string | null;
}

export class StubAuthGateway implements AuthGateway {
  readonly isAuthenticated = false;
  readonly userId: string | null = null;
}
