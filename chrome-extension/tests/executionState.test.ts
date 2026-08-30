import { describe, it, expect } from 'vitest';
import { remainingSeconds, formatRemaining } from '../src/domain/types';
import type { ExecutionState } from '../src/domain/types';
import { ManualClock } from '../src/services/Clock';

describe('ExecutionState remainingSeconds', () => {
  const planned = 25 * 60; // 1500

  it('idle returns planned', () => {
    const s: ExecutionState = { taskId: 't1', phase: 'idle', startedAt: Date.now(), plannedDurationSeconds: planned };
    expect(remainingSeconds(s, new Date())).toBe(planned);
  });

  it('active full at start', () => {
    const now = new Date('2026-08-30T10:00:00.000Z');
    const s: ExecutionState = { taskId: 't1', phase: 'active', startedAt: now.getTime(), plannedDurationSeconds: planned };
    expect(remainingSeconds(s, now)).toBe(1500);
  });

  it('active after 47s -> 1453', () => {
    const start = new Date('2026-08-30T10:00:00.000Z');
    const s: ExecutionState = { taskId: 't1', phase: 'active', startedAt: start.getTime(), plannedDurationSeconds: planned };
    const now = new Date(start.getTime() + 47_000);
    expect(remainingSeconds(s, now)).toBe(1453);
  });

  it('relaunch recovery: started 79s ago -> 1421', () => {
    const start = new Date('2026-08-30T10:00:00.000Z');
    const s: ExecutionState = { taskId: 't1', phase: 'active', startedAt: start.getTime(), plannedDurationSeconds: planned };
    const now = new Date(start.getTime() + 79_000);
    expect(remainingSeconds(s, now)).toBe(1421);
  });

  it('clamps at 0 after expiry', () => {
    const start = new Date('2026-08-30T10:00:00.000Z');
    const s: ExecutionState = { taskId: 't1', phase: 'active', startedAt: start.getTime(), plannedDurationSeconds: 60 };
    const now = new Date(start.getTime() + 120_000);
    expect(remainingSeconds(s, now)).toBe(0);
  });

  it('ManualClock deterministic', () => {
    const start = new Date('2026-08-30T10:00:00Z');
    const clock = new ManualClock(start);
    const s: ExecutionState = { taskId: 't1', phase: 'active', startedAt: clock.now().getTime(), plannedDurationSeconds: 300 };
    clock.advanceSeconds(20);
    expect(remainingSeconds(s, clock.now())).toBe(280);
  });

  it('formatRemaining mm:ss', () => {
    expect(formatRemaining(0)).toBe('00:00');
    expect(formatRemaining(75)).toBe('01:15');
    expect(formatRemaining(1500)).toBe('25:00');
  });
});
