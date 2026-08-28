import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { synchronizeCloudOnce, type CloudSyncDependencies } from './cloudSync';
import { storageService, STORES } from './storage';
import { normalizeSyncMeta } from './syncProtocol';

class TestLocalStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

interface ServerRecord {
  entityType: string;
  entityId: string;
  version: number;
  serverVersion: number;
  deviceId: string;
  payload: unknown;
  updatedAt: string;
  deletedAt: string | null;
}

class DurableFakeServer {
  readonly records: Map<string, ServerRecord>;
  readonly receipts: Map<string, { request: string; result: Record<string, unknown> }>;
  sequence: { value: number };
  failBeforeCommit = false;
  failAfterCommit = false;
  return401 = false;
  duplicateResults = false;

  constructor(state?: {
    records: Map<string, ServerRecord>;
    receipts: Map<string, { request: string; result: Record<string, unknown> }>;
    sequence: { value: number };
  }) {
    this.records = state?.records ?? new Map();
    this.receipts = state?.receipts ?? new Map();
    this.sequence = state?.sequence ?? { value: 0 };
  }

  durableState() {
    return { records: this.records, receipts: this.receipts, sequence: this.sequence };
  }

  fetch = async (path: string, init?: RequestInit): Promise<Response> => {
    if (this.return401) return new Response(JSON.stringify({ error: { message: 'expired' } }), { status: 401 });
    if (path.endsWith('/sync/push')) {
      if (this.failBeforeCommit) {
        this.failBeforeCommit = false;
        throw new TypeError('network disconnected before commit');
      }
      const mutations = JSON.parse(String(init?.body)).mutations as Array<Record<string, unknown>>;
      const results = mutations.map(mutation => this.push(mutation));
      if (this.failAfterCommit) {
        this.failAfterCommit = false;
        throw new TypeError('response lost after commit');
      }
      const wireResults = this.duplicateResults && results.length ? [results[0], results[0], ...results.slice(1)] : results;
      return Response.json({ results: wireResults });
    }
    if (path.includes('/sync/pull')) {
      const cursor = Number(new URL(path, 'https://goalflow.test').searchParams.get('cursor') ?? 0);
      const records = Array.from(this.records.values())
        .filter(record => record.serverVersion > cursor)
        .sort((left, right) => left.serverVersion - right.serverVersion);
      return Response.json({
        records,
        nextCursor: records.at(-1)?.serverVersion ?? cursor,
        hasMore: false
      });
    }
    return new Response(null, { status: 404 });
  };

  private push(mutation: Record<string, unknown>): Record<string, unknown> {
    const mutationId = String(mutation.mutationId);
    const request = JSON.stringify(mutation);
    const receipt = this.receipts.get(mutationId);
    if (receipt) {
      if (receipt.request !== request) {
        return { mutationId, accepted: false, replayMismatch: true, serverVersion: 0 };
      }
      return { mutationId, ...receipt.result };
    }
    const key = `${mutation.entityType}:${mutation.entityId}`;
    const existing = this.records.get(key);
    const base = mutation.baseServerVersion === null ? null : Number(mutation.baseServerVersion);
    if ((existing && base !== existing.serverVersion) || (!existing && base !== null)) {
      const result = {
        accepted: false,
        conflictId: `00000000-0000-4000-8000-${String(++this.sequence.value).padStart(12, '0')}`,
        serverVersion: existing?.serverVersion ?? 0,
        record: existing
      };
      this.receipts.set(mutationId, { request, result });
      return { mutationId, ...result };
    }
    const serverVersion = ++this.sequence.value;
    const record: ServerRecord = {
      entityType: String(mutation.entityType),
      entityId: String(mutation.entityId),
      version: Number(mutation.version),
      serverVersion,
      deviceId: String(mutation.deviceId),
      payload: mutation.payload,
      updatedAt: String(mutation.updatedAt),
      deletedAt: mutation.deletedAt === null ? null : String(mutation.deletedAt)
    };
    this.records.set(key, record);
    const result = { accepted: true, serverVersion, record };
    this.receipts.set(mutationId, { request, result });
    return { mutationId, ...result };
  }
}

const installBrowser = () => {
  const localStorage = new TestLocalStorage();
  const events = new EventTarget();
  (globalThis as any).window = {
    localStorage,
    dispatchEvent: events.dispatchEvent.bind(events),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events)
  };
  (globalThis as any).localStorage = localStorage;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true }
  });
};

const dependencies = (server: DurableFakeServer): CloudSyncDependencies => ({
  fetch: server.fetch as CloudSyncDependencies['fetch'],
  isOnline: () => true,
  now: () => new Date('2026-08-27T00:00:00.000Z'),
  deviceId: () => 'device-a'
});

