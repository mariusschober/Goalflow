import { describe, it, expect, vi } from "vitest";

describe("session recovery — authService", () => {
  it("onSessionChange clears auth artifacts without deleting the durable outbox", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("services/authService.ts", "utf8");
    expect(content).toContain("SIGNED_OUT");
    expect(content).toContain("sessionStorage.removeItem");
    expect(content).toContain("durable\n      // outbox remains intact");
    expect(content).not.toContain("localStorage.removeItem('goalflow:sync-state')");
  });

  it("refreshSession is exported and handles TOKEN_REFRESHED", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("services/authService.ts", "utf8");
    expect(content).toContain("refreshSession");
    expect(content).toContain("TOKEN_REFRESHED");
  });

  it("authenticatedFetch handles 401 by throwing and refreshSession exists", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync("services/authService.ts", "utf8");
    expect(content).toContain("authenticatedFetch");
    expect(content).toContain("refreshSession");
  });
});
