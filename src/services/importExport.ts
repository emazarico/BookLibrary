import type {
  Book,
  BookFormat,
  BookLibraryDatabase,
  ReadingLog,
  ReadingStatus,
  Shelf,
  UserProfile,
} from '../types/library';
import { buildOpenLibraryCoverByIsbn, sanitizeCoverUrl } from '../utils/cover';
import { generateId } from '../utils/crypto';
import { cleanGoodreadsIsbn, parseCsv, serializeCsv } from '../utils/csv';
import { mergeDatabases } from '../utils/merge';

export type ImportFormat =
  | 'v4-household-json'
  | 'v4-profile-json'
  | 'v3-legacy-json'
  | 'goodreads-csv'
  | 'storygraph-csv'
  | 'unknown';

export interface ProfileImportBundle {
  profile?: UserProfile;
  shelves: Shelf[];
  books: Book[];
  readingLogs: ReadingLog[];
}

export interface ImportPreview {
  format: ImportFormat;
  formatLabel: string;
  filename: string;
  summaryCounts: {
    profiles: number;
    shelves: number;
    books: number;
    readingLogs: number;
  };
  duplicateCount: number;
  warnings: string[];
  householdDb?: BookLibraryDatabase;
  profileBundle?: ProfileImportBundle;
}

export interface ProfileExportEnvelope {
  kind: 'booklibrary-profile-v4';
  schemaVersion: 4;
  exportedAt: string;
  profile: UserProfile;
  shelves: Shelf[];
  books: Book[];
  readingLogs: ReadingLog[];
}

