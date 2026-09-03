import { createClient, type AuthChangeEvent, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const apiOrigin = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');
const configuredTelegramProvider = import.meta.env.VITE_TELEGRAM_OIDC_PROVIDER_ID || 'custom:telegram';
export const telegramProvider = (configuredTelegramProvider.startsWith('custom:')
  ? configuredTelegramProvider
  : `custom:${configuredTelegramProvider}`) as `custom:${string}`;
const localDemo = import.meta.env.DEV && import.meta.env.VITE_ENABLE_LOCAL_DEMO === 'true';
const testBuild = import.meta.env.VITE_TEST_MODE === 'true';
const testCode = import.meta.env.VITE_TEST_CODE || '';
const testAccessStorageKey = 'goalflow-test-access';
const emailActivationMetadataKey = 'goalflow_beta_activation_id';

export interface ServerAccount {
  id: string;
  email: string;
  role: 'owner' | 'beta';
  status: 'active';
  assuranceLevel: 'aal1' | 'aal2';
}

export class SessionValidationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'SessionValidationError';
  }
}

export const isTestBuild = (): boolean => testBuild;
export const isLocalDemo = (): boolean => localDemo || testBuild;
export const shouldDisableServiceWorker = (): boolean => localDemo;

export const hasTestAccess = (): boolean => testBuild
  && typeof window !== 'undefined'
  && window.localStorage.getItem(testAccessStorageKey) === 'granted';

export const unlockTestBuild = (code: string): boolean => {
  if (!testBuild || !testCode || code !== testCode || typeof window === 'undefined') return false;
  window.localStorage.setItem(testAccessStorageKey, 'granted');
  return true;
};

export const clearTestAccess = (): void => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(testAccessStorageKey);
};

export const apiUrl = (input: RequestInfo | URL): RequestInfo | URL => {
  if (!apiOrigin) return input;
  const raw = input instanceof URL ? input.href : String(input);
  if (/^[a-z][a-z\d+.-]*:/i.test(raw)) return input;
  return `${apiOrigin}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

export const supabase = supabaseUrl && supabasePublicKey
  ? createClient(supabaseUrl, supabasePublicKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : undefined;

export const getSession = async (): Promise<Session | null> => {
  if (localDemo) return null;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
};

export const onSessionChange = (callback: (session: Session | null, event: AuthChangeEvent) => void) => {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      // Authentication artifacts are removed, but the per-account durable
      // outbox remains intact for a later sign-in and retry.
      try {
        sessionStorage.removeItem('goalflow_telegram_attempt');
        sessionStorage.removeItem('goalflow_telegram_state');
        sessionStorage.removeItem('goalflow_telegram_verifier');
        sessionStorage.removeItem('goalflow_owner_telegram_link');
      } catch {}
    }
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
      // Proactive refresh succeeded, clear any quarantine
    }
    callback(session, event);
  });
  return () => data.subscription.unsubscribe();
};

export const refreshSession = async (): Promise<Session | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return data.session;
};

export const requestOwnerMagicLink = async (email: string): Promise<void> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin, shouldCreateUser: false }
  });
  if (error) throw error;
};

export const registerWithEmail = async (
  email: string,
  password: string,
  inviteCode: string,
  captchaToken = ''
): Promise<{ verificationRequired: boolean }> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  const normalizedEmail = email.trim().toLowerCase();
  const preflight = await fetch(apiUrl('/api/v1/auth/email/preflight'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: normalizedEmail, code: inviteCode.trim(), captchaToken })
  });
  const preflightBody = await preflight.json() as {
    activationId?: string;
    expiresInSeconds?: number;
    error?: { message?: string };
  };
  if (!preflight.ok || !preflightBody.activationId) {
    throw new Error(preflightBody.error?.message || 'Email signup could not be started.');
  }
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/?auth=email`,
      data: { [emailActivationMetadataKey]: preflightBody.activationId }
    }
  });
  if (error) throw error;
  return { verificationRequired: !data.session };
};

