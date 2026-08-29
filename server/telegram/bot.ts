import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config";
import type { Logger } from "../logger";
import type { SpeechProvider } from "../speech/types";
import { buildTodayQueue, getPlanningGate, type DailyPlan, type ScheduledTask } from "../../src/domain/scheduling";
import { parseTelegramCapture } from "./capture";
import { v5 as uuidv5 } from "uuid";

const TELEGRAM_MUTATION_NAMESPACE = "af6e79e1-c616-4c61-bc96-7207d02c9a95";
const mutationIdForUpdate = (updateId: number, operation: string): string =>
  uuidv5(`${updateId}:${operation}`, TELEGRAM_MUTATION_NAMESPACE);

interface TelegramUser { id: number; username?: string }
interface TelegramChat { id: number }
interface TelegramVoice { file_id: string; file_size?: number; mime_type?: string }
interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  voice?: TelegramVoice;
}
interface TelegramCallback { id: string; from: TelegramUser; message?: TelegramMessage; data?: string }
export interface TelegramUpdate { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallback }

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const rowToTask = (row: Record<string, unknown>): ScheduledTask => ({
  id: String(row.id), userId: String(row.user_id), title: String(row.title), notes: String(row.notes ?? ""),
  tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  schedulePrecision: row.schedule_precision as "day" | "month",
  scheduledFor: row.schedule_precision === "month" ? String(row.scheduled_for).slice(0, 7) : String(row.scheduled_for).slice(0, 10),
  scheduledTime: row.scheduled_time ? String(row.scheduled_time).slice(0, 5) : undefined,
  plannedOrder: Number(row.planned_order ?? 0), status: row.status as ScheduledTask["status"],
  isFrog: Boolean(row.is_frog), frogFailures: Number(row.frog_failures ?? 0), beforeFrog: Boolean(row.before_frog),
  source: row.source as ScheduledTask["source"], parentTaskId: row.parent_task_id ? String(row.parent_task_id) : undefined,
  habitId: row.habit_id ? String(row.habit_id) : undefined, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : undefined, version: Number(row.revision ?? 1)
});

