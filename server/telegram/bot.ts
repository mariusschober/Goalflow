import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config";
import type { Logger } from "../logger";
import type { SpeechProvider } from "../speech/types";
import { parseTelegramCapture } from "./capture";
import { mutationIdForUpdate } from "./ids";
import { escapeHtml, sendMessage, answerCallbackQuery, telegramRequest } from "./api";
import { identityFor, localDateFor, loadQueue } from "./queue";
import type { TelegramUpdate, TelegramMessage } from "./types";
import { addDays, findPendingCapture, ensurePendingTextCapture } from "./pending";
import {
  formatAdded,
  addedKeyboard,
  formatCurrent,
  formatCurrentEmpty,
  formatToday,
  helpText,
  pendingSchedulePrompt,
} from "./formatting";

export type { TelegramUpdate, TelegramMessage, TelegramCallback, TelegramUser, TelegramChat, TelegramVoice } from "./types";

const send = sendMessage;
const answerCallback = answerCallbackQuery;

const createTask = async (
  database: SupabaseClient,
  userId: string,
  capture: ReturnType<typeof parseTelegramCapture>,
  today: string,
  mutationId: string,
  taskId = mutationId,
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
      estimatedMinutes: 25,
    },
  });
  if (error) throw error;
  return data;
};

const captureText = async (
  config: AppConfig,
  database: SupabaseClient,
  userId: string,
  chatId: number,
  text: string,
  today: string,
  updateId: number,
) => {
  const capture = parseTelegramCapture(text, today);
  // V1 product: unscheduled capture must not silently become Today.
  // Require explicit scheduling via inline clarification.
  if (capture.defaultedToToday) {
    const captureId = mutationIdForUpdate(updateId, "text-capture");
    const ensured = await ensurePendingTextCapture(database, captureId, userId, chatId, capture.title, today);
    if (ensured === null) {
      // Already resolved (confirmed/cancelled) — ignore duplicate.
      return;
    }
    const prompt = pendingSchedulePrompt(capture.title, captureId);
    // Avoid duplicate sends if this is a retry of the same update that already stored pending.
    // If existing pending was just returned as existing:true, still resend prompt idempotently
    // so the user sees the keyboard even if the first send was lost.
    await send(config, chatId, prompt.text, prompt.keyboard);
    return;
  }
  const task = (await createTask(
    database,
    userId,
    capture,
    today,
    mutationIdForUpdate(updateId, "capture-task"),
  )) as { id: string };
  const dateLabel = capture.schedulePrecision === "day" ? capture.scheduledFor : `month ${capture.scheduledFor}`;
  await send(config, chatId, formatAdded(capture.title, dateLabel), addedKeyboard(task.id));
};

