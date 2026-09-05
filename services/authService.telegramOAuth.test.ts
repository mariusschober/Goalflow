import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signInWithOAuth: vi.fn(), linkIdentity: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth })) }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_value');
  vi.stubEnv('VITE_TELEGRAM_OIDC_PROVIDER_ID', 'custom:telegram');
  vi.stubEnv('VITE_API_ORIGIN', 'https://app.tsurfing.test');
  vi.stubEnv('VITE_ENABLE_LOCAL_DEMO', 'false');
  auth.signInWithOAuth.mockReset().mockResolvedValue({ error: null });
  auth.linkIdentity.mockReset().mockResolvedValue({ error: null });
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
  vi.stubGlobal('window', { location: { origin: 'https://app.tsurfing.test' } });
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const options = (callback: string) => ({
  provider: 'custom:telegram',
  options: {
    redirectTo: `https://app.tsurfing.test/?auth=${callback}`,
    scopes: 'openid profile telegram:bot_access'
  }
});

describe('Telegram OIDC protocol selection', () => {
  it('starts sign-in without widget origin or bot_id parameters that redirect to a URL fragment', async () => {
    const { beginTelegramSignIn } = await import('./authService');
    await beginTelegramSignIn();
    expect(auth.signInWithOAuth).toHaveBeenCalledExactlyOnceWith(options('telegram-sign-in'));
  });

  it('starts invited sign-up through the same OIDC path while retaining its opaque activation attempt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      attemptToken: 'A'.repeat(43), provider: 'custom:telegram'
    })));
    const { beginTelegramSignup } = await import('./authService');
    await beginTelegramSignup('synthetic-invite');
    expect(auth.signInWithOAuth).toHaveBeenCalledExactlyOnceWith(options('telegram'));
    expect(sessionStorage.getItem('goalflow_telegram_attempt')).toBe('A'.repeat(43));
  });

  it('links the signed-in account through Supabase identity linking without switching to the widget protocol', async () => {
    const { beginTelegramLink } = await import('./authService');
    await beginTelegramLink();
    expect(auth.linkIdentity).toHaveBeenCalledExactlyOnceWith(options('telegram-link'));
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('goalflow_owner_telegram_link')).toBe('pending');
  });
});
