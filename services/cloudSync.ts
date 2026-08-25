import { authenticatedFetch, supabase } from './authService';
import { storageService, STORES } from './storage';

export type SyncState = 'saved-locally' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';

interface SyncMutation {
  mutationId: string;
  deviceId: string;
  entityType: string;
  entityId: 'singleton';
  baseServerVersion: number | null;
  version: number;
  payload: unknown;
  updatedAt: string;
  deletedAt: null;
}

interface LocalConflict {
  entityType: string;
  localPayload: unknown;
  serverPayload: unknown;
  serverVersion: number;
  createdAt: string;
}

interface SyncMeta {
  cursor: number;
  versions: Record<string, { local: number; server: number | null }>;
  outbox: SyncMutation[];
  conflicts: LocalConflict[];
  lastSuccessfulSync?: string;
}

const SYNCED_STORES = [
  STORES.TASKS, STORES.GOALS, STORES.HABITS, STORES.STATS, STORES.PROGRESS,
  STORES.HASHTAGS, STORES.ACCOUNTABILITY, STORES.TRUE_NORTH, STORES.AMALGAM,
  STORES.TRACKING, STORES.CIRCADIAN, STORES.SETTINGS
];

const emptyMeta = (): SyncMeta => ({ cursor: 0, versions: {}, outbox: [], conflicts: [] });
const metadataQueues = new Map<string, Promise<void>>();

const withMetadataLock = async <T>(userKey: string, operation: () => Promise<T>): Promise<T> => {
  const previous = metadataQueues.get(userKey) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  metadataQueues.set(userKey, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (metadataQueues.get(userKey) === current) metadataQueues.delete(userKey);
  }
};

const deviceId = (): string => {
  const key = 'goalflow-device-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
};

const emit = (state: SyncState, meta: SyncMeta, message?: string) => {
  window.dispatchEvent(new CustomEvent('goalflow:sync-state', {
    detail: { state, lastSuccessfulSync: meta.lastSuccessfulSync, conflictCount: meta.conflicts.length, message }
  }));
};

