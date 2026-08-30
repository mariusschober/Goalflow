import crypto from "node:crypto";

export class MiniAppAuthError extends Error {
  constructor(
    public readonly code: "missing" | "invalid_hash" | "expired" | "invalid_format",
    message: string,
  ) {
    super(message);
    this.name = "MiniAppAuthError";
  }
}

export interface ValidatedMiniAppData {
  telegram_user_id: number;
  auth_date: number;
  initData: string;
  user: Record<string, unknown> | null;
  query_id?: string;
}

const MAX_AGE_SEC = 24 * 60 * 60; // 24h default, matches plan

export const validateInitData = (
  initData: string,
  botToken: string,
  maxAgeSec: number = MAX_AGE_SEC,
): ValidatedMiniAppData => {
  if (!initData || typeof initData !== "string" || !initData.trim()) {
    throw new MiniAppAuthError("missing", "Missing initData");
  }
  const raw = initData.trim();
  // Parse as query string
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash) throw new MiniAppAuthError("invalid_format", "Missing hash");
  // auth_date is required for freshness check
  const authDateStr = params.get("auth_date");
  if (!authDateStr) throw new MiniAppAuthError("invalid_format", "Missing auth_date");
  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate) || authDate <= 0) throw new MiniAppAuthError("invalid_format", "Invalid auth_date");

  const nowSec = Math.floor(Date.now() / 1000);
  if (maxAgeSec > 0 && nowSec - authDate > maxAgeSec) {
    throw new MiniAppAuthError("expired", "initData expired");
  }

  // Build data_check_string: sort keys excluding hash, join k=v with \n, values as original (not decoded) but per spec we use decoded?
  // Spec: data_check_string is sorted key=value pairs, value is original value (as in initData, not JSON parsed)
  // We must use the raw values as they appear in initData, but URLSearchParams decodes them. To be safe, we reconstruct from params entries.
  // The spec says to use the value as is (decoded JSON for user is still JSON string, but we treat as decoded then re-encode?).
  // Most implementations use: entries sorted, then `${key}=${value}` where value is the decoded value (as per URLSearchParams) but for user it's JSON string.
  // We follow that: use params.get(key) decoded.
  const pairs: string[] = [];
  const keys: string[] = [];
  for (const key of params.keys()) {
    if (key === "hash") continue;
    keys.push(key);
  }
  keys.sort();
  for (const key of keys) {
    const value = params.get(key) ?? "";
    pairs.push(`${key}=${value}`);
  }
  const dataCheckString = pairs.join("\n");

  // secret_key = HMAC_SHA256(bot_token, "WebAppData") => key="WebAppData", message=bot_token
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // Use timingSafeEqual for comparison
  const hashBuf = Buffer.from(hash, "hex");
  const hmacBuf = Buffer.from(hmac, "hex");
  if (hashBuf.length !== hmacBuf.length || !crypto.timingSafeEqual(hashBuf, hmacBuf)) {
    throw new MiniAppAuthError("invalid_hash", "Invalid initData hash");
  }

  // Extract user
  let user: Record<string, unknown> | null = null;
  const userStr = params.get("user");
  if (userStr) {
    try {
      user = JSON.parse(userStr) as Record<string, unknown>;
    } catch {
      // keep null, but still validate telegram_user_id from user.id if present
      user = null;
    }
  }
  const telegramUserId = user && typeof (user as Record<string, unknown>).id === "number"
    ? Number((user as Record<string, unknown>).id)
    : NaN;
  if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
    throw new MiniAppAuthError("invalid_format", "Missing or invalid user.id");
  }

  return {
    telegram_user_id: telegramUserId,
    auth_date: authDate,
    initData: raw,
    user,
    query_id: params.get("query_id") ?? undefined,
  };
};

export const extractInitDataFromRequest = (req: { header: (name: string) => string | undefined; query: Record<string, unknown> }): string | null => {
  const auth = req.header("authorization") ?? req.header("Authorization");
  if (auth) {
    const m = auth.match(/^tma\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  const q = req.query.initData ?? req.query.initdata ?? req.query.tma;
  if (typeof q === "string" && q.trim()) return q.trim();
  return null;
};
