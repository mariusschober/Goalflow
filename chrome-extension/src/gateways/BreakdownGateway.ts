import type { GoalflowTask } from '../domain/types';

export interface BreakdownChild { title: string; durationMinutes?: number; }
export interface BreakdownGateway { suggest(task: GoalflowTask): Promise<BreakdownChild[]>; }
export class StubBreakdownGateway implements BreakdownGateway {
  async suggest(_task: GoalflowTask): Promise<BreakdownChild[]> { return []; }
}
