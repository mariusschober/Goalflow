import type { SupabaseClient } from "@supabase/supabase-js";

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
    .select("id,title,schedule_precision,scheduled_for,state,expires_at")
    .eq("id", captureId)
    .eq("user_id", userId)
    .eq("state", "pending")
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
};

export const ensurePendingTextCapture = async (
  database: SupabaseClient,
  captureId: string,
  userId: string,
  chatId: number,
  title: string,
  today: string,
): Promise<{ existing: boolean; captureId: string } | null> => {
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
    kind: "text",
    title,
    transcript: title,
    schedule_precision: "day",
    scheduled_for: today,
    state: "pending",
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error) throw error;
  return { existing: false, captureId };
};
