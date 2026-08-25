import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const apiOrigin = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');
const configuredTelegramProvider = import.meta.env.VITE_TELEGRAM_OIDC_PROVIDER_ID || 'custom:telegram';
export const telegramProvider = (configuredTelegramProvider.startsWith('custom:')
  ? configuredTelegramProvider
  : `custom:${configuredTelegramProvider}`) as `custom:${string}`;
const localDemo = import.meta.env.DEV && import.meta.env.VITE_ENABLE_LOCAL_DEMO === 'true';
const testBuild = import.meta.env.VITE_TEST_MODE === 'true';
const testCode = import.meta.env.VITE_TEST_CODE || '';
const testAccessStorageKey = 'goalflow-test-access';

export const isTestBuild = (): boolean => testBuild;
export const isLocalDemo = (): boolean => localDemo || testBuild;

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

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : undefined;

export const getSession = async (): Promise<Session | null> => {
  if (localDemo) return null;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
};

export const onSessionChange = (callback: (session: Session | null) => void) => {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
};

export const requestOwnerMagicLink = async (email: string): Promise<void> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin, shouldCreateUser: false }
  });
  if (error) throw error;
};

export const beginTelegramSignup = async (inviteCode: string, captchaToken = ''): Promise<void> => {
  if (!supabase) throw new Error('Authentication is not configured.');
  const response = await fetch(apiUrl('/api/v1/auth/telegram/preflight'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: inviteCode, captchaToken })
  });
  const result = await response.json() as { attemptToken?: string; provider?: string; error?: { message?: string } };
  if (!response.ok || !result.attemptToken) throw new Error(result.error?.message || 'Telegram signup could not be started.');
  sessionStorage.setItem('goalflow_telegram_attempt', result.attemptToken);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: (result.provider || telegramProvider) as never,
    options: {
      redirectTo: `${window.location.origin}/?auth=telegram`,
      scopes: 'openid profile telegram:bot_access'
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
  if (!attemptToken) return !session.user.email;
  const response = await fetch(apiUrl('/api/v1/auth/telegram/activate'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ attemptToken })
  });
  const result = await response.json() as { recoveryEmailRequired?: boolean; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || 'Telegram signup could not be activated.');
  sessionStorage.removeItem('goalflow_telegram_attempt');
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
  if (supabase) await supabase.auth.signOut();
};