export const startCloudSync = (userKey: string): (() => void) => {
  if (!supabase) return () => undefined;
  let stopped = false;
  let timer: number | undefined;
  let activeSync: Promise<void> | null = null;
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`goalflow-sync:${userKey}`);
  const ownDeviceId = deviceId();

  const readMeta = async (): Promise<SyncMeta> => await storageService.get<SyncMeta>(STORES.SYNC, userKey) || emptyMeta();
  const writeMeta = async (meta: SyncMeta) => storageService.set(STORES.SYNC, userKey, meta, 'cloud');
  const pullCanonicalTasks = async () => {
    const response = await authenticatedFetch('/api/v1/tasks');
    const body = await response.json() as { tasks?: Array<Record<string, any>>; error?: { message?: string } };
    if (!response.ok || !body.tasks) throw new Error(body.error?.message || 'Canonical tasks could not be loaded.');
    const localTasks = await storageService.get<Array<Record<string, any>>>(STORES.TASKS, userKey) || [];
    const byId = new Map(localTasks.map(task => [String(task.id), task]));
    for (const task of body.tasks) {
      const localId = String(task.legacyEntityId || task.id);
      const existing = byId.get(localId) || {};
      const status = String(task.status);
      byId.set(localId, {
        ...existing,
        id: localId,
        cloudId: String(task.cloudId || task.id),
        title: task.title,
        description: task.notes || '',
        hashtags: Array.isArray(task.tags) ? task.tags : [],
        dateAssigned: task.schedulePrecision === 'month' ? `${String(task.scheduledFor).slice(0, 7)}-01` : String(task.scheduledFor).slice(0, 10),
        schedulePrecision: task.schedulePrecision,
        scheduledFor: task.scheduledFor,
        scheduledTime: task.scheduledTime,
        plannedOrder: task.plannedOrder,
        completed: status === 'completed' || status === 'broken_down',
        completedAt: task.completedAt ? Date.parse(task.completedAt) : existing.completedAt,
        wontDo: status === 'dropped',
        lifecycleStatus: status,
        isFrog: Boolean(task.isFrog),
        frogFailures: Number(task.frogFailures || 0),
        beforeFrog: Boolean(task.beforeFrog),
        habitId: task.habitId || existing.habitId,
        parentTaskId: task.parentTaskId || existing.parentTaskId,
        duration: Number(task.estimatedMinutes || existing.duration || 25),
        source: task.source,
        isRepetitive: false,
        createdAt: existing.createdAt || Date.parse(task.createdAt),
        rescheduleCount: Number(task.frogFailures || 0),
        strikes: existing.strikes || 0
      });
    }
    const merged = Array.from(byId.values());
    await storageService.set(STORES.TASKS, userKey, merged, 'cloud');
    window.dispatchEvent(new CustomEvent('goalflow:cloud-change', { detail: { storeName: STORES.TASKS, value: merged } }));
  };

  const enqueue = async (storeName: string, value: unknown) => {
    await withMetadataLock(userKey, async () => {
      const meta = await readMeta();
      const version = (meta.versions[storeName]?.local || 0) + 1;
      const mutation: SyncMutation = {
        mutationId: crypto.randomUUID(), deviceId: ownDeviceId, entityType: storeName, entityId: 'singleton',
        baseServerVersion: meta.versions[storeName]?.server ?? null, version, payload: value,
        updatedAt: new Date().toISOString(), deletedAt: null
      };
      meta.versions[storeName] = { local: version, server: meta.versions[storeName]?.server ?? null };
      meta.outbox = [...meta.outbox.filter(item => item.entityType !== storeName), mutation];
      await writeMeta(meta);
      emit(navigator.onLine ? 'saved-locally' : 'offline', meta);
    });
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void synchronize(), 2_000);
  };

  const performSync = async () => {
    await withMetadataLock(userKey, async () => {
      if (stopped) return;
      const meta = await readMeta();
      if (!navigator.onLine) { emit('offline', meta); return; }
      emit('syncing', meta);

      while (meta.outbox.length) {
        const batch = meta.outbox.slice(0, 50);
        const response = await authenticatedFetch('/api/v1/sync/push', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mutations: batch })
        });
        const body = await response.json() as { results?: Array<{ mutationId: string; accepted: boolean; serverVersion: number; record?: { payload?: unknown } }>; error?: { message?: string } };
        if (!response.ok || !body.results) throw new Error(body.error?.message || 'Sync push failed.');
        for (const result of body.results) {
          const mutation = batch.find(item => item.mutationId === result.mutationId);
          if (!mutation) continue;
          meta.outbox = meta.outbox.filter(item => item.mutationId !== result.mutationId);
          if (result.accepted) {
            meta.versions[mutation.entityType] = { local: mutation.version, server: Number(result.serverVersion) };
          } else {
            meta.conflicts.push({
              entityType: mutation.entityType,
              localPayload: mutation.payload,
              serverPayload: result.record?.payload,
              serverVersion: Number(result.serverVersion),
              createdAt: new Date().toISOString()
            });
          }
        }
        await writeMeta(meta);
      }

      let hasMore = true;
      while (hasMore) {
        const response = await authenticatedFetch(`/api/v1/sync/pull?cursor=${meta.cursor}&limit=100`);
        const body = await response.json() as { records?: Array<{ entityType: string; serverVersion: number; version: number; deviceId?: string; payload: unknown }>; nextCursor?: number; hasMore?: boolean; error?: { message?: string } };
        if (!response.ok || !body.records) throw new Error(body.error?.message || 'Sync pull failed.');
        for (const record of body.records) {
          if (!SYNCED_STORES.includes(record.entityType)) continue;
          const pending = meta.outbox.find(item => item.entityType === record.entityType);
          if (pending && record.deviceId !== ownDeviceId) {
            meta.conflicts.push({ entityType: record.entityType, localPayload: pending.payload, serverPayload: record.payload, serverVersion: Number(record.serverVersion), createdAt: new Date().toISOString() });
            continue;
          }
          if (Number(record.serverVersion) > (meta.versions[record.entityType]?.server ?? 0)) {
            await storageService.set(record.entityType, userKey, record.payload, 'cloud');
            meta.versions[record.entityType] = { local: Number(record.version), server: Number(record.serverVersion) };
            window.dispatchEvent(new CustomEvent('goalflow:cloud-change', { detail: { storeName: record.entityType, value: record.payload } }));
          }
        }
        meta.cursor = Number(body.nextCursor ?? meta.cursor);
        hasMore = Boolean(body.hasMore);
        await writeMeta(meta);
      }

      await pullCanonicalTasks();

      meta.lastSuccessfulSync = new Date().toISOString();
      await writeMeta(meta);
      const state: SyncState = meta.conflicts.length ? 'conflict' : 'synced';
      emit(state, meta);
      channel?.postMessage({ type: 'complete', state, lastSuccessfulSync: meta.lastSuccessfulSync, conflictCount: meta.conflicts.length });
    });
  };

  const synchronize = async () => {
    if (activeSync) return activeSync;
    activeSync = (async () => {
      try {
        if ('locks' in navigator) {
          await navigator.locks.request(`goalflow-sync:${userKey}`, { ifAvailable: true }, async lock => { if (lock) await performSync(); });
        } else {
          await performSync();
        }
      } catch (error) {
        const meta = await readMeta();
        emit(navigator.onLine ? 'error' : 'offline', meta, error instanceof Error ? error.message : 'Synchronization failed.');
      } finally {
        activeSync = null;
      }
    })();
    return activeSync;
  };

  const onLocalChange = (event: Event) => {
    const detail = (event as CustomEvent<{ storeName: string; key: string; value: unknown }>).detail;
    if (detail.key === userKey && SYNCED_STORES.includes(detail.storeName)) void enqueue(detail.storeName, detail.value);
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
  const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void synchronize(); }, 60_000);

  void (async () => {
    const meta = await readMeta();
    for (const storeName of SYNCED_STORES) {
      if (meta.versions[storeName] || meta.outbox.some(item => item.entityType === storeName)) continue;
      const value = await storageService.get(storeName, userKey);
      if (value !== undefined) await enqueue(storeName, value);
    }
    await synchronize();
  })();

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

