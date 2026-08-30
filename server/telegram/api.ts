import type { AppConfig } from "../config";

export const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const telegramRequest = async (config: AppConfig, method: string, payload: Record<string, unknown>) => {
  const response = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed with status ${response.status}.`);
  return response.json() as Promise<{ ok: boolean; result?: unknown }>;
};

export const sendMessage = (
  config: AppConfig,
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
) =>
  telegramRequest(config, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

export const answerCallbackQuery = (config: AppConfig, callbackId: string, text?: string) =>
  telegramRequest(config, "answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(text ? { text } : {}),
  });

export { telegramRequest };
