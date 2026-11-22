import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DriveAuthExpiredError,
  fetchUserEmail,
  requestDriveAccessToken,
  syncWithDrive,
} from '../services/googleDriveSync';
import {
  isIndexedDbAvailable,
  loadDatabaseFromIdb,
  saveDatabaseToIdb,
} from '../services/idbStorage';
import { applyImport, type ImportPreview } from '../services/importExport';
import {
  clearLocalDatabase,
  detectLegacyV3Data,
  loadDriveConfig,
  loadInitialTheme,
  loadLocalDatabase,
  loadSavedActiveProfileId,
  persistActiveProfileSession,
  saveDatabaseWithFallback,
  saveDriveConfig,
  saveTheme,
} from '../services/storage';
import type {
  AvatarTheme,
  Book,
  BookFormat,
  BookLibraryDatabase,
  BookOwnership,
  DriveConfig,
  ProfileRole,
  ProgressUnit,
  ReadingLog,
  ReadingStatus,
  ReadSessionSpan,
  Shelf,
  SyncStatus,
  ThemeMode,
  UserProfile,
} from '../types/library';
import { getHouseholdAdmins, isProfileAdmin } from '../utils/admin';
import { sanitizeCoverUrl } from '../utils/cover';
import { generateId, hashPin, verifyPin } from '../utils/crypto';
import { createDemoHousehold } from '../utils/demoData';
import { findBookDuplicates } from '../utils/duplicates';
import { formatMinutesHuman } from '../utils/progress';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone?: 'info' | 'success' | 'error';
  undoAction?: () => void;
}

export interface CreateProfileInput {
  name: string;
  avatarEmoji: string;
  avatarTheme: AvatarTheme;
  role?: ProfileRole;
  pin?: string;
  yearlyBookGoal: number;
  monthlyPageGoal: number;
}

export interface UpdateProfileInput {
  name?: string;
  avatarEmoji?: string;
  avatarTheme?: AvatarTheme;
  role?: ProfileRole;
  /** undefined = unchanged, null = remove PIN, string = set new PIN */
  newPin?: string | null;
  yearlyBookGoal?: number;
  monthlyPageGoal?: number;
  badgeRewards?: Record<string, string>;
}

export interface BookInput {
  title: string;
  author: string;
  shelfIds: string[];
  isbn?: string;
  publishYear?: number;
  publisher?: string;
  language?: string;
  pageCount: number;
  currentPage: number;
  progressUnit?: ProgressUnit;
  totalChapters?: number;
  currentChapter?: number;
  totalMinutes?: number;
  currentMinutes?: number;
  coverUrl?: string;
  format?: BookFormat;
  ownership?: BookOwnership;
  ownershipNote?: string;
  dueDate?: string;
  lentTo?: string;
  lentDate?: string;
  status: ReadingStatus;
  rating: number;
  dateStarted?: string;
  dateFinished?: string;
  readHistory?: ReadSessionSpan[];
  recommendedBy?: string;
  wantToReadNote?: string;
  review?: string;
  synopsis?: string;
  series?: string;
  seriesIndex?: number;
  notes: string;
  tags: string[];
  openLibraryKey?: string;
}

export interface LogSessionInput {
  bookId: string;
  date: string;
  pagesRead: number;
  pageReached?: number;
  unit?: ProgressUnit;
  chaptersRead?: number;
  chapterReached?: number;
  minutesListened?: number;
  minuteReached?: number;
  note?: string;
  markFinished?: boolean;
  finalRating?: number;
  finalReview?: string;
}

interface LibraryContextValue {
  db: BookLibraryDatabase;
  storageEngine: 'indexeddb' | 'localstorage';
  activeProfiles: UserProfile[];
  adminProfiles: UserProfile[];
  activeProfile: UserProfile | null;
  activeProfileId: string | null;
  isActiveProfileAdmin: boolean;
  pendingPinProfile: UserProfile | null;
  profileShelves: Shelf[];
  profileBooks: Book[];
  profileLogs: ReadingLog[];
  theme: ThemeMode;
  toggleTheme: () => void;
  syncStatus: SyncStatus;
  syncError: string | null;
  driveConfig: DriveConfig;
  isDriveConnected: boolean;
  hasUnsyncedChanges: boolean;
  legacyV3Raw: string | null;
  dismissLegacyV3Banner: () => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;

