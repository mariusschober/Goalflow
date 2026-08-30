export type SchedulePrecision = 'day' | 'month';
export type TaskStatus = 'open' | 'completed' | 'broken_down' | 'dropped' | 'archived';
export type TaskSource = 'manual' | 'habit' | 'telegram' | 'share' | 'ai' | 'migration';

export type ExecutionPhase = 'idle' | 'active';

export interface GoalflowTask {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  schedulePrecision: SchedulePrecision;
  scheduledFor: string; // YYYY-MM-DD or YYYY-MM
  scheduledTime?: string; // HH:mm
  plannedOrder: number;
  status: TaskStatus;
  isFrog: boolean;
  frogFailures: number;
  beforeFrog: boolean;
  source: TaskSource;
  parentTaskId?: string;
  habitId?: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  deletedAt?: string;
  version: number;
  serverVersion?: number;
  durationMinutes: number; // 1..1440, default 25
  extraJson: string; // opaque preserved
}

export interface ExecutionState {
  taskId: string;
  phase: ExecutionPhase;
  startedAt: number; // Date.now() ms at ACTION
  plannedDurationSeconds: number;
}

export type FlowState = 'distracted' | 'good' | 'high' | 'flow';

export function remainingSeconds(state: ExecutionState, now: Date): number {
  if (state.phase === 'idle') return state.plannedDurationSeconds;
  const elapsed = Math.floor((now.getTime() - state.startedAt) / 1000);
  return Math.max(0, state.plannedDurationSeconds - Math.max(0, elapsed));
}

export function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function toScheduledTask(task: GoalflowTask): import('./scheduling').ScheduledTask {
  return {
    id: task.id,
    userId: 'local',
    title: task.title,
    notes: task.notes,
    tags: task.tags,
    schedulePrecision: task.schedulePrecision,
    scheduledFor: task.scheduledFor,
    scheduledTime: task.scheduledTime,
    plannedOrder: task.plannedOrder,
    status: task.status,
    isFrog: task.isFrog,
    frogFailures: task.frogFailures,
    beforeFrog: task.beforeFrog,
    source: task.source,
    parentTaskId: task.parentTaskId,
    habitId: task.habitId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
    version: task.version,
    serverVersion: task.serverVersion,
  };
}
