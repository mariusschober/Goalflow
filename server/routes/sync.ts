import { Router, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { reconcileLegacyTasks } from '../taskReconciliation';

const syncEntityType = z.enum([
  'tasks', 'goals', 'habits', 'stats', 'progress', 'hashtags', 'accountability',
  'truenorth', 'amalgam', 'tracking', 'circadian', 'settings', 'daily_plans', 'task_events'
]);

export const syncMutationSchema = z.object({
  mutationId: z.string().uuid(),
  deviceId: z.string().min(1).max(128),
  entityType: syncEntityType,
  entityId: z.string().min(1).max(240),
  baseServerVersion: z.number().int().nonnegative().nullable(),
  version: z.number().int().positive(),
  payload: z.unknown(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null),
  resolvesConflictId: z.string().uuid().optional()
});

const pushBody = z.object({ mutations: z.array(syncMutationSchema).min(1).max(50) });
const pullQuery = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const requireDatabase = (admin?: SupabaseClient): SupabaseClient => {
  if (!admin) throw new Error('Synchronization is not configured.');
  return admin;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, candidate) => {
  if (!isRecord(candidate)) return candidate;
  return Object.keys(candidate).sort().reduce<Record<string, unknown>>((ordered, key) => {
    ordered[key] = candidate[key];
    return ordered;
  }, {});
});

const sameInstant = (left: unknown, right: string | null): boolean => {
  if (left == null || right == null) return left == null && right == null;
  if (typeof left !== 'string') return false;
  const leftTime = Date.parse(left);
  return Number.isFinite(leftTime) && leftTime === Date.parse(right);
};

export const assertDurableReceipt = (mutation: z.infer<typeof syncMutationSchema>, value: unknown): Record<string, unknown> => {
  if (!isRecord(value) || typeof value.accepted !== 'boolean'
    || !Number.isSafeInteger(Number(value.serverVersion)) || Number(value.serverVersion) < 0) {
    throw new Error('Synchronization mutation returned an invalid receipt.');
  }
  if (!value.accepted) return value;
  const record = value.record;
  if (!isRecord(record)
    || record.entity_type !== mutation.entityType
    || record.entity_id !== mutation.entityId
    || Number(record.version) !== mutation.version
    || Number(record.server_version) !== Number(value.serverVersion)
    || canonicalJson(record.payload) !== canonicalJson(mutation.payload)
    || !sameInstant(record.updated_at, mutation.updatedAt)
    || !sameInstant(record.deleted_at, mutation.deletedAt)
    || value.replayMismatch === true
    || value.serverMissing === true
    || value.conflictId !== undefined) {
    throw new Error('Synchronization acceptance did not prove the exact durable server record.');
  }
  return value;
};

type SyncMutation = z.infer<typeof syncMutationSchema>;

/**
 * Preserve client dependency order. Earlier calls may commit before a later
 * call fails, so the client retains the whole batch and safely replays the
 * exact mutation IDs. The durable receipt ledger makes that replay idempotent.
 */
export const applySyncMutationsSequentially = async (
  database: SupabaseClient,
  userId: string,
  mutations: SyncMutation[]
): Promise<Array<Record<string, unknown>>> => {
  const results: Array<Record<string, unknown>> = [];
  for (const mutation of mutations) {
    const { data, error } = await database.rpc('push_sync_mutation_v2', {
      target_user_id: userId,
      target_mutation_id: mutation.mutationId,
      target_device_id: mutation.deviceId,
      target_entity_type: mutation.entityType,
      target_entity_id: mutation.entityId,
      target_base_server_version: mutation.baseServerVersion,
      target_version: mutation.version,
      target_payload: mutation.payload,
      target_updated_at: mutation.updatedAt,
      target_deleted_at: mutation.deletedAt,
      target_resolves_conflict_id: mutation.resolvesConflictId ?? null
    });
    if (error) throw error;
    const receipt = assertDurableReceipt(mutation, data);
    if (receipt.accepted && mutation.entityType === 'tasks') {
      await reconcileLegacyTasks(database, userId, mutation.payload, {
        entityId: mutation.entityId,
        serverVersion: Number(receipt.serverVersion),
        deletedAt: mutation.deletedAt,
        updatedAt: mutation.updatedAt
      });
    }
    results.push({ mutationId: mutation.mutationId, ...receipt });
  }
  return results;
};

const invalidRequest = (response: Response, error: unknown) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: { code: 'invalid_request', message: 'Synchronization data is invalid.', issues: error.issues } });
    return;
  }
  response.status(500).json({ error: { code: 'sync_failed', message: 'Synchronization could not be completed.' } });
};

