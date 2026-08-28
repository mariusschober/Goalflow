import { v5 as uuidv5 } from 'uuid';

export const SYNC_META_SCHEMA_VERSION = 2;
const LEGACY_MUTATION_NAMESPACE = '384d2580-c159-4f6a-97d4-f4e94809538b';

const STORE = {
  TASKS: 'tasks', GOALS: 'goals', HABITS: 'habits', STATS: 'stats', PROGRESS: 'progress',
  HASHTAGS: 'hashtags', ACCOUNTABILITY: 'accountability', TRUE_NORTH: 'truenorth',
  AMALGAM: 'amalgam', TRACKING: 'tracking', CIRCADIAN: 'circadian', SETTINGS: 'settings',
  DAILY_PLANS: 'daily_plans'
} as const;

export const RECORD_LEVEL_STORES = new Set<string>([
  STORE.TASKS,
  STORE.GOALS,
  STORE.HABITS,
  STORE.TRUE_NORTH,
  STORE.DAILY_PLANS
]);

export interface SyncMutation {
  mutationId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  baseServerVersion: number | null;
  version: number;
  payload: unknown;
  updatedAt: string;
  deletedAt: string | null;
  dependsOnMutationId?: string;
  resolvesConflictId?: string;
  attemptedAt?: string;
}

export interface ConflictHistoryEntry {
  mutationId: string;
  payload: unknown;
  deletedAt: string | null;
  updatedAt: string;
  version: number;
}

export interface LocalConflict {
  id: string;
  kind: 'push-rejected' | 'remote-vs-local';
  entityType: string;
  entityId: string;
  mutationId?: string;
  localPayload: unknown;
  localDeletedAt: string | null;
  localHistory: ConflictHistoryEntry[];
  serverPayload: unknown;
  serverMissing: boolean;
  serverDeletedAt: string | null;
  serverVersion: number;
  createdAt: string;
  status: 'unresolved' | 'resolving-local';
}

export interface SyncMeta {
  schemaVersion: number;
  cursor: number;
  versions: Record<string, { local: number; server: number | null }>;
  outbox: SyncMutation[];
  conflicts: LocalConflict[];
  lastSuccessfulSync?: string;
}