const task = (title: string) => ({
  id: 'task-1', title, scheduledFor: '2026-08-27', dateAssigned: '2026-08-27',
  schedulePrecision: 'day', createdAt: 1, updatedAt: 1
});

describe('adversarial cloud synchronization', () => {
  beforeEach(() => installBrowser());

  it('recovers when the server commits but the response is lost', async () => {
    const key = `timeout-after-${crypto.randomUUID()}`;
    const server = new DurableFakeServer();
    storageService.stageLocalValue(STORES.TASKS, key, [], [task('created offline')]);
    server.failAfterCommit = true;

    await expect(synchronizeCloudOnce(key, dependencies(server))).rejects.toThrow('response lost');
    expect(server.records.size).toBe(1);
    expect(normalizeSyncMeta(await storageService.get(STORES.SYNC, key)).outbox).toHaveLength(1);

    const restartedServer = new DurableFakeServer(server.durableState());
    const meta = await synchronizeCloudOnce(key, dependencies(restartedServer));
    expect(meta.outbox).toHaveLength(0);
    expect(meta.conflicts).toHaveLength(0);
    expect(restartedServer.records.size).toBe(1);
    expect(restartedServer.receipts.size).toBe(1);
  });

  it('retries the unchanged mutation after a timeout before commit', async () => {
    const key = `timeout-before-${crypto.randomUUID()}`;
    const server = new DurableFakeServer();
    storageService.stageLocalValue(STORES.TASKS, key, [], [task('safe')]);
    server.failBeforeCommit = true;

    await expect(synchronizeCloudOnce(key, dependencies(server))).rejects.toThrow('before commit');
    expect(server.records.size).toBe(0);
    const pending = normalizeSyncMeta(await storageService.get(STORES.SYNC, key)).outbox;
    expect(pending).toHaveLength(1);
    const mutationId = pending[0].mutationId;

    await synchronizeCloudOnce(key, dependencies(server));
    expect(server.receipts.has(mutationId)).toBe(true);
    expect(server.records.size).toBe(1);
  });

  it('keeps every mutation pending across 401 and later authentication recovery', async () => {
    const key = `auth-${crypto.randomUUID()}`;
    const server = new DurableFakeServer();
    storageService.stageLocalValue(STORES.TASKS, key, [], [task('auth-safe')]);
    server.return401 = true;

    await expect(synchronizeCloudOnce(key, dependencies(server))).rejects.toThrow('expired');
    expect(normalizeSyncMeta(await storageService.get(STORES.SYNC, key)).outbox).toHaveLength(1);
    expect(server.records.size).toBe(0);

    server.return401 = false;
    expect((await synchronizeCloudOnce(key, dependencies(server))).outbox).toHaveLength(0);
  });

  it('rejects duplicated acknowledgement bodies without removing the outbox', async () => {
    const key = `duplicate-response-${crypto.randomUUID()}`;
    const server = new DurableFakeServer();
    storageService.stageLocalValue(STORES.TASKS, key, [], [task('one')]);
    server.duplicateResults = true;

    await expect(synchronizeCloudOnce(key, dependencies(server))).rejects.toThrow('exactly');
    expect(normalizeSyncMeta(await storageService.get(STORES.SYNC, key)).outbox).toHaveLength(1);
    expect(server.records.size).toBe(1);
  });

  it('preserves a staged creation across a simulated client kill before IndexedDB commit', async () => {
    const key = `client-kill-${crypto.randomUUID()}`;
    const server = new DurableFakeServer();
    storageService.stageLocalValue(STORES.TASKS, key, [], [task('survived kill')]);

    // No storageService.set call occurred: only the synchronous WAL exists.
    expect(await storageService.get(STORES.TASKS, key)).toEqual([task('survived kill')]);
    const meta = await synchronizeCloudOnce(key, dependencies(server));
    expect(meta.outbox).toHaveLength(0);
    expect(server.records.get('tasks:task-1')?.payload).toMatchObject({ title: 'survived kill' });
  });

  it('leaves local execution untouched while offline for an arbitrary duration', async () => {
    const key = `offline-${crypto.randomUUID()}`;
    const server = new DurableFakeServer();
    storageService.stageLocalValue(STORES.TASKS, key, [], [task('days offline')]);
    const offlineDependencies = { ...dependencies(server), isOnline: () => false };

    const meta = await synchronizeCloudOnce(key, offlineDependencies);
    expect(meta.outbox).toHaveLength(1);
    expect(await storageService.get(STORES.TASKS, key)).toEqual([task('days offline')]);
    expect(server.records.size).toBe(0);
  });
});
