import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assertSchedule } from "../../src/domain/scheduling";
import type { AppConfig } from "../config";
import type { Logger } from "../logger";
import { createMiniTask, getMiniCurrent, getMiniToday } from "../telegram/miniApp";
import { initDataAuthorization, MiniAppAuthError, validateInitData } from "../telegram/miniAppAuth";
import { localDateFor } from "../telegram/queue";

const uuid = z.string().uuid();
const captureBody = z.object({
  title: z.string().trim().min(1).max(240),
  schedulePrecision: z.enum(["day", "month"]),
  scheduledFor: z.string().max(10),
  scheduledTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  estimatedMinutes: z.number().int().min(1).max(1_440).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional()
}).strict().superRefine((value, context) => {
  const pattern = value.schedulePrecision === "day" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/;
  if (!pattern.test(value.scheduledFor)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["scheduledFor"], message: "Schedule precision and date do not match." });
  }
});

interface CaptureInput {
  title: string;
  schedulePrecision: "day" | "month";
  scheduledFor: string;
  scheduledTime?: string;
  estimatedMinutes?: number;
  tags?: string[];
}
interface MiniPrincipal { userId: string; telegramUserId: number; tokenHash: string }

export interface TelegramMiniDependencies {
  now?: () => Date;
  localDate?: (database: SupabaseClient, userId: string) => Promise<string>;
  current?: typeof getMiniCurrent;
  today?: typeof getMiniToday;
  createTask?: typeof createMiniTask;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const hash = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
const bearerSessionToken = (request: Request): string | undefined => {
  const match = request.header("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1];
};

const publicTask = (value: unknown) => {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id
    || typeof value.title !== "string" || !value.title.trim()) {
    throw new Error("Task response is malformed.");
  }
  const tags = value.tags ?? value.hashtags;
  return {
    id: value.id,
    title: value.title,
    scheduledFor: String(value.scheduledFor ?? value.scheduled_for ?? ""),
    scheduledTime: value.scheduledTime ?? value.scheduled_time ?? null,
    tags: Array.isArray(tags) ? tags.map(String) : [],
    isFrog: Boolean(value.isFrog ?? value.is_frog),
    status: String(value.status ?? "open")
  };
};

export const createTelegramMiniRouter = (
  config: AppConfig,
  database: SupabaseClient | undefined,
  logger: Logger,
  dependencies: TelegramMiniDependencies = {}
) => {
  const router = Router();
  const principals = new WeakMap<Request, MiniPrincipal>();
  const now = dependencies.now ?? (() => new Date());
  const getLocalDate = dependencies.localDate ?? localDateFor;
  const loadCurrent = dependencies.current ?? getMiniCurrent;
  const loadToday = dependencies.today ?? getMiniToday;
  const persistTask = dependencies.createTask ?? createMiniTask;
  const exchangeLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false });

  router.use("/mini", (_request, response, next) => {
    response.setHeader("cache-control", "no-store");
    next();
  });

  router.post("/mini/session", exchangeLimiter, async (request, response) => {
    if (config.TELEGRAM_ENABLED !== "true" || !config.TELEGRAM_BOT_TOKEN || !database) {
      response.status(503).json({ error: { code: "telegram_not_configured", message: "Telegram is not configured." } }); return;
    }
    try {
      const rawInitData = initDataAuthorization(request);
      if (!rawInitData) {
        response.status(401).json({ error: { code: "init_data_missing", message: "Telegram authentication is required." } }); return;
      }
      const validated = validateInitData(rawInitData, config.TELEGRAM_BOT_TOKEN, {
        maxAgeSeconds: config.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
        futureSkewSeconds: config.TELEGRAM_INIT_DATA_FUTURE_SKEW_SECONDS,
        nowMs: now().getTime()
      });
      const token = crypto.randomBytes(32).toString("base64url");
      const sessionId = crypto.randomUUID();
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + config.TELEGRAM_MINI_SESSION_TTL_SECONDS * 1_000);
      const { data, error } = await database.rpc("goalflow_create_telegram_mini_session", {
        target_session_id: sessionId,
        target_token_hash: hash(token),
        target_init_data_hash: validated.initDataHash,
        target_telegram_user_id: validated.telegramUserId,
        target_auth_date: new Date(validated.authDate * 1_000).toISOString(),
        target_expires_at: expiresAt.toISOString()
      });
      if (error || !isRecord(data)) {
        response.status(503).json({ error: { code: "session_unavailable", message: "Telegram session could not be created." } }); return;
      }
      if (data.state === "replay") {
        response.status(409).json({ error: { code: "init_data_replayed", message: "This Telegram launch was already used. Reopen the Mini App." } }); return;
      }
      if (data.state === "inactive") {
        response.status(403).json({ error: { code: "telegram_not_linked", message: "Link this Telegram account in Goalflow first." } }); return;
      }
      if (data.state !== "created" || !uuid.safeParse(data.userId).success
        || data.telegramUserId !== validated.telegramUserId) {
        response.status(503).json({ error: { code: "session_unavailable", message: "Telegram session could not be verified." } }); return;
      }
      response.status(201).json({ token, tokenType: "Bearer", expiresAt: expiresAt.toISOString() });
    } catch (error) {
      if (error instanceof MiniAppAuthError) {
        const status = error.code === "invalid_format" ? 400 : 401;
        response.status(status).json({ error: { code: `init_data_${error.code}`, message: error.message } }); return;
      }
      logger.error("telegram.mini_session_failed", { requestId: request.requestId, category: error instanceof Error ? error.name : "unknown" });
      response.status(503).json({ error: { code: "session_unavailable", message: "Telegram session could not be created." } });
    }
  });

  const requireMiniSession = async (request: Request, response: Response, next: NextFunction) => {
    if (config.TELEGRAM_ENABLED !== "true" || !database) {
      response.status(503).json({ error: { code: "telegram_not_configured", message: "Telegram is not configured." } }); return;
    }
    const token = bearerSessionToken(request);
    if (!token) {
      response.status(401).json({ error: { code: "mini_session_required", message: "A valid Mini App session is required." } }); return;
    }
    const tokenHash = hash(token);
    const { data, error } = await database.rpc("goalflow_validate_telegram_mini_session", { target_token_hash: tokenHash });
    if (error) {
      response.status(503).json({ error: { code: "session_check_unavailable", message: "Telegram access could not be verified." } }); return;
    }
    if (!isRecord(data) || !uuid.safeParse(data.userId).success
      || !Number.isSafeInteger(data.telegramUserId) || Number(data.telegramUserId) <= 0) {
      response.status(401).json({ error: { code: "mini_session_invalid", message: "The Mini App session is expired or revoked." } }); return;
    }
    principals.set(request, { userId: String(data.userId), telegramUserId: Number(data.telegramUserId), tokenHash });
    next();
  };

  router.use("/mini", apiLimiter);
  router.use("/mini", requireMiniSession);

  router.delete("/mini/session", async (request, response) => {
    const principal = principals.get(request)!;
    const { data, error } = await database!.rpc("goalflow_revoke_telegram_mini_session", {
      target_token_hash: principal.tokenHash
    });
    if (error || data !== true) {
      response.status(503).json({ error: { code: "session_revoke_failed", message: "The Mini App session could not be revoked." } }); return;
    }
    response.status(204).end();
  });

  router.get("/mini/current", async (request, response) => {
    const principal = principals.get(request)!;
    try {
      const today = await getLocalDate(database!, principal.userId);
      const result = await loadCurrent(database!, principal.userId, today);
      response.json({
        today,
        gate: result.gate.state,
        current: result.current ? publicTask(result.current) : null,
        queueLength: result.queue.length
      });
    } catch (error) {
      logger.error("telegram.mini_current_failed", { requestId: request.requestId, userId: principal.userId, category: error instanceof Error ? error.name : "unknown" });
      response.status(503).json({ error: { code: "mini_current_failed", message: "Current could not be loaded." } });
    }
  });

  router.get("/mini/today", async (request, response) => {
    const principal = principals.get(request)!;
    try {
      const today = await getLocalDate(database!, principal.userId);
      const result = await loadToday(database!, principal.userId, today);
      response.json({ today, gate: result.gate.state, queue: result.queue.map(task => publicTask(task)) });
    } catch (error) {
      logger.error("telegram.mini_today_failed", { requestId: request.requestId, userId: principal.userId, category: error instanceof Error ? error.name : "unknown" });
      response.status(503).json({ error: { code: "mini_today_failed", message: "Today could not be loaded." } });
    }
  });

  router.post("/mini/capture", async (request, response) => {
    const principal = principals.get(request)!;
    const operationId = request.header("idempotency-key");
    if (!operationId || !uuid.safeParse(operationId).success) {
      response.status(400).json({ error: { code: "operation_id_required", message: "A unique UUID Idempotency-Key is required." } }); return;
    }
    try {
      const input = captureBody.parse(request.body) as CaptureInput;
      const today = await getLocalDate(database!, principal.userId);
      assertSchedule(input.schedulePrecision, input.scheduledFor, today);
      const task = await persistTask(database!, principal.userId, today, operationId, input);
      if (!isRecord(task) || task.id !== operationId || task.user_id !== principal.userId || task.source !== "telegram") {
        response.status(503).json({ error: { code: "durable_ack_unverified", message: "Task storage could not be verified. Retry with the same operation ID." } }); return;
      }
      response.status(201).json({ task: publicTask(task), operationId });
    } catch (error) {
      if (error instanceof z.ZodError || (error instanceof Error && error.name === "SchedulingError")) {
        response.status(400).json({ error: { code: "invalid_capture", message: "Choose a valid title and schedule." } }); return;
      }
      const errorCode = isRecord(error) && typeof error.code === "string" ? error.code : "";
      logger.error("telegram.mini_capture_failed", { requestId: request.requestId, userId: principal.userId, category: error instanceof Error ? error.name : "unknown" });
      response.status(errorCode === "22023" || errorCode === "23505" ? 409 : 503).json({ error: {
        code: errorCode === "22023" || errorCode === "23505" ? "operation_conflict" : "capture_unavailable",
        message: "The task was not acknowledged. Retry with the same operation ID."
      } });
    }
  });

  return router;
};
