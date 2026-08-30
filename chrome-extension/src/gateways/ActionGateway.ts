// Action gateway — tranche 1: local ACTION transition (persist ExecutionState).
// Future J: POST /api/v1/tasks/:id/complete or POST /api/v1/sync/push idempotent.

import type { ExecutionState } from '../domain/types';
import type { GoalflowTask } from '../domain/types';

export interface ActionGateway {
  start(task: GoalflowTask, now: Date): Promise<ExecutionState>;
}

export class LocalActionGateway implements ActionGateway {
  async start(task: GoalflowTask, now: Date): Promise<ExecutionState> {
    return {
      taskId: task.id,
      phase: 'active',
      startedAt: now.getTime(),
      plannedDurationSeconds: Math.max(60, (task.durationMinutes || 25) * 60),
    };
  }
}
