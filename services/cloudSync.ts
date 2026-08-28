import { authenticatedFetch, supabase } from './authService';
import { storageService, STORES } from './storage';
import { emptySyncMeta, normalizeSyncMeta, type PushResult, type RemoteSyncRecord, type SyncMeta, type SyncMutation } from './syncProtocol';

export type SyncState = 'saved-locally' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';

const SYNCED_STORES: string[] = [
  STORES.TASKS, STORES.GOALS, STORES.HABITS, STORES.STATS, STORES.PROGRESS,
  STORES.HASHTAGS, STORES.ACCOUNTABILITY, STORES.TRUE_NORTH, STORES.AMALGAM,
  STORES.TRACKING, STORES.CIRCADIAN, STORES.SETTINGS, STORES.DAILY_PLANS
];

export interface CloudSyncDependencies {
  fetch: typeof authenticatedFetch;
  isOnline: () => boolean;
  now: () => Date;
  deviceId: () => string;
}

const persistentDeviceId = (): string => {
  const key = 'goalflow-device-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  if (localStorage.getItem(key) !== created) throw new Error('A stable sync device identity could not be persisted.');
  return created;
};

const defaultDependencies: CloudSyncDependencies = {
  fetch: authenticatedFetch,
  isOnline: () => navigator.onLine,
  now: () => new Date(),
  deviceId: persistentDeviceId
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const emit = (state: SyncState, meta: SyncMeta, message?: string): void => {
  window.dispatchEvent(new CustomEvent('goalflow:sync-state', {
    detail: {
      state,
      lastSuccessfulSync: meta.lastSuccessfulSync,
      conflictCount: meta.conflicts.length,
      message
    }
  }));
};

const parseJson = async <T>(response: Response, failureMessage: string): Promise<T> => {
  let body: unknown;
  try { body = await response.json(); } catch (_) { throw new Error(failureMessage); }
  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | undefined)?.error?.message;
    throw new Error(message || failureMessage);
  }
  return body as T;
};

const wireMutation = (mutation: SyncMutation) => ({
  mutationId: mutation.mutationId,
  deviceId: mutation.deviceId,
  entityType: mutation.entityType,
  entityId: mutation.entityId,
  baseServerVersion: mutation.baseServerVersion,
  version: mutation.version,
  payload: mutation.payload,
  updatedAt: mutation.updatedAt,
  deletedAt: mutation.deletedAt,
  resolvesConflictId: mutation.resolvesConflictId && UUID_PATTERN.test(mutation.resolvesConflictId)
    ? mutation.resolvesConflictId
    : undefined
});

const seedUnsynchronizedLocalData = async (userKey: string): Promise<void> => {
  const meta = await storageService.flushPendingLocalChanges(userKey);
  for (const storeName of SYNCED_STORES) {
    const hasSyncState = Object.keys(meta.versions).some(key => key === storeName || key.startsWith(`${storeName}:`))
      || meta.outbox.some(item => item.entityType === storeName)
      || meta.conflicts.some(item => item.entityType === storeName);
    if (hasSyncState) continue;
    const value = await storageService.get(storeName, userKey);
    if (value === undefined) continue;
    storageService.stageLocalValue(storeName, userKey, undefined, value);
  }
  await storageService.flushPendingLocalChanges(userKey);
};

/** One crash-safe, retry-safe synchronization cycle. Exported for adversarial tests. */
export const synchronizeCloudOnce = async (
  userKey: string,
  dependencies: CloudSyncDependencies = defaultDependencies
): Promise<SyncMeta> => {
  await seedUnsynchronizedLocalData(userKey);
  let meta = normalizeSyncMeta(await storageService.get(STORES.SYNC, userKey));
  if (!dependencies.isOnline()) return meta;
  const ownDeviceId = dependencies.deviceId();

  while (true) {
    const batch = await storageService.preparePushBatch(userKey, 50);
    if (!batch.length) break;
    const response = await dependencies.fetch('/api/v1/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mutations: batch.map(wireMutation) })
    });
    const body = await parseJson<{ results?: PushResult[] }>(response, 'Sync push failed. Local changes remain pending.');
    if (!Array.isArray(body.results)) throw new Error('Sync push response was invalid. Local changes remain pending.');
    meta = await storageService.commitPushResults(userKey, batch, body.results);
  }

  let hasMore = true;
  while (hasMore) {
    meta = normalizeSyncMeta(await storageService.get(STORES.SYNC, userKey));
    const cursorBefore = meta.cursor;
    const response = await dependencies.fetch(`/api/v1/sync/pull?cursor=${cursorBefore}&limit=100`);
    const body = await parseJson<{
      records?: RemoteSyncRecord[];
      nextCursor?: number;
      hasMore?: boolean;
    }>(response, 'Sync pull failed. The local cursor was not advanced.');
    if (!body || typeof body !== 'object'
      || !Array.isArray(body.records)
      || typeof body.nextCursor !== 'number'
      || !Number.isSafeInteger(body.nextCursor)
      || typeof body.hasMore !== 'boolean') {
      throw new Error('Sync pull response was invalid. The local cursor was not advanced.');
    }
    const nextCursor = body.nextCursor;
    if (nextCursor < cursorBefore || (body.hasMore && nextCursor === cursorBefore)) {
      throw new Error('Sync pull cursor did not advance safely.');
    }
    const highestRecord = body.records.reduce((highest, record) => Math.max(highest, Number(record.serverVersion) || 0), cursorBefore);
    if (nextCursor !== highestRecord) throw new Error('Sync pull cursor would skip or discard remote information.');
    const applied = await storageService.applyRemotePage(userKey, body.records, nextCursor, ownDeviceId);
    meta = applied.meta;
    hasMore = body.hasMore;
  }

  meta = await storageService.markSyncSuccessful(userKey);
  return meta;
};