export const resolveLocalConflict = async (userKey: string, entityType: string, choice: 'local' | 'cloud'): Promise<void> => {
  await withMetadataLock(userKey, async () => {
    const meta = await storageService.get<SyncMeta>(STORES.SYNC, userKey);
    const conflict = meta?.conflicts.find(item => item.entityType === entityType);
    if (!meta || !conflict) return;
    const response = await authenticatedFetch('/api/v1/sync/conflicts/resolve', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityType, choice })
    });
    if (!response.ok) throw new Error('The conflict could not be resolved.');
    if (choice === 'cloud') {
      await storageService.set(entityType, userKey, conflict.serverPayload, 'cloud');
      window.dispatchEvent(new CustomEvent('goalflow:cloud-change', { detail: { storeName: entityType, value: conflict.serverPayload } }));
      meta.versions[entityType] = { local: meta.versions[entityType]?.local || 1, server: conflict.serverVersion };
    } else {
      const version = (meta.versions[entityType]?.local || 0) + 1;
      meta.versions[entityType] = { local: version, server: meta.versions[entityType]?.server ?? conflict.serverVersion };
      meta.outbox = [
        ...meta.outbox.filter(item => item.entityType !== entityType),
        { mutationId: crypto.randomUUID(), deviceId: deviceId(), entityType, entityId: 'singleton', baseServerVersion: conflict.serverVersion, version, payload: conflict.localPayload, updatedAt: new Date().toISOString(), deletedAt: null }
      ];
    }
    meta.conflicts = meta.conflicts.filter(item => item !== conflict);
    await storageService.set(STORES.SYNC, userKey, meta, 'cloud');
    window.dispatchEvent(new Event('online'));
  });
};
