import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config";
import type { Logger } from "../logger";
import type { SpeechProvider } from "../speech/types";
import { createTelegramProcessor, type TelegramUpdate } from "../telegram/bot";

export const createTelegramRouter = (
  config: AppConfig, database: SupabaseClient | undefined, speech: SpeechProvider | undefined, logger: Logger
) => {
  const router = Router();
  const processor = database ? createTelegramProcessor(config, database, speech, logger) : undefined;
  router.post("/webhook", async (request, response) => {
    if (!config.TELEGRAM_WEBHOOK_SECRET || !config.TELEGRAM_BOT_TOKEN || !processor || !database) {
      response.status(503).json({ error: { code: "telegram_not_configured", message: "Telegram is not configured." } }); return;
    }
    if (request.header("x-telegram-bot-api-secret-token") !== config.TELEGRAM_WEBHOOK_SECRET) {
      response.status(401).json({ error: { code: "invalid_webhook_secret", message: "Webhook authentication failed." } }); return;
    }
    const update = request.body as TelegramUpdate;
    if (!Number.isSafeInteger(update?.update_id)) {
      response.status(400).json({ error: { code: "invalid_update", message: "Telegram update is invalid." } }); return;
    }
    const telegramUserId = update.message?.from?.id ?? update.callback_query?.from?.id;
    const { error } = await database.from("telegram_updates").insert({ update_id: update.update_id, telegram_user_id: telegramUserId ?? null });
    if (error?.code === "23505") { response.status(200).json({ ok: true, duplicate: true }); return; }
    if (error) { response.status(503).json({ error: { code: "deduplication_unavailable", message: "Update could not be accepted." } }); return; }
    response.status(202).json({ ok: true });
    void processor(update).then(async () => {
      await database.from("telegram_updates").update({ processed_at: new Date().toISOString(), outcome: "processed" }).eq("update_id", update.update_id);
    }).catch(async (processingError) => {
      logger.error("telegram.update_failed", { updateId: update.update_id, category: processingError instanceof Error ? processingError.name : "unknown" });
      await database.from("telegram_updates").update({ processed_at: new Date().toISOString(), outcome: "error", error_code: "processing_failed" }).eq("update_id", update.update_id);
    });
  });
  return router;
};
