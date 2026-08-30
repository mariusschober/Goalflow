import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  applyRemotePage,
  emptySyncMeta,
  normalizeSyncMeta,
  RECORD_LEVEL_STORES,
} from './syncProtocol';

const iso = (n: number) => new Date(n * 1000).toISOString();

// P2-E: task-a / task-b converge independent of order via last-write-wins + version vector
describe('tranche2 E: two-client convergence', () => {
  it('task-a and task-b converge regardless of apply order', () => {
    fc.assert(
      fc.property(
        fc.record({
          aTitle: fc.string({ minLength: 1, maxLength: 20 }),
          bTitle: fc.string({ minLength: 1, maxLength: 20 }),
          aUpdatedAt: fc.integer({ min: 1, max: 1000 }),
          bUpdatedAt: fc.integer({ min: 1, max: 1000 }),
        }),
        ({ aTitle, bTitle, aUpdatedAt, bUpdatedAt }) => {
          const baseMeta = emptySyncMeta();
          const initialTasks = [{ id: 'task-a', title: 'initial' }, { id: 'task-b', title: 'initial' }] as unknown[];
          const recordA = {
            entityType: 'tasks',
            entityId: 'task-a',
            version: 1,
            serverVersion: 1,
            deviceId: 'device-a',
            payload: { id: 'task-a', title: aTitle },
            updatedAt: iso(aUpdatedAt),
            deletedAt: null,
          };
          const recordB = {
            entityType: 'tasks',
            entityId: 'task-b',
            version: 1,
            serverVersion: 2,
            deviceId: 'device-b',
            payload: { id: 'task-b', title: bTitle },
            updatedAt: iso(bUpdatedAt),
            deletedAt: null,
          };
          const meta = normalizeSyncMeta(baseMeta);
          const r1 = applyRemotePage(meta, { tasks: initialTasks } as unknown as Record<string, unknown>, [recordA, recordB], 2, 'device-a', iso(3));
          const r2 = applyRemotePage(meta, { tasks: initialTasks } as unknown as Record<string, unknown>, [recordB, recordA], 2, 'device-a', iso(3));
          // Both orders must converge to same values (contain both tasks with latest titles)
          const v1 = (r1.values.tasks as unknown[]).map((t: unknown) => (t as { id: string; title: string }).title).sort();
          const v2 = (r2.values.tasks as unknown[]).map((t: unknown) => (t as { id: string; title: string }).title).sort();
          expect(v1).toEqual(v2);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('daily_plans reorder is preserved via taskIds order', () => {
    const baseMeta = emptySyncMeta();
    const initialPlans: unknown[] = [];
    const ordered = { id: '2099-01-01', localDate: '2099-01-01', taskIds: ['a', 'b', 'c'], confirmedAt: Date.now() };
    const reordered = { id: '2099-01-01', localDate: '2099-01-01', taskIds: ['c', 'a', 'b'], confirmedAt: Date.now() + 1000 };
    const rec1 = {
      entityType: 'daily_plans',
      entityId: '2099-01-01',
      version: 1,
      serverVersion: 1,
      deviceId: 'device-a',
      payload: ordered,
      updatedAt: iso(1),
      deletedAt: null,
    };
    const rec2 = {
      entityType: 'daily_plans',
      entityId: '2099-01-01',
      version: 2,
      serverVersion: 2,
      deviceId: 'device-b',
      payload: reordered,
      updatedAt: iso(2),
      deletedAt: null,
    };
    const meta = normalizeSyncMeta(baseMeta);
    const res = applyRemotePage(meta, { daily_plans: [ordered] } as unknown as Record<string, unknown>, [rec2], 2, 'device-a', iso(3));
    const finalPlans = res.values.daily_plans as unknown as { taskIds: string[] }[];
    expect(finalPlans[0].taskIds).toEqual(['c', 'a', 'b']);
  });

  it('extraJson merge preserves unknown fields', () => {
    const baseMeta = emptySyncMeta();
    const taskWithExtra = { id: 't1', title: 'hello', extraJson: JSON.stringify({ duration: 25, unknownField: 'preserve-me', hashtags: [] }) };
    const updated = { id: 't1', title: 'hello updated', extraJson: JSON.stringify({ duration: 30, unknownField: 'preserve-me', newField: 123 }) };
    // RECORD_LEVEL_STORES should be true for tasks, merge should keep unknownField
    expect(RECORD_LEVEL_STORES.has('tasks')).toBe(true);
    const meta = normalizeSyncMeta(baseMeta);
    const rec = {
      entityType: 'tasks',
      entityId: 't1',
      version: 2,
      serverVersion: 2,
      deviceId: 'device-a',
      payload: updated,
      updatedAt: iso(2),
      deletedAt: null,
    };
    const res = applyRemotePage(meta, { tasks: [taskWithExtra] } as unknown as Record<string, unknown>, [rec], 2, 'device-b', iso(3));
    const finalTask = (res.values.tasks as unknown as { extraJson: string }[])[0];
    const extra = JSON.parse(finalTask.extraJson);
    expect(extra.unknownField).toBe('preserve-me');
    expect(extra.newField).toBe(123);
  });
});
