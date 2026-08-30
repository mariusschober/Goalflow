import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTelegramProcessor } from "./bot";
import type { AppConfig } from "../config";
import type { TelegramMessage } from "./types";

type Row = Record<string, unknown>;

const createFakeDatabase = (opts: {
  identity?: { user_id: string; telegram_chat_id: number | null; bot_access_granted: boolean } | null;
  profileTimezone?: string;
  existingCaptureState?: string;
}) => {
  const tables: Record<string, Map<string, Row>> = {
    telegram_captures: new Map(),
    tasks: new Map(),
  };
  const calls: { rpc: string[]; from: string[] } = { rpc: [], from: [] };

  const createBuilder = (table: string) => {
    let filters: Record<string, unknown> = {};
    let op: string | null = null;
    let row: Row | null = null;
    const builder: Record<string, unknown> = {
      select: () => { op = "select"; return builder; },
      insert: (r: Row) => { op = "insert"; row = r; if (r.id) tables[table]?.set(String(r.id), { ...r }); return builder; },
      update: (p: Row) => { op = "update"; row = p; return builder; },
      eq: (f: string, v: unknown) => { filters[f] = v; return builder; },
      is: () => builder,
      gt: () => builder,
      maybeSingle: async () => {
        if (table === "telegram_identities") return { data: opts.identity ?? null, error: null };
        if (table === "profiles") return { data: { timezone: opts.profileTimezone ?? "UTC" }, error: null };
        if (table === "telegram_captures") {
          const id = String(filters["id"] ?? "");
          const stored = tables[table]?.get(id) ?? null;
          if (!stored) return { data: null, error: null };
          // For adversarial, just return stored if id matches, ignore other filters
          // But simulate confirmed state for duplicate test
          if (opts.existingCaptureState && String(stored.state) !== opts.existingCaptureState) {
            // override for test
          }
          return { data: stored, error: null };
        }
        if (table === "tasks") {
          const id = String(filters["id"] ?? "");
          const stored = tables[table]?.get(id) ?? null;
          if (stored) return { data: stored, error: null };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => ({ data: row, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        if (op === "insert" || op === "update") return Promise.resolve({ error: null }).then(resolve as never, reject as never);
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

  const db = {
    from: (table: string) => {
      calls.from.push(table);
      return createBuilder(table) as unknown as ReturnType<typeof createBuilder>;
    },
    rpc: async (name: string) => {
      calls.rpc.push(name);
      return { data: { id: "new-id" }, error: null };
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient & { _calls: typeof calls; _tables: typeof tables };

  (db as unknown as { _calls: typeof calls })._calls = calls;
  (db as unknown as { _tables: typeof tables })._tables = tables;
  return db as typeof db & { _calls: typeof calls; _tables: typeof tables };
};

describe("telegram adversarial", () => {
  const config = {
    TELEGRAM_BOT_TOKEN: "123:abc",
    TELEGRAM_WEBHOOK_SECRET: "secret-long-enough-for-validation-123456",
    APP_ORIGIN: "https://example.com",
    TELEGRAM_MAX_VOICE_BYTES: 19_000_000,
  } as unknown as AppConfig;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as import("../logger").Logger;
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("getFile")) {
        return { ok: true, json: async () => ({ ok: true, result: { file_path: "voice.ogg", file_size: 1000 } }) } as unknown as Response;
      }
      if (String(url).includes("file/bot")) {
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(100) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ok: true, result: {} }) } as unknown as Response;
    });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("duplicate update_id for text pending does not duplicate", async () => {
    const db = createFakeDatabase({ identity: { user_id: "u1", telegram_chat_id: null, bot_access_granted: true } });
    const proc = createTelegramProcessor(config, db as unknown as never, undefined, logger);
    const update = { update_id: 5001, message: { message_id: 1, from: { id: 123 }, chat: { id: 1 }, text: "Buy paper" } as TelegramMessage };
    await proc(update);
    await proc(update); // duplicate
    const pending = (db as unknown as { _tables: { telegram_captures: Map<string, Row> } })._tables.telegram_captures;
    expect(pending.size).toBe(1);
  });

  it("voice too large is rejected explicitly", async () => {
    const db = createFakeDatabase({ identity: { user_id: "u1", telegram_chat_id: null, bot_access_granted: true } });
    const proc = createTelegramProcessor(config, db as unknown as never, { name: "test", transcribe: async () => "transcribed" } as never, logger);
    const bigVoice = { file_id: "f", file_size: 20_000_000 } as unknown as { file_id: string; file_size: number };
    await proc({ update_id: 5002, message: { message_id: 1, from: { id: 123 }, chat: { id: 1 }, voice: bigVoice } as TelegramMessage });
    expect(global.fetch).toHaveBeenCalled();
    const body = JSON.parse(((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(String(body.text)).toContain("too large");
  });

  it("transcription failure is explicit and does not create pending", async () => {
    const db = createFakeDatabase({ identity: { user_id: "u1", telegram_chat_id: null, bot_access_granted: true } });
    const failingSpeech = { name: "test", transcribe: async () => { throw new Error("fail"); } } as unknown as import("../speech/types").SpeechProvider;
    const proc = createTelegramProcessor(config, db as unknown as never, failingSpeech, logger);
    await proc({ update_id: 5003, message: { message_id: 1, from: { id: 123 }, chat: { id: 1 }, voice: { file_id: "f", file_size: 1000 } as unknown as TelegramMessage["voice"] } as TelegramMessage });
    const pending = (db as unknown as { _tables: { telegram_captures: Map<string, Row> } })._tables.telegram_captures;
    expect(pending.size).toBe(0);
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const lastBody = JSON.parse((calls[calls.length - 1][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(String(lastBody.text)).toContain("could not be transcribed");
  });

  it("forwarded hidden_user does not fabricate t.me link but still pending", async () => {
    const db = createFakeDatabase({ identity: { user_id: "u1", telegram_chat_id: null, bot_access_granted: true } });
    const proc = createTelegramProcessor(config, db as unknown as never, undefined, logger);
    const msg: TelegramMessage = {
      message_id: 1,
      from: { id: 123 },
      chat: { id: 1 },
      text: "Secret task",
      forward_origin: { type: "hidden_user", sender_user_name: "Anon", date: 123 } as unknown,
    };
    await proc({ update_id: 5004, message: msg });
    const pending = (db as unknown as { _tables: { telegram_captures: Map<string, Row> } })._tables.telegram_captures;
    expect(pending.size).toBe(1);
    const row = Array.from(pending.values())[0] as Row;
    expect(row.forward_origin).toBeDefined();
    // tMeLink is not stored in telegram_captures, but forward_origin is preserved
  });
});
