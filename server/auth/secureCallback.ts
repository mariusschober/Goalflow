import crypto from "node:crypto";

/**
 * Secure callback state handling for OAuth / Telegram flows.
 * - state is a cryptographically random 32-byte base64url token
 * - redirect targets are validated to prevent open-redirect
 * - state comparison is constant-time
 */

export const generateSecureState = (): string => crypto.randomBytes(32).toString("base64url");

export const isSafeRedirect = (target: string, allowedOrigins: Set<string>): boolean => {
  if (!target || typeof target !== "string") return false;
  // Forbid CRLF injection, backslash, double-slash, protocol-relative
  if (target.includes("\n") || target.includes("\r") || target.includes("\\")) return false;
  // Reject encoded backslash / double-slash tricks
  try {
    const decoded = decodeURIComponent(target);
    if (decoded !== target) {
      if (decoded.includes("\\")) return false;
      if (decoded.slice(1).includes("//")) return false;
      if (decoded.includes("\n") || decoded.includes("\r")) return false;
    }
  } catch {
    // malformed encoding — reject
    return false;
  }
  // Absolute URL — must be in allowedOrigins exactly
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) {
    try {
      const origin = new URL(target).origin;
      return allowedOrigins.has(origin);
    } catch {
      return false;
    }
  }
  // Relative URL — must be a safe same-origin path
  if (!target.startsWith("/")) return false;
  if (target.startsWith("//")) return false;
  // Must not contain // after the leading /
  if (target.slice(1).includes("//")) return false;
  // Must not try to escape via /.. or contain : that could be protocol
  try {
    const dummy = new URL(target, "https://dummy.local");
    // dummy will resolve relative; ensure pathname is same as input without query/hash
    // and that it didn't introduce an unexpected host
    if (dummy.host !== "dummy.local") return false;
    return true;
  } catch {
    return false;
  }
};

export const validateState = (provided: string | null | undefined, expected: string | null | undefined): boolean => {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const buildSafeRedirect = (origin: string, path: string, allowedOrigins: Set<string>): string | null => {
  const candidate = `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  if (!isSafeRedirect(candidate, allowedOrigins)) return null;
  if (!isSafeRedirect(path, allowedOrigins) && !allowedOrigins.has(origin)) return null;
  // Ensure origin itself is allowed
  if (!allowedOrigins.has(origin)) return null;
  return candidate;
};
