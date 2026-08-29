import { Router, type Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  SchedulingError,
  assertSchedule,
  buildTodayQueue,
  getPlanningGate,
  type DailyPlan,
  type ScheduledTask,
  type SchedulePrecision,
  type TaskSource
} from "../../src/domain/scheduling";

const localDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localMonth = z.string().regex(/^\d{4}-\d{2}$/);
const schedulePrecision = z.enum(["day", "month"]);
const scheduledFor = z.union([localDay, localMonth]);
const scheduledTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional();
const expectedRevision = z.number().int().positive();

const createTaskBody = z.object({
  taskId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(240),
  notes: z.string().max(10_000).default(""),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
  schedulePrecision,
  scheduledFor,
  scheduledTime,
  plannedOrder: z.number().int().min(0).max(1_000_000).default(0),
  isFrog: z.boolean().default(false),
  beforeFrog: z.boolean().default(false),
  source: z.enum(["manual", "habit", "telegram", "share", "ai", "migration"]).default("manual"),
  parentTaskId: z.string().uuid().optional(),
  habitId: z.string().uuid().optional(),
  estimatedMinutes: z.number().int().min(1).max(1_440).default(25)
});

const existingTaskMutationBody = z.object({
  today: localDay,
  expectedRevision
});

const scheduleBody = existingTaskMutationBody.extend({
  schedulePrecision,
  scheduledFor,
  scheduledTime
});

const breakdownBody = z.object({
  today: localDay,
  expectedRevision,
  children: z.array(createTaskBody.omit({ isFrog: true, beforeFrog: true, habitId: true }))
    .min(1)
    .max(50)
});

const confirmPlanBody = z.object({
  localDate: localDay,
  taskIds: z.array(z.string().uuid()).max(500),
  expectedRevision: expectedRevision.nullable()
});

const toDatabaseDay = (precision: SchedulePrecision, value: string): string =>
  precision === "month" ? `${value}-01` : value;

const toScheduledTask = (row: Record<string, unknown>): ScheduledTask => ({
  id: String(row.id),
  userId: String(row.user_id),
  title: String(row.title),
  notes: String(row.notes ?? ""),
  tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  schedulePrecision: row.schedule_precision as SchedulePrecision,
  scheduledFor: row.schedule_precision === "month"
    ? String(row.scheduled_for).slice(0, 7)
    : String(row.scheduled_for).slice(0, 10),
  scheduledTime: row.scheduled_time ? String(row.scheduled_time).slice(0, 5) : undefined,
  plannedOrder: Number(row.planned_order ?? 0),
  status: row.status as ScheduledTask["status"],
  isFrog: Boolean(row.is_frog),
  frogFailures: Number(row.frog_failures ?? 0),
  beforeFrog: Boolean(row.before_frog),
  source: row.source as TaskSource,
  parentTaskId: row.parent_task_id ? String(row.parent_task_id) : undefined,
  habitId: row.habit_id ? String(row.habit_id) : undefined,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  version: Number(row.revision ?? 1),
  serverVersion: Number(row.revision ?? 0)
});

class IdempotencyRequiredError extends Error {}

const schedulingResponse = (error: unknown): { status: number; body: unknown } => {
  if (error instanceof IdempotencyRequiredError) {
    return {
      status: 428,
      body: { error: { code: "idempotency_key_required", message: error.message } }
    };
  }
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: { code: "invalid_request", message: "Task data is invalid.", issues: error.issues } }
    };
  }
  if (error instanceof SchedulingError) {
    return { status: 400, body: { error: { code: error.code, message: error.message } } };
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code === "22023") {
      return { status: 409, body: { error: { code: "idempotency_conflict", message: "The idempotency key was reused for different task data." } } };
    }
    if (code === "P0002") {
      return { status: 404, body: { error: { code: "task_not_found", message: "The task no longer exists or is no longer open." } } };
    }
    if (code === "40001") {
      return { status: 409, body: { error: { code: "stale_revision", message: "This record changed on another device. Reload before choosing a version." } } };
    }
  }
  return {
    status: 500,
    body: { error: { code: "task_operation_failed", message: "The task operation could not be completed." } }
  };
};

