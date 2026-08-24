import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AIProvider } from "../ai/types";
import type { AppConfig } from "../config";
import type { Logger } from "../logger";

const text = z.string().trim().min(1).max(4_000);
const breakdown = z.object({ subtasks: z.array(z.object({ title: z.string().trim().min(1).max(240), estimatedDuration: z.number().int().min(1).max(1_440) })).min(1).max(8) });
const suggestions = z.object({ suggestions: z.array(z.object({
  title: z.string().trim().min(1).max(240), reasoning: z.string().max(500),
  type: z.enum(["habit", "task"]), duration: z.number().int().min(1).max(1_440)
})).min(1).max(8) });
const validation = z.object({ isActionable: z.boolean(), reason: z.string().max(500).optional(), suggestions: z.array(z.string().max(240)).max(5).optional() });
const importance = z.object({ reframing: z.string().max(2_000), importanceExercise: z.string().max(2_000), coachingTip: z.string().max(2_000) });
const outer = z.object({ suggestedHabit: z.string().max(240), suggestedHabitReason: z.string().max(1_000), suggestedTasks: z.array(z.string().max(240)).length(3) });
const visualization = z.object({ prompt: z.string().max(1_000) });

const inputs = {
  breakdown: z.object({ taskTitle: text }),
  suggestions: z.object({ goalTitle: text, goalDescription: z.string().max(4_000).default("") }),
  visualization: z.object({ taskTitle: text }),
  validate: z.object({ taskTitle: text }),
  "reduce-importance": z.object({ vision: text, sensoryDetails: z.string().max(4_000).default(""), planB: z.string().max(4_000).default(""), importance: z.number().min(0).max(10).default(5) }),
  "outer-intention": z.object({ vision: text, sensoryDetails: z.string().max(4_000).default("") })
} as const;

const jobs = {
  breakdown: { schema: breakdown, maxTokens: 900, system: "Return JSON only. Break a high-level task into concrete, independently actionable next actions. Do not create projects.", prompt: (v: z.infer<typeof inputs.breakdown>) => `Task: ${v.taskTitle}\nReturn {\"subtasks\":[{\"title\":string,\"estimatedDuration\":number}]}.` },
  suggestions: { schema: suggestions, maxTokens: 1200, system: "Return JSON only. Suggest small habits and scheduled one-off actions without inventing projects.", prompt: (v: z.infer<typeof inputs.suggestions>) => `Goal: ${v.goalTitle}\nContext: ${v.goalDescription}\nReturn {\"suggestions\":[{\"title\":string,\"reasoning\":string,\"type\":\"habit\"|\"task\",\"duration\":number}]}.` },
  visualization: { schema: visualization, maxTokens: 200, system: "Return JSON only. Write one calm process-focused visualization sentence.", prompt: (v: z.infer<typeof inputs.visualization>) => `Task: ${v.taskTitle}\nReturn {\"prompt\":string}.` },
  validate: { schema: validation, maxTokens: 500, system: "Return JSON only. An actionable task can be started immediately and is one physical next action. Reject vague multi-step projects.", prompt: (v: z.infer<typeof inputs.validate>) => `Candidate: ${v.taskTitle}\nReturn {\"isActionable\":boolean,\"reason\":string,\"suggestions\":[string]}.` },
  "reduce-importance": { schema: importance, maxTokens: 900, system: "Return JSON only. Give calm, non-clinical Transurfing-inspired reflection that lowers attachment and keeps agency with the user.", prompt: (v: z.infer<typeof inputs["reduce-importance"]>) => `Vision: ${v.vision}\nSensory details: ${v.sensoryDetails}\nPlan B: ${v.planB}\nImportance: ${v.importance}/10\nReturn {\"reframing\":string,\"importanceExercise\":string,\"coachingTip\":string}.` },
  "outer-intention": { schema: outer, maxTokens: 900, system: "Return JSON only. Translate a vision into one tiny habit and exactly three concrete actions.", prompt: (v: z.infer<typeof inputs["outer-intention"]>) => `Vision: ${v.vision}\nDetails: ${v.sensoryDetails}\nReturn {\"suggestedHabit\":string,\"suggestedHabitReason\":string,\"suggestedTasks\":[string,string,string]}.` }
} as const;