export interface StagedEntityChange {
  mutationId: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StagedLocalTransaction {
  id: string;
  userKey: string;
  storeName: string;
  storageKey: string;
  previousValue?: unknown;
  hasPreviousValue?: boolean;
  value: unknown;
  changes: StagedEntityChange[];
  order: number;
  createdAt: string;
}

export interface PushResult {
  mutationId: string;
  accepted: boolean;
  serverVersion: number;
  conflictId?: string;
  replayMismatch?: boolean;
  serverMissing?: boolean;
  record?: {
    entityType?: string;
    entity_type?: string;
    entityId?: string;
    entity_id?: string;
    version?: number;
    serverVersion?: number;
    server_version?: number;
    payload?: unknown;
    updatedAt?: string;
    updated_at?: string;
    deletedAt?: string | null;
    deleted_at?: string | null;
  };
}

export interface RemoteSyncRecord {
  entityType: string;
  entityId: string;
  version: number;
  serverVersion: number;
  deviceId?: string;
  payload: unknown;
  updatedAt?: string;
  deletedAt?: string | null;
}

export const emptySyncMeta = (): SyncMeta => ({
  schemaVersion: SYNC_META_SCHEMA_VERSION,
  cursor: 0,
  versions: {},
  outbox: [],
  conflicts: []
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const finiteVersion = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const nullableVersion = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

export const syncEntityKey = (entityType: string, entityId: string): string =>
  `${entityType}:${entityId}`;

export const normalizeSyncMeta = (value: unknown): SyncMeta => {
  if (value === undefined || value === null) return emptySyncMeta();
  if (!isRecord(value)) {
    throw new Error('Synchronization metadata is damaged. It was not discarded.');
  }
  const versions: SyncMeta['versions'] = {};
  if (value.versions !== undefined && !isRecord(value.versions)) {
    throw new Error('Synchronization metadata has a damaged version map. It was not discarded.');
  }
  if (isRecord(value.versions)) {
    for (const [key, version] of Object.entries(value.versions)) {
      if (!isRecord(version)) throw new Error(`Synchronization metadata has a damaged version entry for ${key}.`);
      versions[key] = {
        local: finiteVersion(version.local),
        server: nullableVersion(version.server)
      };
    }
  }
  if (value.outbox !== undefined && !Array.isArray(value.outbox)) {
    throw new Error('The durable sync outbox is damaged. It was not discarded.');
  }
  const parsedOutbox = Array.isArray(value.outbox) ? value.outbox.map((item, index): SyncMutation => {
    if (!isRecord(item) || typeof item.mutationId !== 'string' || !item.mutationId
      || typeof item.entityType !== 'string' || !item.entityType) {
      throw new Error(`Pending synchronization mutation ${index} is damaged. It was not discarded.`);
    }
    return {
      mutationId: item.mutationId,
      deviceId: typeof item.deviceId === 'string' ? item.deviceId : 'legacy-device',
      entityType: item.entityType,
      entityId: typeof item.entityId === 'string' ? item.entityId : 'singleton',
      baseServerVersion: nullableVersion(item.baseServerVersion),
      version: Math.max(1, finiteVersion(item.version, 1)),
      payload: item.payload,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      dependsOnMutationId: typeof item.dependsOnMutationId === 'string' ? item.dependsOnMutationId : undefined,
      resolvesConflictId: typeof item.resolvesConflictId === 'string' ? item.resolvesConflictId : undefined,
      attemptedAt: typeof item.attemptedAt === 'string' ? item.attemptedAt : undefined
    };
  }) : [];
  const outbox = parsedOutbox.flatMap((item): SyncMutation[] => {
    if (!RECORD_LEVEL_STORES.has(item.entityType) || item.entityId !== 'singleton'
      || !Array.isArray(item.payload) || item.payload.length === 0 || item.dependsOnMutationId) {
      return [item];
    }
    const ids = new Set<string>();
    return item.payload.map((payload, index) => {
      if (!isRecord(payload) || typeof payload.id !== 'string' || !payload.id || ids.has(payload.id)) {
        throw new Error(`Legacy pending snapshot record ${index} has no unique identity. It was not discarded.`);
      }
      ids.add(payload.id);
      const key = `${item.entityType}:${payload.id}`;
      return {
        ...item,
        mutationId: uuidv5(`${item.mutationId}:${payload.id}`, LEGACY_MUTATION_NAMESPACE),
        entityId: payload.id,
        baseServerVersion: versions[key]?.server ?? null,
        payload,
        deletedAt: typeof payload.deletedAt === 'string' && payload.deletedAt
          ? payload.deletedAt
          : item.deletedAt,
        dependsOnMutationId: undefined,
        attemptedAt: undefined
      };
    });
  });
  if (new Set(outbox.map(item => item.mutationId)).size !== outbox.length) {
    throw new Error('The durable sync outbox contains duplicate mutation ids. It was not changed.');
  }
  if (value.conflicts !== undefined && !Array.isArray(value.conflicts)) {
    throw new Error('The durable conflict ledger is damaged. It was not discarded.');
  }
  const conflicts = Array.isArray(value.conflicts) ? value.conflicts.map((item, index): LocalConflict => {
    if (!isRecord(item) || typeof item.entityType !== 'string' || !item.entityType) {
      throw new Error(`Synchronization conflict ${index} is damaged. It was not discarded.`);
    }
    const entityId = typeof item.entityId === 'string' ? item.entityId : 'singleton';
    const serverVersion = finiteVersion(item.serverVersion);
    const mutationId = typeof item.mutationId === 'string' ? item.mutationId : undefined;
    const createdAt = typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString();
    const history = Array.isArray(item.localHistory) ? item.localHistory.map((entry, historyIndex): ConflictHistoryEntry => {
      if (!isRecord(entry) || typeof entry.mutationId !== 'string' || !entry.mutationId) {
        throw new Error(`Synchronization conflict ${index} has damaged history entry ${historyIndex}. It was not discarded.`);
      }
      return {
        mutationId: entry.mutationId,
        payload: entry.payload,
        deletedAt: typeof entry.deletedAt === 'string' ? entry.deletedAt : null,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : createdAt,
        version: Math.max(1, finiteVersion(entry.version, 1))
      };
    }) : [];
    return {
      id: typeof item.id === 'string' ? item.id : `legacy:${item.entityType}:${entityId}:${serverVersion}:${index}`,
      kind: item.kind === 'remote-vs-local' ? 'remote-vs-local' : 'push-rejected',
      entityType: item.entityType,
      entityId,
      mutationId,
      localPayload: item.localPayload,
      localDeletedAt: typeof item.localDeletedAt === 'string' ? item.localDeletedAt : null,
      localHistory: history,
      serverPayload: item.serverPayload,
      serverMissing: item.serverMissing === true,
      serverDeletedAt: typeof item.serverDeletedAt === 'string' ? item.serverDeletedAt : null,
      serverVersion,
      createdAt,
      status: item.status === 'resolving-local' ? 'resolving-local' : 'unresolved'
    };
  }) : [];
  if (new Set(conflicts.map(item => item.id)).size !== conflicts.length) {
    throw new Error('The durable conflict ledger contains duplicate ids. It was not changed.');
  }
  const representedMutationIds = [
    ...outbox.map(item => item.mutationId),
    ...conflicts.flatMap(item => item.localHistory.map(entry => entry.mutationId))
  ];
  if (new Set(representedMutationIds).size !== representedMutationIds.length) {
    throw new Error('A pending mutation identity appears more than once in durable synchronization state. Nothing was discarded.');
  }
  return {
    schemaVersion: SYNC_META_SCHEMA_VERSION,
    cursor: finiteVersion(value.cursor),
    versions,
    outbox,
    conflicts,
    lastSuccessfulSync: typeof value.lastSuccessfulSync === 'string' ? value.lastSuccessfulSync : undefined
  };
};

/** JSONB and HTTP are insensitive to object-key insertion order. */
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, candidate) => {
  if (!isRecord(candidate)) return candidate;
  return Object.keys(candidate).sort().reduce<Record<string, unknown>>((ordered, key) => {
    ordered[key] = candidate[key];
    return ordered;
  }, {});
});

const sameInstant = (left: string | null | undefined, right: string | null | undefined): boolean => {
  if (left == null || right == null) return left == null && right == null;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && leftTime === rightTime;
};

const conflictSignature = (conflict: LocalConflict): string => stableJson({
  ...conflict,
  createdAt: undefined
});

const recordMap = (value: unknown): Map<string, Record<string, unknown>> | null => {
  if (!Array.isArray(value)) return value === undefined ? new Map() : null;
  const result = new Map<string, Record<string, unknown>>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id) return null;
    if (result.has(item.id)) {
      throw new Error(`Record identity ${item.id} appears more than once. The local change was not applied.`);
    }
    result.set(item.id, item);
  }
  return result;
};

