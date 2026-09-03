import crypto from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../config";
import type { Logger } from "../logger";
import { createTelegramMiniRouter, type TelegramMiniDependencies } from "./telegramMini";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

const botToken = "100000:TEST_ONLY_BOT_TOKEN_NOT_A_SECRET";
const now = new Date("2027-01-15T12:00:00.000Z");
const userId = "11111111-1111-4111-8111-111111111111";
const sessionToken = "T".repeat(43);
const operationId = "22222222-2222-4222-8222-222222222222";
const config = readConfig({
  NODE_ENV: "test",
  TELEGRAM_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: botToken,
  TELEGRAM_BOT_USERNAME: "goalflow_test_bot",
  TELEGRAM_WEBHOOK_SECRET: "TEST_ONLY_WEBHOOK_SECRET_32_CHARS",
  LOG_LEVEL: "error"
});
const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const buildInitData = () => {
  const values = {
    auth_date: String(Math.floor(now.getTime() / 1_000)),
    query_id: "TEST_QUERY_ID",
    user: JSON.stringify({ id: 42, first_name: "Test" })
  };
  const dataCheckString = Object.keys(values).sort().map(key => `${key}=${values[key as keyof typeof values]}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...values, hash }).toString();
};

const serve = async (rpc: ReturnType<typeof vi.fn>, dependencies: TelegramMiniDependencies = {}) => {
  const app = express();
  app.use(express.json({ limit: "128kb" }));
  app.use(createTelegramMiniRouter(config, { rpc } as unknown as SupabaseClient, logger, { now: () => now, ...dependencies }));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

describe("Telegram Mini App server boundary", () => {
  it("exchanges fresh initData exactly once without persisting the raw credential", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { state: "created", userId, telegramUserId: 42 }, error: null });
    const response = await fetch(`${await serve(rpc)}/mini/session`, {
      method: "POST",
      headers: { authorization: `tma ${buildInitData()}` }
    });
    const body = await response.json() as { token: string; tokenType: string };

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.tokenType).toBe("Bearer");
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rpc.mock.calls[0][0]).toBe("goalflow_create_telegram_mini_session");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("target_init_data");
    expect(rpc.mock.calls[0][1].target_init_data_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects replay and never accepts a query-string initData fallback", async () => {
    const replayRpc = vi.fn().mockResolvedValue({ data: { state: "replay" }, error: null });
    const replay = await fetch(`${await serve(replayRpc)}/mini/session`, {
      method: "POST",
      headers: { authorization: `tma ${buildInitData()}` }
    });
    expect(replay.status).toBe(409);
    expect(await replay.json()).toMatchObject({ error: { code: "init_data_replayed" } });

    const queryRpc = vi.fn();
    const query = await fetch(`${await serve(queryRpc)}/mini/session?initData=${encodeURIComponent(buildInitData())}`, { method: "POST" });
    expect(query.status).toBe(401);
    expect(queryRpc).not.toHaveBeenCalled();
  });

  it("requires a caller-generated operation UUID and returns only an exact durable acknowledgment", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { userId, telegramUserId: 42 }, error: null });
    const createTask = vi.fn().mockResolvedValue({
      id: operationId,
      user_id: userId,
      title: "Ship beta",
      source: "telegram",
      schedule_precision: "day",
      scheduled_for: "2027-01-15",
      tags: [],
      is_frog: false,
      status: "open"
    });
    const origin = await serve(rpc, { localDate: async () => "2027-01-15", createTask });
    const missingOperation = await fetch(`${origin}/mini/capture`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "Ship beta", schedulePrecision: "day", scheduledFor: "2027-01-15" })
    });
    expect(missingOperation.status).toBe(400);
    expect(createTask).not.toHaveBeenCalled();

    const accepted = await fetch(`${origin}/mini/capture`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json", "idempotency-key": operationId },
      body: JSON.stringify({ title: "Ship beta", schedulePrecision: "day", scheduledFor: "2027-01-15" })
    });
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toMatchObject({ operationId, task: { id: operationId, title: "Ship beta" } });
    expect(createTask).toHaveBeenCalledWith(expect.anything(), userId, "2027-01-15", operationId, expect.objectContaining({ title: "Ship beta" }));
  });

  it("does not report success for a task acknowledgment bound to another user", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { userId, telegramUserId: 42 }, error: null });
    const createTask = vi.fn().mockResolvedValue({
      id: operationId,
      user_id: "33333333-3333-4333-8333-333333333333",
      title: "Wrong owner",
      source: "telegram"
    });
    const origin = await serve(rpc, { localDate: async () => "2027-01-15", createTask });
    const response = await fetch(`${origin}/mini/capture`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json", "idempotency-key": operationId },
      body: JSON.stringify({ title: "Ship beta", schedulePrecision: "day", scheduledFor: "2027-01-15" })
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "durable_ack_unverified" } });
  });

  it("rejects an expired, revoked, disabled, or unlinked cached Mini session", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const response = await fetch(`${await serve(rpc)}/mini/current`, {
      headers: { authorization: `Bearer ${sessionToken}` }
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "mini_session_invalid" } });
  });
});