export const createAiRouter = (config: AppConfig, admin: SupabaseClient | undefined, provider: AIProvider | undefined, logger: Logger) => {
  const router = Router();
  const localUsage = new Map<string, { date: string; count: number }>();
  const localOnly = config.NODE_ENV !== 'production' && config.ENABLE_LOCAL_DEMO === 'true' && !admin;
  let consecutiveProviderFailures = 0;
  let circuitOpenUntil = 0;
  router.get('/usage', async (request, response) => {
    if (!request.user || (!admin && !localOnly)) {
      response.status(503).json({ error: { code: 'ai_unavailable', message: 'AI usage is unavailable.' } }); return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (localOnly) {
      const usage = localUsage.get(request.user.id);
      response.json({ used: usage?.date === today ? usage.count : 0, limit: config.AI_OWNER_DAILY_LIMIT, date: today });
      return;
    }
    const { data, error } = await admin.from('ai_usage').select('request_count')
      .eq('user_id', request.user.id).eq('usage_date', today).maybeSingle();
    if (error) {
      response.status(503).json({ error: { code: 'ai_usage_unavailable', message: 'AI usage is unavailable.' } }); return;
    }
    response.json({ used: Number(data?.request_count || 0), limit: request.user.role === 'owner' ? config.AI_OWNER_DAILY_LIMIT : config.AI_BETA_DAILY_LIMIT, date: today });
  });
  for (const name of Object.keys(jobs) as Array<keyof typeof jobs>) {
    router.post(`/${name}`, async (request: Request, response: Response) => {
      const started = Date.now();
      if (!provider || (!admin && !localOnly) || !request.user) {
        response.status(503).json({ error: { code: "ai_unavailable", message: "AI is currently unavailable." } }); return;
      }
      if (Date.now() < circuitOpenUntil) {
        response.status(503).json({ error: { code: 'ai_circuit_open', message: 'AI is temporarily paused after repeated provider failures.' } }); return;
      }
      try {
        const input = inputs[name].parse(request.body) as never;
        const limit = request.user.role === "owner" ? config.AI_OWNER_DAILY_LIMIT : config.AI_BETA_DAILY_LIMIT;
        let allowed = true;
        if (localOnly) {
          const today = new Date().toISOString().slice(0, 10);
          const current = localUsage.get(request.user.id);
          const count = current?.date === today ? current.count : 0;
          allowed = count < limit;
          if (allowed) localUsage.set(request.user.id, { date: today, count: count + 1 });
        } else {
          const { data, error: quotaError } = await admin!.rpc("consume_ai_quota", {
            target_user_id: request.user.id, target_user_limit: limit, target_global_limit: config.AI_GLOBAL_DAILY_LIMIT
          });
          if (quotaError) throw quotaError;
          allowed = Boolean(data);
        }
        if (!allowed) { response.status(429).json({ error: { code: "ai_quota_reached", message: "Today's AI limit has been reached." } }); return; }
        const job = jobs[name] as { schema: z.ZodTypeAny; maxTokens: number; system: string; prompt: (value: never) => string };
        const result = await provider.generateJson({ system: job.system, prompt: job.prompt(input), maxTokens: job.maxTokens });
        const parsed = job.schema.parse(result.value);
        consecutiveProviderFailures = 0;
        logger.info("ai.request", { requestId: request.requestId, userId: request.user.id, provider: provider.name, model: provider.model, route: name, latencyMs: Date.now() - started, promptTokens: result.usage?.prompt, completionTokens: result.usage?.completion });
        response.json(parsed);
      } catch (error) {
        const category = error instanceof z.ZodError ? 'validation' : error instanceof SyntaxError ? 'invalid_json' : error instanceof Error && error.message.includes('402') ? 'balance' : 'provider';
        if (category !== 'validation') {
          consecutiveProviderFailures += 1;
          if (category === 'balance' || consecutiveProviderFailures >= 5) {
            circuitOpenUntil = Date.now() + 5 * 60_000;
            logger.error('ai.circuit_opened', { provider: provider.name, category, consecutiveProviderFailures });
          }
        }
        logger.warn("ai.request_failed", { requestId: request.requestId, userId: request.user?.id, provider: provider?.name, route: name, latencyMs: Date.now() - started, category });
        response.status(error instanceof z.ZodError ? 422 : 502).json({ error: { code: "ai_response_invalid", message: "AI could not return a valid result." } });
      }
    });
  }
  return router;
};
