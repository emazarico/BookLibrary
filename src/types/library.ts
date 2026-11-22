export type ReadingStatus = 'want-to-read' | 'reading' | 'finished' | 'dnf';

export type ProfileRole = 'admin' | 'member';

export type BookFormat = 'physical' | 'ebook' | 'audiobook';

export type BookOwnership = 'owned' | 'library' | 'borrowed' | 'other';

export type ProgressUnit = 'pages' | 'chapters' | 'duration';

export type SearchLanguage = 'eng' | 'fre' | 'spa' | 'ger' | 'any';

export type AvatarTheme =
  | 'amber'
  | 'indigo'
  | 'emerald'
  | 'rose'
  | 'violet'
  | 'teal'
  | 'coral'
  | 'slate';

export interface BookEditionOption {
  key: string;
  title: string;
  language?: string;
  publisher?: string;
  publishYear?: number;
  isbn?: string;
  pageCount?: number;
  format?: BookFormat;
  coverUrl?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatarEmoji: string;
  avatarTheme: AvatarTheme;
  role?: ProfileRole;
  pinHash: string | null;
  yearlyBookGoal: number;
  monthlyPageGoal: number;
  badgeRewards?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Shelf {
  id: string;
  profileId: string;
  name: string;
  color: string;
  icon: string;
  visible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Book {
  id: string;
  profileId: string;
  shelfIds: string[];
  title: string;
  author: string;
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
  /** 0 to 5 in 0.5 increments; 0 means unrated */
  rating: number;
  dateStarted?: string;
  dateFinished?: string;
  recommendedBy?: string;
  wantToReadNote?: string;
  review?: string;
  synopsis?: string;
  series?: string;
  seriesIndex?: number;
  notes: string;
  tags: string[];
  openLibraryKey?: string;
  addedAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ReadingLog {
  id: string;
  profileId: string;
  bookId: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  pagesRead: number;
  pageReached?: number;
  unit?: ProgressUnit;
  chaptersRead?: number;
  chapterReached?: number;
  minutesListened?: number;
  minuteReached?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface BookLibraryDatabase {
  schemaVersion: 4;
  dbId: string;
  updatedAt: string;
  profiles: UserProfile[];
  shelves: Shelf[];
  books: Book[];
  readingLogs: ReadingLog[];
}

export type SyncStatus =
  | 'local'
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'token_expired'
  | 'offline'
  | 'error';

export interface DriveConfig {
  clientId: string;
  fileId: string | null;
  fileName: string;
  userEmail: string | null;
  lastSyncedAt: string | null;
}

export interface OpenLibrarySearchResult {
  key: string;
  title: string;
  author: string;
  authors: string[];
  publishYear?: number;
  coverUrl?: string;
  alternateCoverUrls?: string[];
  isbn?: string;
  pageCount?: number;
  publisher?: string;
  language?: string;
  synopsis?: string;
  source?: 'openlibrary' | 'googlebooks' | 'merged';
  editions?: BookEditionOption[];
  subjects: string[];
}

export type AppTab = 'library' | 'search' | 'timeline' | 'management';
export type ThemeMode = 'light' | 'dark';