export const buildStagedLocalTransaction = (
  storeName: string,
  userKey: string,
  previousValue: unknown,
  nextValue: unknown,
  order: number,
  now: string,
  randomUuid: () => string
): StagedLocalTransaction | null => {
  if (stableJson(previousValue) === stableJson(nextValue)) return null;
  const changes: StagedEntityChange[] = [];
  const previousRecords = RECORD_LEVEL_STORES.has(storeName) ? recordMap(previousValue) : null;
  const nextRecords = RECORD_LEVEL_STORES.has(storeName) ? recordMap(nextValue) : null;
  if (RECORD_LEVEL_STORES.has(storeName)) {
    if (!previousRecords || !nextRecords) {
      throw new Error(`Record-level store ${storeName} contains data without stable identities. The change was not staged.`);
    }
    const ids = Array.from(new Set([...previousRecords.keys(), ...nextRecords.keys()])).sort();
    for (const id of ids) {
      const before = previousRecords.get(id);
      const after = nextRecords.get(id);
      if (stableJson(before) === stableJson(after)) continue;
      changes.push({
        mutationId: randomUuid(),
        entityType: storeName,
        entityId: id,
        payload: after ?? before,
        updatedAt: now,
        deletedAt: after
          ? (typeof after.deletedAt === 'string' && after.deletedAt ? after.deletedAt : null)
          : now
      });
    }
  } else {
    changes.push({
      mutationId: randomUuid(),
      entityType: storeName,
      entityId: 'singleton',
      // `undefined` disappears from JSON request bodies. An explicit null keeps
      // singleton deletion retryable and fingerprint-stable across the wire.
      payload: nextValue === undefined ? null : nextValue,
      updatedAt: now,
      deletedAt: nextValue === undefined ? now : null
    });
  }
  return {
    id: randomUuid(),
    userKey,
    storeName,
    storageKey: userKey,
    previousValue,
    hasPreviousValue: true,
    value: nextValue,
    changes,
    order,
    createdAt: now
  };
};

