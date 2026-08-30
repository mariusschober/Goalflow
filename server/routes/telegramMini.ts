import { Router, type Request, type Response, type NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config";
import { validateInitData, extractInitDataFromRequest, MiniAppAuthError } from "../telegram/miniAppAuth";
import { identityFor, localDateFor } from "../telegram/queue";
import { getMiniCurrent, getMiniToday, createMiniTask } from "../telegram/miniApp";
import { parseTelegramCapture } from "../telegram/capture";
import { v5 as uuidv5 } from "uuid";

const MINIAPP_NAMESPACE = "b5e8a3c1-7f9e-4c1a-bc96-7207d02c9a95";

const captureBody = z.object({
  title: z.string().trim().min(1).max(240),
  schedulePrecision: z.enum(["day", "month"]),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  scheduledTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  estimatedMinutes: z.number().int().min(1).max(1440).optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

const mutationIdForMini = (telegramUserId: number, operation: string, payload: unknown): string => {
  const hash = JSON.stringify(payload);
  return uuidv5(`${telegramUserId}:${operation}:${hash}`, MINIAPP_NAMESPACE);
};

export const createTelegramMiniRouter = (config: AppConfig, database?: SupabaseClient) => {
  const router = Router();

  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  // Auth middleware for Mini App
  const miniAuth = async (req: Request, res: Response, next: NextFunction) => {
    if (!config.TELEGRAM_BOT_TOKEN || !database) {
      res.status(503).json({ error: { code: "telegram_not_configured", message: "Telegram is not configured." } });
      return;
    }
    const initData = extractInitDataFromRequest(req as unknown as { header: (n: string) => string | undefined; query: Record<string, unknown> });
    if (!initData) {
      res.status(401).json({ error: { code: "unauthorized", message: "Missing initData" } });
      return;
    }
    try {
      const validated = validateInitData(initData, config.TELEGRAM_BOT_TOKEN);
      const identity = await identityFor(database, validated.telegram_user_id);
      if (!identity?.bot_access_granted) {
        res.status(403).json({ error: { code: "forbidden", message: "Telegram not linked" } });
        return;
      }
      (req as unknown as { user: { id: string }; telegramUserId: number }).user = { id: String(identity.user_id) };
      (req as unknown as { telegramUserId: number }).telegramUserId = validated.telegram_user_id;
      next();
    } catch (e) {
      if (e instanceof MiniAppAuthError) {
        const code = e.code === "expired" ? 401 : e.code === "invalid_hash" ? 401 : 400;
        res.status(code).json({ error: { code: e.code, message: e.message } });
        return;
      }
      res.status(401).json({ error: { code: "unauthorized", message: "Invalid initData" } });
    }
  };

  router.get("/current", miniAuth, async (req, res) => {
    try {
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const today = await localDateFor(database!, userId);
      const result = await getMiniCurrent(database!, userId, today);
      res.json({
        today,
        gate: result.gate.state,
        current: result.current,
        queueLength: result.queue.length,
        details: result.gate,
      });
    } catch (e) {
      res.status(500).json({ error: { code: "mini_current_failed", message: "Could not load Current" } });
    }
  });

  router.get("/today", miniAuth, async (req, res) => {
    try {
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const today = await localDateFor(database!, userId);
      const result = await getMiniToday(database!, userId, today);
      res.json({
        today,
        gate: result.gate.state,
        queue: result.queue,
        details: result.gate,
      });
    } catch (e) {
      res.status(500).json({ error: { code: "mini_today_failed", message: "Could not load Today" } });
    }
  });

  router.post("/capture", miniAuth, async (req, res) => {
    try {
      const userId = (req as unknown as { user: { id: string } }).user.id;
      const telegramUserId = (req as unknown as { telegramUserId: number }).telegramUserId;
      const today = await localDateFor(database!, userId);
      // Support both structured body and free-text capture (for quick capture)
      let payload: { title: string; schedulePrecision: "day" | "month"; scheduledFor: string; scheduledTime?: string; estimatedMinutes?: number; tags?: string[] };
      if (typeof req.body?.text === "string" && req.body.text.trim()) {
        // Free-text capture via Mini App quick input
        const parsed = parseTelegramCapture(String(req.body.text), today);
        if (parsed.defaultedToToday) {
          res.status(400).json({ error: { code: "schedule_required", message: "Choose a date for this task." } });
          return;
        }
        payload = {
          title: parsed.title,
          schedulePrecision: parsed.schedulePrecision,
          scheduledFor: parsed.scheduledFor,
          scheduledTime: parsed.scheduledTime,
          estimatedMinutes: parsed.estimatedMinutes,
          tags: parsed.tags,
        };
      } else {
        payload = captureBody.parse(req.body) as typeof payload;
      }
      const mutationId = (req.header("idempotency-key") as string) || mutationIdForMini(telegramUserId, "capture", payload);
      // Validate UUID if provided via header
      try {
        z.string().uuid().parse(mutationId);
      } catch {
        res.status(400).json({ error: { code: "invalid_idempotency_key", message: "Idempotency-Key must be a UUID" } });
        return;
      }
      const task = await createMiniTask(database!, userId, today, mutationId, payload);
      res.status(201).json({ task });
    } catch (e) {
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: { code: "invalid_request", message: "Capture data is invalid", issues: e.issues } });
        return;
      }
      const msg = e instanceof Error ? e.message : "Capture failed";
      res.status(400).json({ error: { code: "capture_failed", message: msg } });
    }
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true, miniApp: Boolean(config.TELEGRAM_BOT_TOKEN), db: Boolean(database) });
  });

  return router;
};
