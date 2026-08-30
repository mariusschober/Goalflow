import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTelegramProcessor } from "./bot";
import type { AppConfig } from "../config";

type Row = Record<string, unknown>;

const createFakeDatabase = (opts: {
  profileTimezone?: string;
  identity?: { user_id: string; telegram_chat_id: number | null; bot_access_granted: boolean } | null;
}) => {
  const tables: Record<string, Map<string, Row>> = {
    telegram_captures: new Map(),
    tasks: new Map(),
  };
  const calls: { rpc: { name: string; args: Record<string, unknown> }[]; from: string[] } = {
    rpc: [],
    from: [],
  };

  const createBuilder = (table: string) => {
    let filters: Record<string, unknown> = {};
    let gt: { field: string; value: string } | null = null;
    let op: "select" | "insert" | "update" | null = null;
    let insertRow: Row | null = null;
    let updatePatch: Row | null = null;

    const builder: Record<string, unknown> = {
      select: (fields: string) => {
        if (!op) op = "select";
        return builder;
      },
      insert: (row: Row) => {
        op = "insert";
        insertRow = row;
        if (row.id) tables[table]?.set(String(row.id), { ...row });
        return builder;
      },
      update: (patch: Row) => {
        op = "update";
        updatePatch = patch;
        return builder;
      },
      eq: (field: string, value: unknown) => {
        filters[field] = value;
        return builder;
      },
      is: (_field: string, _value: unknown) => builder,
      gt: (field: string, value: string) => {
        gt = { field, value };
        return builder;
      },
      maybeSingle: async () => {
        if (table === "telegram_identities") {
          const tid = filters["telegram_user_id"];
          if (opts.identity && String(tid) === String(12345)) {
            return { data: opts.identity as unknown as Row, error: null };
          }
          return { data: opts.identity ?? null, error: null };
        }
        if (table === "profiles") {
          return { data: { timezone: opts.profileTimezone ?? "UTC" }, error: null };
        }
        if (table === "telegram_captures") {
          const id = String(filters["id"] ?? "");
          const row = tables[table]?.get(id) ?? null;
          if (!row) return { data: null, error: null };
          return { data: row, error: null };
        }
        if (table === "tasks") {
          const id = String(filters["id"] ?? "");
          const row = tables[table]?.get(id) ?? null;
          if (row) return { data: row, error: null };
          return { data: null, error: null };
        }
        if (table === "daily_plans") return { data: null, error: null };
        return { data: null, error: null };
      },
      single: async () => {
        if (op === "insert" && insertRow) return { data: insertRow, error: null };
        return { data: null, error: null };
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (op === "insert") return Promise.resolve({ error: null }).then(resolve as never, reject as never);
        if (op === "update") {
          if (updatePatch) {
            for (const [, row] of tables[table]?.entries() ?? []) {
              let match = true;
              for (const f in filters) if (String(row[f]) !== String(filters[f])) match = false;
              if (gt && String(row[gt.field] ?? "") <= gt.value) match = false;
              if (match) Object.assign(row, updatePatch);
            }
          }
          return Promise.resolve({ error: null }).then(resolve as never, reject as never);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve as never, reject as never);
      },
    };
    return builder as unknown as {
      select: (s: string) => typeof builder;
      insert: (r: Row) => typeof builder;
      update: (r: Row) => typeof builder;
      eq: (f: string, v: unknown) => typeof builder;
      is: (f: string, v: unknown) => typeof builder;
      gt: (f: string, v: string) => typeof builder;
      maybeSingle: () => Promise<{ data: Row | null; error: null }>;
      single: () => Promise<{ data: Row | null; error: null }>;
      then: (a: unknown, b: unknown) => unknown;
    };
  };

  const database = {
    from: (table: string) => {
      calls.from.push(table);
      return createBuilder(table) as unknown as ReturnType<typeof createBuilder>;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.rpc.push({ name, args });
      if (name === "goalflow_create_task_idempotent") {
        const payload = args.task_payload as Row;
        const row = { id: (payload.taskId as string) ?? "new-id", ...payload, user_id: args.target_user_id } as Row;
        tables["tasks"].set(String(row.id), row as Row);
        return { data: row, error: null };
      }
      if (name === "goalflow_drop_task_idempotent") return { data: { id: args.target_task_id }, error: null };
      if (name === "goalflow_complete_task_idempotent") return { data: { id: args.target_task_id }, error: null };
      if (name === "goalflow_skip_task_idempotent") return { data: { id: args.target_task_id }, error: null };
      return { data: null, error: null };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient & { _calls: typeof calls; _tables: typeof tables };

  (database as unknown as { _calls: typeof calls })._calls = calls;
  (database as unknown as { _tables: typeof tables })._tables = tables;
  return database as typeof database & { _calls: typeof calls; _tables: typeof tables };
};

describe("telegram bot tranche-1", () => {
  const config = {
    TELEGRAM_BOT_TOKEN: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    TELEGRAM_WEBHOOK_SECRET: "secret-that-is-long-enough-for-validation-123456",
    APP_ORIGIN: "https://example.com",
    TELEGRAM_MAX_VOICE_BYTES: 19_000_000,
  } as unknown as AppConfig;

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as import("../logger").Logger;

  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, result: {} }) } as Response));
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("requires explicit scheduling for unscheduled text capture (no silent Today)", async () => {
    const db = createFakeDatabase({
      identity: { user_id: "11111111-1111-1111-1111-111111111111", telegram_chat_id: null, bot_access_granted: true },
      profileTimezone: "UTC",
    });
    const processor = createTelegramProcessor(config, db as unknown as never, undefined, logger);
    await processor({ update_id: 1001, message: { message_id: 1, from: { id: 12345 }, chat: { id: 999 }, text: "Buy printer paper" } });

    const pendingMap = (db as unknown as { _tables: { telegram_captures: Map<string, Row> } })._tables.telegram_captures;
    expect(pendingMap.size).toBe(1);
    const pending = Array.from(pendingMap.values())[0] as Row;
    expect(String(pending.title)).toBe("Buy printer paper");
    expect(String(pending.kind)).toBe("text");
    expect(String(pending.state)).toBe("pending");
    const rpcCalls = (db as unknown as { _calls: { rpc: { name: string }[] } })._calls.rpc;
    expect(rpcCalls.filter((c) => c.name === "goalflow_create_task_idempotent")).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalled();
    const fetchCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const sentBody = JSON.parse((fetchCalls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(String(sentBody.text)).toContain("When?");
    expect(JSON.stringify(sentBody.reply_markup)).toContain("Today");
  });

  it("creates task directly when explicit date is present", async () => {
    const db = createFakeDatabase({
      identity: { user_id: "22222222-2222-2222-2222-222222222222", telegram_chat_id: null, bot_access_granted: true },
      profileTimezone: "UTC",
    });
    const processor = createTelegramProcessor(config, db as unknown as never, undefined, logger);
    await processor({ update_id: 1002, message: { message_id: 1, from: { id: 12345 }, chat: { id: 999 }, text: "Call Alex 2026-09-14" } });
    const rpcCalls = (db as unknown as { _calls: { rpc: { name: string; args: Record<string, unknown> }[] } })._calls.rpc;
    expect(rpcCalls.some((c) => c.name === "goalflow_create_task_idempotent")).toBe(true);
    const pendingMap = (db as unknown as { _tables: { telegram_captures: Map<string, Row> } })._tables.telegram_captures;
    expect(pendingMap.size).toBe(0);
  });

  it("handles Today callback for pending capture and creates task", async () => {
    const db = createFakeDatabase({
      identity: { user_id: "33333333-3333-3333-3333-333333333333", telegram_chat_id: null, bot_access_granted: true },
      profileTimezone: "UTC",
    });
    const captureId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    (db as unknown as { _tables: { telegram_captures: Map<string, Row> } })._tables.telegram_captures.set(captureId, {
      id: captureId,
      user_id: "33333333-3333-3333-3333-333333333333",
      title: "Buy printer paper",
      schedule_precision: "day",
      scheduled_for: "2026-08-30",
      state: "pending",
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    } as Row);

    const processor = createTelegramProcessor(config, db as unknown as never, undefined, logger);
    await processor({
      update_id: 2001,
      callback_query: { id: "cb1", from: { id: 12345 }, message: { message_id: 2, chat: { id: 999 } }, data: `sch:today:${captureId}` },
    });

    const rpcCalls = (db as unknown as { _calls: { rpc: { name: string }[] } })._calls.rpc;
    expect(rpcCalls.some((c) => c.name === "goalflow_create_task_idempotent")).toBe(true);
  });

  it("undo uses idempotent drop RPC and guards source", async () => {
    const taskId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const db = createFakeDatabase({
      identity: { user_id: "44444444-4444-4444-4444-444444444444", telegram_chat_id: null, bot_access_granted: true },
    });
    (db as unknown as { _tables: { tasks: Map<string, Row> } })._tables.tasks.set(taskId, {
      id: taskId,
      user_id: "44444444-4444-4444-4444-444444444444",
      source: "telegram",
      status: "open",
    } as Row);

    const processor = createTelegramProcessor(config, db as unknown as never, undefined, logger);
    await processor({
      update_id: 3001,
      callback_query: { id: "cb2", from: { id: 12345 }, message: { message_id: 3, chat: { id: 999 } }, data: `undo:${taskId}` },
    });
    const rpcCalls = (db as unknown as { _calls: { rpc: { name: string }[] } })._calls.rpc;
    expect(rpcCalls.some((c) => c.name === "goalflow_drop_task_idempotent")).toBe(true);
  });
});