const cloneMeta = (meta: SyncMeta): SyncMeta => ({
  ...meta,
  versions: Object.fromEntries(Object.entries(meta.versions).map(([key, value]) => [key, { ...value }])),
  outbox: meta.outbox.map(item => ({ ...item })),
  conflicts: meta.conflicts.map(item => ({ ...item, localHistory: item.localHistory.map(entry => ({ ...entry })) }))
});

export const appendStagedTransactions = (
  input: SyncMeta,
  transactions: StagedLocalTransaction[],
  deviceId: string
): SyncMeta => {
  const meta = cloneMeta(input);
  const signature = (entityType: string, entityId: string, change: {
    payload: unknown; deletedAt: string | null; updatedAt: string;
  }): string => stableJson({
    entityType,
    entityId,
    payload: change.payload,
    deletedAt: change.deletedAt,
    updatedAt: change.updatedAt
  });
  const knownMutations = new Map<string, string>();
  meta.outbox.forEach(item => knownMutations.set(
    item.mutationId,
    signature(item.entityType, item.entityId, item)
  ));
  meta.conflicts.forEach(conflict => conflict.localHistory.forEach(item => {
    const nextSignature = signature(conflict.entityType, conflict.entityId, item);
    const existing = knownMutations.get(item.mutationId);
    if (existing !== undefined && existing !== nextSignature) {
      throw new Error('A mutation id refers to different durable local changes. Synchronization stopped.');
    }
    knownMutations.set(item.mutationId, nextSignature);
  }));
  for (const transaction of [...transactions].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    for (const change of transaction.changes) {
      const changeSignature = signature(change.entityType, change.entityId, change);
      const existingSignature = knownMutations.get(change.mutationId);
      if (existingSignature !== undefined) {
        if (existingSignature !== changeSignature) {
          throw new Error('A mutation id collision was detected. The pending local change was not discarded.');
        }
        continue;
      }
      const key = syncEntityKey(change.entityType, change.entityId);
      const conflict = meta.conflicts.find(item =>
        item.entityType === change.entityType
        && item.entityId === change.entityId
        && item.status === 'unresolved'
      );
      const legacyVersion = change.entityId === 'singleton' ? meta.versions[change.entityType] : undefined;
      const currentLocal = meta.versions[key]?.local ?? legacyVersion?.local ?? 0;
      const latestForEntity = meta.outbox
        .filter(item => item.entityType === change.entityType && item.entityId === change.entityId)
        .sort((a, b) => b.version - a.version)[0];
      const version = Math.max(currentLocal, latestForEntity?.version ?? 0) + 1;
      meta.versions[key] = {
        local: version,
        server: meta.versions[key]?.server ?? legacyVersion?.server ?? null
      };
      if (conflict) {
        conflict.localPayload = change.payload;
        conflict.localDeletedAt = change.deletedAt;
        conflict.localHistory.push({
          mutationId: change.mutationId,
          payload: change.payload,
          deletedAt: change.deletedAt,
          updatedAt: change.updatedAt,
          version
        });
        knownMutations.set(change.mutationId, changeSignature);
        continue;
      }
      const mutation: SyncMutation = {
        ...change,
        deviceId,
        baseServerVersion: latestForEntity ? null : meta.versions[key].server,
        version,
        dependsOnMutationId: latestForEntity?.mutationId
      };
      meta.outbox.push(mutation);
      knownMutations.set(mutation.mutationId, changeSignature);
    }
  }
  return meta;
};

export const readyOutbox = (meta: SyncMeta, limit = 50): SyncMutation[] => {
  const pendingIds = new Set(meta.outbox.map(item => item.mutationId));
  const selectedEntities = new Set<string>();
  const ready: SyncMutation[] = [];
  for (const mutation of [...meta.outbox].sort((a, b) => a.version - b.version || a.mutationId.localeCompare(b.mutationId))) {
    if (mutation.dependsOnMutationId && pendingIds.has(mutation.dependsOnMutationId)) continue;
    const key = syncEntityKey(mutation.entityType, mutation.entityId);
    if (selectedEntities.has(key)) continue;
    selectedEntities.add(key);
    ready.push(mutation);
    if (ready.length >= limit) break;
  }
  return ready;
};

export const markMutationsAttempted = (input: SyncMeta, mutationIds: string[], attemptedAt: string): SyncMeta => {
  const ids = new Set(mutationIds);
  const meta = cloneMeta(input);
  meta.outbox = meta.outbox.map(item => ids.has(item.mutationId) ? { ...item, attemptedAt } : item);
  return meta;
};

