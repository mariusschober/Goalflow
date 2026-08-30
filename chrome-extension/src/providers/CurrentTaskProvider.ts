import type { GoalflowTask } from '../domain/types';

export interface CurrentTaskProvider {
  fetchCurrent(today: string): Promise<GoalflowTask | null>;
  allTasks(today: string): Promise<GoalflowTask[]>;
  setFrogDemo(isFrog: boolean): Promise<void>;
  resetDemo(today: string): Promise<void>;
}
