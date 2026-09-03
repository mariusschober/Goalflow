import { describe, expect, it, vi } from "vitest";
import { readConfig } from "./config";
import { createReadinessProbe } from "./readiness";

const cloudConfig = () => readConfig({
  NODE_ENV: "production",
  APP_ORIGIN: "https://beta.goalflow.example",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
  SUPABASE_SECRET_KEY: "sb_secret_test_value",
  OWNER_USER_ID: "00000000-0000-4000-8000-000000000001",
  READINESS_CACHE_MS: "1000"
});

describe("readiness probe", () => {
  it("coalesces concurrent checks and caches durable dependency success", async () => {
    const check = vi.fn(async () => undefined);
    const probe = createReadinessProbe(cloudConfig(), check);
    expect(await Promise.all([probe(), probe(), probe()])).toEqual([true, true, true]);
    expect(await probe()).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("fails closed and caches a dependency failure", async () => {
    const check = vi.fn(async () => { throw new Error("offline"); });
    const probe = createReadinessProbe(cloudConfig(), check);
    expect(await probe()).toBe(false);
    expect(await probe()).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("never probes dependencies when production configuration is incomplete", async () => {
    const check = vi.fn(async () => undefined);
    const config = readConfig({ NODE_ENV: "production", APP_ORIGIN: "https://beta.goalflow.example" });
    expect(await createReadinessProbe(config, check)()).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it("allows an explicitly selected local development mode without cloud credentials", async () => {
    const check = vi.fn(async () => undefined);
    const config = readConfig({ NODE_ENV: "development", ENABLE_LOCAL_DEMO: "true" });
    expect(await createReadinessProbe(config, check)()).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });
});
