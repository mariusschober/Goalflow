import type { AppConfig } from './config';

interface TurnstileResult {
  success?: boolean;
  hostname?: string;
  action?: string;
}

export const verifyTurnstile = async (
  config: AppConfig,
  token: string,
  remoteIp?: string
): Promise<boolean> => {
  if (config.TURNSTILE_ENABLED !== 'true') return true;
  if (!config.TURNSTILE_SECRET_KEY || !token) return false;

  try {
    const body = new URLSearchParams({
      secret: config.TURNSTILE_SECRET_KEY,
      response: token
    });
    if (remoteIp) body.set('remoteip', remoteIp);
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(config.UPSTREAM_TIMEOUT_MS)
    });
    if (!response.ok) return false;
    const result = await response.json() as TurnstileResult;
    if (!result.success) return false;
    if (config.NODE_ENV !== 'production') return true;
    return result.hostname === new URL(config.APP_ORIGIN).hostname
      && result.action === 'beta-signup';
  } catch {
    return false;
  }
};
