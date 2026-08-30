import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedCapture } from "./capture";

export const addDays = (localDate: string, days: number): string => {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

export const findPendingCapture = async (
  database: SupabaseClient,
  captureId: string,
  userId: string,
): Promise<Record<string, unknown> | null> => {
  const nowIso = new Date().toISOString();
  const { data, error } = await database
    .from("telegram_captures")
    .select("id,title,schedule_precision,scheduled_for,scheduled_time,estimated_minutes,tags,forward_origin,forwarded_text,state,expires_at")
    .eq("id", captureId)
    .eq("user_id", userId)
    .eq("state", "pending")
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
};

export interface PendingCaptureInput {
  title: string;
  schedulePrecision: ParsedCapture["schedulePrecision"];
  scheduledFor: string;
  scheduledTime?: string;
  estimatedMinutes?: number;
  tags?: string[];
  forwardOrigin?: unknown;
  forwardedText?: string;
}

export const ensurePendingTextCapture = async (
  database: SupabaseClient,
  captureId: string,
  userId: string,
  chatId: number,
  input: PendingCaptureInput | string,
  today: string,
): Promise<{ existing: boolean; captureId: string } | null> => {
  const normalized: PendingCaptureInput =
    typeof input === "string" ? { title: input, schedulePrecision: "day", scheduledFor: today } : input;
  const { data: existing, error: existingError } = await database
    .from("telegram_captures")
    .select("id,title,schedule_precision,scheduled_for,state,expires_at")
    .eq("id", captureId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const state = String((existing as Record<string, unknown>).state ?? "");
    if (state !== "pending") return null;
    return { existing: true, captureId: String((existing as Record<string, unknown>).id) };
  }
  const { error } = await database.from("telegram_captures").insert({
    id: captureId,
    user_id: userId,
    telegram_chat_id: chatId,
    kind: normalized.forwardOrigin ? "forwarded" : "text",
    title: normalized.title,
    transcript: normalized.forwardedText ?? normalized.title,
    schedule_precision: normalized.schedulePrecision,
    scheduled_for: normalized.schedulePrecision === "month" ? `${normalized.scheduledFor}-01` : normalized.scheduledFor,
    scheduled_time: normalized.scheduledTime ?? null,
    estimated_minutes: normalized.estimatedMinutes ?? null,
    tags: normalized.tags ?? [],
    forward_origin: normalized.forwardOrigin ?? null,
    forwarded_text: normalized.forwardedText ?? null,
    state: "pending",
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  } as Record<string, unknown>);
  if (error) throw error;
  return { existing: false, captureId };
};

// Backward compat: allow old call signature with title/today
export const ensurePendingTextCaptureLegacy = async (
  database: SupabaseClient,
  captureId: string,
  userId: string,
  chatId: number,
  title: string,
  today: string,
): Promise<{ existing: boolean; captureId: string } | null> =>
  ensurePendingTextCapture(database, captureId, userId, chatId, { title, schedulePrecision: "day", scheduledFor: today }, today);