const telegramRequest = async (config: AppConfig, method: string, payload: Record<string, unknown>) => {
  const response = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed with status ${response.status}.`);
  return response.json() as Promise<{ ok: boolean; result?: unknown }>;
};

const send = (config: AppConfig, chatId: number, text: string, replyMarkup?: Record<string, unknown>) =>
  telegramRequest(config, "sendMessage", {
    chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  });

const answerCallback = (config: AppConfig, callbackId: string, text?: string) =>
  telegramRequest(config, "answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });

const identityFor = async (database: SupabaseClient, telegramUserId: number) => {
  const { data, error } = await database.from("telegram_identities")
    .select("user_id,telegram_chat_id,bot_access_granted")
    .eq("telegram_user_id", telegramUserId).maybeSingle();
  if (error) throw error;
  return data;
};

const existingApiReceipt = async (database: SupabaseClient, userId: string, mutationId: string) => {
  const { data, error } = await database.from("api_mutation_receipts")
    .select("operation,response")
    .eq("user_id", userId)
    .eq("mutation_id", mutationId)
    .maybeSingle();
  if (error) throw error;
  return data as { operation?: string; response?: Record<string, unknown> } | null;
};

const localDateFor = async (database: SupabaseClient, userId: string): Promise<string> => {
  const { data } = await database.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  const timeZone = String(data?.timezone ?? "UTC");
  try { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
};

const loadQueue = async (database: SupabaseClient, userId: string, today: string) => {
  const [{ data: rows, error }, { data: planRow, error: planError }] = await Promise.all([
    database.from("tasks").select("*").eq("user_id", userId).eq("status", "open").is("deleted_at", null),
    database.from("daily_plans").select("local_date,confirmed_at,task_ids").eq("user_id", userId).eq("local_date", today).maybeSingle()
  ]);
  if (error) throw error; if (planError) throw planError;
  const tasks = (rows ?? []).map((row) => rowToTask(row as Record<string, unknown>));
  const plan: DailyPlan | undefined = planRow ? {
    localDate: String(planRow.local_date), confirmedAt: String(planRow.confirmed_at), taskIds: (planRow.task_ids ?? []).map(String)
  } : undefined;
  return { tasks, gate: getPlanningGate(tasks, today, plan), queue: buildTodayQueue(tasks, today) };
};

const createTask = async (
  database: SupabaseClient,
  userId: string,
  capture: ReturnType<typeof parseTelegramCapture>,
  today: string,
  mutationId: string,
  taskId = mutationId
) => {
  const { data, error } = await database.rpc("goalflow_create_task_idempotent", {
    target_user_id: userId,
    target_mutation_id: mutationId,
    target_local_date: today,
    task_payload: {
      taskId,
      title: capture.title,
      notes: "",
      tags: [],
      schedulePrecision: capture.schedulePrecision,
      scheduledFor: capture.scheduledFor,
      plannedOrder: 0,
      isFrog: false,
      beforeFrog: false,
      source: "telegram",
      estimatedMinutes: 25
    }
  });
  if (error) throw error;
  return data;
};

const captureText = async (
  config: AppConfig, database: SupabaseClient, userId: string, chatId: number,
  text: string, today: string, updateId: number
) => {
  const capture = parseTelegramCapture(text, today);
  const task = await createTask(
    database, userId, capture, today, mutationIdForUpdate(updateId, "capture-task")
  );
  const dateLabel = capture.schedulePrecision === "day" ? capture.scheduledFor : `month ${capture.scheduledFor}`;
  await send(config, chatId, `<b>Added:</b> ${escapeHtml(capture.title)}\nScheduled for ${dateLabel}.`, {
    inline_keyboard: [[
      { text: "Undo", callback_data: `undo:${task.id}:${task.revision}` },
      { text: "Change date", callback_data: `date:${task.id}` }
    ]]
  });
};

const handleVoice = async (
  config: AppConfig, database: SupabaseClient, speech: SpeechProvider | undefined,
  userId: string, message: TelegramMessage, today: string, updateId: number
) => {
  if (!speech) { await send(config, message.chat.id, "Voice capture is not configured yet. Send the task as text."); return; }
  const captureId = mutationIdForUpdate(updateId, "voice-capture");
  const { data: existingCapture, error: existingError } = await database.from("telegram_captures")
    .select("id,title,schedule_precision,scheduled_for,state,expires_at")
    .eq("id", captureId).eq("user_id", userId).maybeSingle();
  if (existingError) throw existingError;
  if (existingCapture) {
    if (existingCapture.state !== "pending") return;
    await send(config, message.chat.id, `<b>I heard:</b> ${escapeHtml(String(existingCapture.title))}\nConfirm before I add it.`, {
      inline_keyboard: [[
        { text: "Add task", callback_data: `confirm:${captureId}` },
        { text: "Cancel", callback_data: `cancel:${captureId}` }
      ]]
    });
    return;
  }
  const voice = message.voice!;
  if ((voice.file_size ?? 0) > config.TELEGRAM_MAX_VOICE_BYTES) {
    await send(config, message.chat.id, "That voice note is too large. Keep it under 19 MB."); return;
  }
  const file = await telegramRequest(config, "getFile", { file_id: voice.file_id }) as { result?: { file_path?: string; file_size?: number } };
  const path = file.result?.file_path;
  if (!path || (file.result?.file_size ?? 0) > config.TELEGRAM_MAX_VOICE_BYTES) throw new Error("Telegram voice file is unavailable or too large.");
  const response = await fetch(`https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Telegram voice download failed.");
  let audio: Uint8Array | undefined = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength > config.TELEGRAM_MAX_VOICE_BYTES) throw new Error("Telegram voice file exceeded the limit.");
  const transcript = await speech.transcribe({ audio, mimeType: voice.mime_type ?? "audio/ogg", fileName: "voice.ogg" });
  audio = undefined;
  const capture = parseTelegramCapture(transcript, today);
  const { data, error } = await database.from("telegram_captures").insert({
    id: captureId, user_id: userId, telegram_chat_id: message.chat.id, kind: "voice", title: capture.title,
    transcript, schedule_precision: capture.schedulePrecision,
    scheduled_for: capture.schedulePrecision === "month" ? `${capture.scheduledFor}-01` : capture.scheduledFor,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString()
  }).select("id").single();
  if (error) throw error;
  await send(config, message.chat.id, `<b>I heard:</b> ${escapeHtml(capture.title)}\nConfirm before I add it.`, {
    inline_keyboard: [[
      { text: "Add task", callback_data: `confirm:${data.id}` },
      { text: "Cancel", callback_data: `cancel:${data.id}` }
    ]]
  });
};

