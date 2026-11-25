import type { BookLibraryDatabase, DriveConfig, ThemeMode } from '../types/library';
import { generateId } from '../utils/crypto';
import {
  clearDatabaseFromIdb,
  isIndexedDbAvailable,
  saveDatabaseToIdb,
} from './idbStorage';

export const STORAGE_KEYS = {
  DB: 'booklibrary_db',
  DRIVE_CONFIG: 'booklibrary_drive_config',
  DRIVE_TOKEN: 'booklibrary_drive_token',
  THEME: 'booklibrary_theme',
  ACTIVE_PROFILE_PERSISTENT: 'booklibrary_active_profile',
  ACTIVE_PROFILE_SESSION: 'booklibrary_active_profile_session',
  LEGACY_V4_DB: 'omnilibrary_v4_db',
  LEGACY_V4_DRIVE_CONFIG: 'omnilibrary_v4_drive_config',
  LEGACY_V4_THEME: 'omnilibrary_v4_theme',
  LEGACY_V4_ACTIVE_PROFILE_PERSISTENT: 'omnilibrary_v4_active_profile',
  LEGACY_V4_ACTIVE_PROFILE_SESSION: 'omnilibrary_v4_active_profile_session',
  LEGACY_V3: 'omni_library_v1',
} as const;

export const DEFAULT_DRIVE_FILE_NAME = 'booklibrary-db.json';
export const DRIVE_TOKEN_EXPIRY_BUFFER_MS = 60_000;
const LOCAL_STORAGE_MIRROR_LIMIT = 4_000_000;

export interface CachedDriveToken {
  accessToken: string;
  expiresAt: number;
  clientId: string;
  userEmail?: string | null;
}

function readWithLegacyFallback(primaryKey: string, legacyKey: string): string | null {
  const current = localStorage.getItem(primaryKey);
  if (current !== null) return current;
  return localStorage.getItem(legacyKey);
}

export function createEmptyDatabase(): BookLibraryDatabase {
  return {
    schemaVersion: 4,
    dbId: generateId('db'),
    updatedAt: new Date().toISOString(),
    profiles: [],
    shelves: [],
    books: [],
    readingLogs: [],
  };
}

export function loadLocalDatabase(): BookLibraryDatabase {
  try {
    const raw = readWithLegacyFallback(STORAGE_KEYS.DB, STORAGE_KEYS.LEGACY_V4_DB);
    if (!raw) return createEmptyDatabase();
    const parsed = JSON.parse(raw) as Partial<BookLibraryDatabase>;
    if (parsed && parsed.schemaVersion === 4) {
      return {
        schemaVersion: 4,
        dbId: parsed.dbId || generateId('db'),
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        shelves: Array.isArray(parsed.shelves) ? parsed.shelves : [],
        books: Array.isArray(parsed.books) ? parsed.books : [],
        readingLogs: Array.isArray(parsed.readingLogs) ? parsed.readingLogs : [],
      };
    }
    return createEmptyDatabase();
  } catch {
    return createEmptyDatabase();
  }
}

export function saveLocalDatabase(db: BookLibraryDatabase): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(STORAGE_KEYS.DB, JSON.stringify(db));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Storage quota exceeded';
    return { ok: false, error: message };
  }
}

export interface SaveFallbackResult {
  ok: boolean;
  engine: 'indexeddb' | 'localstorage';
  localStorageOverflow?: boolean;
  error?: string;
}

/**
 * Persists database primarily in IndexedDB (high storage ceiling for large households),
 * while maintaining a synchronous localStorage mirror when size is safely below 4 MB.
 */
export async function saveDatabaseWithFallback(
  db: BookLibraryDatabase,
): Promise<SaveFallbackResult> {
  if (isIndexedDbAvailable()) {
    const idbRes = await saveDatabaseToIdb(db);
    if (idbRes.ok) {
      const serialized = JSON.stringify(db);
      if (serialized.length < LOCAL_STORAGE_MIRROR_LIMIT) {
        try {
          localStorage.setItem(STORAGE_KEYS.DB, serialized);
          return { ok: true, engine: 'indexeddb' };
        } catch {
          try {
            localStorage.removeItem(STORAGE_KEYS.DB);
          } catch {
            // ignore
          }
          return { ok: true, engine: 'indexeddb', localStorageOverflow: true };
        }
      } else {
        try {
          localStorage.removeItem(STORAGE_KEYS.DB);
        } catch {
          // ignore
        }
        return { ok: true, engine: 'indexeddb', localStorageOverflow: true };
      }
    }
  }

  const localRes = saveLocalDatabase(db);
  return {
    ok: localRes.ok,
    engine: 'localstorage',
    error: localRes.error,
  };
}

