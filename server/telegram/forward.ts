import type { TelegramMessage } from "./types";

export interface ForwardContext {
  forwardedText: string;
  forwardOrigin: unknown | null;
  tMeLink: string | null;
  sourceChatTitle?: string;
}

const extractForwardOrigin = (message: TelegramMessage): unknown | null => {
  if (message.forward_origin) return message.forward_origin;
  // Legacy fallback: construct minimal forward_origin from forward_from
  if (message.forward_from || message.forward_from_chat) {
    return {
      type: message.forward_from ? "user" : "chat",
      sender_user: message.forward_from ?? null,
      chat: message.forward_from_chat ?? null,
      date: message.forward_date ?? null,
    };
  }
  return null;
};

const buildTMeLink = (forwardOrigin: unknown, message: TelegramMessage): string | null => {
  if (!forwardOrigin || typeof forwardOrigin !== "object") return null;
  const origin = forwardOrigin as Record<string, unknown>;
  // Only construct if we have a username or chat username and message_id
  const chat = origin.chat as Record<string, unknown> | undefined;
  const username = (chat?.username ?? (message.forward_from_chat?.username as string | undefined)) as string | undefined;
  const messageId = (origin.message_id ?? message.forward_from_chat?.message_id) as number | undefined;
  if (username && messageId) {
    return `https://t.me/${username}/${messageId}`;
  }
  // For private groups with no username, Telegram uses /c/ links with chat id
  const chatId = chat?.id as number | undefined;
  if (chatId && messageId) {
    // chatId is like -100123456789, need to strip -100 prefix
    const idStr = String(chatId).replace(/^-100/, "");
    return `https://t.me/c/${idStr}/${messageId}`;
  }
  return null;
};

export const isForwarded = (message: TelegramMessage): boolean =>
  Boolean(message.forward_origin || message.forward_from || message.forward_from_chat);

export const extractForwardContext = (message: TelegramMessage): ForwardContext | null => {
  if (!isForwarded(message)) return null;
  const forwardedText = (message.text ?? message.caption ?? "").trim().slice(0, 1000);
  if (!forwardedText) return null; // need some text to capture
  const forwardOrigin = extractForwardOrigin(message);
  const tMeLink = buildTMeLink(forwardOrigin, message);
  const sourceChatTitle =
    (forwardOrigin as Record<string, unknown> | null)?.chat !== undefined
      ? String(((forwardOrigin as Record<string, unknown>).chat as Record<string, unknown> | undefined)?.title ?? "")
      : message.forward_from_chat?.title
        ? String(message.forward_from_chat.title)
        : undefined;
  return {
    forwardedText,
    forwardOrigin,
    tMeLink,
    sourceChatTitle: sourceChatTitle || undefined,
  };
};