  // Profile, Admin, & PIN auth
  beginSwitchToProfile: (profileId: string) => void;
  verifyPendingPin: (pin: string) => Promise<boolean>;
  cancelPendingPin: () => void;
  logoutProfile: () => void;
  createProfile: (input: CreateProfileInput, autoLogin?: boolean) => Promise<UserProfile>;
  updateProfile: (profileId: string, input: UpdateProfileInput) => Promise<void>;
  deleteProfile: (profileId: string) => void;
  adminResetUserPin: (
    adminProfileId: string,
    adminPin: string | null,
    targetProfileId: string,
    newPin: string | null,
    unlockOnClear?: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  setProfileRole: (
    targetProfileId: string,
    role: ProfileRole,
  ) => { ok: boolean; error?: string };

  // Shelves
  addShelf: (name: string, color?: string, icon?: string) => Shelf | null;
  updateShelf: (
    shelfId: string,
    updates: Partial<Pick<Shelf, 'name' | 'color' | 'icon' | 'visible' | 'sortOrder'>>,
  ) => void;
  deleteShelf: (shelfId: string) => void;

  // Books, Re-Reads, & Household Recommendations
  addBook: (input: BookInput) => Book | null;
  updateBook: (bookId: string, updates: Partial<BookInput>) => void;
  deleteBook: (bookId: string) => void;
  startReread: (bookId: string, startDate?: string) => void;
  addReadHistorySpan: (bookId: string, span: Omit<ReadSessionSpan, 'id'>) => void;
  deleteReadHistorySpan: (bookId: string, spanId: string) => void;
  recommendBookToProfile: (
    bookId: string,
    targetProfileId: string,
    note: string,
  ) => { ok: boolean; error?: string };

  // Reading Logs
  logReadingSession: (input: LogSessionInput) => ReadingLog | null;
  updateReadingLog: (
    logId: string,
    updates: Partial<Pick<ReadingLog, 'date' | 'pagesRead' | 'pageReached' | 'note'>>,
  ) => void;
  deleteReadingLog: (logId: string) => void;

  // Data, Demo, & Drive Sync
  applyImportPreview: (preview: ImportPreview, mode: 'merge' | 'replace') => void;
  loadSampleHousehold: () => Promise<void>;
  resetAllLocalData: () => void;
  updateDriveConfig: (partial: Partial<DriveConfig>) => void;
  connectGoogleDrive: (promptMode?: '' | 'consent' | 'select_account') => Promise<boolean>;
  syncNow: () => Promise<void>;
  disconnectGoogleDrive: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

function sanitizeOptionalCount(value?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function sanitizeSeriesIndex(value?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 100) / 100;
}

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<BookLibraryDatabase>(() => loadLocalDatabase());
  const [storageEngine, setStorageEngine] = useState<'indexeddb' | 'localstorage'>(() =>
    isIndexedDbAvailable() ? 'indexeddb' : 'localstorage',
  );
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const initialDb = loadLocalDatabase();
    const savedId = loadSavedActiveProfileId();
    if (!savedId) return null;
    const found = initialDb.profiles.find((p) => p.id === savedId && !p.deletedAt);
    return found ? found.id : null;
  });
  const [pendingPinProfileId, setPendingPinProfileId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => loadInitialTheme());
  const [driveConfig, setDriveConfig] = useState<DriveConfig>(() => loadDriveConfig());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'local',
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const [legacyV3Raw, setLegacyV3Raw] = useState<string | null>(() => detectLegacyV3Data());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dbRef = useRef(db);
  dbRef.current = db;
  const activeProfileIdRef = useRef(activeProfileId);
  activeProfileIdRef.current = activeProfileId;
  const driveConfigRef = useRef(driveConfig);
  driveConfigRef.current = driveConfig;
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const syncTimerRef = useRef<number | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = generateId('toast');
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, toast.undoAction ? 6500 : 4000);
    },
    [dismissToast],
  );

  // Hydrate / migrate database from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    if (!isIndexedDbAvailable()) {
      setStorageEngine('localstorage');
      return;
    }
    setStorageEngine('indexeddb');

    void (async () => {
      const idbDb = await loadDatabaseFromIdb();
      if (cancelled) return;

      const current = dbRef.current;
      if (idbDb) {
        const currentEmpty = current.profiles.length === 0 && current.books.length === 0;
        const idbNewer = Date.parse(idbDb.updatedAt) > Date.parse(current.updatedAt);
        if (currentEmpty || idbNewer) {
          setDb(idbDb);
          const currentActiveId = activeProfileIdRef.current;
          const savedId = loadSavedActiveProfileId();
          const candidateId = currentActiveId || savedId;
          if (candidateId && idbDb.profiles.some((p) => p.id === candidateId && !p.deletedAt)) {
            setActiveProfileId(candidateId);
          } else if (currentActiveId) {
            setActiveProfileId(null);
          }
        }
      } else if (current.profiles.length > 0 || current.books.length > 0) {
        await saveDatabaseToIdb(current);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync HTML .dark class + localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Online / Offline listeners
  useEffect(() => {
    const handleOffline = () => setSyncStatus('offline');
    const handleOnline = () => {
      setSyncStatus((prev) => {
        if (prev === 'offline') {
          return accessTokenRef.current ? 'synced' : 'local';
        }
        return prev;
      });
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Register PWA service worker in production
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    }
  }, []);

  const persistSnapshot = useCallback(
    (stamped: BookLibraryDatabase) => {
      void saveDatabaseWithFallback(stamped).then((res) => {
        setStorageEngine(res.engine);
        if (!res.ok) {
          addToast({
            title: 'Local save failed',
            description: res.error,
            tone: 'error',
          });
        }
      });
    },
    [addToast],
  );

  const runSyncWithToken = useCallback(
    async (token: string, silent = false) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncStatus('offline');
        return;
      }
      setSyncStatus('syncing');
      setSyncError(null);
      try {
        const result = await syncWithDrive(dbRef.current, driveConfigRef.current, token);
        setDb(result.mergedDb);
        persistSnapshot(result.mergedDb);
        const updatedConfig: DriveConfig = {
          ...driveConfigRef.current,
          fileId: result.fileId,
          lastSyncedAt: result.syncedAt,
        };
        setDriveConfig(updatedConfig);
        saveDriveConfig(updatedConfig);
        setHasUnsyncedChanges(false);
        setSyncStatus('synced');
        if (!silent) {
          addToast({ title: 'Synced with Google Drive', tone: 'success' });
        }
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          setAccessToken(null);
          setSyncStatus('token_expired');
          setSyncError(err.message);
          if (!silent) {
            addToast({
              title: 'Google Drive token expired',
              description: 'Reconnect in Cloud Sync to upload pending changes.',
              tone: 'error',
            });
          }
        } else {
          const msg = err instanceof Error ? err.message : 'Google Drive sync failed';
          setSyncStatus('error');
          setSyncError(msg);
          if (!silent) {
            addToast({ title: 'Drive Sync Error', description: msg, tone: 'error' });
          }
        }
      }
    },
    [addToast, persistSnapshot],
  );

  const scheduleAutoSync = useCallback(() => {
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }
    if (!accessTokenRef.current) return;
    syncTimerRef.current = window.setTimeout(() => {
      if (accessTokenRef.current) {
        void runSyncWithToken(accessTokenRef.current, true);
      }
    }, 2500);
  }, [runSyncWithToken]);

  const commitDatabase = useCallback(
    (updater: (prev: BookLibraryDatabase) => BookLibraryDatabase) => {
      setDb((prev) => {
        const next = updater(prev);
        const stamped: BookLibraryDatabase = {
          ...next,
          schemaVersion: 4,
          updatedAt: new Date().toISOString(),
        };
        persistSnapshot(stamped);
        return stamped;
      });
      setHasUnsyncedChanges(true);
      scheduleAutoSync();
    },
    [persistSnapshot, scheduleAutoSync],
  );

  const activeProfiles = useMemo(
    () => db.profiles.filter((p) => !p.deletedAt),
    [db.profiles],
  );

  const adminProfiles = useMemo(
    () => getHouseholdAdmins(activeProfiles),
    [activeProfiles],
  );

  const activeProfile = useMemo(
    () => activeProfiles.find((p) => p.id === activeProfileId) || null,
    [activeProfiles, activeProfileId],
  );

  const isActiveProfileAdmin = useMemo(
    () => (activeProfile ? isProfileAdmin(activeProfile, activeProfiles) : false),
    [activeProfile, activeProfiles],
  );

  const pendingPinProfile = useMemo(
    () => activeProfiles.find((p) => p.id === pendingPinProfileId) || null,
    [activeProfiles, pendingPinProfileId],
  );

  // Ensure activeProfileId never points to a deleted/missing profile
  useEffect(() => {
    if (activeProfileId && !activeProfile) {
      setActiveProfileId(null);
      persistActiveProfileSession(null, false);
    }
  }, [activeProfileId, activeProfile]);

  const profileShelves = useMemo(() => {
    if (!activeProfileId) return [];
    return db.shelves
      .filter((s) => s.profileId === activeProfileId && !s.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [db.shelves, activeProfileId]);

  const profileBooks = useMemo(() => {
    if (!activeProfileId) return [];
    return db.books.filter((b) => b.profileId === activeProfileId && !b.deletedAt);
  }, [db.books, activeProfileId]);

  const profileLogs = useMemo(() => {
    if (!activeProfileId) return [];
    return db.readingLogs
      .filter((l) => l.profileId === activeProfileId && !l.deletedAt)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [db.readingLogs, activeProfileId]);

  // --- Profile Auth & Switching ---
  const logoutProfile = useCallback(() => {
    setActiveProfileId(null);
    setPendingPinProfileId(null);
    persistActiveProfileSession(null, false);
  }, []);

  const beginSwitchToProfile = useCallback((targetProfileId: string) => {
    setActiveProfileId(null);
    persistActiveProfileSession(null, false);

    const target = dbRef.current.profiles.find(
      (p) => p.id === targetProfileId && !p.deletedAt,
    );
    if (!target) {
      setPendingPinProfileId(null);
      return;
    }

    if (target.pinHash) {
      setPendingPinProfileId(target.id);
    } else {
      setPendingPinProfileId(null);
      setActiveProfileId(target.id);
      persistActiveProfileSession(target.id, false);
    }
  }, []);

  const verifyPendingPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!pendingPinProfileId) return false;
      const target = dbRef.current.profiles.find(
        (p) => p.id === pendingPinProfileId && !p.deletedAt,
      );
      if (!target) return false;
      if (!target.pinHash) {
        setPendingPinProfileId(null);
        setActiveProfileId(target.id);
        persistActiveProfileSession(target.id, false);
        return true;
      }
      const ok = await verifyPin(target.id, pin, target.pinHash);
      if (ok) {
        setPendingPinProfileId(null);
        setActiveProfileId(target.id);
        persistActiveProfileSession(target.id, true);
        return true;
      }
      return false;
    },
    [pendingPinProfileId],
  );

  const cancelPendingPin = useCallback(() => {
    setPendingPinProfileId(null);
  }, []);

  const createProfile = useCallback(
    async (input: CreateProfileInput, autoLogin = true): Promise<UserProfile> => {
      const now = new Date().toISOString();
      const id = generateId('profile');
      const trimmedPin = input.pin?.trim();
      const pinHash = trimmedPin ? await hashPin(id, trimmedPin) : null;
      const existingActive = dbRef.current.profiles.filter((p) => !p.deletedAt);
      const role: ProfileRole =
        existingActive.length === 0 ? 'admin' : input.role ?? 'member';

      const profile: UserProfile = {
        id,
        name: input.name.trim() || 'Reader',
        avatarEmoji: input.avatarEmoji || '📚',
        avatarTheme: input.avatarTheme || 'amber',
        role,
        pinHash,
        yearlyBookGoal: Math.max(1, Number(input.yearlyBookGoal) || 12),
        monthlyPageGoal: Math.max(50, Number(input.monthlyPageGoal) || 500),
        createdAt: now,
        updatedAt: now,
      };

      const defaultShelf: Shelf = {
        id: generateId('shelf'),
        profileId: id,
        name: 'Personal Library',
        color: input.avatarTheme === 'indigo' ? 'indigo' : 'amber',
        icon: 'book-open',
        visible: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      };

      commitDatabase((prev) => ({
        ...prev,
        profiles: [...prev.profiles, profile],
        shelves: [...prev.shelves, defaultShelf],
      }));

      if (autoLogin) {
        setPendingPinProfileId(null);
        setActiveProfileId(id);
        persistActiveProfileSession(id, Boolean(pinHash));
      }

      addToast({ title: `Welcome, ${profile.name}!`, tone: 'success' });
      return profile;
    },
    [addToast, commitDatabase],
  );

  const updateProfile = useCallback(
    async (profileId: string, input: UpdateProfileInput): Promise<void> => {
      const now = new Date().toISOString();
      const currentActive = dbRef.current.profiles.filter((p) => !p.deletedAt);
      const currentAdmins = getHouseholdAdmins(currentActive);

      if (
        input.role === 'member' &&
        currentAdmins.length <= 1 &&
        currentAdmins.some((a) => a.id === profileId)
      ) {
        addToast({
          title: 'Cannot remove last Admin',
          description: 'At least one Parent / Admin profile is required.',
          tone: 'error',
        });
        return;
      }

      let updatedPinHash: string | null | undefined = undefined;
      if (input.newPin === null) {
        updatedPinHash = null;
      } else if (typeof input.newPin === 'string' && input.newPin.trim().length > 0) {
        updatedPinHash = await hashPin(profileId, input.newPin.trim());
      }

      commitDatabase((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) => {
          if (p.id !== profileId) return p;
          return {
            ...p,
            name: input.name !== undefined ? input.name.trim() || p.name : p.name,
            avatarEmoji: input.avatarEmoji ?? p.avatarEmoji,
            avatarTheme: input.avatarTheme ?? p.avatarTheme,
            role: input.role ?? p.role,
            pinHash: updatedPinHash !== undefined ? updatedPinHash : p.pinHash,
            yearlyBookGoal: input.yearlyBookGoal ?? p.yearlyBookGoal,
            monthlyPageGoal: input.monthlyPageGoal ?? p.monthlyPageGoal,
            badgeRewards:
              input.badgeRewards !== undefined ? input.badgeRewards : p.badgeRewards,
            updatedAt: now,
          };
        }),
      }));

      if (activeProfileId === profileId && updatedPinHash !== undefined) {
        persistActiveProfileSession(profileId, Boolean(updatedPinHash));
      }

      addToast({ title: 'Profile updated', tone: 'success' });
    },
    [activeProfileId, addToast, commitDatabase],
  );

  const deleteProfile = useCallback(
    (profileId: string) => {
      const now = new Date().toISOString();
      commitDatabase((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) =>
          p.id === profileId ? { ...p, deletedAt: now, updatedAt: now } : p,
        ),
        shelves: prev.shelves.map((s) =>
          s.profileId === profileId ? { ...s, deletedAt: now, updatedAt: now } : s,
        ),
        books: prev.books.map((b) =>
          b.profileId === profileId ? { ...b, deletedAt: now, updatedAt: now } : b,
        ),
        readingLogs: prev.readingLogs.map((l) =>
          l.profileId === profileId ? { ...l, deletedAt: now, updatedAt: now } : l,
        ),
      }));
      if (activeProfileId === profileId) {
        logoutProfile();
      }
      addToast({ title: 'Profile removed', tone: 'info' });
    },
    [activeProfileId, addToast, commitDatabase, logoutProfile],
  );

  const adminResetUserPin = useCallback(
    async (
      adminProfileId: string,
      adminPin: string | null,
      targetProfileId: string,
      newPin: string | null,
      unlockOnClear = false,
    ): Promise<{ ok: boolean; error?: string }> => {
      const currentActive = dbRef.current.profiles.filter((p) => !p.deletedAt);
      const admin = currentActive.find((p) => p.id === adminProfileId);
      if (!admin || !isProfileAdmin(admin, currentActive)) {
        return { ok: false, error: 'Selected profile does not have Parent / Admin privileges.' };
      }

      if (admin.pinHash) {
        const valid = await verifyPin(admin.id, adminPin || '', admin.pinHash);
        if (!valid) {
          return { ok: false, error: 'Admin PIN is incorrect.' };
        }
      }

      const target = currentActive.find((p) => p.id === targetProfileId);
      if (!target) {
        return { ok: false, error: 'Target profile not found.' };
      }

      const trimmedNewPin = newPin === null ? null : newPin.trim();
      if (trimmedNewPin !== null && !/^\d{4,6}$/.test(trimmedNewPin)) {
        return { ok: false, error: 'New PIN must be 4 to 6 digits.' };
      }

      const nextHash =
        trimmedNewPin === null ? null : await hashPin(target.id, trimmedNewPin);
      const now = new Date().toISOString();

      commitDatabase((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) =>
          p.id === target.id ? { ...p, pinHash: nextHash, updatedAt: now } : p,
        ),
      }));

      if (trimmedNewPin === null && unlockOnClear) {
        setPendingPinProfileId(null);
        setActiveProfileId(target.id);
        persistActiveProfileSession(target.id, false);
      } else if (activeProfileId === target.id) {
        persistActiveProfileSession(target.id, Boolean(nextHash));
      }

      addToast({
        title:
          trimmedNewPin === null
            ? `Removed PIN for ${target.name}`
            : `Updated PIN for ${target.name}`,
        tone: 'success',
      });

      return { ok: true };
    },
    [activeProfileId, addToast, commitDatabase],
  );

  const setProfileRole = useCallback(
    (targetProfileId: string, role: ProfileRole): { ok: boolean; error?: string } => {
      const currentActive = dbRef.current.profiles.filter((p) => !p.deletedAt);
      const currentAdmins = getHouseholdAdmins(currentActive);

      if (
        role === 'member' &&
        currentAdmins.length <= 1 &&
        currentAdmins.some((a) => a.id === targetProfileId)
      ) {
        const error = 'At least one Parent / Admin profile is required.';
        addToast({ title: 'Cannot demote last Admin', description: error, tone: 'error' });
        return { ok: false, error };
      }

      const now = new Date().toISOString();
      commitDatabase((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) =>
          p.id === targetProfileId ? { ...p, role, updatedAt: now } : p,
        ),
      }));

      addToast({
        title: role === 'admin' ? 'Promoted to Parent / Admin' : 'Changed role to Reader',
        tone: 'success',
      });
      return { ok: true };
    },
    [addToast, commitDatabase],
  );

  // --- Shelves ---
  const addShelf = useCallback(
    (name: string, color = 'amber', icon = 'book-open'): Shelf | null => {
      if (!activeProfileId || !name.trim()) return null;
      const now = new Date().toISOString();
      const maxOrder = dbRef.current.shelves
        .filter((s) => s.profileId === activeProfileId && !s.deletedAt)
        .reduce((max, s) => Math.max(max, s.sortOrder), -1);

      const shelf: Shelf = {
        id: generateId('shelf'),
        profileId: activeProfileId,
        name: name.trim(),
        color,
        icon,
        visible: true,
        sortOrder: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      };
      commitDatabase((prev) => ({ ...prev, shelves: [...prev.shelves, shelf] }));
      addToast({ title: `Created shelf "${shelf.name}"`, tone: 'success' });
      return shelf;
    },
    [activeProfileId, addToast, commitDatabase],
  );

  const updateShelf = useCallback(
    (
      shelfId: string,
      updates: Partial<Pick<Shelf, 'name' | 'color' | 'icon' | 'visible' | 'sortOrder'>>,
    ) => {
      const now = new Date().toISOString();
      commitDatabase((prev) => ({
        ...prev,
        shelves: prev.shelves.map((s) =>
          s.id === shelfId ? { ...s, ...updates, updatedAt: now } : s,
        ),
      }));
    },
    [commitDatabase],
  );

  const deleteShelf = useCallback(
    (shelfId: string) => {
      const now = new Date().toISOString();
      commitDatabase((prev) => ({
        ...prev,
        shelves: prev.shelves.map((s) =>
          s.id === shelfId ? { ...s, deletedAt: now, updatedAt: now } : s,
        ),
        books: prev.books.map((b) =>
          b.shelfIds.includes(shelfId)
            ? { ...b, shelfIds: b.shelfIds.filter((id) => id !== shelfId), updatedAt: now }
            : b,
        ),
      }));
      addToast({ title: 'Shelf deleted', tone: 'info' });
    },
    [addToast, commitDatabase],
  );

  // --- Books & Re-Reads ---
  const addBook = useCallback(
    (input: BookInput): Book | null => {
      if (!activeProfileId) return null;
      const now = new Date().toISOString();
      const book: Book = {
        id: generateId('book'),
        profileId: activeProfileId,
        shelfIds: input.shelfIds,
        title: input.title.trim() || 'Untitled Book',
        author: input.author.trim() || 'Unknown Author',
        isbn: input.isbn?.trim() || undefined,
        publishYear: input.publishYear,
        publisher: input.publisher?.trim() || undefined,
        language: input.language?.trim() || 'English',
        pageCount: Math.max(0, Math.round(input.pageCount || 0)),
        currentPage: Math.max(0, Math.round(input.currentPage || 0)),
        progressUnit: input.progressUnit || 'pages',
        totalChapters: sanitizeOptionalCount(input.totalChapters),
        currentChapter: sanitizeOptionalCount(input.currentChapter),
        totalMinutes: sanitizeOptionalCount(input.totalMinutes),
        currentMinutes: sanitizeOptionalCount(input.currentMinutes),
        coverUrl: sanitizeCoverUrl(input.coverUrl),
        format: input.format || 'physical',
        ownership: input.ownership,
        ownershipNote: input.ownershipNote?.trim() || undefined,
        dueDate: input.dueDate || undefined,
        lentTo: input.lentTo?.trim() || undefined,
        lentDate: input.lentDate || undefined,
        status: input.status,
        rating: Math.min(5, Math.max(0, Math.round((input.rating || 0) * 2) / 2)),
        dateStarted: input.dateStarted || undefined,
        dateFinished: input.dateFinished || undefined,
        readHistory: input.readHistory,
        recommendedBy: input.recommendedBy?.trim() || undefined,
        wantToReadNote: input.wantToReadNote?.trim() || undefined,
        review: input.review?.trim() || undefined,
        synopsis: input.synopsis?.trim() || undefined,
        series: input.series?.trim() || undefined,
        seriesIndex: sanitizeSeriesIndex(input.seriesIndex),
        notes: input.notes || '',
        tags: input.tags.map((t) => t.trim()).filter(Boolean),
        openLibraryKey: input.openLibraryKey,
        addedAt: now,
        updatedAt: now,
      };
      commitDatabase((prev) => ({ ...prev, books: [book, ...prev.books] }));
      addToast({ title: `Added "${book.title}"`, tone: 'success' });
      return book;
    },
    [activeProfileId, addToast, commitDatabase],
  );

  const updateBook = useCallback(
    (bookId: string, updates: Partial<BookInput>) => {
      const now = new Date().toISOString();
      commitDatabase((prev) => ({
        ...prev,
        books: prev.books.map((b) => {
          if (b.id !== bookId) return b;
          return {
            ...b,
            ...updates,
            title: updates.title !== undefined ? updates.title.trim() || b.title : b.title,
            author: updates.author !== undefined ? updates.author.trim() || b.author : b.author,
            language:
              updates.language !== undefined
                ? updates.language.trim() || 'English'
                : b.language,
            coverUrl:
              updates.coverUrl !== undefined ? sanitizeCoverUrl(updates.coverUrl) : b.coverUrl,
            format: updates.format !== undefined ? updates.format : b.format,
            ownership: 'ownership' in updates ? updates.ownership : b.ownership,
            ownershipNote:
              'ownershipNote' in updates
                ? updates.ownershipNote?.trim() || undefined
                : b.ownershipNote,
            dueDate: 'dueDate' in updates ? updates.dueDate || undefined : b.dueDate,
            lentTo: 'lentTo' in updates ? updates.lentTo?.trim() || undefined : b.lentTo,
            lentDate: 'lentDate' in updates ? updates.lentDate || undefined : b.lentDate,
            readHistory: 'readHistory' in updates ? updates.readHistory : b.readHistory,
            recommendedBy:
              'recommendedBy' in updates
                ? updates.recommendedBy?.trim() || undefined
                : b.recommendedBy,
            wantToReadNote:
              'wantToReadNote' in updates
                ? updates.wantToReadNote?.trim() || undefined
                : b.wantToReadNote,
            review: 'review' in updates ? updates.review?.trim() || undefined : b.review,
            synopsis:
              'synopsis' in updates ? updates.synopsis?.trim() || undefined : b.synopsis,
            series: 'series' in updates ? updates.series?.trim() || undefined : b.series,
            seriesIndex:
              'seriesIndex' in updates ? sanitizeSeriesIndex(updates.seriesIndex) : b.seriesIndex,
            progressUnit:
              updates.progressUnit !== undefined ? updates.progressUnit : b.progressUnit,
            totalChapters:
              'totalChapters' in updates
                ? sanitizeOptionalCount(updates.totalChapters)
                : b.totalChapters,
            currentChapter:
              'currentChapter' in updates
                ? sanitizeOptionalCount(updates.currentChapter)
                : b.currentChapter,
            totalMinutes:
              'totalMinutes' in updates
                ? sanitizeOptionalCount(updates.totalMinutes)
                : b.totalMinutes,
            currentMinutes:
              'currentMinutes' in updates
                ? sanitizeOptionalCount(updates.currentMinutes)
                : b.currentMinutes,
            rating:
              updates.rating !== undefined
                ? Math.min(5, Math.max(0, Math.round(updates.rating * 2) / 2))
                : b.rating,
            tags:
              updates.tags !== undefined
                ? updates.tags.map((t) => t.trim()).filter(Boolean)
                : b.tags,
            updatedAt: now,
          };
        }),
      }));
    },
    [commitDatabase],
  );

  const startReread = useCallback(
    (bookId: string, startDate?: string) => {
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      const targetBook = dbRef.current.books.find((b) => b.id === bookId && !b.deletedAt);
      if (!targetBook) return;

      const history = Array.isArray(targetBook.readHistory)
        ? [...targetBook.readHistory]
        : [];
      const alreadyRecorded = history.some(
        (span) =>
          span.finishedAt === targetBook.dateFinished &&
          span.startedAt === targetBook.dateStarted,
      );

      if (
        !alreadyRecorded &&
        (targetBook.status === 'finished' || targetBook.dateFinished || targetBook.dateStarted)
      ) {
        history.push({
          id: generateId('read'),
          startedAt: targetBook.dateStarted,
          finishedAt:
            targetBook.dateFinished || (targetBook.status === 'finished' ? today : undefined),
          rating: targetBook.rating > 0 ? targetBook.rating : undefined,
          notes: targetBook.review?.trim() || undefined,
          format: targetBook.format,
        });
      }

      const nextReadNumber = history.length + 1;
      commitDatabase((prev) => ({
        ...prev,
        books: prev.books.map((b) =>
          b.id === bookId
            ? {
                ...b,
                status: 'reading',
                dateStarted: startDate || today,
                dateFinished: undefined,
                currentPage: 0,
                currentChapter:
                  b.totalChapters !== undefined || b.progressUnit === 'chapters' ? 0 : undefined,
                currentMinutes:
                  b.totalMinutes !== undefined || b.progressUnit === 'duration' ? 0 : undefined,
                readHistory: history,
                updatedAt: now,
              }
            : b,
        ),
      }));

      addToast({
        title: `Started re-read #${nextReadNumber} of "${targetBook.title}"`,
        tone: 'success',
      });
    },
    [addToast, commitDatabase],
  );

  const addReadHistorySpan = useCallback(
    (bookId: string, span: Omit<ReadSessionSpan, 'id'>) => {
      const now = new Date().toISOString();
      const entry: ReadSessionSpan = {
        ...span,
        id: generateId('read'),
        notes: span.notes?.trim() || undefined,
      };
      commitDatabase((prev) => ({
        ...prev,
        books: prev.books.map((b) =>
          b.id === bookId
            ? {
                ...b,
                readHistory: [...(b.readHistory || []), entry],
                updatedAt: now,
              }
            : b,
        ),
      }));
      addToast({ title: 'Added past read entry', tone: 'success' });
    },
    [addToast, commitDatabase],
  );

  const deleteReadHistorySpan = useCallback(
    (bookId: string, spanId: string) => {
      const now = new Date().toISOString();
      commitDatabase((prev) => ({
        ...prev,
        books: prev.books.map((b) => {
          if (b.id !== bookId) return b;
          const remaining = (b.readHistory || []).filter((s) => s.id !== spanId);
          return {
            ...b,
            readHistory: remaining.length > 0 ? remaining : undefined,
            updatedAt: now,
          };
        }),
      }));
      addToast({ title: 'Removed past read entry', tone: 'info' });
    },
    [addToast, commitDatabase],
  );

  const deleteBook = useCallback(
    (bookId: string) => {
      const now = new Date().toISOString();
      const target = dbRef.current.books.find((b) => b.id === bookId);
      commitDatabase((prev) => ({
        ...prev,
        books: prev.books.map((b) =>
          b.id === bookId ? { ...b, deletedAt: now, updatedAt: now } : b,
        ),
      }));
      addToast({
        title: `Removed "${target?.title || 'Book'}"`,
        tone: 'info',
        undoAction: () => {
          const restoreNow = new Date().toISOString();
          commitDatabase((prev) => ({
            ...prev,
            books: prev.books.map((b) =>
              b.id === bookId ? { ...b, deletedAt: null, updatedAt: restoreNow } : b,
            ),
          }));
        },
      });
    },
    [addToast, commitDatabase],
  );

  const recommendBookToProfile = useCallback(
    (bookId: string, targetProfileId: string, note: string): { ok: boolean; error?: string } => {
      const currentDb = dbRef.current;
      const sourceBook = currentDb.books.find((b) => b.id === bookId && !b.deletedAt);
      const targetProfile = currentDb.profiles.find(
        (p) => p.id === targetProfileId && !p.deletedAt,
      );
      const sender = currentDb.profiles.find((p) => p.id === activeProfileId && !p.deletedAt);

      if (!sourceBook || !targetProfile) {
        return { ok: false, error: 'Book or recipient profile not found.' };
      }

      const dupCheck = findBookDuplicates(
        { title: sourceBook.title, author: sourceBook.author, isbn: sourceBook.isbn },
        currentDb.books,
        currentDb.profiles,
        targetProfileId,
      );

      if (dupCheck.ownMatches.length > 0) {
        const msg = `${targetProfile.name} already has "${sourceBook.title}" on their shelf.`;
        addToast({ title: msg, tone: 'info' });
        return { ok: false, error: msg };
      }

      const targetShelves = currentDb.shelves
        .filter((s) => s.profileId === targetProfileId && !s.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const now = new Date().toISOString();
      const cleanTags = Array.from(
        new Set([
          ...sourceBook.tags.filter((t) => t.toLowerCase() !== 'wishlist'),
          'wishlist',
        ]),
      );

      const recommendedBook: Book = {
        id: generateId('book'),
        profileId: targetProfileId,
        shelfIds: targetShelves[0] ? [targetShelves[0].id] : [],
        title: sourceBook.title,
        author: sourceBook.author,
        isbn: sourceBook.isbn,
        publishYear: sourceBook.publishYear,
        publisher: sourceBook.publisher,
        language: sourceBook.language || 'English',
        pageCount: sourceBook.pageCount,
        currentPage: 0,
        progressUnit: sourceBook.progressUnit || 'pages',
        totalChapters: sourceBook.totalChapters,
        totalMinutes: sourceBook.totalMinutes,
        coverUrl: sourceBook.coverUrl,
        format: sourceBook.format || 'physical',
        status: 'want-to-read',
        rating: 0,
        recommendedBy: sender?.name || 'Household Member',
        wantToReadNote: note.trim() || undefined,
        synopsis: sourceBook.synopsis,
        series: sourceBook.series,
        seriesIndex: sourceBook.seriesIndex,
        notes: '',
        tags: cleanTags,
        openLibraryKey: sourceBook.openLibraryKey,
        addedAt: now,
        updatedAt: now,
      };

      commitDatabase((prev) => ({
        ...prev,
        books: [recommendedBook, ...prev.books],
      }));

      addToast({
        title: `Recommended to ${targetProfile.name}`,
        description: `Added "${sourceBook.title}" to ${targetProfile.name}'s Want to Read wishlist.`,
        tone: 'success',
      });

      return { ok: true };
    },
    [activeProfileId, addToast, commitDatabase],
  );

  // --- Reading Logs ---
  const logReadingSession = useCallback(
    (input: LogSessionInput): ReadingLog | null => {
      if (!activeProfileId) return null;
      const now = new Date().toISOString();
      const book = dbRef.current.books.find((b) => b.id === input.bookId && !b.deletedAt);
      if (!book) return null;

      const unit: ProgressUnit = input.unit || book.progressUnit || 'pages';
      const shouldFinish = Boolean(input.markFinished);

      let pagesRead = Math.max(0, Math.round(input.pagesRead || 0));
      let nextCurrentPage =
        input.pageReached !== undefined
          ? Math.max(0, Math.round(input.pageReached))
          : Math.max(0, book.currentPage + pagesRead);

      let chaptersRead: number | undefined;
      let nextChapter: number | undefined;
      let minutesListened: number | undefined;
      let nextMinute: number | undefined;

      if (unit === 'duration') {
        minutesListened = Math.max(0, Math.round(input.minutesListened ?? 0));
        nextMinute =
          input.minuteReached !== undefined
            ? Math.max(0, Math.round(input.minuteReached))
            : Math.max(0, (book.currentMinutes ?? 0) + minutesListened);

        if (book.pageCount > 0 && (book.totalMinutes ?? 0) > 0) {
          const estPage = Math.min(
            book.pageCount,
            Math.round((nextMinute / (book.totalMinutes ?? 1)) * book.pageCount),
          );
          pagesRead = Math.max(0, estPage - book.currentPage);
          nextCurrentPage = Math.max(book.currentPage, estPage);
        }
      } else if (unit === 'chapters') {
        chaptersRead = Math.max(0, Math.round(input.chaptersRead ?? 0));
        nextChapter =
          input.chapterReached !== undefined
            ? Math.max(0, Math.round(input.chapterReached))
            : Math.max(0, (book.currentChapter ?? 0) + chaptersRead);

        if (book.pageCount > 0 && (book.totalChapters ?? 0) > 0) {
          const estPage = Math.min(
            book.pageCount,
            Math.round((nextChapter / (book.totalChapters ?? 1)) * book.pageCount),
          );
          pagesRead = Math.max(0, estPage - book.currentPage);
          nextCurrentPage = Math.max(book.currentPage, estPage);
        }
      }

      const activeCycle = (book.readHistory?.length ?? 0) + 1;

      const log: ReadingLog = {
        id: generateId('log'),
        profileId: activeProfileId,
        bookId: input.bookId,
        date: input.date,
        pagesRead,
        pageReached: unit === 'pages' ? nextCurrentPage : undefined,
        unit,
        chaptersRead,
        chapterReached: nextChapter,
        minutesListened,
        minuteReached: nextMinute,
        readCycle: activeCycle,
        note: input.note?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };

      commitDatabase((prev) => ({
        ...prev,
        readingLogs: [log, ...prev.readingLogs],
        books: prev.books.map((b) => {
          if (b.id !== book.id) return b;
          const nextStatus: ReadingStatus = shouldFinish
            ? 'finished'
            : b.status === 'want-to-read'
              ? 'reading'
              : b.status;
          const resolvedPage =
            shouldFinish && b.pageCount > 0
              ? Math.max(nextCurrentPage, b.pageCount)
              : nextCurrentPage;
          const resolvedMinutes =
            unit === 'duration'
              ? shouldFinish && (b.totalMinutes ?? 0) > 0
                ? Math.max(nextMinute ?? 0, b.totalMinutes ?? 0)
                : nextMinute
              : b.currentMinutes;
          const resolvedChapters =
            unit === 'chapters'
              ? shouldFinish && (b.totalChapters ?? 0) > 0
                ? Math.max(nextChapter ?? 0, b.totalChapters ?? 0)
                : nextChapter
              : b.currentChapter;

          const resolvedRating =
            shouldFinish && input.finalRating !== undefined && input.finalRating > 0
              ? Math.min(5, Math.max(0, Math.round(input.finalRating * 2) / 2))
              : b.rating;
          const resolvedReview =
            shouldFinish && input.finalReview?.trim()
              ? input.finalReview.trim()
              : b.review;

          return {
            ...b,
            status: nextStatus,
            progressUnit: b.progressUnit || unit,
            currentPage: resolvedPage,
            currentMinutes: resolvedMinutes,
            currentChapter: resolvedChapters,
            rating: resolvedRating,
            review: resolvedReview,
            dateStarted: b.dateStarted || input.date,
            dateFinished: shouldFinish ? b.dateFinished || input.date : b.dateFinished,
            updatedAt: now,
          };
        }),
      }));

      const toastTitle =
        unit === 'duration'
          ? `Logged +${formatMinutesHuman(minutesListened ?? 0)}`
          : unit === 'chapters'
            ? `Logged +${chaptersRead ?? 0} ch`
            : `Logged +${pagesRead} pages`;

      addToast({
        title: toastTitle,
        description: book.title,
        tone: 'success',
      });
      return log;
    },
    [activeProfileId, addToast, commitDatabase],
  );

  const updateReadingLog = useCallback(
    (
      logId: string,
      updates: Partial<Pick<ReadingLog, 'date' | 'pagesRead' | 'pageReached' | 'note'>>,
    ) => {
      const now = new Date().toISOString();
      commitDatabase((prev) => ({
        ...prev,
        readingLogs: prev.readingLogs.map((l) =>
          l.id === logId ? { ...l, ...updates, updatedAt: now } : l,
        ),
      }));
    },
    [commitDatabase],
  );

  const deleteReadingLog = useCallback(
    (logId: string) => {
      const now = new Date().toISOString();
      commitDatabase((prev) => ({
        ...prev,
        readingLogs: prev.readingLogs.map((l) =>
          l.id === logId ? { ...l, deletedAt: now, updatedAt: now } : l,
        ),
      }));
      addToast({
        title: 'Reading log deleted',
        tone: 'info',
        undoAction: () => {
          const restoreNow = new Date().toISOString();
          commitDatabase((prev) => ({
            ...prev,
            readingLogs: prev.readingLogs.map((l) =>
              l.id === logId ? { ...l, deletedAt: null, updatedAt: restoreNow } : l,
            ),
          }));
        },
      });
    },
    [addToast, commitDatabase],
  );

  // --- Import / Demo / Reset ---
  const applyImportPreview = useCallback(
    (preview: ImportPreview, mode: 'merge' | 'replace') => {
      commitDatabase((prev) => applyImport(prev, activeProfileId, preview, mode));
      if (!activeProfileId && preview.format === 'v4-household-json') {
        const importedActive = preview.householdDb?.profiles.find((p) => !p.deletedAt);
        if (importedActive && !importedActive.pinHash) {
          setActiveProfileId(importedActive.id);
          persistActiveProfileSession(importedActive.id, false);
        }
      }
      addToast({
        title: `Imported ${preview.summaryCounts.books} book(s)`,
        description: `Format: ${preview.formatLabel}`,
        tone: 'success',
      });
    },
    [activeProfileId, addToast, commitDatabase],
  );

  const loadSampleHousehold = useCallback(async () => {
    const demo = await createDemoHousehold();
    await saveDatabaseWithFallback(demo);
    setDb(demo);
    setActiveProfileId(null);
    setPendingPinProfileId(null);
    persistActiveProfileSession(null, false);
    setHasUnsyncedChanges(true);
    scheduleAutoSync();
    addToast({
      title: 'Sample household loaded',
      description: 'Alex (Admin) and Maya (Reader, PIN: 1234) are ready.',
      tone: 'success',
    });
  }, [addToast, scheduleAutoSync]);

  const resetAllLocalData = useCallback(() => {
    clearLocalDatabase();
    const empty: BookLibraryDatabase = {
      schemaVersion: 4,
      dbId: generateId('db'),
      updatedAt: new Date().toISOString(),
      profiles: [],
      shelves: [],
      books: [],
      readingLogs: [],
    };
    setDb(empty);
    setActiveProfileId(null);
    setPendingPinProfileId(null);
    setHasUnsyncedChanges(false);
    addToast({ title: 'All local data cleared', tone: 'info' });
  }, [addToast]);

  const dismissLegacyV3Banner = useCallback(() => {
    setLegacyV3Raw(null);
  }, []);

  // --- Google Drive Sync ---
  const updateDriveConfig = useCallback((partial: Partial<DriveConfig>) => {
    setDriveConfig((prev) => {
      const next = { ...prev, ...partial };
      saveDriveConfig(next);
      return next;
    });
  }, []);

  const connectGoogleDrive = useCallback(
    async (promptMode: '' | 'consent' | 'select_account' = ''): Promise<boolean> => {
      const clientId = driveConfigRef.current.clientId.trim();
      if (!clientId) {
        addToast({
          title: 'Google OAuth Client ID required',
          description: 'Paste your Web Client ID in Cloud Sync settings.',
          tone: 'error',
        });
        return false;
      }

      setSyncStatus('connecting');
      setSyncError(null);
      try {
        const { accessToken: token } = await requestDriveAccessToken(clientId, promptMode);
        setAccessToken(token);
        accessTokenRef.current = token;

        const email = await fetchUserEmail(token);
        if (email) {
          updateDriveConfig({ userEmail: email });
        }

        await runSyncWithToken(token, false);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
        setSyncStatus('error');
        setSyncError(msg);
        addToast({ title: 'Google Drive Connection Failed', description: msg, tone: 'error' });
        return false;
      }
    },
    [addToast, runSyncWithToken, updateDriveConfig],
  );

  const syncNow = useCallback(async () => {
    if (accessTokenRef.current) {
      await runSyncWithToken(accessTokenRef.current, false);
    } else {
      await connectGoogleDrive('');
    }
  }, [connectGoogleDrive, runSyncWithToken]);

  const disconnectGoogleDrive = useCallback(() => {
    setAccessToken(null);
    accessTokenRef.current = null;
    updateDriveConfig({ fileId: null, userEmail: null, lastSyncedAt: null });
    setSyncStatus('local');
    setSyncError(null);
    setHasUnsyncedChanges(false);
    addToast({ title: 'Disconnected from Google Drive', tone: 'info' });
  }, [addToast, updateDriveConfig]);

  const value: LibraryContextValue = {
    db,
    storageEngine,
    activeProfiles,
    adminProfiles,
    activeProfile,
    activeProfileId,
    isActiveProfileAdmin,
    pendingPinProfile,
    profileShelves,
    profileBooks,
    profileLogs,
    theme,
    toggleTheme,
    syncStatus,
    syncError,
    driveConfig,
    isDriveConnected: Boolean(accessToken),
    hasUnsyncedChanges,
    legacyV3Raw,
    dismissLegacyV3Banner,
    toasts,
    dismissToast,
    addToast,
    beginSwitchToProfile,
    verifyPendingPin,
    cancelPendingPin,
    logoutProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    adminResetUserPin,
    setProfileRole,
    addShelf,
    updateShelf,
    deleteShelf,
    addBook,
    updateBook,
    deleteBook,
    startReread,
    addReadHistorySpan,
    deleteReadHistorySpan,
    recommendBookToProfile,
    logReadingSession,
    updateReadingLog,
    deleteReadingLog,
    applyImportPreview,
    loadSampleHousehold,
    resetAllLocalData,
    updateDriveConfig,
    connectGoogleDrive,
    syncNow,
    disconnectGoogleDrive,
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
};

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return ctx;
}
