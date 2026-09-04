import { describe, it, expect } from "vitest";

describe("secure callback flow — authService", () => {
  it("delegates browser PKCE and OAuth state to the Supabase client", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("services/authService.ts", "utf8");
    const oauth = content.slice(content.indexOf("const startTelegramOAuth"), content.indexOf("export const beginTelegramSignup"));
    const signup = content.slice(content.indexOf("export const beginTelegramSignup"), content.indexOf("export const beginTelegramLink"));
    expect(content).toContain("flowType: 'pkce'");
    expect(oauth).toContain("signInWithOAuth");
    expect(oauth).toContain("openid profile telegram:bot_access");
    expect(`${oauth}${signup}`).not.toContain("queryParams");
    expect(`${oauth}${signup}`).not.toContain("code_challenge");
    expect(`${oauth}${signup}`).not.toContain("codeChallenge");
    expect(`${oauth}${signup}`).not.toContain("state:");
  });

  it("activation sends only the opaque one-use invite attempt", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("services/authService.ts", "utf8");
    const activation = content.slice(content.indexOf("export const activateTelegramSignup"), content.indexOf("export const getLocalDemoUser"));
    expect(activation).toContain("JSON.stringify({ attemptToken })");
    expect(activation).not.toContain("oauthState");
  });
});
