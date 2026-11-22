import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStorageEngineInfo, isIndexedDbAvailable } from '../services/idbStorage';
import { createEmptyDatabase, saveDatabaseWithFallback, STORAGE_KEYS } from '../services/storage';
import type { BookLibraryDatabase } from '../types/library';

function installMockLocalStorage(throwOnSet = false): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (throwOnSet) {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  return store;
}

function installMockIndexedDb(backingMap: Map<string, unknown>) {
  vi.stubGlobal('indexedDB', {
    open: () => {
      const req: Record<string, unknown> = {
        result: {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => undefined,
          close: () => undefined,
          transaction: () => {
            const tx: Record<string, unknown> = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: () => ({
                put: (val: unknown, key: string) => {
                  backingMap.set(key, val);
                  queueMicrotask(() => {
                    if (typeof tx.oncomplete === 'function') tx.oncomplete();
                  });
                },
                get: (key: string) => {
                  const getReq: Record<string, unknown> = {};
                  queueMicrotask(() => {
                    getReq.result = backingMap.get(key);
                    if (typeof getReq.onsuccess === 'function') getReq.onsuccess();
                    if (typeof tx.oncomplete === 'function') tx.oncomplete();
                  });
                  return getReq;
                },
                delete: (key: string) => {
                  backingMap.delete(key);
                  queueMicrotask(() => {
                    if (typeof tx.oncomplete === 'function') tx.oncomplete();
                  });
                },
              }),
            };
            return tx;
          },
        },
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        if (typeof req.onupgradeneeded === 'function') req.onupgradeneeded();
        if (typeof req.onsuccess === 'function') req.onsuccess();
      });
      return req;
    },
  });
}

describe('IndexedDB storage engine & fallback persistence (P6.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back gracefully to localStorage when indexedDB is unavailable', async () => {
    const lsStore = installMockLocalStorage(false);
    expect(isIndexedDbAvailable()).toBe(false);

    const db: BookLibraryDatabase = createEmptyDatabase();
    const res = await saveDatabaseWithFallback(db);
    expect(res).toMatchObject({ ok: true, engine: 'localstorage' });
    expect(lsStore.get(STORAGE_KEYS.DB)).toBeTruthy();

    const info = await getStorageEngineInfo(db);
    expect(info.engine).toBe('localstorage');
    expect(info.estimatedBytes).toBeGreaterThan(20);
  });

  it('writes to IndexedDB and survives localStorage QuotaExceededError cleanly', async () => {
    const idbBacking = new Map<string, unknown>();
    installMockIndexedDb(idbBacking);
    const lsStore = installMockLocalStorage(true);
    lsStore.set(STORAGE_KEYS.DB, 'stale');

    expect(isIndexedDbAvailable()).toBe(true);
    const db: BookLibraryDatabase = createEmptyDatabase();
    const res = await saveDatabaseWithFallback(db);

    expect(res).toEqual({
      ok: true,
      engine: 'indexeddb',
      localStorageOverflow: true,
    });
    expect(idbBacking.get('database')).toEqual(db);
    expect(lsStore.has(STORAGE_KEYS.DB)).toBe(false);

    const info = await getStorageEngineInfo(db);
    expect(info.engine).toBe('indexeddb');
  });
});
