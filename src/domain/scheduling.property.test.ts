import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  SchedulingError,
  assertSchedule,
  breakDownTask,
  buildTodayQueue,
  compareCurrentTasks,
  createScheduledTask,
  dropTask,
  generateHabitInstance,
  rescheduleTask,
  skipTask,
  type ScheduledTask,
  type SchedulingContext
} from "./scheduling";

const today = "2026-07-18";
const tomorrow = "2026-07-19";

type Operation =
  | { kind: "create" }
  | { kind: "reschedule"; target: number; scheduledFor: string; precision: "day" | "month" }
  | { kind: "skip"; target: number }
  | { kind: "complete"; target: number }
  | { kind: "drop"; target: number }
  | { kind: "breakdown"; target: number; childCount: number }
  | { kind: "habit"; habitNumber: number };

const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  fc.constant({ kind: "create" } as const),
  fc.record({
    kind: fc.constant("reschedule" as const),
    target: fc.integer(),
    scheduledFor: fc.constantFrom(today, tomorrow, "2026-07-20", "2026-08", "2026-09"),
    precision: fc.constantFrom("day" as const, "month" as const)
  }),
  fc.record({ kind: fc.constant("skip" as const), target: fc.integer() }),
  fc.record({ kind: fc.constant("complete" as const), target: fc.integer() }),
  fc.record({ kind: fc.constant("drop" as const), target: fc.integer() }),
  fc.record({ kind: fc.constant("breakdown" as const), target: fc.integer(), childCount: fc.integer({ min: 1, max: 4 }) }),
  fc.record({ kind: fc.constant("habit" as const), habitNumber: fc.integer({ min: 0, max: 3 }) })
) as fc.Arbitrary<Operation>;

const contextFactory = () => {
  let nextId = 0;
  return (): SchedulingContext => ({
    userId: "property-user",
    today,
    now: `${today}T08:00:00.000Z`,
    id: () => `property-${++nextId}`
  });
};

const assertInvariants = (tasks: ScheduledTask[]) => {
  const ids = tasks.map(task => task.id);
  expect(new Set(ids).size).toBe(ids.length);
  const habitDays = new Set<string>();

  for (const task of tasks) {
    expect(task.userId).toBe("property-user");
    if (task.status === "open") {
      assertSchedule(task.schedulePrecision, task.scheduledFor, today, task.scheduledTime);
      if (task.beforeFrog) expect(task.habitId).toBeTruthy();
    }
    if (task.habitId && task.schedulePrecision === "day") {
      const key = `${task.habitId}:${task.scheduledFor}`;
      expect(habitDays.has(key)).toBe(false);
      habitDays.add(key);
    }
  }

  const queue = buildTodayQueue(tasks, today);
  for (let index = 1; index < queue.length; index += 1) {
    expect(queue[index - 1].id).not.toBe(queue[index].id);
    expect(compareCurrentTasks(queue[index - 1], queue[index])).toBeLessThanOrEqual(0);
  }
};

describe("scheduling state-machine properties", () => {
  it("preserves identity, valid schedules, and habit idempotency across randomized workflows", () => {
    fc.assert(fc.property(fc.array(operationArbitrary, { minLength: 1, maxLength: 120 }), operations => {
      const context = contextFactory();
      let tasks: ScheduledTask[] = [];
      const knownIds = new Set<string>();

      for (const operation of operations) {
        const targetIndex = 'target' in operation ? operation.target : 0;
        const target = tasks.length ? tasks[Math.abs(targetIndex) % tasks.length] : undefined;
        try {
          if (operation.kind === "create") {
            const created = createScheduledTask({
              title: `Action ${knownIds.size}`,
              schedulePrecision: "day",
              scheduledFor: today
            }, context());
            tasks = [...tasks, created];
          } else if (operation.kind === "reschedule" && target) {
            const schedule = operation.precision === "month"
              ? { schedulePrecision: "month" as const, scheduledFor: operation.scheduledFor.slice(0, 7) }
              : { schedulePrecision: "day" as const, scheduledFor: operation.scheduledFor.length === 7 ? `${operation.scheduledFor}-01` : operation.scheduledFor };
            tasks = rescheduleTask(tasks, target.id, schedule, context()).tasks;
          } else if (operation.kind === "skip" && target) {
            tasks = skipTask(tasks, target.id, today, context().now).tasks;
          } else if (operation.kind === "complete" && target?.status === "open") {
            tasks = tasks.map(task => task.id === target.id ? { ...task, status: "completed", completedAt: context().now } : task);
          } else if (operation.kind === "drop" && target) {
            tasks = dropTask(tasks, target.id, context().now).tasks;
          } else if (operation.kind === "breakdown" && target?.status === "open") {
            const children = Array.from({ length: operation.childCount }, (_, index) => ({
              title: `${target.title} step ${index + 1}`,
              schedulePrecision: "day" as const,
              scheduledFor: index % 2 === 0 ? today : tomorrow
            }));
            tasks = breakDownTask(tasks, target.id, children, context()).tasks;
          } else if (operation.kind === "habit") {
            tasks = generateHabitInstance(tasks, {
              id: `habit-${operation.habitNumber}`,
              title: `Habit ${operation.habitNumber}`,
              beforeFrog: operation.habitNumber % 2 === 0
            }, context()).tasks;
          }
        } catch (error) {
          if (!(error instanceof SchedulingError)) throw error;
        }

        tasks.forEach(task => knownIds.add(task.id));
        assertInvariants(tasks);
      }

      expect(tasks.every(task => knownIds.has(task.id))).toBe(true);
    }), { numRuns: 400, endOnFailure: true });
  });
});
