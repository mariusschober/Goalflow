import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { validateInitData } from "../telegram/miniAppAuth";

const BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

const buildInitData = (params: Record<string, string>): string => {
  const keys = Object.keys(params).filter((k) => k !== "hash").sort();
  const dataCheckString = keys.map((k) => `${k}=${params[k]}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...params, hash }).toString();
};

describe("telegram mini routes", () => {
  it("validates initData for mini app", () => {
    const authDate = Math.floor(Date.now() / 1000);
    const user = JSON.stringify({ id: 123456, username: "test" });
    const initData = buildInitData({ user, auth_date: String(authDate), query_id: "test" });
    const validated = validateInitData(initData, BOT_TOKEN);
    expect(validated.telegram_user_id).toBe(123456);
  });

  it("rejects invalid hash for mini app", () => {
    const authDate = Math.floor(Date.now() / 1000);
    const user = JSON.stringify({ id: 123456 });
    const initData = buildInitData({ user, auth_date: String(authDate) });
    const tampered = initData.replace(/hash=[^&]+/, "hash=0000000000000000000000000000000000000000000000000000000000000000");
    expect(() => validateInitData(tampered, BOT_TOKEN)).toThrow();
  });

  it("extracts initData from Authorization header", async () => {
    const { extractInitDataFromRequest } = await import("../telegram/miniAppAuth");
    const initData = "query_id=abc&user=%7B%22id%22%3A1%7D&auth_date=123&hash=abc";
    const req = {
      header: (name: string) => (name.toLowerCase() === "authorization" ? `tma ${initData}` : undefined),
      query: {},
    };
    expect(extractInitDataFromRequest(req as never)).toBe(initData);
  });
});
