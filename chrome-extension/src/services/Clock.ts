// Clock abstraction for deterministic timer tests — mirrors android-native/time/GoalflowTime.kt and macos-native/Services/Clock.swift

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date { return new Date(); }
}

export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}
  now(): Date { return new Date(this.fixed.getTime()); }
}

export class ManualClock implements Clock {
  private ms: number;
  constructor(initial: Date) { this.ms = initial.getTime(); }
  now(): Date { return new Date(this.ms); }
  advance(ms: number): void { this.ms += ms; }
  advanceSeconds(s: number): void { this.ms += s * 1000; }
  set(date: Date): void { this.ms = date.getTime(); }
}
