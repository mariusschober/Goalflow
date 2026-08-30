// Deterministic demo Current provider — mirrors macos-native Providers/CurrentTaskProvider.swift
// Persists demo queue in chrome.storage.local; sorts via vendored compareCurrentTasks.

import type { GoalflowTask } from '../domain/types';
import type { ScheduledTask } from '../domain/scheduling';
import { buildTodayQueue } from '../domain/scheduling';
import type { CurrentTaskProvider } from './CurrentTaskProvider';

const DEMO_KEY = 'goalflow.demo.tasks.v1';

interface StorageAdapter {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

class ChromeStorage implements StorageAdapter {
  async get(key: string): Promise<Record<string, unknown>> {
    const g: any = globalThis as any;
    if (g.chrome?.storage?.local?.get) return await g.chrome.storage.local.get(key);
    return {};
  }
  async set(items: Record<string, unknown>): Promise<void> {
    const g: any = globalThis as any;
    if (g.chrome?.storage?.local?.set) return await g.chrome.storage.local.set(items);
    // fallback no-op for tests
    (globalThis as any).__demoMem = (globalThis as any).__demoMem || new Map();
    for (const [k, v] of Object.entries(items)) (globalThis as any).__demoMem.set(k, v);
  }
}

class MemoryStorage implements StorageAdapter {
  private m = new Map<string, unknown>();
  async get(key: string): Promise<Record<string, unknown>> {
    const v = this.m.get(key);
    return v === undefined ? {} : { [key]: v };
  }
  async set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) this.m.set(k, v);
  }
}

function isChrome(): boolean {
  const g: any = globalThis as any;
  return Boolean(g.chrome?.storage?.local?.get);
}

function toScheduled(task: GoalflowTask): ScheduledTask {
  return {
    id: task.id,
    userId: 'local-demo',
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
  };
}

export class DemoCurrentTaskProvider implements CurrentTaskProvider {
  private storage: StorageAdapter;
  constructor(storage?: StorageAdapter) {
    if (storage) this.storage = storage;
    else this.storage = isChrome() ? new ChromeStorage() : new MemoryStorage();
  }

  private seedTasks(today: string, nowIso: string): GoalflowTask[] {
    const base: GoalflowTask[] = [
      {
        id: 'demo-1',
        title: 'Draft Q4 roadmap — outline three bets',
        notes: '',
        tags: ['#planning'],
        schedulePrecision: 'day',
        scheduledFor: today,
        plannedOrder: 0,
        status: 'open',
        isFrog: false,
        frogFailures: 0,
        beforeFrog: false,
        source: 'manual',
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
        durationMinutes: 25,
        extraJson: '{}',
      },
      {
        id: 'demo-2',
        title: 'Review weekly goals and set tomorrow',
        notes: '',
        tags: [],
        schedulePrecision: 'day',
        scheduledFor: today,
        plannedOrder: 1,
        status: 'open',
        isFrog: false,
        frogFailures: 0,
        beforeFrog: false,
        source: 'manual',
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
        durationMinutes: 15,
        extraJson: '{}',
      },
    ];
    return base;
  }

  private async loadRaw(): Promise<GoalflowTask[] | null> {
    const r = await this.storage.get(DEMO_KEY);
    const raw = r[DEMO_KEY];
    if (raw === undefined) return null;
    try {
      const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const parsed = JSON.parse(json) as GoalflowTask[];
      if (!Array.isArray(parsed)) return null;
      return parsed;
    } catch { return null; }
  }

  private async persist(tasks: GoalflowTask[]): Promise<void> {
    await this.storage.set({ [DEMO_KEY]: JSON.stringify(tasks) });
  }

  async allTasks(today: string): Promise<GoalflowTask[]> {
    const nowIso = new Date().toISOString();
    let tasks = await this.loadRaw();
    if (!tasks) {
      tasks = this.seedTasks(today, nowIso);
      await this.persist(tasks);
      return tasks;
    }
    // Ensure demo tasks are for today (migrate date if stale)
    const needsMigrate = tasks.some(t => t.scheduledFor !== today && t.id.startsWith('demo-'));
    if (needsMigrate) {
      tasks = tasks.map(t => t.id.startsWith('demo-') ? { ...t, scheduledFor: today, updatedAt: nowIso } : t);
      await this.persist(tasks);
    }
    // validate shape minimally — if corrupted, reseed
    if (!tasks.every(t => typeof t.id === 'string' && typeof t.title === 'string')) {
      tasks = this.seedTasks(today, nowIso);
      await this.persist(tasks);
    }
    return tasks;
  }

  async fetchCurrent(today: string): Promise<GoalflowTask | null> {
    const tasks = await this.allTasks(today);
    const scheduled: ScheduledTask[] = tasks.map(toScheduled);
    const queue = buildTodayQueue(scheduled, today);
    if (queue.length === 0) return null;
    const headId = queue[0].id;
    return tasks.find(t => t.id === headId) ?? null;
  }

  async setFrogDemo(isFrog: boolean): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const tasks = await this.allTasks(today);
    if (tasks[0]) {
      tasks[0].isFrog = isFrog;
      tasks[0].updatedAt = new Date().toISOString();
      await this.persist(tasks);
    }
  }

  async resetDemo(today: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const tasks = this.seedTasks(today, nowIso);
    await this.persist(tasks);
  }
}