const handleVoice = async (
  config: AppConfig,
  database: SupabaseClient,
  speech: SpeechProvider | undefined,
  userId: string,
  message: TelegramMessage,
  today: string,
  updateId: number,
) => {
  if (!speech) {
    await send(config, message.chat.id, "Voice capture is not configured yet. Send the task as text.");
    return;
  }
  const captureId = mutationIdForUpdate(updateId, "voice-capture");
  const { data: existingCapture, error: existingError } = await database
    .from("telegram_captures")
    .select("id,title,schedule_precision,scheduled_for,state,expires_at")
    .eq("id", captureId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existingCapture) {
    if ((existingCapture as Record<string, unknown>).state !== "pending") return;
    await send(
      config,
      message.chat.id,
      `<b>I heard:</b> ${escapeHtml(String((existingCapture as Record<string, unknown>).title ?? ""))}\nConfirm before I add it.`,
      {
        inline_keyboard: [
          [
            { text: "Add task", callback_data: `confirm:${captureId}` },
            { text: "Cancel", callback_data: `cancel:${captureId}` },
          ],
        ],
      },
    );
    return;
  }
  const voice = message.voice!;
  if ((voice.file_size ?? 0) > config.TELEGRAM_MAX_VOICE_BYTES) {
    await send(config, message.chat.id, "That voice note is too large. Keep it under 19 MB.");
    return;
  }
  const file = (await telegramRequest(config, "getFile", { file_id: voice.file_id })) as {
    result?: { file_path?: string; file_size?: number };
  };
  const path = file.result?.file_path;
  if (!path || (file.result?.file_size ?? 0) > config.TELEGRAM_MAX_VOICE_BYTES)
    throw new Error("Telegram voice file is unavailable or too large.");
  const response = await fetch(`https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${path}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Telegram voice download failed.");
  let audio: Uint8Array | undefined = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength > config.TELEGRAM_MAX_VOICE_BYTES) throw new Error("Telegram voice file exceeded the limit.");
  const transcript = await speech.transcribe({ audio, mimeType: voice.mime_type ?? "audio/ogg", fileName: "voice.ogg" });
  audio = undefined;
  const capture = parseTelegramCapture(transcript, today);
  const { data, error } = await database
    .from("telegram_captures")
    .insert({
      id: captureId,
      user_id: userId,
      telegram_chat_id: message.chat.id,
      kind: "voice",
      title: capture.title,
      transcript,
      schedule_precision: capture.schedulePrecision,
      scheduled_for: capture.schedulePrecision === "month" ? `${capture.scheduledFor}-01` : capture.scheduledFor,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  await send(config, message.chat.id, `<b>I heard:</b> ${escapeHtml(capture.title)}\nConfirm before I add it.`, {
    inline_keyboard: [
      [
        { text: "Add task", callback_data: `confirm:${(data as { id: string }).id}` },
        { text: "Cancel", callback_data: `cancel:${(data as { id: string }).id}` },
      ],
    ],
  });
};

const handleScheduleCallback = async (
  config: AppConfig,
  database: SupabaseClient,
  userId: string,
  chatId: number,
  captureId: string,
  choice: string,
  today: string,
  callbackUpdateId: number,
  callbackId: string,
) => {
  if (choice === "today" || choice === "tomorrow") {
    const pending = await findPendingCapture(database, captureId, userId);
    if (!pending) {
      await answerCallback(config, callbackId, "Capture expired");
      return;
    }
    const title = String(pending.title ?? "");
    if (!title.trim()) {
      await answerCallback(config, callbackId, "Capture expired");
      return;
    }
    const scheduledFor = choice === "today" ? today : addDays(today, 1);
    const capture = { title, schedulePrecision: "day" as const, scheduledFor, defaultedToToday: false };
    const task = (await createTask(
      database,
      userId,
      capture,
      today,
      mutationIdForUpdate(callbackUpdateId, "schedule-text-task"),
      captureId,
    )) as { id: string };
    const { error: confirmError } = await database
      .from("telegram_captures")
      .update({ state: "confirmed" })
      .eq("id", captureId)
      .eq("user_id", userId)
      .eq("state", "pending");
    if (confirmError) throw confirmError;
    await answerCallback(config, callbackId, "Task added");
    await send(config, chatId, formatAdded(title, scheduledFor), addedKeyboard(task.id));
    return;
  }
  if (choice === "pick") {
    await answerCallback(config, callbackId);
    await send(
      config,
      chatId,
      `Send a date like <code>2026-09-14</code> or include it in your task, e.g. <code>Buy paper 2026-09-14</code>.`,
    );
    return;
  }
  if (choice === "month") {
    await answerCallback(config, callbackId);
    await send(
      config,
      chatId,
      `Send a month like <code>in September</code> or <code>in June 2027</code>, e.g. <code>Buy paper in September</code>.`,
    );
    return;
  }
  await answerCallback(config, callbackId, "Unknown choice");
};

export const createTelegramProcessor = (
  config: AppConfig,
  database: SupabaseClient,
  speech: SpeechProvider | undefined,
  logger: Logger,
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
  await database
    .from("telegram_identities")
    .update({ telegram_chat_id: message.chat.id, updated_at: new Date().toISOString() })
    .eq("telegram_user_id", from.id);
  const userId = String(identity.user_id);
  const today = await localDateFor(database, userId);

  if (callback?.data) {
    const raw = String(callback.data);
    // Structured callbacks: sch:today:<uuid> etc. keep uuid intact after second colon.
    if (raw.startsWith("sch:")) {
      const withoutPrefix = raw.slice(4); // remove "sch:"
      const sepIndex = withoutPrefix.indexOf(":");
      if (sepIndex === -1) {
        await answerCallback(config, callback.id, "Invalid choice");
        return;
      }
      const choice = withoutPrefix.slice(0, sepIndex);
      const captureId = withoutPrefix.slice(sepIndex + 1);
      await handleScheduleCallback(config, database, userId, message.chat.id, captureId, choice, today, update.update_id, callback.id);
      return;
    }
    // Flat callbacks: action:id
    const colonIndex = raw.indexOf(":");
    const action = colonIndex === -1 ? raw : raw.slice(0, colonIndex);
    const id = colonIndex === -1 ? "" : raw.slice(colonIndex + 1);
    if (action === "undo") {
      // Preserve source guard: only telegram-sourced open tasks may be undone via Telegram.
      const { data: taskRow, error: taskError } = await database
        .from("tasks")
        .select("id,source,status")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (taskError) throw taskError;
      const row = taskRow as Record<string, unknown> | null;
      if (!row || String(row.source) !== "telegram" || String(row.status) !== "open") {
        await answerCallback(config, callback.id, "Task not available for Undo");
        return;
      }
      const { error } = await database.rpc("goalflow_drop_task_idempotent", {
        target_user_id: userId,
        target_mutation_id: mutationIdForUpdate(update.update_id, "undo-task"),
        target_task_id: id,
        target_local_date: today,
      });
      await answerCallback(config, callback.id, error ? "Undo failed" : "Task removed");
      if (!error) {
        await send(config, message.chat.id, "Undone.");
      }
      return;
    }
    if (action === "date") {
      await answerCallback(config, callback.id);
      await send(config, message.chat.id, `Use <code>/move ${id} YYYY-MM-DD</code>.`);
      return;
    }
    if (action === "cancel") {
      await database
        .from("telegram_captures")
        .update({ state: "cancelled" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("state", "pending");
      await answerCallback(config, callback.id, "Capture cancelled");
      return;
    }
    if (action === "confirm") {
      const pending = await findPendingCapture(database, id, userId);
      // Legacy fallback: fetch any pending row matching id (including voice pending that may be expired but we treat as not pending)
      const effectivePending =
        pending ??
        ((await database
          .from("telegram_captures")
          .select("*")
          .eq("id", id)
          .eq("user_id", userId)
          .eq("state", "pending")
          .gt("expires_at", new Date().toISOString())
          .maybeSingle()
          .then((r) => (r.data as Record<string, unknown> | null))) as Record<string, unknown> | null);
      if (!effectivePending) {
        await answerCallback(config, callback.id, "Capture expired");
        return;
      }
      const capture = {
        title: String(effectivePending.title ?? ""),
        schedulePrecision: effectivePending.schedule_precision as "day" | "month",
        scheduledFor:
          effectivePending.schedule_precision === "month"
            ? String(effectivePending.scheduled_for).slice(0, 7)
            : String(effectivePending.scheduled_for).slice(0, 10),
        defaultedToToday: false,
      };
      await createTask(database, userId, capture, today, mutationIdForUpdate(update.update_id, "confirm-voice-task"), id);
      const { error: confirmError } = await database
        .from("telegram_captures")
        .update({ state: "confirmed" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("state", "pending");
      if (confirmError) throw confirmError;
      await answerCallback(config, callback.id, "Task added");
      return;
    }
    if (action === "done" && id === "current") {
      const { gate, queue } = await loadQueue(database, userId, today);
      if (gate.state !== "ready" || !gate.queue[0]) {
        await answerCallback(config, callback.id, "Nothing to complete");
        return;
      }
      const current = gate.queue[0];
      const { error } = await database.rpc("goalflow_complete_task_idempotent", {
        target_user_id: userId,
        target_mutation_id: mutationIdForUpdate(update.update_id, "complete-current-cb"),
        target_task_id: current.id,
        target_local_date: today,
      });
      await answerCallback(config, callback.id, error ? "Could not complete" : "Completed");
      if (!error) await send(config, message.chat.id, `Completed: ${escapeHtml(current.title)}`);
      return;
    }
    if (action === "skip" && id === "current") {
      const { gate } = await loadQueue(database, userId, today);
      if (gate.state !== "ready" || !gate.queue[0]) {
        await answerCallback(config, callback.id, "Nothing to skip");
        return;
      }
      const current = gate.queue[0];
      if (current.isFrog) {
        await answerCallback(config, callback.id, "A frog cannot be skipped");
        return;
      }
      const { error } = await database.rpc("goalflow_skip_task_idempotent", {
        target_user_id: userId,
        target_mutation_id: mutationIdForUpdate(update.update_id, "skip-current-cb"),
        target_task_id: current.id,
        target_day: today,
      });
      await answerCallback(config, callback.id, error ? "Could not skip" : "Skipped");
      if (!error) await send(config, message.chat.id, `Moved to the end of today: ${escapeHtml(current.title)}`);
      return;
    }
    if (action === "nav" && id === "current") {
      const { gate, queue } = await loadQueue(database, userId, today);
      if (gate.state !== "ready" || !gate.queue[0]) {
        await send(
          config,
          message.chat.id,
          gate.state === "empty" ? "Nothing is scheduled for today." : `Planning is required before Current is available. Open ${config.APP_ORIGIN}`,
        );
        await answerCallback(config, callback.id);
        return;
      }
      const current = gate.queue[0];
      const formatted = formatCurrent(current, queue.length, config);
      await send(config, message.chat.id, formatted.text, formatted.keyboard);
      await answerCallback(config, callback.id);
      return;
    }
  }

  if (message.voice) {
    await handleVoice(config, database, speech, userId, message, today, update.update_id);
    return;
  }
  const text = message.text?.trim();
  if (!text) return;
  const [commandWithBot, ...parts] = text.split(/\s+/);
  const command = commandWithBot.toLowerCase().split("@")[0];
  if (command === "/start" || command === "/help") {
    await send(config, message.chat.id, helpText());
    return;
  }
  if (command === "/current" || command === "/today" || command === "/done" || command === "/skip") {
    const { gate, queue } = await loadQueue(database, userId, today);
    if (command === "/today") {
      const formatted = formatToday(queue, config);
      await send(config, message.chat.id, formatted.text, formatted.keyboard);
      return;
    }
    if (gate.state !== "ready" || !gate.queue[0]) {
      await send(config, message.chat.id, formatCurrentEmpty(gate.state, config));
      return;
    }
    const current = gate.queue[0];
    if (command === "/current") {
      const formatted = formatCurrent(current, queue.length, config);
      await send(config, message.chat.id, formatted.text, formatted.keyboard);
      return;
    }
    if (command === "/done") {
      const { error } = await database.rpc("goalflow_complete_task_idempotent", {
        target_user_id: userId,
        target_mutation_id: mutationIdForUpdate(update.update_id, "complete-current"),
        target_task_id: current.id,
        target_local_date: today,
      });
      await send(config, message.chat.id, error ? "The task could not be completed." : `Completed: ${escapeHtml(current.title)}`);
      return;
    }
    const { error } = await database.rpc("goalflow_skip_task_idempotent", {
      target_user_id: userId,
      target_mutation_id: mutationIdForUpdate(update.update_id, "skip-current"),
      target_task_id: current.id,
      target_day: today,
    });
    if (error)
      await send(
        config,
        message.chat.id,
        current.isFrog ? "A frog cannot be skipped. Complete it, break it down, or drop it explicitly." : "This task could not be skipped.",
      );
    else await send(config, message.chat.id, `Moved to the end of today: ${escapeHtml(current.title)}`);
    return;
  }
  if (command === "/move") {
    const [id, date] = parts;
    if (!id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await send(config, message.chat.id, "Use <code>/move TASK_ID YYYY-MM-DD</code>.");
      return;
    }
    const parsed = parseTelegramCapture(`Move ${date ?? ""}`, today);
    const { error } = await database.rpc("goalflow_reschedule_task_idempotent", {
      target_user_id: userId,
      target_mutation_id: mutationIdForUpdate(update.update_id, "move-task"),
      target_task_id: id,
      target_local_date: today,
      target_schedule_precision: "day",
      target_scheduled_for: parsed.scheduledFor,
      target_scheduled_time: null,
    });
    await send(config, message.chat.id, error ? "The task could not be moved." : `Moved to ${parsed.scheduledFor}.`);
    return;
  }
  const captureTextValue = command === "/add" ? parts.join(" ") : text;
  try {
    await captureText(config, database, userId, message.chat.id, captureTextValue, today, update.update_id);
  } catch (error) {
    logger.warn("telegram.capture_rejected", {
      updateId: update.update_id,
      userId,
      category: error instanceof Error ? error.name : "unknown",
    });
    await send(config, message.chat.id, error instanceof Error ? escapeHtml(error.message) : "The task could not be added.");
  }
};
