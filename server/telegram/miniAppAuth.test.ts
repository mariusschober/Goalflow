import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { validateInitData, MiniAppAuthError } from "./miniAppAuth";

const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

const buildInitData = (params: Record<string, string>, botToken: string = BOT_TOKEN): string => {
  const keys = Object.keys(params).filter((k) => k !== "hash").sort();
  const dataCheckString = keys.map((k) => `${k}=${params[k]}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const search = new URLSearchParams({ ...params, hash });
  return search.toString();
};

describe("miniAppAuth", () => {
  it("validates a correct initData", () => {
    const authDate = Math.floor(Date.now() / 1000);
    const user = JSON.stringify({ id: 12345, first_name: "Test", username: "testuser" });
    const initData = buildInitData({ query_id: "AAHdF6IQAAAA", user, auth_date: String(authDate) });
    const validated = validateInitData(initData, BOT_TOKEN);
    expect(validated.telegram_user_id).toBe(12345);
    expect(validated.auth_date).toBe(authDate);
  });

  it("rejects tampered hash", () => {
    const authDate = Math.floor(Date.now() / 1000);
    const user = JSON.stringify({ id: 12345 });
    const initData = buildInitData({ user, auth_date: String(authDate) });
    const tampered = initData.replace(/hash=[^&]+/, "hash=0000000000000000000000000000000000000000000000000000000000000000");
    expect(() => validateInitData(tampered, BOT_TOKEN)).toThrow(MiniAppAuthError);
    try {
      validateInitData(tampered, BOT_TOKEN);
    } catch (e) {
      expect((e as MiniAppAuthError).code).toBe("invalid_hash");
    }
  });

  it("rejects expired auth_date", () => {
    const authDate = Math.floor(Date.now() / 1000) - 25 * 60 * 60; // 25h ago
    const user = JSON.stringify({ id: 12345 });
    const initData = buildInitData({ user, auth_date: String(authDate) });
    expect(() => validateInitData(initData, BOT_TOKEN, 24 * 60 * 60)).toThrow(MiniAppAuthError);
    try {
      validateInitData(initData, BOT_TOKEN, 24 * 60 * 60);
    } catch (e) {
      expect((e as MiniAppAuthError).code).toBe("expired");
    }
  });

  it("rejects missing hash", () => {
    const params = new URLSearchParams({ user: JSON.stringify({ id: 123 }), auth_date: String(Math.floor(Date.now() / 1000)) });
    expect(() => validateInitData(params.toString(), BOT_TOKEN)).toThrow(MiniAppAuthError);
  });

  it("rejects missing user.id", () => {
    const authDate = Math.floor(Date.now() / 1000);
    const initData = buildInitData({ auth_date: String(authDate), query_id: "test" });
    expect(() => validateInitData(initData, BOT_TOKEN)).toThrow(MiniAppAuthError);
  });

  it("accepts initData via Authorization header helper", async () => {
    const { extractInitDataFromRequest } = await import("./miniAppAuth");
    const initData = "query_id=abc&user=%7B%22id%22%3A1%7D&auth_date=123&hash=abc";
    const req = {
      header: (name: string) => (name.toLowerCase() === "authorization" ? `tma ${initData}` : undefined),
      query: {},
    };
    expect(extractInitDataFromRequest(req as never)).toBe(initData);
  });
});