export function clearCachedDriveToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.DRIVE_TOKEN);
  } catch {
    // ignore
  }
}

export function saveCachedDriveToken(
  accessToken: string,
  expiresInSeconds: number,
  clientId: string,
  userEmail?: string | null,
): void {
  const trimmedClientId = clientId.trim();
  if (!accessToken || !trimmedClientId) return;
  try {
    const payload: CachedDriveToken = {
      accessToken,
      expiresAt: Date.now() + Math.max(0, expiresInSeconds) * 1000,
      clientId: trimmedClientId,
      userEmail: userEmail ?? null,
    };
    localStorage.setItem(STORAGE_KEYS.DRIVE_TOKEN, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export function loadCachedDriveToken(
  expectedClientId: string,
  nowMs = Date.now(),
): CachedDriveToken | null {
  const trimmedClientId = expectedClientId.trim();
  if (!trimmedClientId) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DRIVE_TOKEN);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedDriveToken>;
    if (
      !parsed ||
      typeof parsed.accessToken !== 'string' ||
      !parsed.accessToken ||
      typeof parsed.expiresAt !== 'number' ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.clientId !== trimmedClientId ||
      parsed.expiresAt - nowMs <= DRIVE_TOKEN_EXPIRY_BUFFER_MS
    ) {
      clearCachedDriveToken();
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      clientId: parsed.clientId,
      userEmail: parsed.userEmail ?? null,
    };
  } catch {
    clearCachedDriveToken();
    return null;
  }
}

export function clearLocalDatabase(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.DB);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_V4_DB);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_PERSISTENT);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_V4_ACTIVE_PROFILE_PERSISTENT);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_SESSION);
    sessionStorage.removeItem(STORAGE_KEYS.LEGACY_V4_ACTIVE_PROFILE_SESSION);
  } catch {
    // ignore
  }
  clearCachedDriveToken();
  void clearDatabaseFromIdb();
}

export function detectLegacyV3Data(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LEGACY_V3);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { libraries?: unknown[] };
    if (parsed && Array.isArray(parsed.libraries)) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadSavedActiveProfileId(): string | null {
  try {
    const sessionId =
      sessionStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_SESSION) ||
      sessionStorage.getItem(STORAGE_KEYS.LEGACY_V4_ACTIVE_PROFILE_SESSION);
    if (sessionId) return sessionId;
    return readWithLegacyFallback(
      STORAGE_KEYS.ACTIVE_PROFILE_PERSISTENT,
      STORAGE_KEYS.LEGACY_V4_ACTIVE_PROFILE_PERSISTENT,
    );
  } catch {
    return null;
  }
}

export function persistActiveProfileSession(profileId: string | null, hasPin: boolean): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_PERSISTENT);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_V4_ACTIVE_PROFILE_PERSISTENT);
    sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE_SESSION);
    sessionStorage.removeItem(STORAGE_KEYS.LEGACY_V4_ACTIVE_PROFILE_SESSION);
    if (!profileId) return;
    if (hasPin) {
      sessionStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_SESSION, profileId);
    } else {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_PERSISTENT, profileId);
    }
  } catch {
    // ignore storage errors
  }
}

export function loadDriveConfig(): DriveConfig {
  const defaultClientId =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) || '';
  const fallback: DriveConfig = {
    clientId: defaultClientId,
    fileId: null,
    fileName: DEFAULT_DRIVE_FILE_NAME,
    userEmail: null,
    lastSyncedAt: null,
  };
  try {
    const raw = readWithLegacyFallback(
      STORAGE_KEYS.DRIVE_CONFIG,
      STORAGE_KEYS.LEGACY_V4_DRIVE_CONFIG,
    );
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DriveConfig>;
    return {
      clientId: parsed.clientId || defaultClientId,
      fileId: parsed.fileId ?? null,
      fileName: parsed.fileName || DEFAULT_DRIVE_FILE_NAME,
      userEmail: parsed.userEmail ?? null,
      lastSyncedAt: parsed.lastSyncedAt ?? null,
    };
  } catch {
    return fallback;
  }
}

export function saveDriveConfig(config: DriveConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DRIVE_CONFIG, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function loadInitialTheme(): ThemeMode {
  try {
    const saved = readWithLegacyFallback(STORAGE_KEYS.THEME, STORAGE_KEYS.LEGACY_V4_THEME);
    if (saved === 'dark' || saved === 'light') return saved;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // ignore
  }
  return 'light';
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch {
    // ignore
  }
}
