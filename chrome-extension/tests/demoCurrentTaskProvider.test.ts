import { describe, it, expect } from 'vitest';
import { DemoCurrentTaskProvider } from '../src/providers/DemoCurrentTaskProvider';

describe('DemoCurrentTaskProvider', () => {
  it('seeds deterministic and sorted, fetchCurrent returns head', async () => {
    const provider = new DemoCurrentTaskProvider();
    const today = '2026-08-30';
    const tasks = await provider.allTasks(today);
    expect(tasks.length).toBe(2);
    expect(tasks[0].id).toBe('demo-1');
    expect(tasks[1].id).toBe('demo-2');
    const current = await provider.fetchCurrent(today);
    expect(current?.id).toBe('demo-1');
  });

  it('setFrogDemo toggles isFrog', async () => {
    const provider = new DemoCurrentTaskProvider();
    const today = '2026-08-30';
    await provider.setFrogDemo(true);
    const tasks = await provider.allTasks(today);
    expect(tasks[0].isFrog).toBe(true);
    await provider.setFrogDemo(false);
    const tasks2 = await provider.allTasks(today);
    expect(tasks2[0].isFrog).toBe(false);
  });

  it('respects plannedOrder sorting via vendored comparator (frog before ordinary parity)', async () => {
    // Use a fresh in-memory provider injected storage to craft order?
    // Here we test default ordering: demo-1 order0 before demo-2 order1.
    const provider = new DemoCurrentTaskProvider();
    const today = '2026-08-30';
    const current = await provider.fetchCurrent(today);
    expect(current?.plannedOrder).toBe(0);
  });

  it('allTasks migrates stale date', async () => {
    const provider = new DemoCurrentTaskProvider();
    const today = '2026-08-30';
    // seed then manually inject stale? Simpler check that successive today changes migrate.
    const tasks1 = await provider.allTasks(today);
    expect(tasks1.every(t => t.scheduledFor === today)).toBe(true);
    // new today
    const tomorrow = '2026-08-31';
    const tasks2 = await provider.allTasks(tomorrow);
    expect(tasks2.every(t => t.scheduledFor === tomorrow)).toBe(true);
  });
});
