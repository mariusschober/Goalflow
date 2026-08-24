import { openDB, deleteDB, IDBPDatabase } from 'idb';

const DB_NAME = 'GoalflowDB';
const BACKUP_SCHEMA_VERSION = 2;

// Define store names
export const STORES = {
  TASKS: 'tasks',
  GOALS: 'goals',
  HABITS: 'habits',
  STATS: 'stats',
  PROGRESS: 'progress',
  HASHTAGS: 'hashtags',
  ACCOUNTABILITY: 'accountability',
  TRUE_NORTH: 'truenorth',
  AMALGAM: 'amalgam',
  TRACKING: 'tracking',
  CIRCADIAN: 'circadian',
  SETTINGS: 'settings',
  SYNC: 'sync',
  SNAPSHOTS: 'snapshots'
};

const DATA_STORES = Object.values(STORES).filter(storeName => storeName !== STORES.SNAPSHOTS && storeName !== STORES.SYNC);

export interface GoalflowBackup {
  schemaVersion: number;
  exportedAt: string;
  checksum: string;
  collections: Record<string, any>;
}

const checksumCollections = async (collections: Record<string, any>): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(collections));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const mergeBackupCollection = (current: unknown, incoming: unknown): unknown => {
  if (Array.isArray(current) && Array.isArray(incoming)) {
    if (incoming.every(item => isRecord(item) && typeof item.id === 'string')) {
      const merged = new Map<string, unknown>();
      current.forEach(item => {
        if (isRecord(item) && typeof item.id === 'string') merged.set(item.id, item);
      });
      incoming.forEach(item => merged.set(String(item.id), item));
      return Array.from(merged.values());
    }
    return incoming;
  }
  if (isRecord(current) && isRecord(incoming)) return { ...current, ...incoming };
  return incoming;
};

// Global states for Disaster Recovery and Fallbacks
let useFallbackStorage = false;
const fallbackMemoryStore: Record<string, Record<string, any>> = {};

const writeToFallback = (storeName: string, key: string, value: any) => {
  if (!fallbackMemoryStore[storeName]) {
    fallbackMemoryStore[storeName] = {};
  }
  fallbackMemoryStore[storeName][key] = value;
  try {
    window.localStorage.setItem(`goalflow_fallback_${storeName}_${key}`, JSON.stringify(value));
  } catch (e) {
    console.warn("[Storage] Fallback backup failed:", e);
  }
};

const readFromFallback = <T>(storeName: string, key: string): T | undefined => {
  if (fallbackMemoryStore[storeName]?.[key] !== undefined) {
    return fallbackMemoryStore[storeName][key];
  }
  try {
    const backup = window.localStorage.getItem(`goalflow_dr_${storeName}_${key}`) || 
                   window.localStorage.getItem(`goalflow_fallback_${storeName}_${key}`);
    if (backup) {
      const parsed = JSON.parse(backup);
      if (!fallbackMemoryStore[storeName]) {
        fallbackMemoryStore[storeName] = {};
      }
      fallbackMemoryStore[storeName][key] = parsed;
      return parsed;
    }
  } catch (e) {
    console.warn("[Storage] Read from fallback failed:", e);
  }
  return undefined;
};

const announceLocalChange = (storeName: string, key: string, value: unknown) => {
  if (storeName === STORES.SYNC || storeName === STORES.SNAPSHOTS) return;
  window.dispatchEvent(new CustomEvent('goalflow:local-change', { detail: { storeName, key, value } }));
};

// Open database with dynamic schema auto-migration
const openAndMigrate = async (versionAttempt?: number): Promise<IDBPDatabase> => {
  const requiredStores = Object.values(STORES);

  const db = await openDB(DB_NAME, versionAttempt, {
    upgrade(database, oldVersion, newVersion) {
      console.log(`[Storage] Upgrading database from version ${oldVersion} to ${newVersion}`);
      requiredStores.forEach(storeName => {
        if (!database.objectStoreNames.contains(storeName)) {
          console.log(`[Storage] Creating object store: ${storeName}`);
          database.createObjectStore(storeName);
        }
      });
    },
    blocked(currentVersion, blockedVersion) {
      console.warn(`[Storage] Database open is blocked! Current: ${currentVersion}, Blocked: ${blockedVersion}`);
    },
    blocking(currentVersion, blockedVersion, event) {
      console.warn(`[Storage] Database is blocking another connection. Closing!`);
      try {
        (event.target as any).result.close();
      } catch (_) {}
    },
    terminated() {
      console.error(`[Storage] Database connection was abnormally terminated`);
    }
  });

  // Verify that all requested stores are present in this version
  const missingStores = requiredStores.filter(storeName => !db.objectStoreNames.contains(storeName));

  if (missingStores.length > 0) {
    console.warn(`[Storage] Found missing stores: ${missingStores.join(', ')}. Initiating auto-migration upgrade.`);
    const currentVersion = db.version;
    db.close(); // Close active connection to allow upgrade
    
    // Re-open with an incremented version to trigger the upgrade() callback
    return openAndMigrate(currentVersion + 1);
  }

  return db;
};