function todaySlug(): string {
  return new Date().toISOString().split('T')[0];
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toGoodreadsDate(isoDate?: string): string {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return '';
  return `${match[1]}/${match[2]}/${match[3]}`;
}

function fromFlexibleDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const slashMatch = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(trimmed);
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`;
  }
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }
  return undefined;
}

function clampRating(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const clamped = Math.min(5, Math.max(0, num));
  return Math.round(clamped * 2) / 2;
}

function normalizeBookKey(title: string, author: string): string {
  return `${title.trim().toLowerCase()}::${author.trim().toLowerCase()}`;
}

function parseBookFormat(raw?: string): BookFormat {
  if (!raw) return 'physical';
  const lower = raw.toLowerCase();
  if (/audio|audible|cd\b/.test(lower)) return 'audiobook';
  if (/kindle|ebook|e-book|nook|epub|digital/.test(lower)) return 'ebook';
  return 'physical';
}

function formatToBinding(format?: BookFormat): string {
  if (format === 'audiobook') return 'Audiobook';
  if (format === 'ebook') return 'Kindle Edition';
  return 'Paperback';
}

function findDuplicateCount(candidateBooks: Book[], existingBooks: Book[]): number {
  const existingIsbns = new Set(
    existingBooks
      .filter((b) => !b.deletedAt && b.isbn)
      .map((b) => cleanGoodreadsIsbn(b.isbn))
      .filter(Boolean),
  );
  const existingKeys = new Set(
    existingBooks.filter((b) => !b.deletedAt).map((b) => normalizeBookKey(b.title, b.author)),
  );

  let dupes = 0;
  for (const book of candidateBooks) {
    if (book.deletedAt) continue;
    const cleanIsbn = cleanGoodreadsIsbn(book.isbn);
    if (cleanIsbn && existingIsbns.has(cleanIsbn)) {
      dupes++;
      continue;
    }
    if (existingKeys.has(normalizeBookKey(book.title, book.author))) {
      dupes++;
    }
  }
  return dupes;
}

export function buildGoodreadsCsvString(books: Book[], shelves: Shelf[]): string {
  const shelfMap = new Map(shelves.filter((s) => !s.deletedAt).map((s) => [s.id, s.name]));
  const headers = [
    'Book Id',
    'Title',
    'Author',
    'Author l-f',
    'Additional Authors',
    'ISBN',
    'ISBN13',
    'My Rating',
    'Average Rating',
    'Publisher',
    'Binding',
    'Number of Pages',
    'Year Published',
    'Original Publication Year',
    'Date Read',
    'Date Added',
    'Bookshelves',
    'Bookshelves with positions',
    'Exclusive Shelf',
    'My Review',
    'Spoiler',
    'Private Notes',
    'Read Count',
    'Owned Copies',
  ];

  const rows = books
    .filter((b) => !b.deletedAt)
    .map((b, index) => {
      const cleanIsbn = cleanGoodreadsIsbn(b.isbn);
      const isbn10 = cleanIsbn.length === 10 ? cleanIsbn : '';
      const isbn13 = cleanIsbn.length === 13 ? cleanIsbn : '';
      const exclusiveShelf =
        b.status === 'finished'
          ? 'read'
          : b.status === 'reading'
            ? 'currently-reading'
            : b.status === 'dnf'
              ? 'did-not-finish'
              : 'to-read';

      const customShelves = b.shelfIds
        .map((id) => shelfMap.get(id))
        .filter((n): n is string => Boolean(n));
      const tagShelves = b.tags || [];
      const allShelves = Array.from(new Set([...customShelves, ...tagShelves])).join(', ');

      return [
        String(index + 1),
        b.title,
        b.author,
        b.author,
        '',
        isbn10,
        isbn13,
        b.rating > 0 ? String(b.rating) : '0',
        '',
        b.publisher || '',
        formatToBinding(b.format),
        b.pageCount > 0 ? String(b.pageCount) : '',
        b.publishYear ? String(b.publishYear) : '',
        b.publishYear ? String(b.publishYear) : '',
        toGoodreadsDate(b.dateFinished),
        toGoodreadsDate(b.addedAt),
        allShelves,
        '',
        exclusiveShelf,
        b.notes || '',
        '',
        '',
        b.status === 'finished' ? '1' : '0',
        '1',
      ];
    });

  return serializeCsv(headers, rows);
}

export function buildReadingLogsCsvString(logs: ReadingLog[], books: Book[]): string {
  const bookMap = new Map(books.map((b) => [b.id, b]));
  const headers = [
    'Date',
    'Book Title',
    'Author',
    'ISBN',
    'Unit',
    'Pages Read',
    'Page Reached',
    'Chapters Read',
    'Minutes Listened',
    'Session Note',
  ];

  const sorted = [...logs]
    .filter((l) => !l.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date));

  const rows = sorted.map((l) => {
    const book = bookMap.get(l.bookId);
    const unit =
      l.unit ||
      (l.minutesListened !== undefined
        ? 'duration'
        : l.chaptersRead !== undefined
          ? 'chapters'
          : 'pages');
    return [
      l.date,
      book?.title || 'Unknown Book',
      book?.author || '',
      book?.isbn || '',
      unit,
      String(l.pagesRead),
      l.pageReached !== undefined ? String(l.pageReached) : '',
      l.chaptersRead !== undefined ? String(l.chaptersRead) : '',
      l.minutesListened !== undefined ? String(l.minutesListened) : '',
      l.note || '',
    ];
  });

  return serializeCsv(headers, rows);
}

export function exportHouseholdJson(db: BookLibraryDatabase): void {
  triggerDownload(
    `booklibrary-household-${todaySlug()}.json`,
    JSON.stringify(db, null, 2),
    'application/json',
  );
}

export function exportProfileJson(db: BookLibraryDatabase, profileId: string): void {
  const profile = db.profiles.find((p) => p.id === profileId && !p.deletedAt);
  if (!profile) return;

  const bundle: ProfileExportEnvelope = {
    kind: 'booklibrary-profile-v4',
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    profile,
    shelves: db.shelves.filter((s) => s.profileId === profileId && !s.deletedAt),
    books: db.books.filter((b) => b.profileId === profileId && !b.deletedAt),
    readingLogs: db.readingLogs.filter((l) => l.profileId === profileId && !l.deletedAt),
  };

  const slug =
    profile.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'reader';
  triggerDownload(
    `booklibrary-profile-${slug}-${todaySlug()}.json`,
    JSON.stringify(bundle, null, 2),
    'application/json',
  );
}

export function exportGoodreadsCsv(books: Book[], shelves: Shelf[], profileName = 'library'): void {
  const csv = buildGoodreadsCsvString(books, shelves);
  const slug = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'library';
  triggerDownload(`goodreads-export-${slug}-${todaySlug()}.csv`, csv, 'text/csv;charset=utf-8');
}

export function exportReadingLogsCsv(
  logs: ReadingLog[],
  books: Book[],
  profileName = 'reading-log',
): void {
  const csv = buildReadingLogsCsvString(logs, books);
  const slug = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'reading-log';
  triggerDownload(`reading-log-${slug}-${todaySlug()}.csv`, csv, 'text/csv;charset=utf-8');
}

interface LegacyV3Item {
  id?: string;
  title?: string;
  author?: string;
  cover?: string;
  type?: string;
  rating?: number;
  dateRead?: string;
  notes?: string;
  tags?: string[];
  addedAt?: string;
}

interface LegacyV3Library {
  id?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  items?: LegacyV3Item[];
}

function parseV3LegacyJson(
  parsed: { libraries: LegacyV3Library[] },
  filename: string,
  existingProfileBooks: Book[],
  targetProfileId: string,
): ImportPreview {
  const now = new Date().toISOString();
  const warnings: string[] = [];
  const shelves: Shelf[] = [];
  const books: Book[] = [];
  let skippedMovieLibraries = 0;
  let convertedMovieItems = 0;

  parsed.libraries.forEach((lib, idx) => {
    const items = Array.isArray(lib.items) ? lib.items : [];
    const isMovieLib = lib.type === 'movie';
    if (isMovieLib && items.length === 0) {
      skippedMovieLibraries++;
      return;
    }

    const shelfId = generateId('shelf');
    shelves.push({
      id: shelfId,
      profileId: targetProfileId,
      name: lib.name?.trim() || `Imported Shelf ${idx + 1}`,
      color: isMovieLib ? 'rose' : 'amber',
      icon: 'book-open',
      visible: lib.visible !== false,
      sortOrder: idx,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of items) {
      if (item.type === 'movie' || (isMovieLib && item.type !== 'book')) {
        convertedMovieItems++;
      }
      const cleanedDate = fromFlexibleDate(item.dateRead);
      const status: ReadingStatus = cleanedDate ? 'finished' : 'want-to-read';
      const coverUrl = sanitizeCoverUrl(item.cover);
      const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
      const format: BookFormat = tags.some((t) => /audio/i.test(t)) ? 'audiobook' : 'physical';

      books.push({
        id: generateId('book'),
        profileId: targetProfileId,
        shelfIds: [shelfId],
        title: item.title?.trim() || 'Untitled',
        author: item.author?.trim() || 'Unknown Author',
        pageCount: 0,
        currentPage: 0,
        coverUrl,
        format,
        status,
        rating: clampRating(item.rating),
        dateFinished: cleanedDate,
        notes: item.notes?.trim() || '',
        tags,
        addedAt: item.addedAt || now,
        updatedAt: now,
      });
    }
  });

  if (skippedMovieLibraries > 0) {
    warnings.push(`Skipped ${skippedMovieLibraries} empty v3 movie watchlist(s).`);
  }
  if (convertedMovieItems > 0) {
    warnings.push(
      `Imported ${convertedMovieItems} non-book item(s) from a v3 movie shelf into your library.`,
    );
  }

  return {
    format: 'v3-legacy-json',
    formatLabel: 'Legacy v3 Library Backup (JSON)',
    filename,
    summaryCounts: {
      profiles: 0,
      shelves: shelves.length,
      books: books.length,
      readingLogs: 0,
    },
    duplicateCount: findDuplicateCount(books, existingProfileBooks),
    warnings,
    profileBundle: {
      shelves,
      books,
      readingLogs: [],
    },
  };
}

function parseGoodreadsOrStoryGraphCsv(
  rawText: string,
  filename: string,
  existingProfileBooks: Book[],
  targetProfileId: string,
): ImportPreview {
  const rows = parseCsv(rawText);
  if (rows.length < 2) {
    return {
      format: 'unknown',
      formatLabel: 'Empty or invalid CSV',
      filename,
      summaryCounts: { profiles: 0, shelves: 0, books: 0, readingLogs: 0 },
      duplicateCount: 0,
      warnings: ['CSV file has no data rows.'],
    };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = new Map<string, number>();
  headers.forEach((h, i) => colIndex.set(h, i));

  const getCell = (row: string[], ...candidates: string[]): string => {
    for (const key of candidates) {
      const idx = colIndex.get(key.toLowerCase());
      if (idx !== undefined && row[idx] !== undefined) {
        return row[idx].trim();
      }
    }
    return '';
  };

  const isStoryGraph =
    colIndex.has('read status') || colIndex.has('star rating') || colIndex.has('isbn/uid');
  const isGoodreads =
    colIndex.has('exclusive shelf') || colIndex.has('my rating') || colIndex.has('book id');

  if (!isStoryGraph && !isGoodreads && !colIndex.has('title')) {
    return {
      format: 'unknown',
      formatLabel: 'Unrecognized CSV format',
      filename,
      summaryCounts: { profiles: 0, shelves: 0, books: 0, readingLogs: 0 },
      duplicateCount: 0,
      warnings: ['Could not detect Goodreads or StoryGraph columns (missing Title / Shelf headers).'],
    };
  }

  const now = new Date().toISOString();
  const shelfByName = new Map<string, Shelf>();
  const books: Book[] = [];
  const warnings: string[] = [];

  const getOrCreateShelf = (rawName: string): Shelf => {
    const cleanName = rawName.trim();
    const key = cleanName.toLowerCase();
    const existing = shelfByName.get(key);
    if (existing) return existing;
    const shelf: Shelf = {
      id: generateId('shelf'),
      profileId: targetProfileId,
      name: cleanName,
      color: 'amber',
      icon: 'book-open',
      visible: true,
      sortOrder: shelfByName.size,
      createdAt: now,
      updatedAt: now,
    };
    shelfByName.set(key, shelf);
    return shelf;
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((cell) => !cell.trim())) continue;

    const title = getCell(row, 'title');
    if (!title) continue;

    const author = getCell(row, 'author', 'authors') || 'Unknown Author';
    const rawIsbn13 = cleanGoodreadsIsbn(getCell(row, 'isbn13', 'isbn/uid'));
    const rawIsbn10 = cleanGoodreadsIsbn(getCell(row, 'isbn'));
    const isbn = rawIsbn13 || rawIsbn10 || undefined;

    const rawStatus = getCell(row, 'exclusive shelf', 'read status').toLowerCase();
    let status: ReadingStatus = 'want-to-read';
    if (rawStatus === 'read' || rawStatus === 'finished') {
      status = 'finished';
    } else if (rawStatus === 'currently-reading' || rawStatus === 'reading') {
      status = 'reading';
    } else if (rawStatus === 'did-not-finish' || rawStatus === 'dnf') {
      status = 'dnf';
    }

    const pageCountRaw = Number(getCell(row, 'number of pages', 'pages'));
    const pageCount = Number.isFinite(pageCountRaw) && pageCountRaw > 0 ? Math.round(pageCountRaw) : 0;

    const yearRaw = Number(
      getCell(row, 'original publication year', 'year published', 'publication year'),
    );
    const publishYear =
      Number.isFinite(yearRaw) && yearRaw >= 1000 && yearRaw <= 2100 ? Math.round(yearRaw) : undefined;

    const rating = clampRating(getCell(row, 'my rating', 'star rating'));
    const dateFinished =
      fromFlexibleDate(getCell(row, 'date read', 'last date read', 'dates read')) || undefined;
    const addedDate = fromFlexibleDate(getCell(row, 'date added'));

    const rawReview = getCell(row, 'my review', 'review');
    const privateNotes = getCell(row, 'private notes');
    const combinedNotes = [
      rawReview.replace(/<br\s*\/?>/gi, '\n'),
      privateNotes,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const rawShelvesCell = getCell(row, 'bookshelves', 'tags');
    const shelfNames = rawShelvesCell
      .split(',')
      .map((s) => s.trim())
      .filter(
        (s) =>
          s &&
          s.toLowerCase() !== 'to-read' &&
          s.toLowerCase() !== 'currently-reading' &&
          s.toLowerCase() !== 'read' &&
          s.toLowerCase() !== 'did-not-finish',
      );

    const rawFormatCell = getCell(row, 'binding', 'format');
    let format = parseBookFormat(rawFormatCell);
    if (format === 'physical' && shelfNames.some((s) => /audio/i.test(s))) {
      format = 'audiobook';
    }

    const assignedShelfIds: string[] = [];
    if (shelfNames.length > 0 && !isStoryGraph) {
      for (const sName of shelfNames) {
        assignedShelfIds.push(getOrCreateShelf(sName).id);
      }
    } else {
      const defaultShelf = getOrCreateShelf(
        isStoryGraph ? 'StoryGraph Import' : 'Goodreads Import',
      );
      assignedShelfIds.push(defaultShelf.id);
    }

    books.push({
      id: generateId('book'),
      profileId: targetProfileId,
      shelfIds: assignedShelfIds,
      title,
      author,
      isbn,
      publishYear,
      publisher: getCell(row, 'publisher') || undefined,
      pageCount,
      currentPage: status === 'finished' ? pageCount : 0,
      coverUrl: isbn ? buildOpenLibraryCoverByIsbn(isbn, 'L') : undefined,
      format,
      status,
      rating,
      dateFinished,
      notes: combinedNotes,
      tags: shelfNames,
      addedAt: addedDate ? `${addedDate}T12:00:00.000Z` : now,
      updatedAt: now,
    });
  }

  if (books.length === 0) {
    warnings.push('No valid book rows found in CSV.');
  }

  const format: ImportFormat = isStoryGraph ? 'storygraph-csv' : 'goodreads-csv';
  const formatLabel = isStoryGraph ? 'StoryGraph CSV' : 'Goodreads CSV';
  const shelves = Array.from(shelfByName.values());

  return {
    format,
    formatLabel,
    filename,
    summaryCounts: {
      profiles: 0,
      shelves: shelves.length,
      books: books.length,
      readingLogs: 0,
    },
    duplicateCount: findDuplicateCount(books, existingProfileBooks),
    warnings,
    profileBundle: {
      shelves,
      books,
      readingLogs: [],
    },
  };
}

export function inspectImportFile(
  filename: string,
  rawText: string,
  currentDb: BookLibraryDatabase,
  activeProfileId: string | null,
): ImportPreview {
  const trimmed = rawText.trim();
  const existingProfileBooks = activeProfileId
    ? currentDb.books.filter((b) => b.profileId === activeProfileId && !b.deletedAt)
    : [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;

      if (
        parsed.schemaVersion === 4 &&
        Array.isArray(parsed.profiles) &&
        Array.isArray(parsed.books)
      ) {
        const householdDb = parsed as unknown as BookLibraryDatabase;
        const activeProfiles = householdDb.profiles.filter((p) => !p.deletedAt);
        const activeShelves = (householdDb.shelves || []).filter((s) => !s.deletedAt);
        const activeBooks = householdDb.books.filter((b) => !b.deletedAt);
        const activeLogs = (householdDb.readingLogs || []).filter((l) => !l.deletedAt);

        return {
          format: 'v4-household-json',
          formatLabel: 'BookLibrary Household Backup (JSON)',
          filename,
          summaryCounts: {
            profiles: activeProfiles.length,
            shelves: activeShelves.length,
            books: activeBooks.length,
            readingLogs: activeLogs.length,
          },
          duplicateCount: findDuplicateCount(
            activeBooks,
            currentDb.books.filter((b) => !b.deletedAt),
          ),
          warnings: [],
          householdDb,
        };
      }

      if (
        (parsed.kind === 'booklibrary-profile-v4' ||
          parsed.kind === 'omnilibrary-profile-v4' ||
          parsed.schemaVersion === 4) &&
        parsed.profile &&
        Array.isArray(parsed.books)
      ) {
        const bundle = parsed as unknown as ProfileExportEnvelope;
        const activeShelves = (bundle.shelves || []).filter((s) => !s.deletedAt);
        const activeBooks = (bundle.books || []).filter((b) => !b.deletedAt);
        const activeLogs = (bundle.readingLogs || []).filter((l) => !l.deletedAt);

        return {
          format: 'v4-profile-json',
          formatLabel: 'BookLibrary Profile Backup (JSON)',
          filename,
          summaryCounts: {
            profiles: 1,
            shelves: activeShelves.length,
            books: activeBooks.length,
            readingLogs: activeLogs.length,
          },
          duplicateCount: findDuplicateCount(activeBooks, existingProfileBooks),
          warnings: [],
          profileBundle: {
            profile: bundle.profile,
            shelves: activeShelves,
            books: activeBooks,
            readingLogs: activeLogs,
          },
        };
      }

      if (Array.isArray(parsed.libraries)) {
        return parseV3LegacyJson(
          parsed as unknown as { libraries: LegacyV3Library[] },
          filename,
          existingProfileBooks,
          activeProfileId || 'imported-profile',
        );
      }

      return {
        format: 'unknown',
        formatLabel: 'Unrecognized JSON file',
        filename,
        summaryCounts: { profiles: 0, shelves: 0, books: 0, readingLogs: 0 },
        duplicateCount: 0,
        warnings: ['JSON did not match BookLibrary backup or legacy v3 schema.'],
      };
    } catch (err) {
      return {
        format: 'unknown',
        formatLabel: 'Invalid JSON file',
        filename,
        summaryCounts: { profiles: 0, shelves: 0, books: 0, readingLogs: 0 },
        duplicateCount: 0,
        warnings: [err instanceof Error ? err.message : 'Failed to parse JSON.'],
      };
    }
  }

  return parseGoodreadsOrStoryGraphCsv(
    rawText,
    filename,
    existingProfileBooks,
    activeProfileId || 'imported-profile',
  );
}

export function applyImport(
  currentDb: BookLibraryDatabase,
  activeProfileId: string | null,
  preview: ImportPreview,
  mode: 'merge' | 'replace',
): BookLibraryDatabase {
  const now = new Date().toISOString();

  if (preview.format === 'v4-household-json' && preview.householdDb) {
    if (mode === 'replace') {
      return {
        ...preview.householdDb,
        schemaVersion: 4,
        updatedAt: now,
      };
    }
    return mergeDatabases(currentDb, preview.householdDb);
  }

  if (!preview.profileBundle) {
    return currentDb;
  }

  let targetProfileId = activeProfileId;
  let nextProfiles = [...currentDb.profiles];

  if (!targetProfileId) {
    if (preview.profileBundle.profile) {
      const clonedProfile: UserProfile = {
        ...preview.profileBundle.profile,
        id: generateId('profile'),
        updatedAt: now,
      };
      nextProfiles.push(clonedProfile);
      targetProfileId = clonedProfile.id;
    } else {
      const createdId = generateId('profile');
      nextProfiles.push({
        id: createdId,
        name: 'Imported Reader',
        avatarEmoji: '📚',
        avatarTheme: 'amber',
        role: nextProfiles.some((p) => !p.deletedAt) ? 'member' : 'admin',
        pinHash: null,
        yearlyBookGoal: 12,
        monthlyPageGoal: 500,
        createdAt: now,
        updatedAt: now,
      });
      targetProfileId = createdId;
    }
  }

  const bundle = preview.profileBundle;

  let nextShelves = [...currentDb.shelves];
  let nextBooks = [...currentDb.books];
  let nextLogs = [...currentDb.readingLogs];

  if (mode === 'replace') {
    nextShelves = nextShelves.map((s) =>
      s.profileId === targetProfileId ? { ...s, deletedAt: now, updatedAt: now } : s,
    );
    nextBooks = nextBooks.map((b) =>
      b.profileId === targetProfileId ? { ...b, deletedAt: now, updatedAt: now } : b,
    );
    nextLogs = nextLogs.map((l) =>
      l.profileId === targetProfileId ? { ...l, deletedAt: now, updatedAt: now } : l,
    );
  }

  const activeTargetShelves = nextShelves.filter(
    (s) => s.profileId === targetProfileId && !s.deletedAt,
  );
  const shelfNameMap = new Map(activeTargetShelves.map((s) => [s.name.toLowerCase(), s.id]));
  const shelfIdRemap = new Map<string, string>();

  for (const s of bundle.shelves) {
    const existingId = shelfNameMap.get(s.name.trim().toLowerCase());
    if (existingId && mode === 'merge') {
      shelfIdRemap.set(s.id, existingId);
    } else {
      const newId = generateId('shelf');
      shelfIdRemap.set(s.id, newId);
      shelfNameMap.set(s.name.trim().toLowerCase(), newId);
      nextShelves.push({
        ...s,
        id: newId,
        profileId: targetProfileId,
        createdAt: s.createdAt || now,
        updatedAt: now,
        deletedAt: null,
      });
    }
  }

  let fallbackShelfId = nextShelves.find((s) => s.profileId === targetProfileId && !s.deletedAt)?.id;
  if (!fallbackShelfId && bundle.books.length > 0) {
    fallbackShelfId = generateId('shelf');
    nextShelves.push({
      id: fallbackShelfId,
      profileId: targetProfileId,
      name: 'Personal Library',
      color: 'amber',
      icon: 'book-open',
      visible: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  const activeTargetBooks = nextBooks.filter(
    (b) => b.profileId === targetProfileId && !b.deletedAt,
  );
  const existingIsbns = new Set(
    activeTargetBooks
      .filter((b) => b.isbn)
      .map((b) => cleanGoodreadsIsbn(b.isbn))
      .filter(Boolean),
  );
  const existingKeys = new Set(
    activeTargetBooks.map((b) => normalizeBookKey(b.title, b.author)),
  );
  const bookIdRemap = new Map<string, string>();

  for (const b of bundle.books) {
    const cleanIsbn = cleanGoodreadsIsbn(b.isbn);
    const key = normalizeBookKey(b.title, b.author);

    if (mode === 'merge') {
      if ((cleanIsbn && existingIsbns.has(cleanIsbn)) || existingKeys.has(key)) {
        const match = activeTargetBooks.find(
          (ex) =>
            (cleanIsbn && cleanGoodreadsIsbn(ex.isbn) === cleanIsbn) ||
            normalizeBookKey(ex.title, ex.author) === key,
        );
        if (match) bookIdRemap.set(b.id, match.id);
        continue;
      }
    }

    const newBookId = generateId('book');
    bookIdRemap.set(b.id, newBookId);
    if (cleanIsbn) existingIsbns.add(cleanIsbn);
    existingKeys.add(key);

    const mappedShelfIds = b.shelfIds
      .map((sid) => shelfIdRemap.get(sid))
      .filter((id): id is string => Boolean(id));
    if (mappedShelfIds.length === 0 && fallbackShelfId) {
      mappedShelfIds.push(fallbackShelfId);
    }

    nextBooks.push({
      ...b,
      id: newBookId,
      profileId: targetProfileId,
      shelfIds: mappedShelfIds,
      coverUrl: sanitizeCoverUrl(b.coverUrl),
      addedAt: b.addedAt || now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  for (const log of bundle.readingLogs) {
    const mappedBookId = bookIdRemap.get(log.bookId);
    if (!mappedBookId) continue;
    nextLogs.push({
      ...log,
      id: generateId('log'),
      profileId: targetProfileId,
      bookId: mappedBookId,
      createdAt: log.createdAt || now,
      updatedAt: now,
      deletedAt: null,
    });
  }

  return {
    schemaVersion: 4,
    dbId: currentDb.dbId,
    updatedAt: now,
    profiles: nextProfiles,
    shelves: nextShelves,
    books: nextBooks,
    readingLogs: nextLogs,
  };
}
