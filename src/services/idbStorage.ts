import type { BookLibraryDatabase } from '../types/library';
import { generateId } from '../utils/crypto';

const DB_NAME = 'booklibrary_storage_v1';
const STORE_NAME = 'kv';
const DB_KEY = 'database';

export interface StorageEngineInfo {
  engine: 'indexeddb' | 'localstorage';
  estimatedBytes: number;
  quotaBytes?: number;
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openStorageDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function normalizeLoadedDb(raw: unknown): BookLibraryDatabase | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<BookLibraryDatabase>;
  if (parsed.schemaVersion !== 4) return null;
  if (!Array.isArray(parsed.profiles) || !Array.isArray(parsed.books)) return null;

  return {
    schemaVersion: 4,
    dbId: parsed.dbId || generateId('db'),
    updatedAt: parsed.updatedAt || new Date().toISOString(),
    profiles: parsed.profiles,
    shelves: Array.isArray(parsed.shelves) ? parsed.shelves : [],
    books: parsed.books,
    readingLogs: Array.isArray(parsed.readingLogs) ? parsed.readingLogs : [],
  };
}

export async function loadDatabaseFromIdb(): Promise<BookLibraryDatabase | null> {
  const idb = await openStorageDb();
  if (!idb) return null;

  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(DB_KEY);
      req.onsuccess = () => resolve(normalizeLoadedDb(req.result));
      req.onerror = () => resolve(null);
      tx.oncomplete = () => {
        try {
          idb.close();
        } catch {
          // ignore close errors on mock IDB
        }
      };
    } catch {
      resolve(null);
    }
  });
}

export async function saveDatabaseToIdb(
  db: BookLibraryDatabase,
): Promise<{ ok: boolean; error?: string }> {
  const idb = await openStorageDb();
  if (!idb) {
    return { ok: false, error: 'IndexedDB unavailable' };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (res: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    try {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(db, DB_KEY);
      tx.oncomplete = () => {
        try {
          idb.close();
        } catch {
          // ignore
        }
        finish({ ok: true });
      };
      tx.onerror = () => finish({ ok: false, error: tx.error?.message || 'IndexedDB write failed' });
      tx.onabort = () => finish({ ok: false, error: tx.error?.message || 'IndexedDB transaction aborted' });
    } catch (err) {
      finish({ ok: false, error: err instanceof Error ? err.message : 'IndexedDB write error' });
    }
  });
}

export async function clearDatabaseFromIdb(): Promise<void> {
  const idb = await openStorageDb();
  if (!idb) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(DB_KEY);
      tx.oncomplete = () => {
        try {
          idb.close();
        } catch {
          // ignore
        }
        resolve();
      };
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getStorageEngineInfo(db: BookLibraryDatabase): Promise<StorageEngineInfo> {
  const json = JSON.stringify(db);
  const estimatedBytes =
    typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(json).length : json.length;

  let quotaBytes: number | undefined;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === 'number') {
        quotaBytes = est.quota;
      }
    }
  } catch {
    // ignore storage estimate errors
  }

  return {
    engine: isIndexedDbAvailable() ? 'indexeddb' : 'localstorage',
    estimatedBytes,
    quotaBytes,
  };
}
