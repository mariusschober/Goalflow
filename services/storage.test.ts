import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { mergeBackupCollection, storageService, STORES, validateBackupCollections } from './storage';

class TestLocalStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const installBrowserStorage = () => {
  const localStorage = new TestLocalStorage();
  (globalThis as any).window = {
    localStorage,
    dispatchEvent: () => true
  };
  (globalThis as any).localStorage = localStorage;
};

describe('backup merge behavior', () => {
  it('merges typed entity arrays by id and keeps records absent from the backup', () => {
    expect(mergeBackupCollection(
      [{ id: 'one', title: 'Local' }, { id: 'two', title: 'Keep' }],
      [{ id: 'one', title: 'Backup' }, { id: 'three', title: 'Add' }]
    )).toEqual([
      { id: 'one', title: 'Backup' },
      { id: 'two', title: 'Keep' },
      { id: 'three', title: 'Add' }
    ]);
  });

  it('merges keyed settings and replaces unkeyed arrays', () => {
    expect(mergeBackupCollection({ enableAi: false, theme: 'dark' }, { enableAi: true }))
      .toEqual({ enableAi: true, theme: 'dark' });
    expect(mergeBackupCollection([1, 2], [3])).toEqual([3]);
  });
});

describe('durable storage failure boundaries', () => {
  it('preserves call order when a write is immediately followed by delete', async () => {
    installBrowserStorage();
    const key = `storage-order-${Date.now()}`;
    await storageService.set(STORES.TASKS, key, [{ id: 'task-1', title: 'temporary' }], 'cloud');

    const write = storageService.set(STORES.TASKS, key, [{ id: 'task-2', title: 'newest' }], 'cloud');
    const remove = storageService.delete(STORES.TASKS, key);
    await Promise.all([write, remove]);

    expect(await storageService.get(STORES.TASKS, key)).toBeUndefined();
  });

  it('rejects malformed envelopes before touching existing state', () => {
    expect(() => validateBackupCollections({ schemaVersion: 2, collections: [] })).toThrow(
      'typed collections'
    );
    expect(validateBackupCollections({ schemaVersion: 2, collections: { tasks: [] } })).toEqual({ tasks: [] });
  });

  it('keeps the previous state after an import transaction aborts', async () => {
    installBrowserStorage();
    const key = `storage-import-${Date.now()}`;
    const previousTasks = [{ id: 'task-1', title: 'keep me' }];
    await storageService.set(STORES.TASKS, key, previousTasks, 'cloud');

    const malformedBackup = {
      schemaVersion: 2,
      collections: {
        [STORES.TASKS]: [() => 'not cloneable']
      }
    };
    await expect(storageService.importBackup(key, malformedBackup, 'replace')).rejects.toBeTruthy();
    expect(await storageService.get(STORES.TASKS, key)).toEqual(previousTasks);
  });

  it('round-trips representative state through export, destruction, and replace restore', async () => {
    installBrowserStorage();
    const key = `storage-roundtrip-${Date.now()}`;
    const tasks = [{ id: 'task-1', title: 'Ship the release' }];
    const goals = [{ id: 'goal-1', name: 'Reliable execution' }];
    await storageService.set(STORES.TASKS, key, tasks, 'cloud');
    await storageService.set(STORES.GOALS, key, goals, 'cloud');

    const backup = await storageService.exportBackup(key);
    await storageService.clear(STORES.TASKS);
    await storageService.clear(STORES.GOALS);
    expect(await storageService.get(STORES.TASKS, key)).toBeUndefined();
    expect(await storageService.get(STORES.GOALS, key)).toBeUndefined();

    await storageService.importBackup(key, backup, 'replace');
    expect(await storageService.get(STORES.TASKS, key)).toEqual(tasks);
    expect(await storageService.get(STORES.GOALS, key)).toEqual(goals);
  });
});
