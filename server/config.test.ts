import { describe, expect, it } from "vitest";
import {
  productionConfigurationProblems,
  readConfig,
  supabasePublicKey,
  supabaseServerKey
} from "./config";

const productionEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  APP_ORIGIN: "https://beta.goalflow.example",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
  SUPABASE_SECRET_KEY: "sb_secret_test_value",
  OWNER_USER_ID: "00000000-0000-4000-8000-000000000001"
});

describe("production environment contract", () => {
  it("reports every missing core dependency instead of treating production as ready", () => {
    const config = readConfig({ NODE_ENV: "production", APP_ORIGIN: "http://localhost:3000" });
    expect(productionConfigurationProblems(config)).toEqual([
      "public_origin_must_use_https",
      "supabase_url_missing",
      "supabase_public_key_missing",
      "supabase_server_key_missing",
      "owner_user_id_missing"
    ]);
  });

  it("accepts a complete cloud configuration without enabling optional providers", () => {
    const config = readConfig(productionEnvironment());
    expect(productionConfigurationProblems(config)).toEqual([]);
    expect(config.TELEGRAM_ENABLED).toBe("false");
    expect(config.AI_ENABLED).toBe("false");
    expect(config.VOICE_ENABLED).toBe("false");
    expect(config.BACKUPS_ENABLED).toBe("false");
  });

  it("supports legacy server key names during migration but prefers current opaque keys", () => {
    const legacy = readConfig({
      ...productionEnvironment(),
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_ANON_KEY: "legacy-public",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-server"
    });
    expect(supabasePublicKey(legacy)).toBe("legacy-public");
    expect(supabaseServerKey(legacy)).toBe("legacy-server");
    expect(productionConfigurationProblems(legacy)).toEqual([]);
  });

  it("requires credentials only for explicitly enabled optional features", () => {
    const config = readConfig({
      ...productionEnvironment(),
      TELEGRAM_ENABLED: "true",
      AI_ENABLED: "true",
      VOICE_ENABLED: "true",
      TURNSTILE_ENABLED: "true",
      BACKUPS_ENABLED: "true",
      BACKUP_MASTER_KEY: "not-a-32-byte-key-but-long-enough-to-parse"
    });
    expect(productionConfigurationProblems(config)).toEqual([
      "telegram_bot_token_missing",
      "telegram_bot_username_missing",
      "telegram_webhook_secret_missing",
      "ai_key_missing",
      "voice_key_missing",
      "turnstile_secret_missing",
      "backup_key_invalid"
    ]);
  });

  it("forbids an accidental local-demo flag in production", () => {
    const config = readConfig({ ...productionEnvironment(), ENABLE_LOCAL_DEMO: "true" });
    expect(productionConfigurationProblems(config)).toContain("local_demo_forbidden");
  });

  it("treats blank optional values as absent for local development", () => {
    const config = readConfig({ SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", OWNER_USER_ID: "" });
    expect(config.SUPABASE_URL).toBeUndefined();
    expect(config.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(config.OWNER_USER_ID).toBeUndefined();
    expect(productionConfigurationProblems(config)).toEqual([]);
  });
});