export const createSyncRouter = (admin?: SupabaseClient) => {
  const router = Router();

  router.post('/sync/push', async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const body = pushBody.parse(request.body);
      // Never call the legacy RPC: it did not fingerprint requests and could
      // auto-resolve conflicts. Production rollout must apply the forward
      // migration before this server begins accepting mutations.
      const { data: protocolVersion, error: protocolError } = await database.rpc('goalflow_sync_protocol_version');
      if (protocolError || Number(protocolVersion) !== 3) {
        throw new Error('The hardened synchronization protocol is not installed. Local mutations remain pending.');
      }
      const results = await applySyncMutationsSequentially(database, request.user!.id, body.mutations);
      response.json({ results });
    } catch (error) {
      invalidRequest(response, error);
    }
  });

  router.get('/sync/pull', async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const query = pullQuery.parse(request.query);
      const { data, error } = await database.from('sync_records')
        .select('entity_type,entity_id,version,server_version,device_id,payload,updated_at,deleted_at')
        .eq('user_id', request.user!.id)
        .gt('server_version', query.cursor)
        .order('server_version', { ascending: true })
        .limit(query.limit + 1);
      if (error) throw error;
      const rows = data ?? [];
      const page = rows.slice(0, query.limit);
      response.json({
        records: page.map(row => ({
          entityType: row.entity_type,
          entityId: row.entity_id,
          version: row.version,
          serverVersion: row.server_version,
          deviceId: row.device_id,
          payload: row.payload,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at
        })),
        nextCursor: page.length ? Number(page[page.length - 1].server_version) : query.cursor,
        hasMore: rows.length > query.limit
      });
    } catch (error) {
      invalidRequest(response, error);
    }
  });

  router.get('/sync/status', async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const [{ data: latest, error: latestError }, { count: conflictCount, error: conflictError }] = await Promise.all([
        database.from('sync_records').select('server_version').eq('user_id', request.user!.id).order('server_version', { ascending: false }).limit(1).maybeSingle(),
        database.from('sync_conflicts').select('id', { count: 'exact', head: true }).eq('user_id', request.user!.id).is('resolved_at', null)
      ]);
      if (latestError || conflictError) throw latestError || conflictError;
      response.json({
        userId: request.user!.id,
        serverVersion: Number(latest?.server_version ?? 0),
        unresolvedConflicts: conflictCount ?? 0
      });
    } catch (error) {
      invalidRequest(response, error);
    }
  });

  router.get('/sync/health', async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const [{ data: latest, error: latestError }, { count: conflictCount, error: conflictError }, { count: recordCount, error: recordError }] = await Promise.all([
        database.from('sync_records').select('server_version').eq('user_id', request.user!.id).order('server_version', { ascending: false }).limit(1).maybeSingle(),
        database.from('sync_conflicts').select('id', { count: 'exact', head: true }).eq('user_id', request.user!.id).is('resolved_at', null),
        database.from('sync_records').select('entity_id', { count: 'exact', head: true }).eq('user_id', request.user!.id)
      ]);
      if (latestError || conflictError || recordError) throw latestError || conflictError || recordError;
      response.json({
        userId: request.user!.id,
        serverVersion: Number(latest?.server_version ?? 0),
        unresolvedConflicts: conflictCount ?? 0,
        serverRecordCount: recordCount ?? 0
      });
    } catch (error) {
      invalidRequest(response, error);
    }
  });

  router.get('/sync/conflicts', async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const { data, error } = await database.from('sync_conflicts').select('*')
        .eq('user_id', request.user!.id).is('resolved_at', null).order('created_at', { ascending: true });
      if (error) throw error;
      response.json({ conflicts: data ?? [] });
    } catch (error) {
      invalidRequest(response, error);
    }
  });

  router.post('/sync/conflicts/resolve', async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const input = z.object({ mutationId: z.string().uuid(), choice: z.enum(['local', 'cloud']) }).parse(request.body);
      // Keeping the local version is only complete once its retry is accepted
      // by push_sync_mutation. Leave the server conflict visible until then.
      if (input.choice === 'local') {
        response.status(204).end();
        return;
      }
      const { error } = await database.from('sync_conflicts').update({ resolved_at: new Date().toISOString() })
        .eq('user_id', request.user!.id).eq('mutation_id', input.mutationId).is('resolved_at', null);
      if (error) throw error;
      response.status(204).end();
    } catch (error) {
      invalidRequest(response, error);
    }
  });

  return router;
};
