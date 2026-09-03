import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthMiddleware } from './auth';
import { readConfig } from './config';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

const config = readConfig({
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://beta.goalflow.example',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_value',
  SUPABASE_SECRET_KEY: 'sb_secret_test_value',
  OWNER_USER_ID: '00000000-0000-4000-8000-000000000001'
});

const token = (sessionId: string): string => [
  Buffer.from('{}').toString('base64url'),
  Buffer.from(JSON.stringify({ session_id: sessionId, aal: 'aal1' })).toString('base64url'),
  'synthetic-signature'
].join('.');

const serve = async (active: boolean) => {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.invalid' } },
    error: null
  });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { email: 'a@example.invalid', role: 'beta', status: 'active' },
    error: null
  });
  const admin = {
    rpc: vi.fn().mockResolvedValue({ data: active, error: null }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle })
      })
    })
  } as unknown as SupabaseClient;
  const verifier = { auth: { getUser } } as unknown as SupabaseClient;
  const app = express();
  app.use(createAuthMiddleware(config, admin, verifier));
  app.get('/private', (request, response) => response.json({ user: request.user }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, admin };
};

describe('authenticated API session boundary', () => {
  it('rejects a cryptographically valid token after its Auth session is revoked', async () => {
    const { origin, admin } = await serve(false);
    const response = await fetch(`${origin}/private`, {
      headers: { authorization: `Bearer ${token('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')}` }
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'session_revoked' } });
    expect(admin.rpc).toHaveBeenCalledWith('goalflow_session_is_active', {
      target_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      target_session_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    });
  });

  it('accepts only the profile belonging to the verified token user', async () => {
    const { origin } = await serve(true);
    const response = await fetch(`${origin}/private`, {
      headers: { authorization: `Bearer ${token('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')}` }
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'beta', status: 'active' }
    });
  });

  it('rejects tokens without a valid session_id claim', async () => {
    const { origin, admin } = await serve(true);
    const response = await fetch(`${origin}/private`, {
      headers: { authorization: `Bearer ${token('not-a-uuid')}` }
    });
    expect(response.status).toBe(401);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
