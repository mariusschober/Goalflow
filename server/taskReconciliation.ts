import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type LegacyTask = Record<string, unknown>;

const deterministicUuid = (userId: string, namespace: string, value: string): string => {
  const bytes = crypto.createHash('sha256').update(`${userId}:${namespace}:${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const validUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const canonicalStatus = (task: LegacyTask): 'open' | 'completed' | 'broken_down' | 'dropped' | 'archived' => {
  if (task.lifecycleStatus === 'broken_down') return 'broken_down';
  if (task.lifecycleStatus === 'archived') return 'archived';
  if (task.wontDo || task.lifecycleStatus === 'dropped') return 'dropped';
  if (task.completed || task.lifecycleStatus === 'completed') return 'completed';
  return 'open';
};

export const reconcileLegacyTasks = async (database: SupabaseClient, userId: string, payload: unknown): Promise<void> => {
  if (!Array.isArray(payload)) return;
  for (const value of payload.slice(0, 10_000)) {
    if (!value || typeof value !== 'object') continue;
    const task = value as LegacyTask;
    const legacyId = String(task.id || '').slice(0, 240);
    const title = String(task.title || '').trim().slice(0, 240);
    if (!legacyId || !title) continue;
    const precision = task.schedulePrecision === 'month' ? 'month' : 'day';
    const scheduleValue = String(task.scheduledFor || task.dateAssigned || '');
    if (precision === 'day' && !/^\d{4}-\d{2}-\d{2}$/.test(scheduleValue)) continue;
    if (precision === 'month' && !/^\d{4}-\d{2}$/.test(scheduleValue)) continue;
    const status = canonicalStatus(task);
    const cloudId = validUuid(task.cloudId) ? task.cloudId : undefined;
    const habitId = task.habitId ? deterministicUuid(userId, 'habit', String(task.habitId)) : null;
    let canonicalId = cloudId;
    if (!canonicalId) {
      const { data: existing, error: lookupError } = await database.from('tasks').select('id')
        .eq('user_id', userId).eq('legacy_entity_id', legacyId).maybeSingle();
      if (lookupError) throw lookupError;
      canonicalId = existing?.id;
    }
    const row = {
      ...(canonicalId ? { id: canonicalId } : {}),
      user_id: userId,
      legacy_entity_id: canonicalId === legacyId ? null : legacyId,
      title,
      notes: String(task.description || '').slice(0, 10_000),
      tags: Array.isArray(task.hashtags) ? task.hashtags.map(String).slice(0, 20) : [],
      schedule_precision: precision,
      scheduled_for: precision === 'month' ? `${scheduleValue}-01` : scheduleValue,
      scheduled_time: typeof task.scheduledTime === 'string' ? task.scheduledTime : null,
      planned_order: Math.max(0, Math.floor(Number(task.plannedOrder || 0))),
      status,
      completed_at: status === 'completed' ? new Date(Number(task.completedAt) || Date.now()).toISOString() : null,
      is_frog: Boolean(task.isFrog),
      frog_failures: Math.max(0, Math.floor(Number(task.frogFailures ?? task.rescheduleCount ?? 0))),
      before_frog: Boolean(task.beforeFrog && habitId),
      source: ['manual', 'habit', 'telegram', 'share', 'ai', 'migration'].includes(String(task.source)) ? task.source : 'migration',
      habit_id: habitId,
      estimated_minutes: Math.min(1_440, Math.max(1, Math.floor(Number(task.duration || 25)))),
      deleted_at: task.deletedAt ? new Date(String(task.deletedAt)).toISOString() : null
    };
    const query = canonicalId
      ? database.from('tasks').upsert(row, { onConflict: 'id' })
      : database.from('tasks').insert(row);
    const { error } = await query;
    if (error) throw error;
  }
};
