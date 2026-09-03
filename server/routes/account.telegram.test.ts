import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../types";
import { createAccountRouter } from "./account";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

const userId = "11111111-1111-4111-8111-111111111111";
const user = (aal: "aal1" | "aal2"): AuthenticatedUser => ({
  id: userId, email: "test@example.invalid", role: "beta", status: "active", aal
});
const authUser = {
  id: userId,
  user_metadata: { telegram_user_id: "999999" },
  identities: [{ id: "42", provider: "telegram", identity_data: { id: "42", username: "linked" } }]
} as unknown as User;

const serve = async (aal: "aal1" | "aal2", rpc: ReturnType<typeof vi.fn>) => {
  const admin = {
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: authUser }, error: null }) } },
    rpc
  } as unknown as SupabaseClient;
  const app = express();
  app.use((request, _response, next) => { request.user = user(aal); next(); });
  app.use(createAccountRouter(admin, "custom:telegram", true));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

describe("Telegram account binding boundary", () => {
  it("requires AAL2 for every account before linking", async () => {
    const rpc = vi.fn();
    const response = await fetch(`${await serve("aal1", rpc)}/account/telegram/link`, { method: "POST" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "mfa_required" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds only the authenticated account to the verified provider identity", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const response = await fetch(`${await serve("aal2", rpc)}/account/telegram/link`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("goalflow_link_telegram_identity", {
      target_user_id: userId,
      target_telegram_user_id: 42,
      target_telegram_username: "linked"
    });
  });

  it("revokes bot and cached Mini App access for only the authenticated account", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const response = await fetch(`${await serve("aal2", rpc)}/account/telegram/link`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("goalflow_revoke_user_telegram_access", { target_user_id: userId });
  });
});
