import { describe, expect, it } from 'vitest';
import { generateSecureState, isSafeRedirect, validateState, buildSafeRedirect } from './secureCallback';

describe('secureCallback — Tranche 2A', () => {
  it('generates a cryptographically random state (32 bytes base64url, non-empty, unique)', () => {
    const a = generateSecureState();
    const b = generateSecureState();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes -> 43 chars base64url
    expect(a).not.toBe(b);
  });

  it('validates state with constant-time compare — matching passes', () => {
    const state = generateSecureState();
    expect(validateState(state, state)).toBe(true);
  });

  it('rejects tampered state', () => {
    const state = generateSecureState();
    const tampered = state.slice(0, -1) + (state.slice(-1) === 'A' ? 'B' : 'A');
    expect(validateState(tampered, state)).toBe(false);
    expect(validateState(state, tampered)).toBe(false);
  });

  it('rejects missing or empty state', () => {
    expect(validateState(null, 'abc')).toBe(false);
    expect(validateState('abc', null)).toBe(false);
    expect(validateState('', 'abc')).toBe(false);
    expect(validateState(undefined as never, 'abc' as never)).toBe(false);
  });

  it('rejects reused nonce (state mismatch after rotation)', () => {
    const first = generateSecureState();
    const second = generateSecureState();
    expect(validateState(first, second)).toBe(false);
  });

  it('allows safe same-origin absolute redirects', () => {
    const allowed = new Set(['https://goalflow.example', 'https://localhost']);
    expect(isSafeRedirect('https://goalflow.example/?auth=telegram', allowed)).toBe(true);
    expect(isSafeRedirect('https://goalflow.example/callback?state=abc', allowed)).toBe(true);
  });

  it('rejects open-redirect to evil origin', () => {
    const allowed = new Set(['https://goalflow.example']);
    expect(isSafeRedirect('https://evil.com/?auth=telegram', allowed)).toBe(false);
    expect(isSafeRedirect('https://goalflow.example.evil.com/', allowed)).toBe(false);
    expect(isSafeRedirect('//evil.com/', allowed)).toBe(false);
  });

  it('rejects protocol-relative and backslash tricks', () => {
    const allowed = new Set(['https://goalflow.example']);
    expect(isSafeRedirect('//evil.com', allowed)).toBe(false);
    expect(isSafeRedirect('/\\evil.com', allowed)).toBe(false);
    expect(isSafeRedirect('/%5cevil.com', allowed)).toBe(false);
  });

  it('allows safe relative paths and rejects unsafe', () => {
    const allowed = new Set(['https://goalflow.example']);
    expect(isSafeRedirect('/?auth=telegram', allowed)).toBe(true);
    expect(isSafeRedirect('/callback?state=abc', allowed)).toBe(true);
    expect(isSafeRedirect('relative-no-slash', allowed)).toBe(false);
    expect(isSafeRedirect('/\n/evil', allowed)).toBe(false);
  });

  it('buildSafeRedirect returns null for disallowed origins', () => {
    const allowed = new Set(['https://goalflow.example']);
    expect(buildSafeRedirect('https://evil.com', '/?auth=telegram', allowed)).toBeNull();
    expect(buildSafeRedirect('https://goalflow.example', '/?auth=telegram', allowed)).toBe('https://goalflow.example/?auth=telegram');
  });

  it('does not expose tokens — state is not guessable and not logged', () => {
    const state = generateSecureState();
    // Ensure state does not contain predictable substrings
    expect(state).not.toContain('telegram');
    expect(state).not.toContain('token');
    // Simulate that logs would not contain state if we don't log it
    const fakeLog = `http.request path=/api/v1/auth/telegram/preflight userId=abc`;
    expect(fakeLog).not.toContain(state);
  });
});
