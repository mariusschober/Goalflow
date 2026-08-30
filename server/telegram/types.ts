export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramChat {
  id: number;
  type?: string;
  title?: string;
  username?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_size?: number;
  mime_type?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  voice?: TelegramVoice;
  // Forwarded message metadata (Bot API 7.0+ forward_origin, legacy forward_from)
  forward_origin?: unknown;
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat & { message_id?: number };
  forward_date?: number;
  // For forwarded via forward_origin, Telegram may include forward_origin object
}

export interface TelegramCallback {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallback;
}