let dbPromise: Promise<IDBPDatabase | null> | null = null;

const getDB = async (): Promise<IDBPDatabase | null> => {
  if (useFallbackStorage) {
    return null;
  }
  
  if (dbPromise) {
    try {
      const db = await dbPromise;
      if (db) return db;
    } catch (err) {
      console.warn("[Storage] Existing dbPromise rejected. Re-initializing.", err);
      dbPromise = null;
    }
  }

  dbPromise = (async () => {
    try {
      return await openAndMigrate();
    } catch (err) {
      console.error("[Storage] IndexedDB is unavailable. Preserving it untouched and using fallback storage.", err);
      useFallbackStorage = true;
      return null;
    }
  })();

  return dbPromise;
};

interface PendingWrite {
  storeName: string;
  key: string;
  value: any;
  resolve: () => void;
  reject: (err: any) => void;
}

let pendingWrites: PendingWrite[] = [];
let batchPromise: Promise<void> | null = null;

const flushWrites = async () => {
  const currentBatch = [...pendingWrites];
  pendingWrites = [];
  batchPromise = null;

  if (currentBatch.length === 0) return;

  try {
    const db = await getDB();
    if (!db) {
      // In fallback mode, write immediately
      currentBatch.forEach(write => {
        writeToFallback(write.storeName, write.key, write.value);
        write.resolve();
      });
      return;
    }

    const storeNames = Array.from(new Set(currentBatch.map(w => w.storeName)));
    const tx = db.transaction(storeNames, 'readwrite');
    await Promise.all(
      currentBatch.map(async (write) => {
        await tx.objectStore(write.storeName).put(write.value, write.key);
      })
    );
    await tx.done;
    currentBatch.forEach(w => w.resolve());
  } catch (err) {
    console.error("Error committing batch database transaction:", err);
    currentBatch.forEach(w => w.reject(err));
  }
};

