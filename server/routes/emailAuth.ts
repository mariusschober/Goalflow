import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { bearerToken } from '../auth';
import type { AppConfig } from '../config';
import { createUserVerifierClient } from '../supabase';
import { verifyTurnstile } from '../turnstile';

const hash = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');
const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const preflightBody = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().trim().min(6).max(128),
  captchaToken: z.string().max(4096).default('')
});
const activationId = z.string().uuid();

export const createEmailAuthRouter = (
  config: AppConfig,
  admin?: SupabaseClient,
  verifier: SupabaseClient | undefined = createUserVerifierClient(config)
) => {
  const router = Router();
  router.use(rateLimit({
    windowMs: 60_000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));

  router.post('/email/preflight', async (request, response) => {
    if (!admin) {
      response.status(503).json({ error: { code: 'auth_not_configured', message: 'Email signup is not configured.' } });
      return;
    }
    try {
      const input = preflightBody.parse(request.body);
      const captchaValid = await verifyTurnstile(config, input.captchaToken, request.ip);
      if (!captchaValid) {
        response.status(400).json({ error: { code: 'captcha_failed', message: 'Human verification failed. Please try again.' } });
        return;
      }
      const { data: invite, error } = await admin.from('invite_codes')
        .select('id,use_count,max_uses')
        .eq('code_hash', hash(input.code))
        .is('disabled_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (error || !invite || invite.use_count >= invite.max_uses) {
        response.status(400).json({ error: { code: 'invalid_invite', message: 'This beta invite is invalid or expired.' } });
        return;
      }

      const { data: attempt, error: insertError } = await admin.from('email_auth_attempts').insert({
        invite_id: invite.id,
        email: normalizeEmail(input.email),
        expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString()
      }).select('id').single();
      if (insertError || !attempt) throw insertError || new Error('Attempt was not created');
      response.status(201).json({ activationId: attempt.id, expiresInSeconds: 86_400 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        response.status(400).json({ error: { code: 'invalid_request', message: 'Enter a valid email address and beta invite.' } });
        return;
      }
      response.status(500).json({ error: { code: 'preflight_failed', message: 'Email signup could not be started.' } });
    }
  });

  router.post('/email/activate', async (request, response) => {
    if (!admin || !verifier) {
      response.status(503).json({ error: { code: 'auth_not_configured', message: 'Email signup is not configured.' } });
      return;
    }
    try {
      const token = bearerToken(request);
      if (!token) {
        response.status(401).json({ error: { code: 'unauthorized', message: 'A verified email session is required.' } });
        return;
      }
      const { data, error } = await verifier.auth.getUser(token);
      const user = data.user;
      if (error || !user?.email || !user.email_confirmed_at) {
        response.status(401).json({ error: { code: 'email_not_verified', message: 'Verify this email address before activating Tsurfing.' } });
        return;
      }
      const parsedActivationId = activationId.safeParse(user.user_metadata?.goalflow_beta_activation_id);
      if (!parsedActivationId.success) {
        response.status(400).json({ error: { code: 'activation_rejected', message: 'This activation is invalid or expired.' } });
        return;
      }
      const { data: activated, error: activateError } = await admin.rpc('activate_goalflow_email_beta', {
        target_attempt_id: parsedActivationId.data,
        target_user_id: user.id,
        target_email: normalizeEmail(user.email)
      });
      if (activateError) throw activateError;
      if (!activated) {
        response.status(400).json({ error: { code: 'activation_rejected', message: 'This activation is invalid or expired.' } });
        return;
      }
      response.status(200).json({ activated: true });
    } catch {
      response.status(500).json({ error: { code: 'activation_failed', message: 'Email signup could not be activated.' } });
    }
  });

  return router;
};
