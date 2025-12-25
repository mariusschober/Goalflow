
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'GoalflowDB';
const DB_VERSION = 1;

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
  SETTINGS: 'settings'
};

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        Object.values(STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        });
      },
    });
  }
  return dbPromise;
};

export const storageService = {
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const db = await getDB();
    return db.get(storeName, key);
  },

  async set<T>(storeName: string, key: string, value: T): Promise<void> {
    const db = await getDB();
    await db.put(storeName, value, key);
  },

  async delete(storeName: string, key: string): Promise<void> {
    const db = await getDB();
    await db.delete(storeName, key);
  },

  async clear(storeName: string): Promise<void> {
    const db = await getDB();
    await db.clear(storeName);
  },
  
  // Migration helper: Load from LS if IDB is empty, then save to IDB
  async migrateFromLocalStorage<T>(storeName: string, key: string, lsKey: string, defaultValue: T): Promise<T> {
    const dbValue = await this.get(storeName, key) as T | undefined;
    if (dbValue !== undefined) {
      return dbValue;
    }

    // Try LocalStorage
    try {
      const lsItem = window.localStorage.getItem(lsKey);
      if (lsItem) {
        const parsed = JSON.parse(lsItem);
        // Save to IDB
        await this.set(storeName, key, parsed);
        return parsed;
      }
    } catch (e) {
      console.warn(`Migration failed for ${lsKey}`, e);
    }

    return defaultValue;
  }
};