export const signInWithEmail = async (email: string, password: string): Promise<void> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/?auth=recovery`
  });
  if (error) throw error;
};

export const updateRecoveredPassword = async (password: string): Promise<void> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  const { error: revokeError } = await supabase.auth.signOut({ scope: 'global' });
  if (revokeError) {
    throw new Error('The password was updated, but other sessions could not be revoked. Sign out all devices before continuing.');
  }
};

export const hasPendingEmailActivation = (session: Session): boolean => {
  const activationId = session.user.user_metadata?.[emailActivationMetadataKey];
  return typeof activationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activationId);
};

export const clearPendingEmailActivation = (): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

export const activateEmailSignup = async (session: Session): Promise<void> => {
  if (!hasPendingEmailActivation(session)) {
    clearPendingEmailActivation();
    throw new SessionValidationError('This verification link has no valid beta activation. Start signup again.', 400, 'activation_rejected');
  }
  const response = await fetch(apiUrl('/api/v1/auth/email/activate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: '{}'
  });
  const result = await response.json() as { error?: { code?: string; message?: string } };
  if (!response.ok) {
    if (response.status < 500) clearPendingEmailActivation();
    throw new SessionValidationError(
      result.error?.message || 'Email signup could not be activated.',
      response.status,
      result.error?.code || 'activation_failed'
    );
  }
  clearPendingEmailActivation();
  // The attempt ID is not a credential and is already consumed server-side.
  // Remove it from future session payloads as a best-effort hygiene step.
  try {
    await supabase?.auth.updateUser({ data: { [emailActivationMetadataKey]: null } });
  } catch {}
};

export const validateServerSession = async (session: Session): Promise<ServerAccount> => {
  const response = await fetch(apiUrl('/api/v1/session'), {
    headers: { authorization: `Bearer ${session.access_token}` }
  });
  const result = await response.json() as {
    user?: Omit<ServerAccount, 'assuranceLevel'>;
    assuranceLevel?: 'aal1' | 'aal2';
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !result.user || !result.assuranceLevel) {
    throw new SessionValidationError(
      result.error?.message || 'Account access could not be verified.',
      response.status,
      result.error?.code || 'session_validation_failed'
    );
  }
  return { ...result.user, assuranceLevel: result.assuranceLevel };
};

const generateState = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
};

const generateCodeVerifier = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const pkceChallenge = async (verifier: string): Promise<string> => {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const beginTelegramSignup = async (inviteCode: string, captchaToken = ''): Promise<void> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await pkceChallenge(codeVerifier);
  const response = await fetch(apiUrl('/api/v1/auth/telegram/preflight'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: inviteCode, captchaToken, state, codeChallenge, codeChallengeMethod: 'S256' })
  });
  const result = await response.json() as { attemptToken?: string; provider?: string; error?: { message?: string } };
  if (!response.ok || !result.attemptToken) throw new Error(result.error?.message || 'Telegram signup could not be started.');
  sessionStorage.setItem('goalflow_telegram_attempt', result.attemptToken);
  sessionStorage.setItem('goalflow_telegram_state', state);
  sessionStorage.setItem('goalflow_telegram_verifier', codeVerifier);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: (result.provider || telegramProvider) as never,
    options: {
      redirectTo: `${window.location.origin}/?auth=telegram`,
      scopes: 'openid profile telegram:bot_access',
      queryParams: {
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      }
    }
  });
  if (error) throw error;
};

export const beginOwnerTelegramLink = async (): Promise<void> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  sessionStorage.setItem('goalflow_owner_telegram_link', 'pending');
  const { error } = await supabase.auth.linkIdentity({
    provider: telegramProvider,
    options: {
      redirectTo: `${window.location.origin}/?auth=telegram-link`,
      scopes: 'openid profile telegram:bot_access'
    }
  });
  if (error) {
    sessionStorage.removeItem('goalflow_owner_telegram_link');
    throw error;
  }
};

export const activateOwnerTelegramLink = async (session: Session): Promise<void> => {
  if (sessionStorage.getItem('goalflow_owner_telegram_link') !== 'pending') return;
  const response = await fetch(apiUrl('/api/v1/account/telegram/link'), {
    method: 'POST',
    headers: { authorization: `Bearer ${session.access_token}` }
  });
  const result = await response.json() as { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || 'Telegram could not be linked to the owner account.');
  sessionStorage.removeItem('goalflow_owner_telegram_link');
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
};

export const activateTelegramSignup = async (session: Session): Promise<boolean> => {
  const attemptToken = sessionStorage.getItem('goalflow_telegram_attempt');
  const oauthState = sessionStorage.getItem('goalflow_telegram_state');
  if (!attemptToken) return !session.user.email;
  const response = await fetch(apiUrl('/api/v1/auth/telegram/activate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ attemptToken, oauthState: oauthState ?? undefined })
  });
  const result = await response.json() as { recoveryEmailRequired?: boolean; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || 'Telegram signup could not be activated.');
  sessionStorage.removeItem('goalflow_telegram_attempt');
  sessionStorage.removeItem('goalflow_telegram_state');
  sessionStorage.removeItem('goalflow_telegram_verifier');
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
  return Boolean(result.recoveryEmailRequired);
};

export const getLocalDemoUser = (): string | null => {
  if (testBuild) return 'test@goalflow.local';
  return localDemo ? (import.meta.env.VITE_OWNER_EMAIL || 'mris@tuta.io') : null;
};

export const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const session = await getSession();
  const token = session?.access_token || (localDemo ? 'local-demo' : undefined);
  if (!token) throw new Error('A signed-in session is required.');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return fetch(apiUrl(input), { ...init, headers });
};

export const logout = async (): Promise<void> => {
  if (supabase) await supabase.auth.signOut({ scope: 'local' });
};

export const logoutEverywhere = async (): Promise<void> => {
  if (supabase) await supabase.auth.signOut({ scope: 'global' });
};
