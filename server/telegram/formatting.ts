import { escapeHtml } from "./api";
import type { ScheduledTask } from "../../src/domain/scheduling";
import type { AppConfig } from "../config";

export const formatAdded = (title: string, dateLabel: string): string =>
  `<b>Added:</b> ${escapeHtml(title)}\nScheduled for ${dateLabel}.`;

export const formatAddedRich = (
  title: string,
  dateLabel: string,
  opts: { scheduledTime?: string; estimatedMinutes?: number; tags?: string[] } = {},
): string => {
  const timePart = opts.scheduledTime ? ` at ${opts.scheduledTime}` : "";
  const durationPart = opts.estimatedMinutes ? ` · ${opts.estimatedMinutes} min` : "";
  const tagsPart = opts.tags?.length ? ` ${opts.tags.map((t) => `#${t}`).join(" ")}` : "";
  const suffix = `${timePart}${durationPart}${tagsPart}`.trim();
  const titleLine = suffix ? `${escapeHtml(title)} — ${suffix}` : escapeHtml(title);
  // Keep backward compat: if no rich opts, use simple format
  if (!opts.scheduledTime && !opts.estimatedMinutes && !opts.tags?.length) {
    return formatAdded(title, dateLabel);
  }
  return `<b>Added:</b> ${titleLine}\nScheduled for ${dateLabel}.`;
};

export const addedKeyboard = (taskId: string): Record<string, unknown> => ({
  inline_keyboard: [
    [
      { text: "Undo", callback_data: `undo:${taskId}` },
      { text: "Change date", callback_data: `date:${taskId}` },
    ],
  ],
});

export const addedKeyboardWithOpen = (taskId: string, config: AppConfig): Record<string, unknown> => ({
  inline_keyboard: [
    [
      { text: "Undo", callback_data: `undo:${taskId}` },
      { text: "Open", url: `${config.APP_ORIGIN}/?taskId=${taskId}&view=current` },
    ],
    [{ text: "Change date", callback_data: `date:${taskId}` }],
  ],
});

export const formatCurrent = (
  task: ScheduledTask,
  remaining: number,
  config: AppConfig,
): { text: string; keyboard?: Record<string, unknown> } => {
  const lines = [`<b>CURRENT</b>`, `${task.isFrog ? "🐸 " : ""}${escapeHtml(task.title)}`];
  if (task.notes) lines.push(escapeHtml(task.notes));
  const meta: string[] = [];
  if (task.scheduledTime) meta.push(task.scheduledTime);
  // estimatedMinutes is not in ScheduledTask, but we can handle if present via any
  const est = (task as unknown as { estimatedMinutes?: number }).estimatedMinutes;
  if (est) meta.push(`${est} min`);
  if (task.tags?.length) meta.push(task.tags.map((t) => `#${t}`).join(" "));
  if (meta.length) lines.push(meta.join(" · "));
  lines.push(`${remaining} remaining today.`);
  return {
    text: lines.join("\n"),
    keyboard: {
      inline_keyboard: [
        [
          { text: "Done", callback_data: `done:current` },
          { text: "Skip", callback_data: `skip:current` },
        ],
        [{ text: "Open in Goalflow", url: `${config.APP_ORIGIN}/?view=current` }],
      ],
    },
  };
};

export const formatCurrentEmpty = (
  gateState: string,
  config: AppConfig,
): string =>
  gateState === "empty"
    ? "Nothing is scheduled for today."
    : `Planning is required before Current is available. Open ${config.APP_ORIGIN}`;

export const formatToday = (
  queue: ScheduledTask[],
  config: AppConfig,
): { text: string; keyboard?: Record<string, unknown> } => {
  if (!queue.length) {
    return { text: "Nothing is scheduled for today." };
  }
  const lines = [`<b>TODAY</b>`, ""];
  for (let index = 0; index < queue.length; index += 1) {
    const task = queue[index];
    const prefix = index === 0 ? "→ " : "  ";
    const est = (task as unknown as { estimatedMinutes?: number }).estimatedMinutes;
    const timePart = task.scheduledTime ? ` · ${task.scheduledTime}` : "";
    const estPart = est ? ` · ${est}m` : "";
    const tagsPart = task.tags?.length ? ` ${task.tags.map((t) => `#${t}`).join(" ")}` : "";
    lines.push(`${prefix}${task.isFrog ? "🐸 " : ""}${escapeHtml(task.title)}${timePart}${estPart}${tagsPart}`);
  }
  const totalMins = queue.reduce((sum, t) => sum + ((t as unknown as { estimatedMinutes?: number }).estimatedMinutes ?? 25), 0);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const durationLabel = hours ? `${hours}h ${mins}m` : `${mins}m`;
  lines.push("", `${queue.length} open · ${durationLabel} remaining`);
  return {
    text: lines.join("\n"),
    keyboard: {
      inline_keyboard: [
        [
          { text: "Current", callback_data: "nav:current" },
          { text: "Open Planning", url: `${config.APP_ORIGIN}/?view=planning` },
        ],
      ],
    },
  };
};

export const helpText = (): string =>
  "<b>Goalflow</b>\n/current - one task\n/today - today's ordered queue\n/add Task title - capture\n/done - complete Current\n/skip - rotate Current\nSend plain text or a voice note to capture quickly.";

export const pendingSchedulePrompt = (
  title: string,
  captureId: string,
): { text: string; keyboard: Record<string, unknown> } => ({
  text: `${escapeHtml(title)}\n\nWhen?`,
  keyboard: {
    inline_keyboard: [
      [
        { text: "Today", callback_data: `sch:today:${captureId}` },
        { text: "Tomorrow", callback_data: `sch:tomorrow:${captureId}` },
      ],
      [
        { text: "Pick date", callback_data: `sch:pick:${captureId}` },
        { text: "Future month", callback_data: `sch:month:${captureId}` },
      ],
    ],
  },
});