const mutationHistory = (mutations: SyncMutation[]): ConflictHistoryEntry[] => mutations
  .sort((a, b) => a.version - b.version || a.mutationId.localeCompare(b.mutationId))
  .map(item => ({
    mutationId: item.mutationId,
    payload: item.payload,
    deletedAt: item.deletedAt,
    updatedAt: item.updatedAt,
    version: item.version
  }));

export const applyPushResults = (
  input: SyncMeta,
  batch: SyncMutation[],
  results: PushResult[],
  now: string
): SyncMeta => {
  const submitted = new Map(batch.map(item => [item.mutationId, item]));
  if (submitted.size !== batch.length) {
    throw new Error('Sync push batch contains duplicate mutation identities. Pending mutations were not changed.');
  }
  for (const [index, candidate] of results.entries()) {
    if (!isRecord(candidate)
      || typeof candidate.mutationId !== 'string' || !candidate.mutationId
      || typeof candidate.accepted !== 'boolean'
      || !Number.isSafeInteger(candidate.serverVersion) || candidate.serverVersion < 0
      || (candidate.accepted && candidate.serverVersion === 0)
      || (candidate.conflictId !== undefined && (typeof candidate.conflictId !== 'string' || !candidate.conflictId))
      || (candidate.replayMismatch !== undefined && typeof candidate.replayMismatch !== 'boolean')
      || (candidate.serverMissing !== undefined && typeof candidate.serverMissing !== 'boolean')
      || (candidate.record !== undefined && !isRecord(candidate.record))) {
      throw new Error(`Sync push response result ${index} is invalid. Pending mutations were not changed.`);
    }
    const mutation = submitted.get(candidate.mutationId);
    if (!mutation) continue;
    if (candidate.accepted) {
      const record = candidate.record;
      const recordEntityType = record?.entityType ?? record?.entity_type;
      const recordEntityId = record?.entityId ?? record?.entity_id;
      const recordVersion = Number(record?.version);
      const recordServerVersion = Number(record?.serverVersion ?? record?.server_version);
      const recordDeletedAt = record?.deletedAt ?? record?.deleted_at ?? null;
      if (!record
        || recordEntityType !== mutation.entityType
        || recordEntityId !== mutation.entityId
        || recordVersion !== mutation.version
        || recordServerVersion !== candidate.serverVersion
        || stableJson(record.payload) !== stableJson(mutation.payload)
        || !sameInstant(recordDeletedAt, mutation.deletedAt)
        || candidate.replayMismatch === true
        || candidate.serverMissing === true
        || candidate.conflictId !== undefined) {
        throw new Error(`Sync push acceptance ${index} did not prove the exact submitted record. Pending mutations were not changed.`);
      }
    }
    if (!candidate.accepted && candidate.serverMissing !== true
      && (!isRecord(candidate.record) || !Object.prototype.hasOwnProperty.call(candidate.record, 'payload'))) {
      throw new Error(`Sync push rejection ${index} did not preserve the server side. Pending mutations were not changed.`);
    }
  }
  const batchIds = new Set(batch.map(item => item.mutationId));
  const resultIds = results.map(item => item.mutationId);
  if (resultIds.length !== batchIds.size || new Set(resultIds).size !== resultIds.length || resultIds.some(id => !batchIds.has(id))) {
    throw new Error('Sync push response did not acknowledge exactly the submitted mutations.');
  }
  const meta = cloneMeta(input);
  for (const result of results) {
    const mutation = meta.outbox.find(item => item.mutationId === result.mutationId);
    if (!mutation) continue;
    const key = syncEntityKey(mutation.entityType, mutation.entityId);
    const serverVersion = finiteVersion(result.serverVersion);
    if (result.accepted && !result.replayMismatch) {
      meta.outbox = meta.outbox.filter(item => item.mutationId !== mutation.mutationId);
      meta.outbox = meta.outbox.map(item => item.dependsOnMutationId === mutation.mutationId
        ? { ...item, dependsOnMutationId: undefined, baseServerVersion: serverVersion }
        : item);
      meta.versions[key] = { local: Math.max(meta.versions[key]?.local ?? 0, mutation.version), server: serverVersion };
      if (mutation.resolvesConflictId) meta.conflicts = meta.conflicts.filter(item => item.id !== mutation.resolvesConflictId);
      continue;
    }
    const affected = meta.outbox.filter(item =>
      item.entityType === mutation.entityType && item.entityId === mutation.entityId && item.version >= mutation.version
    );
    const history = mutationHistory(affected);
    const latest = history[history.length - 1] ?? {
      mutationId: mutation.mutationId,
      payload: mutation.payload,
      deletedAt: mutation.deletedAt,
      updatedAt: mutation.updatedAt,
      version: mutation.version
    };
    const conflictId = result.conflictId || `push:${mutation.mutationId}`;
    const nextConflict: LocalConflict = {
      id: conflictId,
      kind: 'push-rejected',
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      mutationId: mutation.mutationId,
      localPayload: latest.payload,
      localDeletedAt: latest.deletedAt,
      localHistory: history,
      serverPayload: result.record?.payload,
      serverMissing: result.serverMissing === true,
      serverDeletedAt: result.record?.deletedAt ?? result.record?.deleted_at ?? null,
      serverVersion,
      createdAt: now,
      status: 'unresolved'
    };
    const resolvingConflict = mutation.resolvesConflictId
      ? meta.conflicts.find(item => item.id === mutation.resolvesConflictId)
      : undefined;
    if (resolvingConflict) {
      const combinedHistory = [...resolvingConflict.localHistory, ...history];
      const uniqueHistory = new Map(combinedHistory.map(entry => [entry.mutationId, entry]));
      nextConflict.localHistory = Array.from(uniqueHistory.values())
        .sort((left, right) => left.version - right.version || left.mutationId.localeCompare(right.mutationId));
      const newest = nextConflict.localHistory[nextConflict.localHistory.length - 1];
      if (newest) {
        nextConflict.localPayload = newest.payload;
        nextConflict.localDeletedAt = newest.deletedAt;
      }
      meta.conflicts = meta.conflicts.filter(item => item.id !== resolvingConflict.id);
    }
    const existingConflict = meta.conflicts.find(item => item.id === conflictId);
    if (existingConflict && conflictSignature(existingConflict) !== conflictSignature(nextConflict)) {
      throw new Error('A server conflict id refers to different preserved data. The pending mutation was not removed.');
    }
    meta.outbox = meta.outbox.filter(item => !affected.some(candidate => candidate.mutationId === item.mutationId));
    if (!existingConflict) meta.conflicts.push(nextConflict);
    meta.versions[key] = { local: Math.max(meta.versions[key]?.local ?? 0, latest.version), server: serverVersion };
  }
  return meta;
};

