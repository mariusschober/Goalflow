import crypto from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { bearerToken } from "../auth";
import type { AppConfig } from "../config";

const hash = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
const codeChallengePattern = /^[A-Za-z0-9_-]{43,128}$/;
const statePattern = /^[A-Za-z0-9_-]{16,128}$/;
const preflightBody = z.object({
  code: z.string().trim().min(6).max(128),
  captchaToken: z.string().max(4096).default(''),
  state: z.string().regex(statePattern).optional(),
  codeChallenge: z.string().regex(codeChallengePattern).optional(),
  codeChallengeMethod: z.enum(["S256", "plain"]).optional()
});
const activateBody = z.object({
  attemptToken: z.string().min(32).max(256),
  oauthState: z.string().regex(statePattern).optional()
});

export const telegramIdentity = (user: User, providerId: string) => {
  const identity = user.identities?.find((item) =>
    item.provider === providerId || item.provider.toLowerCase().includes("telegram"));
  const data = { ...user.user_metadata, ...(identity?.identity_data ?? {}) } as Record<string, unknown>;
  const rawId = data.telegram_user_id ?? data.id ?? data.sub ?? identity?.id;
  const match = String(rawId ?? "").match(/\d+/);
  if (!match) return undefined;
  return {
    id: Number(match[0]),
    username: String(data.username ?? data.preferred_username ?? "")
  };
};

export const createTelegramAuthRouter = (config: AppConfig, admin?: SupabaseClient) => {
  const router = Router();
  const verifier = config.SUPABASE_URL && config.SUPABASE_ANON_KEY
    ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : undefined;
  router.use(rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false }));

  router.post("/telegram/preflight", async (request, response) => {
    if (!admin) {
      response.status(503).json({ error: { code: "auth_not_configured", message: "Telegram signup is not configured." } });
      return;
    }
    try {
      const input = preflightBody.parse(request.body);
      if (config.TURNSTILE_SECRET_KEY) {
        const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret: config.TURNSTILE_SECRET_KEY, response: input.captchaToken, remoteip: request.ip || '' })
        });
        const result = await verification.json() as { success?: boolean };
        if (!result.success) {
          response.status(400).json({ error: { code: 'captcha_failed', message: 'Human verification failed. Please try again.' } });
          return;
        }
      }
      const { data: invite, error } = await admin.from("invite_codes").select("id,use_count,max_uses")
        .eq("code_hash", hash(input.code)).is("disabled_at", null).gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error || !invite || invite.use_count >= invite.max_uses) {
        response.status(400).json({ error: { code: "invalid_invite", message: "This beta invite is invalid or expired." } });
        return;
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const stateHash = input.state ? hash(input.state) : null;
      const { error: insertError } = await admin.from("telegram_auth_attempts").insert({
        token_hash: hash(token),
        invite_id: invite.id,
        oauth_state_hash: stateHash,
        code_challenge: input.codeChallenge ?? null,
        code_challenge_method: input.codeChallengeMethod ?? null,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
      });
      if (insertError) throw insertError;
      response.json({
        attemptToken: token,
        provider: config.TELEGRAM_OIDC_PROVIDER_ID,
        expiresInSeconds: 600,
        state: input.state ?? null,
        codeChallenge: input.codeChallenge ?? null
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        response.status(400).json({ error: { code: "invalid_request", message: "Enter a valid beta invite code." } });
        return;
      }
      response.status(500).json({ error: { code: "preflight_failed", message: "Telegram signup could not be started." } });
    }
  });

  router.post("/telegram/activate", async (request, response) => {
    if (!admin || !verifier) {
      response.status(503).json({ error: { code: "auth_not_configured", message: "Telegram signup is not configured." } });
      return;
    }
    try {
      const input = activateBody.parse(request.body);
      const token = bearerToken(request);
      if (!token) {
        response.status(401).json({ error: { code: "unauthorized", message: "A Telegram session is required." } });
        return;
      }
      const { data, error } = await verifier.auth.getUser(token);
      const identity = data.user ? telegramIdentity(data.user, config.TELEGRAM_OIDC_PROVIDER_ID) : undefined;
      if (error || !data.user || !identity) {
        response.status(401).json({ error: { code: "telegram_identity_missing", message: "Telegram identity could not be verified." } });
        return;
      }
      const { data: activated, error: activateError } = await admin.rpc("activate_telegram_beta", {
        target_token_hash: hash(input.attemptToken),
        target_user_id: data.user.id,
        target_telegram_user_id: identity.id,
        target_telegram_username: identity.username,
        target_email: data.user.email ?? "",
        target_oauth_state: input.oauthState ?? null
      });
      if (activateError) throw activateError;
      if (!activated) {
        response.status(400).json({ error: { code: "activation_expired", message: "This signup attempt expired or was already used." } });
        return;
      }
      response.json({ activated: true, recoveryEmailRequired: !data.user.email });
    } catch (error) {
      if (error instanceof z.ZodError) {
        response.status(400).json({ error: { code: "invalid_request", message: "The activation request is invalid." } });
        return;
      }
      response.status(500).json({ error: { code: "activation_failed", message: "Telegram signup could not be activated." } });
    }
  });

  return router;
};
