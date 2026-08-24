import { Router, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { reconcileLegacyTasks } from '../taskReconciliation';

const mutationSchema = z.object({
  mutationId: z.string().uuid(),
  deviceId: z.string().min(1).max(128),
  entityType: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  entityId: z.string().min(1).max(240),
  baseServerVersion: z.number().int().nonnegative().nullable(),
  version: z.number().int().positive(),
  payload: z.unknown(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().default(null)
});

const pushBody = z.object({ mutations: z.array(mutationSchema).min(1).max(50) });
const pullQuery = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const requireDatabase = (admin?: SupabaseClient): SupabaseClient => {
  if (!admin) throw new Error('Synchronization is not configured.');
  return admin;
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
      const results: unknown[] = [];
      for (const mutation of body.mutations) {
        const { data, error } = await database.rpc('push_sync_mutation', {
          target_user_id: request.user!.id,
          target_mutation_id: mutation.mutationId,
          target_device_id: mutation.deviceId,
          target_entity_type: mutation.entityType,
          target_entity_id: mutation.entityId,
          target_base_server_version: mutation.baseServerVersion,
          target_version: mutation.version,
          target_payload: mutation.payload,
          target_updated_at: mutation.updatedAt,
          target_deleted_at: mutation.deletedAt
        });
        if (error) throw error;
        if ((data as { accepted?: boolean } | null)?.accepted && mutation.entityType === 'tasks') {
          await reconcileLegacyTasks(database, request.user!.id, mutation.payload);
        }
        results.push({ mutationId: mutation.mutationId, ...(data as Record<string, unknown>) });
      }
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
      response.json({ serverVersion: Number(latest?.server_version ?? 0), unresolvedConflicts: conflictCount ?? 0 });
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
      const input = z.object({ entityType: z.string().min(1).max(64) }).parse(request.body);
      const { error } = await database.from('sync_conflicts').update({ resolved_at: new Date().toISOString() })
        .eq('user_id', request.user!.id).eq('entity_type', input.entityType).is('resolved_at', null);
      if (error) throw error;
      response.status(204).end();
    } catch (error) {
      invalidRequest(response, error);
    }
  });

  return router;
};