const upsertRecord = (value: unknown, entityId: string, payload: unknown, deletedAt: string | null | undefined): unknown => {
  if (!Array.isArray(value)) value = [];
  const rows = (value as unknown[]).filter(isRecord);
  if (deletedAt) return rows.filter(item => item.id !== entityId);
  if (!isRecord(payload)) throw new Error('Record-level synchronization payload is invalid.');
  const normalized = { ...payload, id: entityId };
  const index = rows.findIndex(item => item.id === entityId);
  if (index < 0) return [...rows, normalized];
  const next = [...rows];
  next[index] = normalized;
  return next;
};

const addConflict = (meta: SyncMeta, conflict: LocalConflict): void => {
  const existing = meta.conflicts.find(item => item.id === conflict.id);
  if (existing && conflictSignature(existing) !== conflictSignature(conflict)) {
    throw new Error('A remote conflict id refers to different preserved data. The sync cursor was not advanced.');
  }
  if (!existing) meta.conflicts.push(conflict);
};

const retainNewestRemoteSide = (
  meta: SyncMeta,
  entityType: string,
  entityId: string,
  record: RemoteSyncRecord,
  serverPayload: unknown = record.payload
): boolean => {
  const matching = meta.conflicts.filter(item =>
    item.entityType === entityType && item.entityId === entityId
  );
  if (!matching.length) return false;
  for (const conflict of matching) {
    if (record.serverVersion <= conflict.serverVersion) continue;
    conflict.serverPayload = serverPayload;
    conflict.serverMissing = false;
    conflict.serverDeletedAt = record.deletedAt ?? null;
    conflict.serverVersion = record.serverVersion;
  }
  return true;
};

