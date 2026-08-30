import { describe, it, expect } from 'vitest';
import {
  assertSchedule,
  buildTodayQueue,
  compareQueueCandidates,
  getPlanningGate,
  createScheduledTask,
} from '../src/domain/scheduling';

describe('scheduling parity', () => {
  const today = '2026-08-30';
  const ctx = (id: string) => ({ userId: 'local', today, now: '2026-08-30T10:00:00.000Z', id: () => id });

  it('rejects invalid day on assertSchedule', () => {
    expect(() => assertSchedule('day', '2026-02-30', today)).toThrow();
  });

  it('rejects current month requiring day', () => {
    expect(() => assertSchedule('month', '2026-08', today)).toThrow();
    expect(() => assertSchedule('month', '2026-09', today)).not.toThrow();
  });

  it('rejects HH:mm on month precision', () => {
    expect(() => assertSchedule('month', '2026-10', today, '10:00')).toThrow();
  });

  it('compareQueueCandidates groupRank: beforeFrog habit before frog before ordinary', () => {
    const b = { id: 'b', isFrog: false, beforeFrog: true, habitId: 'h1', plannedOrder: 10, createdAt: '2026-08-30T00:00:00Z' };
    const f = { id: 'f', isFrog: true, plannedOrder: 0, createdAt: '2026-08-30T00:00:00Z' };
    const n = { id: 'n', isFrog: false, plannedOrder: 0, createdAt: '2026-08-30T00:00:00Z' };
    const sorted = [n, f, b].sort(compareQueueCandidates);
    expect(sorted.map(x => x.id)).toEqual(['b', 'f', 'n']);
  });

  it('buildTodayQueue filters only today open day tasks and sorts', () => {
    const t1 = createScheduledTask({ title: 'A', schedulePrecision: 'day', scheduledFor: today, plannedOrder: 1 }, ctx('1'));
    const t2 = createScheduledTask({ title: 'B', schedulePrecision: 'day', scheduledFor: today, plannedOrder: 0 }, ctx('2'));
    const t3 = createScheduledTask({ title: 'C', schedulePrecision: 'day', scheduledFor: '2026-08-31', plannedOrder: 0 }, ctx('3'));
    const q = buildTodayQueue([t1, t2, t3], today);
    expect(q.map(x=>x.id)).toEqual(['2','1']);
  });

  it('plannedOrder tiebreak before createdAt', () => {
    const t1 = createScheduledTask({ title: 'A', schedulePrecision: 'day', scheduledFor: today, plannedOrder: 0 }, { ...ctx('1'), now: '2026-08-30T00:01:00Z' });
    const t2 = createScheduledTask({ title: 'B', schedulePrecision: 'day', scheduledFor: today, plannedOrder: 0 }, { ...ctx('2'), now: '2026-08-30T00:02:00Z' });
    const q = buildTodayQueue([t2, t1], today);
    expect(q[0].id).toBe('1');
  });

  it('getPlanningGate ready when plan matches queue order', () => {
    const a = createScheduledTask({ title: 'A', schedulePrecision: 'day', scheduledFor: today, plannedOrder: 0 }, ctx('a'));
    const b = createScheduledTask({ title: 'B', schedulePrecision: 'day', scheduledFor: today, plannedOrder: 1 }, ctx('b'));
    const gate = getPlanningGate([a,b], today, { localDate: today, confirmedAt: '2026-08-30T09:00:00Z', taskIds: ['a','b'] });
    expect(gate.state).toBe('ready');
  });

  it('getPlanningGate daily_planning_required when no plan', () => {
    const a = createScheduledTask({ title: 'A', schedulePrecision: 'day', scheduledFor: today }, ctx('a'));
    const gate = getPlanningGate([a], today, undefined);
    expect(gate.state).toBe('daily_planning_required');
  });

  it('getPlanningGate empty when no tasks', () => {
    expect(getPlanningGate([], today, undefined).state).toBe('empty');
  });

  it('overdue forces daily_planning_required even with matching plan', () => {
    const overdue = createScheduledTask({ title: 'Old', schedulePrecision: 'day', scheduledFor: '2026-08-29' }, ctx('o'));
    const todayTask = createScheduledTask({ title: 'Today', schedulePrecision: 'day', scheduledFor: today }, ctx('t'));
    const gate = getPlanningGate([overdue, todayTask], today, { localDate: today, confirmedAt: 'x', taskIds: ['t'] });
    expect(gate.state).toBe('daily_planning_required');
    if (gate.state === 'daily_planning_required') expect(gate.overdueTaskIds).toContain('o');
  });
});
