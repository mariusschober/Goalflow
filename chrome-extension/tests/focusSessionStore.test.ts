import { describe, it, expect, beforeEach } from 'vitest';
import { FocusSessionStore, createMemoryStorage } from '../src/services/FocusSessionStore';
import type { ExecutionState } from '../src/domain/types';

describe('FocusSessionStore', () => {
  let mem: ReturnType<typeof createMemoryStorage>;
  let store: FocusSessionStore;

  beforeEach(() => {
    mem = createMemoryStorage();
    store = new FocusSessionStore(mem);
  });

  it('persists and recovers round-trip', async () => {
    const state: ExecutionState = { taskId: 't1', phase: 'active', startedAt: Date.now(), plannedDurationSeconds: 1500 };
    await store.save(state);
    const loaded = await store.load();
    expect(loaded).toEqual(state);
  });

  it('clear is idempotent', async () => {
    await store.clear();
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('overwrite preserves latest', async () => {
    const a: ExecutionState = { taskId: 't1', phase: 'active', startedAt: 1000, plannedDurationSeconds: 1500 };
    const b: ExecutionState = { taskId: 't2', phase: 'active', startedAt: 2000, plannedDurationSeconds: 900 };
    await store.save(a);
    await store.save(b);
    expect(await store.load()).toEqual(b);
  });

  it('throws corrupted on invalid shape', async () => {
    // inject invalid JSON string directly via adapter
    (mem as any).map?.set?.('goalflow.focus.session.v1', JSON.stringify({ taskId: '', phase: 'active' }));
    // Actually use _inject if MemoryStorage, else direct map
    if ((store.storageForTest as any)?._inject) {
      store.storageForTest!._inject('goalflow.focus.session.v1', JSON.stringify({ bogus: true }));
    } else {
      await (mem as any).set?.({ 'goalflow.focus.session.v1': JSON.stringify({ bogus: true }) });
      // fallback
      (mem as any).m?.set('goalflow.focus.session.v1', JSON.stringify({ bogus: true }));
    }
    // Ensure injected: try both paths
    try { await mem.set({ 'goalflow.focus.session.v1': JSON.stringify({ bogus: true }) }); } catch {}
    await expect(store.load()).rejects.toThrow(/invalid|corrupted/i);
  });

  it('read-back mismatch detection', async () => {
    // Create a storage that lies on get
    let writeValue: string | undefined;
    const lying = {
      async get(_key: string) { return { 'goalflow.focus.session.v1': writeValue ? writeValue + 'CORRUPT' : undefined }; },
      async set(items: Record<string, unknown>) { writeValue = items['goalflow.focus.session.v1'] as string; },
      async remove(_key: string) { writeValue = undefined; }
    };
    const lyingStore = new FocusSessionStore(lying as any);
    const state: ExecutionState = { taskId: 't1', phase: 'active', startedAt: 123456, plannedDurationSeconds: 600 };
    await expect(lyingStore.save(state)).rejects.toThrow(/read-back/i);
  });

  it('load returns null when empty', async () => {
    expect(await store.load()).toBeNull();
  });

  it('save then clear then load null', async () => {
    const s: ExecutionState = { taskId: 'x', phase: 'active', startedAt: 1000, plannedDurationSeconds: 600 };
    await store.save(s);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
