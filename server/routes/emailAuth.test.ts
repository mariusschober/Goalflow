import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../config';
import { createEmailAuthRouter } from './emailAuth';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

const config = readConfig({ TURNSTILE_ENABLED: 'false' });
const serve = async (confirmed: boolean, activationId: unknown = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') => {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const admin = { rpc } as unknown as SupabaseClient;
  const verifier = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          email: 'Beta@Example.invalid',
          email_confirmed_at: confirmed ? new Date().toISOString() : null,
          user_metadata: { goalflow_beta_activation_id: activationId }
        } },
        error: null
      })
    }
  } as unknown as SupabaseClient;
  const app = express();
  app.use(express.json());
  app.use('/auth', createEmailAuthRouter(config, admin, verifier));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, rpc };
};

describe('email beta activation', () => {
  it('derives identity and activation state from the verified bearer token', async () => {
    const { origin, rpc } = await serve(true);
    const response = await fetch(`${origin}/auth/email/activate`, {
      method: 'POST',
      headers: { authorization: 'Bearer verified-token', 'content-type': 'application/json' },
      body: JSON.stringify({ activationId: 'forged-id', userId: 'forged-user', email: 'forged@example.invalid' })
    });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('activate_goalflow_email_beta', {
      target_attempt_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      target_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      target_email: 'beta@example.invalid'
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('forged-id');
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('forged-user');
  });

  it('refuses activation before Supabase confirms the email address', async () => {
    const { origin, rpc } = await serve(false);
    const response = await fetch(`${origin}/auth/email/activate`, {
      method: 'POST',
      headers: { authorization: 'Bearer unconfirmed-token', 'content-type': 'application/json' },
      body: '{}'
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'email_not_verified' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('ignores forged request state and rejects a missing verified metadata binding', async () => {
    const { origin, rpc } = await serve(true, null);
    const response = await fetch(`${origin}/auth/email/activate`, {
      method: 'POST',
      headers: { authorization: 'Bearer verified-token', 'content-type': 'application/json' },
      body: JSON.stringify({ activationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'activation_rejected' } });
    expect(rpc).not.toHaveBeenCalled();
  });
});
