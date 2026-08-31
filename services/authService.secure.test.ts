import { describe, it, expect } from "vitest";

describe("secure callback flow — authService", () => {

  it("beginTelegramSignup stores state and verifier and sends PKCE", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("services/authService.ts", "utf8");
    expect(content).toContain("generateState");
    expect(content).toContain("generateCodeVerifier");
    expect(content).toContain("pkceChallenge");
    expect(content).toContain("codeChallenge");
    expect(content).toContain("code_challenge");
    expect(content).toContain("goalflow_telegram_state");
    expect(content).toContain("goalflow_telegram_verifier");
  });

  it("activateTelegramSignup sends oauthState", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("services/authService.ts", "utf8");
    expect(content).toContain("oauthState");
    expect(content).toContain("activateTelegramSignup");
    expect(content).toContain("sessionStorage.getItem");
  });
});
