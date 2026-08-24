import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  OWNER_EMAIL: z.string().email().default("mris@tuta.io"),
  ENABLE_LOCAL_DEMO: z.enum(["true", "false"]).default("false"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_BASE: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-v4-flash"),
  AI_OWNER_DAILY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(100),
  AI_BETA_DAILY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(20),
  AI_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(300),
  TELEGRAM_BOT_TOKEN: z.string().min(20).optional(),
  TELEGRAM_BOT_USERNAME: z.string().min(3).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32).optional(),
  TELEGRAM_OIDC_PROVIDER_ID: z.string().regex(/^custom:[a-z0-9:-]+$/).default("custom:telegram"),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_API_BASE: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  TELEGRAM_MAX_VOICE_BYTES: z.coerce.number().int().min(1_024).max(20_000_000).default(19_000_000),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  BACKUP_MASTER_KEY: z.string().min(32).optional(),
  BACKUP_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(2),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type AppConfig = z.infer<typeof environmentSchema>;
export const readConfig = (environment: NodeJS.ProcessEnv = process.env): AppConfig =>
  environmentSchema.parse(environment);
