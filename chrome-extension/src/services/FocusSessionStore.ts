// Durable focus-session store — mirrors android FocusSessionStore and macos UserDefaultsFocusSessionStore
// Uses chrome.storage.local with verified read-back. Falls back to in-memory for tests/off-extension.

import type { ExecutionState } from '../domain/types';

const STORAGE_KEY = 'goalflow.focus.session.v1';

export type FocusSessionStoreErrorCode = 'writeFailed' | 'readBackMismatch' | 'corrupted';

export class FocusSessionStoreError extends Error {
  constructor(public readonly code: FocusSessionStoreErrorCode, message: string) {
    super(message);
    this.name = 'FocusSessionStoreError';
  }
}

export interface StorageAdapter {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

class ChromeStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<Record<string, unknown>> {
    const g: any = globalThis as any;
    if (g.chrome?.storage?.local?.get) {
      return await g.chrome.storage.local.get(key);
    }
    return {};
  }
  async set(items: Record<string, unknown>): Promise<void> {
    const g: any = globalThis as any;
    if (g.chrome?.storage?.local?.set) {
      await g.chrome.storage.local.set(items);
      return;
    }
    throw new FocusSessionStoreError('writeFailed', 'chrome.storage unavailable');
  }
  async remove(key: string): Promise<void> {
    const g: any = globalThis as any;
    if (g.chrome?.storage?.local?.remove) {
      await g.chrome.storage.local.remove(key);
      return;
    }
  }
}

class MemoryStorageAdapter implements StorageAdapter {
  private map = new Map<string, unknown>();
  async get(key: string): Promise<Record<string, unknown>> {
    const v = this.map.get(key);
    return v === undefined ? {} : { [key]: v };
  }
  async set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) this.map.set(k, v);
  }
  async remove(key: string): Promise<void> { this.map.delete(key); }
  // test hook: corrupt store directly
  _inject(key: string, value: unknown) { this.map.set(key, value); }
}

function isChromeAvailable(): boolean {
  const g: any = globalThis as any;
  return Boolean(g.chrome?.storage?.local?.get && g.chrome?.storage?.local?.set);
}

export function createMemoryStorage(): MemoryStorageAdapter {
  return new MemoryStorageAdapter();
}

export class FocusSessionStore {
  private readonly key = STORAGE_KEY;
  private readonly storage: StorageAdapter;

  constructor(storage?: StorageAdapter) {
    if (storage) this.storage = storage;
    else this.storage = isChromeAvailable() ? new ChromeStorageAdapter() : new MemoryStorageAdapter();
  }

  async load(): Promise<ExecutionState | null> {
    const result = await this.storage.get(this.key);
    const raw = result[this.key];
    if (raw === undefined || raw === null) return null;
    try {
      const json = typeof raw === 'string' ? raw : JSON.stringify(raw);
      const parsed = JSON.parse(json) as ExecutionState;
      if (!parsed || typeof parsed.taskId !== 'string' || !parsed.taskId
          || typeof parsed.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)
          || typeof parsed.plannedDurationSeconds !== 'number' || !Number.isFinite(parsed.plannedDurationSeconds)
          || (parsed.phase !== 'idle' && parsed.phase !== 'active')) {
        throw new FocusSessionStoreError('corrupted', 'Stored focus session has invalid shape');
      }
      return parsed;
    } catch (e) {
      if (e instanceof FocusSessionStoreError) throw e;
      throw new FocusSessionStoreError('corrupted', `Stored focus session is corrupted: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async save(state: ExecutionState): Promise<void> {
    const serialized = JSON.stringify(state);
    // chrome.storage prefers object, but store as string for fidelity with macos JSON secondsSince1970 equivalent
    try {
      await this.storage.set({ [this.key]: serialized });
    } catch (e) {
      throw new FocusSessionStoreError('writeFailed', `chrome.storage set failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    // verified read-back
    const after = await this.storage.get(this.key);
    const stored = after[this.key];
    const storedJson = typeof stored === 'string' ? stored : JSON.stringify(stored);
    if (storedJson !== serialized) {
      throw new FocusSessionStoreError('readBackMismatch', 'Focus session read-back mismatch — not durably persisted');
    }
    // deep equality second check (parse compare)
    try {
      const decoded = JSON.parse(storedJson) as ExecutionState;
      if (JSON.stringify(decoded) !== JSON.stringify(state)) {
        throw new FocusSessionStoreError('readBackMismatch', 'Decoded focus state differs from written state');
      }
    } catch (e) {
      if (e instanceof FocusSessionStoreError) throw e;
      throw new FocusSessionStoreError('readBackMismatch', `Read-back parse failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async clear(): Promise<void> {
    await this.storage.remove(this.key);
    const after = await this.storage.get(this.key);
    if (after[this.key] !== undefined) {
      throw new FocusSessionStoreError('writeFailed', 'Focus session not cleared');
    }
  }

  // For testing: expose underlying for injection helpers
  get storageForTest(): MemoryStorageAdapter | undefined {
    return this.storage instanceof MemoryStorageAdapter ? this.storage : undefined;
  }
}
