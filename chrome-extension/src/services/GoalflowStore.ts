// Placeholder GoalflowStore — tranche 1 delegates to DemoCurrentTaskProvider.
// Later LocalGoalflowStore will hold IndexedDB backup of tasks for sync.
import type { GoalflowTask } from '../domain/types';

export interface GoalflowStore {
  loadTasks(): Promise<GoalflowTask[]>;
}
export class DemoGoalflowStore implements GoalflowStore {
  constructor(private readonly tasks: GoalflowTask[]) {}
  async loadTasks(): Promise<GoalflowTask[]> { return this.tasks; }
}
