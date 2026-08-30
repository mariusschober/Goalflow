import { describe, it, expect, vi } from 'vitest';
import { ExecutionTimer } from '../src/services/ExecutionTimer';
import { ManualClock } from '../src/services/Clock';
import type { ExecutionState } from '../src/domain/types';

describe('ExecutionTimer', () => {
  it('derives remaining from reference time, not tick count', () => {
    const start = new Date('2026-08-30T10:00:00.000Z');
    const clock = new ManualClock(start);
    const timer = new ExecutionTimer(clock);
    const state: ExecutionState = { taskId: 't1', phase: 'active', startedAt: start.getTime(), plannedDurationSeconds: 600 };
    timer.configure(state, clock);
    expect(timer.currentRemaining()).toBe(600);
    clock.advanceSeconds(20);
    expect(timer.currentRemaining()).toBe(580);
    clock.advanceSeconds(40);
    expect(timer.currentRemaining()).toBe(540);
    timer.dispose();
  });

  it('relaunch 47s offset recovers within 1s window', () => {
    const start = new Date('2026-08-30T10:00:00.000Z');
    const clock = new ManualClock(new Date(start.getTime() + 47_000));
    const state: ExecutionState = { taskId: 't1', phase: 'active', startedAt: start.getTime(), plannedDurationSeconds: 1500 };
    const timer = new ExecutionTimer(clock);
    timer.configure(state, clock);
    expect(timer.currentRemaining()).toBe(1453);
    expect(timer.formattedRemaining()).toBe('24:13');
    timer.dispose();
  });

  it('holds 0 at expiry and isActive true until zero', () => {
    const start = new Date('2026-08-30T10:00:00.000Z');
    const clock = new ManualClock(start);
    const timer = new ExecutionTimer(clock);
    const state: ExecutionState = { taskId: 't1', phase: 'active', startedAt: start.getTime(), plannedDurationSeconds: 10 };
    timer.configure(state, clock);
    clock.advanceSeconds(15);
    expect(timer.currentRemaining()).toBe(0);
    expect(timer.formattedRemaining()).toBe('00:00');
    timer.dispose();
  });

  it('idle timer returns planned', () => {
    const clock = new ManualClock(new Date());
    const timer = new ExecutionTimer(clock);
    expect(timer.currentRemaining()).toBe(0);
    const state: ExecutionState = { taskId: 't1', phase: 'idle', startedAt: Date.now(), plannedDurationSeconds: 900 };
    timer.configure(state, clock);
    expect(timer.isActive()).toBe(false);
    timer.dispose();
  });
});