export const applyRemotePage = (
  input: SyncMeta,
  currentValues: Record<string, unknown>,
  records: RemoteSyncRecord[],
  nextCursor: number,
  ownDeviceId: string,
  now: string
): { meta: SyncMeta; values: Record<string, unknown>; changedStores: string[] } => {
  const meta = cloneMeta(input);
  if (!Number.isSafeInteger(nextCursor) || nextCursor < meta.cursor) {
    throw new Error('Remote synchronization cursor is invalid or moved backwards.');
  }
  const supportedStores = new Set<string>([
    STORE.TASKS, STORE.GOALS, STORE.HABITS, STORE.STATS, STORE.PROGRESS,
    STORE.HASHTAGS, STORE.ACCOUNTABILITY, STORE.TRUE_NORTH, STORE.AMALGAM,
    STORE.TRACKING, STORE.CIRCADIAN, STORE.SETTINGS, STORE.DAILY_PLANS
  ]);
  const seenServerVersions = new Set<number>();
  for (const record of records) {
    if (!isRecord(record) || typeof record.entityType !== 'string' || !supportedStores.has(record.entityType)
      || typeof record.entityId !== 'string' || !record.entityId
      || !Number.isSafeInteger(record.version) || record.version < 0
      || !Number.isSafeInteger(record.serverVersion) || record.serverVersion <= meta.cursor
      || seenServerVersions.has(record.serverVersion)
      || (record.deviceId !== undefined && typeof record.deviceId !== 'string')
      || (record.updatedAt !== undefined && typeof record.updatedAt !== 'string')
      || (record.deletedAt !== undefined && record.deletedAt !== null && typeof record.deletedAt !== 'string')) {
      throw new Error('Remote synchronization page contains invalid, stale, or duplicate information. The cursor was not advanced.');
    }
    seenServerVersions.add(record.serverVersion);
  }
  const highestReturned = records.reduce(
    (highest, record) => Math.max(highest, finiteVersion(record.serverVersion)),
    meta.cursor
  );
  if (nextCursor !== highestReturned) {
    throw new Error('Remote synchronization cursor would skip or discard information.');
  }
  const values = { ...currentValues };
  const changedStores = new Set<string>();
  for (const record of [...records].sort((a, b) => a.serverVersion - b.serverVersion)) {
    if (record.entityId === 'singleton' && RECORD_LEVEL_STORES.has(record.entityType) && Array.isArray(record.payload)) {
      let nextValue = values[record.entityType];
      for (const item of record.payload) {
        if (!isRecord(item) || typeof item.id !== 'string' || !item.id) {
          throw new Error('Legacy snapshot contains an invalid record.');
        }
        const key = syncEntityKey(record.entityType, item.id);
        const pending = meta.outbox.filter(candidate => candidate.entityType === record.entityType && candidate.entityId === item.id);
        if (pending.length && record.deviceId !== ownDeviceId) {
          const history = mutationHistory(pending);
          const latest = history[history.length - 1];
          addConflict(meta, {
            id: `pull:${record.serverVersion}:${record.entityType}:${item.id}`,
            kind: 'remote-vs-local',
            entityType: record.entityType,
            entityId: item.id,
            localPayload: latest.payload,
            localDeletedAt: latest.deletedAt,
            localHistory: history,
            serverPayload: item,
            serverMissing: false,
            serverDeletedAt: record.deletedAt ?? null,
            serverVersion: record.serverVersion,
            createdAt: now,
            status: 'unresolved'
          });
          const pendingIds = new Set(pending.map(item => item.mutationId));
          meta.outbox = meta.outbox.filter(item => !pendingIds.has(item.mutationId));
        } else if (retainNewestRemoteSide(meta, record.entityType, item.id, record, item)) {
          // The current UI value remains the local side. The conflict ledger is
          // advanced to the newest remote side before the page cursor moves.
        } else if (record.serverVersion > (meta.versions[key]?.server ?? 0)) {
          nextValue = upsertRecord(nextValue, item.id, item, record.deletedAt);
          changedStores.add(record.entityType);
        }
        meta.versions[key] = {
          local: Math.max(meta.versions[key]?.local ?? 0, finiteVersion(record.version)),
          server: Math.max(meta.versions[key]?.server ?? 0, record.serverVersion)
        };
      }
      values[record.entityType] = nextValue;
      const singletonKey = syncEntityKey(record.entityType, 'singleton');
      meta.versions[singletonKey] = {
        local: Math.max(meta.versions[singletonKey]?.local ?? 0, finiteVersion(record.version)),
        server: Math.max(meta.versions[singletonKey]?.server ?? 0, record.serverVersion)
      };
      continue;
    }
    const key = syncEntityKey(record.entityType, record.entityId);
    const pending = meta.outbox.filter(candidate => candidate.entityType === record.entityType && candidate.entityId === record.entityId);
    if (pending.length) {
      const history = mutationHistory(pending);
      const latest = history[history.length - 1];
      addConflict(meta, {
        id: `pull:${record.serverVersion}:${record.entityType}:${record.entityId}`,
        kind: 'remote-vs-local',
        entityType: record.entityType,
        entityId: record.entityId,
        localPayload: latest.payload,
        localDeletedAt: latest.deletedAt,
        localHistory: history,
        serverPayload: record.payload,
        serverMissing: false,
        serverDeletedAt: record.deletedAt ?? null,
        serverVersion: record.serverVersion,
        createdAt: now,
        status: 'unresolved'
      });
      const pendingIds = new Set(pending.map(item => item.mutationId));
      meta.outbox = meta.outbox.filter(item => !pendingIds.has(item.mutationId));
    } else if (retainNewestRemoteSide(meta, record.entityType, record.entityId, record)) {
      // See the legacy-record branch above: the remote side is durably updated
      // in the conflict rather than silently applied behind an old conflict.
    } else if (record.serverVersion > (meta.versions[key]?.server ?? 0)) {
      values[record.entityType] = RECORD_LEVEL_STORES.has(record.entityType)
        ? upsertRecord(values[record.entityType], record.entityId, record.payload, record.deletedAt)
        : record.deletedAt ? undefined : record.payload;
      changedStores.add(record.entityType);
    }
    meta.versions[key] = {
      local: Math.max(meta.versions[key]?.local ?? 0, finiteVersion(record.version)),
      server: Math.max(meta.versions[key]?.server ?? 0, record.serverVersion)
    };
  }
  meta.cursor = Math.max(meta.cursor, finiteVersion(nextCursor, meta.cursor));
  return { meta, values, changedStores: Array.from(changedStores) };
};

