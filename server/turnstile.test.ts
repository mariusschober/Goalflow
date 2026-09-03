import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from './config';
import { verifyTurnstile } from './turnstile';

afterEach(() => vi.unstubAllGlobals());

describe('Turnstile verification', () => {
  it('does not contact Turnstile when the feature is disabled', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await verifyTurnstile(readConfig({ TURNSTILE_ENABLED: 'false' }), '', '127.0.0.1')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on an upstream error or a production hostname mismatch', async () => {
    const config = readConfig({
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://beta.goalflow.example',
      TURNSTILE_ENABLED: 'true',
      TURNSTILE_SECRET_KEY: 'synthetic-turnstile-secret',
      VITE_TURNSTILE_SITE_KEY: 'synthetic-turnstile-site-key'
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'attacker.example',
      action: 'beta-signup'
    }), { status: 200 })));
    expect(await verifyTurnstile(config, 'synthetic-response')).toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await verifyTurnstile(config, 'synthetic-response')).toBe(false);
  });

  it('accepts only a successful response for the configured production host', async () => {
    const config = readConfig({
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://beta.goalflow.example',
      TURNSTILE_ENABLED: 'true',
      TURNSTILE_SECRET_KEY: 'synthetic-turnstile-secret',
      VITE_TURNSTILE_SITE_KEY: 'synthetic-turnstile-site-key'
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'beta.goalflow.example',
      action: 'beta-signup'
    }), { status: 200 })));
    expect(await verifyTurnstile(config, 'synthetic-response')).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'beta.goalflow.example',
      action: 'unrelated-action'
    }), { status: 200 })));
    expect(await verifyTurnstile(config, 'synthetic-response')).toBe(false);
  });
});
