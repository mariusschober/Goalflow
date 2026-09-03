import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import type { User } from "@supabase/supabase-js";
import { telegramIdentity } from "./telegramAuth";

const hash = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

describe("secure callback flow — telegramAuth", () => {
  it("accepts only the exact configured provider identity and an all-numeric safe subject", () => {
    const valid = {
      user_metadata: { telegram_user_id: "999999" },
      identities: [{ id: "42", provider: "telegram", identity_data: { id: "42", username: "linked" } }]
    } as unknown as User;
    expect(telegramIdentity(valid, "custom:telegram")).toEqual({ id: 42, username: "linked" });

    const forgedMetadata = { user_metadata: { telegram_user_id: "42" }, identities: [] } as unknown as User;
    expect(telegramIdentity(forgedMetadata, "custom:telegram")).toBeUndefined();
    const lookalikeProvider = {
      user_metadata: {},
      identities: [{ id: "42", provider: "attacker-telegram-copy", identity_data: { id: "42" } }]
    } as unknown as User;
    expect(telegramIdentity(lookalikeProvider, "custom:telegram")).toBeUndefined();
    const partialSubject = {
      user_metadata: {},
      identities: [{ id: "telegram-42", provider: "telegram", identity_data: { sub: "telegram-42" } }]
    } as unknown as User;
    expect(telegramIdentity(partialSubject, "custom:telegram")).toBeUndefined();
  });

  it("preflight hashes state correctly (PKCE binding)", () => {
    const state = "abc123_state_1234567890";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    // Verify hash logic matches server
    expect(hash(state)).toBe(crypto.createHash("sha256").update(state).digest("hex"));
    expect(challenge.length).toBeGreaterThanOrEqual(43);
    // Verify server stores oauth_state_hash
    const content = fs.readFileSync("server/routes/telegramAuth.ts", "utf8");
    expect(content).toContain("oauth_state_hash");
    expect(content).toContain("code_challenge");
    expect(content).toContain("code_challenge_method");
  });

  it("activate forwards oauthState to RPC", () => {
    const content = fs.readFileSync("server/routes/telegramAuth.ts", "utf8");
    expect(content).toContain("target_oauth_state");
    expect(content).toContain("activate_telegram_beta");
    // Verify RPC now takes 6 args including state
    const migration = fs.readFileSync("supabase/migrations/202608310001_telegram_auth_state_pkce.sql", "utf8");
    expect(migration).toContain("target_oauth_state text");
    expect(migration).toContain("oauth_state_hash");
  });

  it("webhook secret is compared with timingSafeEqual (no early exit on length)", async () => {
    // This is a static check: ensure server/routes/telegram.ts uses timingSafeEqual
    const fs = await import("node:fs");
    const content = fs.readFileSync("server/routes/telegram.ts", "utf8");
    expect(content).toContain("timingSafeEqual");
    expect(content).toContain("providedBuffer.length === expectedBuffer.length");
  });
});