const requireDatabase = (admin: SupabaseClient | undefined): SupabaseClient => {
  if (!admin) throw new Error("Task storage is not configured.");
  return admin;
};

const mutationIdFor = (request: Request): string => {
  const supplied = request.header("idempotency-key")
    ?? request.header("x-request-id")
    ?? (typeof request.body?.mutationId === "string" ? request.body.mutationId : undefined);
  if (!supplied) {
    throw new IdempotencyRequiredError("A UUID Idempotency-Key is required for task mutations.");
  }
  return z.string().uuid().parse(supplied);
};

export const createTaskRouter = (admin?: SupabaseClient) => {
  const router = Router();

  router.get('/tasks', async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const { data, error } = await database.from('tasks').select('*')
        .eq('user_id', request.user!.id).is('deleted_at', null).order('revision', { ascending: true });
      if (error) throw error;
      response.json({ tasks: (data ?? []).map(row => ({
        ...toScheduledTask(row as Record<string, unknown>),
        cloudId: row.id,
        legacyEntityId: row.legacy_entity_id,
        completedAt: row.completed_at,
        estimatedMinutes: row.estimated_minutes,
        goalId: row.goal_id,
        trueNorthGoalId: row.true_north_goal_id
      })) });
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  router.get("/current", async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const today = localDay.parse(request.query.date);
      const { data: rows, error } = await database
        .from("tasks")
        .select("*")
        .eq("user_id", request.user!.id)
        .eq("status", "open")
        .is("deleted_at", null);
      if (error) throw error;
      const tasks = (rows ?? []).map((row) => toScheduledTask(row as Record<string, unknown>));
      const { data: planRow, error: planError } = await database
        .from("daily_plans")
        .select("local_date,confirmed_at,task_ids,revision")
        .eq("user_id", request.user!.id)
        .eq("local_date", today)
        .maybeSingle();
      if (planError) throw planError;
      const plan: DailyPlan | undefined = planRow ? {
        localDate: String(planRow.local_date),
        confirmedAt: String(planRow.confirmed_at),
        taskIds: (planRow.task_ids ?? []).map(String)
      } : undefined;
      const gate = getPlanningGate(tasks, today, plan);
      response.json({
        gate: gate.state,
        current: gate.state === "ready" ? gate.queue[0] ?? null : null,
        progress: gate.state === "ready" ? { remaining: gate.queue.length, taskIds: gate.queue.map((task) => task.id) } : null,
        planRevision: planRow ? Number(planRow.revision) : null,
        details: gate
      });
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  router.post("/tasks", async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const mutationId = mutationIdFor(request);
      const today = localDay.parse(request.body.today);
      const input = createTaskBody.parse(request.body.task ?? request.body);
      assertSchedule(input.schedulePrecision, input.scheduledFor, today, input.scheduledTime);
      if (input.beforeFrog && !input.habitId) {
        throw new SchedulingError("invalid_title", "Before-frog precedence is only available to habits.");
      }
      const { data, error } = await database.rpc("goalflow_create_task_idempotent", {
        target_user_id: request.user!.id,
        target_mutation_id: mutationId,
        target_local_date: today,
        task_payload: input
      });
      if (error) throw error;
      response.status(201).json({ task: toScheduledTask(data as Record<string, unknown>) });
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  router.post("/tasks/:taskId/skip", async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const mutationId = mutationIdFor(request);
      const input = existingTaskMutationBody.parse(request.body);
      const today = input.today;
      const taskId = z.string().uuid().parse(request.params.taskId);
      const { data, error } = await database.rpc("goalflow_skip_task_idempotent", {
        target_user_id: request.user!.id,
        target_mutation_id: mutationId,
        target_task_id: taskId,
        target_day: today,
        target_expected_revision: input.expectedRevision
      });
      if (error) throw error;
      response.json({ task: toScheduledTask(data as Record<string, unknown>) });
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  router.post("/tasks/:taskId/reschedule", async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const mutationId = mutationIdFor(request);
      const taskId = z.string().uuid().parse(request.params.taskId);
      const schedule = scheduleBody.parse(request.body);
      const today = schedule.today;
      assertSchedule(schedule.schedulePrecision, schedule.scheduledFor, today, schedule.scheduledTime);
      const { data, error } = await database.rpc("goalflow_reschedule_task_idempotent", {
        target_user_id: request.user!.id,
        target_mutation_id: mutationId,
        target_task_id: taskId,
        target_local_date: today,
        target_schedule_precision: schedule.schedulePrecision,
        target_scheduled_for: toDatabaseDay(schedule.schedulePrecision, schedule.scheduledFor),
        target_scheduled_time: schedule.scheduledTime ?? null,
        target_expected_revision: schedule.expectedRevision
      });
      if (error) throw error;
      response.json({ task: toScheduledTask(data as Record<string, unknown>) });
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  router.post("/tasks/:taskId/complete", async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const mutationId = mutationIdFor(request);
      const taskId = z.string().uuid().parse(request.params.taskId);
      const input = existingTaskMutationBody.parse(request.body);
      const today = input.today;
      const { data, error } = await database.rpc("goalflow_complete_task_idempotent", {
        target_user_id: request.user!.id, target_mutation_id: mutationId,
        target_task_id: taskId, target_local_date: today,
        target_expected_revision: input.expectedRevision
      });
      if (error) throw error;
      response.json({ task: toScheduledTask(data as Record<string, unknown>) });
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  router.post("/tasks/:taskId/drop", async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const mutationId = mutationIdFor(request);
      const taskId = z.string().uuid().parse(request.params.taskId);
      const input = existingTaskMutationBody.parse(request.body);
      const today = input.today;
      const { data, error } = await database.rpc("goalflow_drop_task_idempotent", {
        target_user_id: request.user!.id, target_mutation_id: mutationId,
        target_task_id: taskId, target_local_date: today,
        target_expected_revision: input.expectedRevision
      });
      if (error) throw error;
      response.json({ task: toScheduledTask(data as Record<string, unknown>) });
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  router.post("/tasks/:taskId/breakdown", async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const mutationId = mutationIdFor(request);
      const taskId = z.string().uuid().parse(request.params.taskId);
      const input = breakdownBody.parse(request.body);
      const today = input.today;
      input.children.forEach((child) => assertSchedule(
        child.schedulePrecision,
        child.scheduledFor,
        today,
        child.scheduledTime
      ));
      const { data, error } = await database.rpc("goalflow_break_down_task_idempotent", {
        target_user_id: request.user!.id,
        target_mutation_id: mutationId,
        target_task_id: taskId,
        child_tasks: input.children,
        target_expected_revision: input.expectedRevision
      });
      if (error) throw error;
      response.json(data);
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  router.post("/planning/daily/confirm", async (request, response) => {
    try {
      const database = requireDatabase(admin);
      const mutationId = mutationIdFor(request);
      const input = confirmPlanBody.parse(request.body);
      const { data: rows, error } = await database.from("tasks").select("*")
        .eq("user_id", request.user!.id)
        .eq("scheduled_for", input.localDate)
        .eq("schedule_precision", "day")
        .eq("status", "open")
        .is("deleted_at", null);
      if (error) throw error;
      const expected = buildTodayQueue(
        (rows ?? []).map((row) => toScheduledTask(row as Record<string, unknown>)),
        input.localDate
      ).map((task) => task.id);
      if (expected.length !== input.taskIds.length || expected.some((id, index) => input.taskIds[index] !== id)) {
        response.status(409).json({
          error: { code: "plan_changed", message: "The queue changed. Review and confirm the current order again." },
          expectedTaskIds: expected
        });
        return;
      }
      const { data, error: saveError } = await database.rpc("goalflow_confirm_plan_idempotent", {
        target_user_id: request.user!.id,
        target_mutation_id: mutationId,
        target_local_date: input.localDate,
        target_task_ids: input.taskIds,
        target_expected_revision: input.expectedRevision
      });
      if (saveError) throw saveError;
      response.json({ plan: data });
    } catch (error) {
      const result = schedulingResponse(error);
      response.status(result.status).json(result.body);
    }
  });

  return router;
};
