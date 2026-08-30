import crypto from "node:crypto";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createAuthMiddleware, requireOwnerMfa } from "./auth";
import { createDeepSeekProvider } from "./ai/deepseek";
import type { AppConfig } from "./config";
import { createLogger } from "./logger";
import { createAiRouter } from "./routes/ai";
import { createTaskRouter } from "./routes/tasks";
import { createTelegramRouter } from "./routes/telegram";
import { createTelegramAuthRouter } from "./routes/telegramAuth";
import { createTelegramMiniRouter } from "./routes/telegramMini";
import { createSyncRouter } from "./routes/sync";
import { createAdminInviteRouter } from "./routes/adminInvites";
import { createAccountRouter } from './routes/account';
import { createOpenAiSpeechProvider } from "./speech/openai";
import { createAdminClient } from "./supabase";

export const createApp = async (config: AppConfig) => {
  const app = express();
  const logger = createLogger(config);
  const admin = createAdminClient(config);
  const auth = createAuthMiddleware(config, admin);
  const ai = createDeepSeekProvider(config);
  const speech = createOpenAiSpeechProvider(config);
  const localOnly = config.NODE_ENV !== 'production' && config.ENABLE_LOCAL_DEMO === 'true';
  const allowedOrigins = new Set([
    config.APP_ORIGIN,
    'https://localhost',
    'capacitor://localhost',
    ...config.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  ]);

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    const origin = request.header('origin');
    if (origin && allowedOrigins.has(origin)) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('access-control-allow-headers', 'authorization,content-type,idempotency-key,x-request-id');
      response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      response.setHeader('vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      if (!origin || allowedOrigins.has(origin)) response.status(204).end();
      else response.status(403).json({ error: { code: 'origin_not_allowed', message: 'This application origin is not allowed.' } });
      return;
    }
    next();
  });
  app.use((request, response, next) => {
    const startedAt = Date.now();
    request.requestId = request.header("x-request-id") ?? crypto.randomUUID();
    response.setHeader("x-request-id", request.requestId);
    response.on("finish", () => logger.info("http.request", {
      requestId: request.requestId, method: request.method, path: request.path,
      status: response.statusCode, durationMs: Date.now() - startedAt, userId: request.user?.id
    }));
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'", ...(localOnly ? ["'unsafe-inline'"] : []), "https://challenges.cloudflare.com", "https://telegram.org"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https://api.telegram.org", "https://telegram.org", "https://ice1.somafm.com", "https://ice2.somafm.com", "https://ice4.somafm.com", ...(config.SUPABASE_URL ? [config.SUPABASE_URL] : [])],
        mediaSrc: ["'self'", "blob:", "https://ice1.somafm.com", "https://ice2.somafm.com", "https://ice4.somafm.com"],
        fontSrc: ["'self'"], frameSrc: ["https://challenges.cloudflare.com", "https://web.telegram.org"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: "256kb" }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false }));

  app.get("/api/v1/health", (_request, response) => response.json({
    status: "ok",
    version: process.env.npm_package_version ?? "unknown",
    mode: localOnly ? 'local-only' : 'cloud',
    authConfigured: localOnly || Boolean(admin && config.SUPABASE_ANON_KEY),
    tasksConfigured: localOnly || Boolean(admin),
    telegramConfigured: Boolean(admin && config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_WEBHOOK_SECRET),
    voiceConfigured: Boolean(speech),
    aiConfigured: Boolean(ai)
  }));

  app.use("/api/v1/auth", createTelegramAuthRouter(config, admin));
  app.use("/api/v1/telegram", createTelegramRouter(config, admin, speech, logger));
  app.use("/api/v1/telegram/mini", createTelegramMiniRouter(config, admin));
  app.use("/api/v1", auth, requireOwnerMfa, createAdminInviteRouter(admin), createAccountRouter(admin, config.TELEGRAM_OIDC_PROVIDER_ID), createSyncRouter(admin), createTaskRouter(admin));
  app.use("/api/v1/ai", auth, requireOwnerMfa, createAiRouter(config, admin, ai, logger));
  app.use("/api/gemini", auth, requireOwnerMfa, createAiRouter(config, admin, ai, logger));

  if (config.NODE_ENV === "production") {
    const miniPath = path.resolve(process.cwd(), "dist/mini");
    app.use("/mini", express.static(miniPath, { index: false, maxAge: "1y", immutable: true, setHeaders(response, filePath) {
      if (filePath.endsWith("index.html")) response.setHeader("cache-control", "no-cache");
    }}));
    const clientPath = path.resolve(process.cwd(), "dist/client");
    app.use(express.static(clientPath, { index: false, maxAge: "1y", immutable: true, setHeaders(response, filePath) {
      if (filePath.endsWith("index.html") || filePath.endsWith("sw.js") || filePath.endsWith("manifest.webmanifest")) response.setHeader("cache-control", "no-cache");
    }}));
    app.get("/{*splat}", (_request, response) => {
      response.setHeader("cache-control", "no-cache");
      response.sendFile(path.join(clientPath, "index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
    logger.error("http.unhandled_error", { requestId: request.requestId, category: error instanceof Error ? error.name : "unknown" });
    response.status(500).json({ error: { code: "internal_error", message: "The request could not be completed." } });
  };
  app.use(errorHandler);
  return app;
};