export const startCloudSync = (userKey: string): (() => void) => {
  if (!supabase) return () => undefined;
  let stopped = false;
  let timer: number | undefined;
  let activeSync: Promise<void> | null = null;
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`goalflow-sync:${userKey}`);

  const synchronize = async (): Promise<void> => {
    if (activeSync) return activeSync;
    activeSync = (async () => {
      try {
        const before = normalizeSyncMeta(await storageService.get(STORES.SYNC, userKey));
        if (!navigator.onLine) {
          emit('offline', before);
          return;
        }
        emit('syncing', before);
        const run = async () => {
          if (stopped) return;
          const meta = await synchronizeCloudOnce(userKey);
          const state: SyncState = meta.conflicts.length ? 'conflict' : 'synced';
          emit(state, meta);
          channel?.postMessage({
            type: 'complete', state, lastSuccessfulSync: meta.lastSuccessfulSync,
            conflictCount: meta.conflicts.length
          });
        };
        if ('locks' in navigator) {
          await navigator.locks.request(`goalflow-sync:${userKey}`, { ifAvailable: true }, async lock => {
            if (lock) await run();
          });
        } else await run();
      } catch (error) {
        let meta: SyncMeta;
        try {
          meta = normalizeSyncMeta(await storageService.get(STORES.SYNC, userKey));
        } catch (_) {
          meta = emptySyncMeta();
        }
        emit(navigator.onLine ? 'error' : 'offline', meta, error instanceof Error ? error.message : 'Synchronization failed.');
      } finally {
        activeSync = null;
      }
    })();
    return activeSync;
  };

  const onLocalChange = (event: Event) => {
    const detail = (event as CustomEvent<{ storeName: string; key: string }>).detail;
    if (detail.key !== userKey || !SYNCED_STORES.includes(detail.storeName)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void synchronize(), 500);
  };
  const onOnline = () => void synchronize();
  const onFocus = () => { if (document.visibilityState === 'visible') void synchronize(); };
  const onChannel = (event: MessageEvent) => {
    if (event.data?.type === 'complete') window.dispatchEvent(new CustomEvent('goalflow:sync-state', { detail: event.data }));
  };

  window.addEventListener('goalflow:local-change', onLocalChange);
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  channel?.addEventListener('message', onChannel);
  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible') void synchronize();
  }, 60_000);
  void synchronize();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.clearInterval(interval);
    window.removeEventListener('goalflow:local-change', onLocalChange);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
    channel?.removeEventListener('message', onChannel);
    channel?.close();
  };
};

export const resolveLocalConflict = async (
  userKey: string,
  conflictId: string,
  choice: 'local' | 'cloud'
): Promise<void> => {
  const conflict = await storageService.getConflict(userKey, conflictId);
  if (!conflict) return;
  if (choice === 'local') {
    const meta = await storageService.resolveConflictLocally(userKey, conflictId);
    emit('conflict', meta, 'The local version remains preserved until its retry is accepted.');
    window.dispatchEvent(new Event('online'));
    return;
  }
  if (conflict.mutationId) {
    const response = await authenticatedFetch('/api/v1/sync/conflicts/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mutationId: conflict.mutationId, choice: 'cloud' })
    });
    if (!response.ok) throw new Error('The server conflict could not be resolved. Both versions remain preserved.');
  }
  const meta = await storageService.resolveConflictWithCloud(userKey, conflictId);
  emit(meta.conflicts.length ? 'conflict' : 'saved-locally', meta);
};
