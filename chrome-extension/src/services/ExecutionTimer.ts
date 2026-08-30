// Reference-time-derived timer — never stores decrement int.
// Authority is startedAt wall-time, not tick count.

import type { Clock, SystemClock } from './Clock';
import type { ExecutionState } from '../domain/types';
import { remainingSeconds } from '../domain/types';

export class ExecutionTimer {
  private clock: Clock;
  private state: ExecutionState | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(remaining: number) => void>();

  constructor(clock: Clock) {
    this.clock = clock;
  }

  configure(state: ExecutionState | null, clock?: Clock): void {
    if (clock) this.clock = clock;
    this.state = state;
    this.restartTicker();
  }

  currentRemaining(): number {
    if (!this.state) return 0;
    return remainingSeconds(this.state, this.clock.now());
  }

  isActive(): boolean {
    return this.state?.phase === 'active';
  }

  formattedRemaining(): string {
    const s = this.currentRemaining();
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  onTick(listener: (remaining: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private restartTicker(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    if (!this.isActive()) return;
    this.tickHandle = setInterval(() => this.emit(), 1000);
    // emit immediately for instant UI
    this.emit();
  }

  private emit(): void {
    const r = this.currentRemaining();
    for (const l of this.listeners) l(r);
    if (r === 0) {
      if (this.tickHandle) { clearInterval(this.tickHandle); this.tickHandle = null; }
    }
  }

  dispose(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.listeners.clear();
  }
}
