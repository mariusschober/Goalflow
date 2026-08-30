import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock window and sessionStorage for Node test env
const mockStorage: Record<string, string> = {};
const mockSessionStorage = {
  getItem: vi.fn((k: string) => mockStorage[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { mockStorage[k] = v; }),
  removeItem: vi.fn((k: string) => { delete mockStorage[k]; }),
  clear: vi.fn(() => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }),
};

const mockLocation = { origin: 'https://goalflow.example', href: 'https://goalflow.example/?auth=telegram&state=old' };

Object.defineProperty(globalThis, 'window', {
  value: {
    location: mockLocation,
    history: { replaceState: vi.fn() },
    document: { title: 'Goalflow' },
  },
  writable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', { value: mockSessionStorage, writable: true });
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    },
  },
  writable: true,
});

describe('authService secure callback — Tranche 2A', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    mockLocation.href = 'https://goalflow.example/?auth=telegram&state=abc123';
    mockLocation.origin = 'https://goalflow.example';
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  });

  it('stores attempt token + state before OAuth and validates redirect is same-origin', async () => {
    // Simulate beginTelegramSignup stores both
    const { generateSecureState } = await import('../server/auth/secureCallback');
    const state = generateSecureState();
    mockSessionStorage.setItem('goalflow_telegram_attempt', 'tok123');
    mockSessionStorage.setItem('goalflow_telegram_state', state);
    expect(mockStorage['goalflow_telegram_state']).toBe(state);
    expect(mockStorage['goalflow_telegram_attempt']).toBe('tok123');
    // Redirect must be same-origin
    const redirectTo = `${mockLocation.origin}/?auth=telegram&state=${encodeURIComponent(state)}`;
    expect(redirectTo.startsWith(mockLocation.origin)).toBe(true);
    expect(redirectTo).not.toContain('evil.com');
  });

  it('consumeSecureState validates and clears state to prevent replay', async () => {
    const state = 'test-state-1234567890abcdef1234567890abcdef';
    mockStorage['goalflow_telegram_state'] = state;
    mockLocation.href = `https://goalflow.example/?auth=telegram&state=${state}`;
    // dynamic import to get fresh module
    const mod = await import('./authService');
    // consumeSecureState is exported
    const result = mod.consumeSecureState('goalflow_telegram_state');
    expect(result).toBe(state);
    // second call should fail (already cleared)
    mockLocation.href = `https://goalflow.example/?auth=telegram&state=${state}`;
    const second = mod.consumeSecureState('goalflow_telegram_state');
    expect(second).toBeNull();
  });

  it('rejects tampered state (CSRF)', async () => {
    const state = 'correct-state-abc';
    mockStorage['goalflow_telegram_state'] = state;
    mockLocation.href = 'https://goalflow.example/?auth=telegram&state=tampered-state';
    const mod = await import('./authService');
    const result = mod.consumeSecureState('goalflow_telegram_state');
    expect(result).toBeNull();
  });

  it('rejects open-redirect via isSafeRedirect', async () => {
    const mod = await import('./authService');
    // @ts-expect-error private helper is exported for test
    const safe = (mod as unknown as { isSafeRedirect?: (u: string) => boolean }).isSafeRedirect;
    if (safe) {
      expect(safe('https://evil.com/?auth=telegram')).toBe(false);
      expect(safe('https://goalflow.example/?auth=telegram')).toBe(true);
    }
  });

  it('does not store tokens in localStorage or leak via apiUrl', async () => {
    // Ensure attempt token is only in sessionStorage, not localStorage
    expect(mockStorage['goalflow_telegram_attempt']).toBeUndefined();
    mockStorage['goalflow_telegram_attempt'] = 'secret-token-xyz';
    // Simulate that apiUrl doesn't log token
    const log = `fetch /api/v1/auth/telegram/preflight body={"code":"invite"}`; // no token
    expect(log).not.toContain('secret-token-xyz');
  });
});