export const storageService = {
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    if (useFallbackStorage) {
      return readFromFallback<T>(storeName, key);
    }
    try {
      const db = await getDB();
      if (!db) {
        return readFromFallback<T>(storeName, key);
      }
      return await db.get(storeName, key);
    } catch (err) {
      console.warn(`[Storage] Failed to get ${storeName} : ${key}, trying fallback.`, err);
      return readFromFallback<T>(storeName, key);
    }
  },

  set<T>(storeName: string, key: string, value: T, source: 'local' | 'cloud' = 'local'): Promise<void> {
    // Proactive background backing up for resilient Disaster Recovery
    try {
      window.localStorage.setItem(`goalflow_dr_${storeName}_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn("[Storage] Disaster Recovery LocalStorage backup failed:", e);
    }

    if (useFallbackStorage) {
      writeToFallback(storeName, key, value);
      if (source === 'local') announceLocalChange(storeName, key, value);
      return Promise.resolve();
    }

    const write = new Promise<void>((resolve, reject) => {
      pendingWrites.push({ storeName, key, value, resolve, reject });
      if (!batchPromise) {
        batchPromise = Promise.resolve().then(flushWrites);
      }
    });
    return write.then(() => { if (source === 'local') announceLocalChange(storeName, key, value); });
  },

  async delete(storeName: string, key: string): Promise<void> {
    try {
      window.localStorage.removeItem(`goalflow_dr_${storeName}_${key}`);
      window.localStorage.removeItem(`goalflow_fallback_${storeName}_${key}`);
    } catch (e) {}

    if (fallbackMemoryStore[storeName]) {
      delete fallbackMemoryStore[storeName][key];
    }

    if (useFallbackStorage) {
      return;
    }

    try {
      const db = await getDB();
      if (db) {
        await db.delete(storeName, key);
      }
    } catch (err) {
      console.error("[Storage] Failed to delete in IndexedDB.", err);
    }
  },

  async clear(storeName: string): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (key.startsWith(`goalflow_dr_${storeName}_`) || key.startsWith(`goalflow_fallback_${storeName}_`))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => window.localStorage.removeItem(k));
    } catch (e) {}

    if (fallbackMemoryStore[storeName]) {
      fallbackMemoryStore[storeName] = {};
    }

    if (useFallbackStorage) {
      return;
    }

    try {
      const db = await getDB();
      if (db) {
        await db.clear(storeName);
      }
    } catch (err) {
      console.error("[Storage] Failed to clear IndexedDB store:", err);
    }
  },
  
  async migrateFromLocalStorage<T>(storeName: string, key: string, lsKey: string, defaultValue: T): Promise<T> {
    const dbValue = await this.get(storeName, key) as T | undefined;
    if (dbValue !== undefined) {
      return dbValue;
    }

    try {
      const lsItem = window.localStorage.getItem(lsKey);
      if (lsItem) {
        const parsed = JSON.parse(lsItem);
        await this.set(storeName, key, parsed);
        return parsed;
      }
    } catch (e) {
      console.warn(`Migration failed for ${lsKey}`, e);
    }

    return defaultValue;
  },

  async migrateUserKey(sourceKey: string, targetKey: string): Promise<void> {
    if (!sourceKey || sourceKey === targetKey) return;
    for (const storeName of DATA_STORES) {
      const targetValue = await this.get(storeName, targetKey);
      if (targetValue !== undefined) continue;
      const sourceValue = await this.get(storeName, sourceKey);
      if (sourceValue !== undefined) await this.set(storeName, targetKey, sourceValue, 'cloud');
    }
  },

  async exportBackup(userEmail: string): Promise<GoalflowBackup> {
    const collections: Record<string, any> = {};
    if (useFallbackStorage) {
      for (const storeName of DATA_STORES) {
        const val = readFromFallback<any>(storeName, userEmail);
        if (val !== undefined) {
          collections[storeName] = val;
        }
      }
      return { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), checksum: await checksumCollections(collections), collections };
    }
    try {
      const db = await getDB();
      if (!db) return { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), checksum: await checksumCollections(collections), collections };
      for (const storeName of DATA_STORES) {
        try {
          const data = await db.get(storeName, userEmail);
          if (data !== undefined) {
            collections[storeName] = data;
          }
        } catch (err) {
          console.warn(`Error exporting store ${storeName}`, err);
        }
      }
    } catch (e) {
      console.warn("[Storage] Error getting db connection for export", e);
    }
    return { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), checksum: await checksumCollections(collections), collections };
  },

  async importBackup(userEmail: string, backup: Record<string, any>, mode: 'merge' | 'replace' = 'merge'): Promise<void> {
    const envelope = backup as Partial<GoalflowBackup>;
    if (envelope.schemaVersion && envelope.schemaVersion > BACKUP_SCHEMA_VERSION) throw new Error('This backup was created by a newer Goalflow version.');
    const collections = envelope.collections || backup;
    if (!collections || typeof collections !== 'object') throw new Error('The backup does not contain typed collections.');
    if (envelope.checksum) {
      const actualChecksum = await checksumCollections(collections);
      if (actualChecksum !== envelope.checksum) throw new Error('Backup checksum validation failed. The file may be incomplete or modified.');
    }
    await this.createLocalSnapshot(userEmail, 'before-restore');

    if (useFallbackStorage) {
      for (const storeName of DATA_STORES) {
        if (collections[storeName] !== undefined) {
          const current = readFromFallback(storeName, userEmail);
          const value = mode === 'merge' ? mergeBackupCollection(current, collections[storeName]) : collections[storeName];
          writeToFallback(storeName, userEmail, value);
        }
      }
      return;
    }
    try {
      const db = await getDB();
      if (!db) return;
      const tx = db.transaction(DATA_STORES, 'readwrite');
      for (const storeName of DATA_STORES) {
        if (mode === 'replace') await tx.objectStore(storeName).delete(userEmail);
        if (collections[storeName] !== undefined) {
          try {
            const current = mode === 'merge' ? await tx.objectStore(storeName).get(userEmail) : undefined;
            const value = mode === 'merge' ? mergeBackupCollection(current, collections[storeName]) : collections[storeName];
            await tx.objectStore(storeName).put(value, userEmail);
            try {
              window.localStorage.setItem(`goalflow_dr_${storeName}_${userEmail}`, JSON.stringify(value));
            } catch (e) {}
          } catch (err) {
            console.warn(`Error importing store ${storeName}`, err);
          }
        }
      }
      await tx.done;
    } catch (e) {
      console.warn("[Storage] Database import transaction failed", e);
      throw e;
    }
  },

  async createLocalSnapshot(userEmail: string, reason: string): Promise<void> {
    if (useFallbackStorage) return;
    const db = await getDB();
    if (!db) return;
    const backup = await this.exportBackup(userEmail);
    const key = `${userEmail}:${Date.now()}`;
    await db.put(STORES.SNAPSHOTS, { ...backup, reason }, key);
    const keys = (await db.getAllKeys(STORES.SNAPSHOTS))
      .map(String)
      .filter(candidate => candidate.startsWith(`${userEmail}:`))
      .sort();
    for (const oldKey of keys.slice(0, Math.max(0, keys.length - 10))) await db.delete(STORES.SNAPSHOTS, oldKey);
  },

  // DIAGNOSTIC AND SELF-REPAIR APIS
  async getDatabaseStatus(): Promise<{
    status: 'healthy' | 'fallback' | 'error';
    mode: 'indexeddb' | 'memory-fallback';
    version: number;
    storeCount: number;
    stores: string[];
    details?: string;
  }> {
    if (useFallbackStorage) {
      return {
        status: 'fallback',
        mode: 'memory-fallback',
        version: 0,
        storeCount: 0,
        stores: [],
        details: 'IndexedDB is blocked or unavailable. Robust multi-tier fallbacks are running natively.'
      };
    }
    try {
      const db = await getDB();
      if (!db) {
        return {
          status: 'fallback',
          mode: 'memory-fallback',
          version: 0,
          storeCount: 0,
          stores: [],
          details: 'Unable to resolve IndexedDB. Living on local buffers.'
        };
      }
      return {
        status: 'healthy',
        mode: 'indexeddb',
        version: db.version,
        storeCount: db.objectStoreNames.length,
        stores: Array.from(db.objectStoreNames)
      };
    } catch (err: any) {
      return {
        status: 'error',
        mode: 'memory-fallback',
        version: 0,
        storeCount: 0,
        stores: [],
        details: `Diagnostic failure: ${err?.message || err}`
      };
    }
  },

  async runSelfRepair(userEmail: string): Promise<{ success: boolean; message: string }> {
    console.log("[Storage] Initiating manual self-repair of IndexedDB...");
    try {
      const verifiedBackup = await this.exportBackup(userEmail);
      if (verifiedBackup.checksum !== await checksumCollections(verifiedBackup.collections)) {
        throw new Error('The pre-repair snapshot could not be verified. No database changes were made.');
      }
      await this.createLocalSnapshot(userEmail, 'before-repair');

      // 1. Scan LocalStorage for existing recovery buffers and merge the verified live snapshot.
      const restoreData: Record<string, Record<string, any>> = {};
      
      for (const storeName of DATA_STORES) {
        restoreData[storeName] = {};
        try {
          for (let i = 0; i < window.localStorage.length; i++) {
            const lsKey = window.localStorage.key(i);
            if (lsKey) {
              const prefixRecovery = `goalflow_dr_${storeName}_`;
              const prefixFallback = `goalflow_fallback_${storeName}_`;
              
              if (lsKey.startsWith(prefixRecovery)) {
                const itemKey = lsKey.substring(prefixRecovery.length);
                const val = window.localStorage.getItem(lsKey);
                if (val) restoreData[storeName][itemKey] = JSON.parse(val);
              } else if (lsKey.startsWith(prefixFallback)) {
                const itemKey = lsKey.substring(prefixFallback.length);
                const val = window.localStorage.getItem(lsKey);
                if (val) restoreData[storeName][itemKey] = JSON.parse(val);
              }
            }
          }
        } catch (e) {
          console.warn(`[Storage] Error scanning backups for store ${storeName}`, e);
        }
        if (verifiedBackup.collections[storeName] !== undefined) restoreData[storeName][userEmail] = verifiedBackup.collections[storeName];
      }

      const verifiedRecordCount = Object.values(restoreData).reduce((total, records) => total + Object.keys(records).length, 0);
      if (verifiedRecordCount === 0) throw new Error('No verified recovery records were found. The database was left untouched.');

      // 2. Tear down the current database promise & connection
      if (dbPromise) {
        try {
          const db = await dbPromise;
          if (db) db.close();
        } catch (e) {}
        dbPromise = null;
      }

      // 3. Delete IndexedDB completely
      await deleteDB(DB_NAME);
      
      // 4. Reset failure flag and recreate fresh
      useFallbackStorage = false;
      const freshDb = await openAndMigrate(1);
      dbPromise = Promise.resolve(freshDb);

      // 5. Populate fresh DB from the saved buffers
      const tx = freshDb.transaction(DATA_STORES, 'readwrite');
      let restoredKeysCount = 0;
      for (const storeName of DATA_STORES) {
        const storeObj = restoreData[storeName];
        if (storeObj) {
          for (const [key, value] of Object.entries(storeObj)) {
            await tx.objectStore(storeName).put(value, key);
            restoredKeysCount++;
          }
        }
      }
      await tx.done;

      console.log(`[Storage] Self-repair completed. Repaired and restored ${restoredKeysCount} keys.`);
      return {
        success: true,
        message: `IndexedDB self-repair successfully complete! Restored ${restoredKeysCount} items from multi-tier local disaster recovery buffers.`
      };
    } catch (err: any) {
      console.error("[Storage] Self-repair failed:", err);
      useFallbackStorage = true;
      dbPromise = null;
      return {
        success: false,
        message: `IndexedDB self-repair failed: ${err?.message || err}. Smoothly falling back to standard LocalStorage + memory mode to keep tasks safe.`
      };
    }
  }
};