export const resolveConflictWithLocal = (
  input: SyncMeta,
  conflictId: string,
  deviceId: string,
  now: string,
  mutationId: string
): SyncMeta => {
  const meta = cloneMeta(input);
  const conflict = meta.conflicts.find(item => item.id === conflictId);
  if (!conflict) return meta;
  if (conflict.status === 'resolving-local') return meta;
  const representedIds = new Set([
    ...meta.outbox.map(item => item.mutationId),
    ...meta.conflicts.flatMap(item => item.localHistory.map(entry => entry.mutationId))
  ]);
  if (representedIds.has(mutationId)) {
    throw new Error('A conflict resolution mutation id is already in use. Both versions remain preserved.');
  }
  const key = syncEntityKey(conflict.entityType, conflict.entityId);
  const version = Math.max(meta.versions[key]?.local ?? 0, ...conflict.localHistory.map(item => item.version), 0) + 1;
  meta.outbox.push({
    mutationId,
    deviceId,
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    baseServerVersion: conflict.serverVersion,
    version,
    payload: conflict.localPayload,
    updatedAt: now,
    deletedAt: conflict.localDeletedAt,
    resolvesConflictId: conflict.id
  });
  conflict.status = 'resolving-local';
  meta.versions[key] = { local: version, server: conflict.serverVersion };
  return meta;
};

export const applyConflictCloudValue = (value: unknown, conflict: LocalConflict): unknown => {
  if (RECORD_LEVEL_STORES.has(conflict.entityType) && conflict.entityId === 'singleton') {
    if (conflict.serverMissing) return value;
    if (Array.isArray(conflict.serverPayload)) {
      let merged = value;
      const ids = new Set<string>();
      for (const item of conflict.serverPayload) {
        if (!isRecord(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)) {
          throw new Error('The cloud snapshot conflict contains invalid or duplicate records. Both versions remain preserved.');
        }
        ids.add(item.id);
        merged = upsertRecord(merged, item.id, item, conflict.serverDeletedAt);
      }
      return merged;
    }
  }
  return conflict.serverMissing
    ? (RECORD_LEVEL_STORES.has(conflict.entityType)
      ? (Array.isArray(value) ? value.filter(item => !isRecord(item) || item.id !== conflict.entityId) : [])
      : undefined)
    : RECORD_LEVEL_STORES.has(conflict.entityType)
      ? upsertRecord(value, conflict.entityId, conflict.serverPayload, conflict.serverDeletedAt)
      : conflict.serverDeletedAt ? undefined : conflict.serverPayload;
};