export const createTelegramProcessor = (
  config: AppConfig, database: SupabaseClient, speech: SpeechProvider | undefined, logger: Logger
) => async (update: TelegramUpdate) => {
  const callback = update.callback_query;
  const message = update.message ?? callback?.message;
  const from = update.message?.from ?? callback?.from;
  if (!message || !from) return;
  const identity = await identityFor(database, from.id);
  if (!identity?.bot_access_granted) {
    await send(config, message.chat.id, `Link this Telegram account in Goalflow first: ${config.APP_ORIGIN}`);
    return;
  }
  await database.from("telegram_identities").update({ telegram_chat_id: message.chat.id, updated_at: new Date().toISOString() })
    .eq("telegram_user_id", from.id);
  const userId = String(identity.user_id);
  const today = await localDateFor(database, userId);

  if (callback?.data) {
    const [action, id, revisionText] = callback.data.split(":");
    if (action === "undo") {
      const expected = Number(revisionText);
      if (!Number.isSafeInteger(expected) || expected <= 0) {
        await answerCallback(config, callback.id, "Task changed; open Goalflow before removing it."); return;
      }
      const { data: dropped, error: dropError } = await database.from("tasks").update({ status: "dropped" })
        .eq("id", id).eq("user_id", userId).eq("source", "telegram").eq("status", "open")
        .eq("revision", expected).select("id").maybeSingle();
      if (dropError) throw dropError;
      await answerCallback(config, callback.id, dropped ? "Task removed" : "Task changed; nothing was removed."); return;
    }
    if (action === "date") {
      await answerCallback(config, callback.id);
      await send(config, message.chat.id, `Use <code>/move ${id} YYYY-MM-DD</code>.`); return;
    }
    if (action === "cancel") {
      await database.from("telegram_captures").update({ state: "cancelled" }).eq("id", id).eq("user_id", userId).eq("state", "pending");
      await answerCallback(config, callback.id, "Capture cancelled"); return;
    }
    if (action === "confirm") {
      const { data: pending } = await database.from("telegram_captures").select("*").eq("id", id).eq("user_id", userId)
        .eq("state", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!pending) { await answerCallback(config, callback.id, "Capture expired"); return; }
      const capture = {
        title: String(pending.title),
        schedulePrecision: pending.schedule_precision as "day" | "month",
        scheduledFor: pending.schedule_precision === "month"
          ? String(pending.scheduled_for).slice(0, 7)
          : String(pending.scheduled_for).slice(0, 10),
        defaultedToToday: false
      };
      await createTask(
        database,
        userId,
        capture,
        today,
        mutationIdForUpdate(update.update_id, "confirm-voice-task"),
        id
      );
      const { error: confirmError } = await database.from("telegram_captures")
        .update({ state: "confirmed" }).eq("id", id).eq("user_id", userId).eq("state", "pending");
      if (confirmError) throw confirmError;
      await answerCallback(config, callback.id, "Task added"); return;
    }
  }

  if (message.voice) { await handleVoice(config, database, speech, userId, message, today, update.update_id); return; }
  const text = message.text?.trim(); if (!text) return;
  const [commandWithBot, ...parts] = text.split(/\s+/); const command = commandWithBot.toLowerCase().split("@")[0];
  if (command === "/start" || command === "/help") {
    await send(config, message.chat.id, "<b>Goalflow</b>\n/current - one task\n/today - today's ordered queue\n/add Task title - capture\n/done - complete Current\n/skip - rotate Current\nSend plain text or a voice note to capture quickly."); return;
  }
  if (command === "/current" || command === "/today" || command === "/done" || command === "/skip") {
    const commandMutationId = command === "/done"
      ? mutationIdForUpdate(update.update_id, "complete-current")
      : command === "/skip"
        ? mutationIdForUpdate(update.update_id, "skip-current")
        : undefined;
    if (commandMutationId) {
      const receipt = await existingApiReceipt(database, userId, commandMutationId);
      if (receipt?.response) {
        const title = escapeHtml(String(receipt.response.title ?? "task"));
        await send(config, message.chat.id, command === "/done" ? `Completed: ${title}` : `Moved to the end of today: ${title}`);
        return;
      }
    }
    const { gate, queue } = await loadQueue(database, userId, today);
    if (command === "/today") {
      await send(config, message.chat.id, queue.length ? queue.map((task, index) => `${index + 1}. ${task.isFrog ? "🐸 " : ""}${escapeHtml(task.title)}`).join("\n") : "Nothing is scheduled for today."); return;
    }
    if (gate.state !== "ready" || !gate.queue[0]) {
      await send(config, message.chat.id, gate.state === "empty" ? "Nothing is scheduled for today." : `Planning is required before Current is available. Open ${config.APP_ORIGIN}`); return;
    }
    const current = gate.queue[0];
    if (command === "/current") {
      await send(config, message.chat.id, `<b>Current</b>\n${escapeHtml(current.title)}${current.notes ? `\n${escapeHtml(current.notes)}` : ""}\n${gate.queue.length} remaining today.`); return;
    }
    if (command === "/done") {
      const { error } = await database.rpc('goalflow_complete_task_idempotent', {
        target_user_id: userId,
        target_mutation_id: mutationIdForUpdate(update.update_id, "complete-current"),
        target_task_id: current.id,
        target_local_date: today,
        target_expected_revision: current.version
      });
      await send(config, message.chat.id, error ? 'The task could not be completed.' : `Completed: ${escapeHtml(current.title)}`); return;
    }
    const { error } = await database.rpc("goalflow_skip_task_idempotent", {
      target_user_id: userId,
      target_mutation_id: mutationIdForUpdate(update.update_id, "skip-current"),
      target_task_id: current.id,
      target_day: today,
      target_expected_revision: current.version
    });
    if (error) await send(config, message.chat.id, current.isFrog ? "A frog cannot be skipped. Complete it, break it down, or drop it explicitly." : "This task could not be skipped.");
    else await send(config, message.chat.id, `Moved to the end of today: ${escapeHtml(current.title)}`);
    return;
  }
  if (command === "/move") {
    const [id, date] = parts;
    if (!id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await send(config, message.chat.id, "Use <code>/move TASK_ID YYYY-MM-DD</code>.");
      return;
    }
    const moveMutationId = mutationIdForUpdate(update.update_id, "move-task");
    const existingMove = await existingApiReceipt(database, userId, moveMutationId);
    if (existingMove?.response) {
      await send(config, message.chat.id, `Moved to ${String(existingMove.response.scheduled_for).slice(0, 10)}.`); return;
    }
    const { data: taskToMove, error: taskError } = await database.from("tasks")
      .select("revision,status,deleted_at").eq("id", id).eq("user_id", userId).maybeSingle();
    if (taskError) throw taskError;
    if (!taskToMove || taskToMove.status !== "open" || taskToMove.deleted_at) {
      await send(config, message.chat.id, "The task no longer exists or is no longer open."); return;
    }
    const parsed = parseTelegramCapture(`Move ${date ?? ""}`, today);
    const { error } = await database.rpc('goalflow_reschedule_task_idempotent', {
      target_user_id: userId,
      target_mutation_id: moveMutationId,
      target_task_id: id, target_local_date: today,
      target_schedule_precision: 'day', target_scheduled_for: parsed.scheduledFor, target_scheduled_time: null,
      target_expected_revision: Number(taskToMove.revision)
    });
    await send(config, message.chat.id, error ? "The task could not be moved." : `Moved to ${parsed.scheduledFor}.`); return;
  }
  const captureTextValue = command === "/add" ? parts.join(" ") : text;
  try { await captureText(config, database, userId, message.chat.id, captureTextValue, today, update.update_id); }
  catch (error) {
    logger.warn("telegram.capture_rejected", { updateId: update.update_id, userId, category: error instanceof Error ? error.name : "unknown" });
    await send(config, message.chat.id, error instanceof Error ? escapeHtml(error.message) : "The task could not be added.");
  }
};
