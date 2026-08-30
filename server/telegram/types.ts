export interface TelegramUser {
  id: number;
  username?: string;
}

export interface TelegramChat {
  id: number;
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
  voice?: TelegramVoice;
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
