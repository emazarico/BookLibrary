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
import { parseDurationToMinutes } from '../utils/progress';

export type ImportFormat =
  | 'v4-household-json'
  | 'v4-profile-json'
  | 'v3-legacy-json'
  | 'goodreads-csv'
  | 'storygraph-csv'
  | 'audible-csv'
  | 'libby-json'
  | 'libby-csv'
  | 'kindle-clippings'
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

function fromFlexibleDate(raw?: string | number | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString().split('T')[0];
  }

  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;

  if (/^\d{10,13}$/.test(trimmed)) {
    const num = Number(trimmed);
    const ms = num < 1e12 ? num * 1000 : num;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString().split('T')[0];
  }

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
    const d = new Date(parsed);
    if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
      return d.toISOString().split('T')[0];
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return undefined;
}

function parseTimestampMs(raw?: string | number | null): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (raw === undefined || raw === null) return 0;
  const str = String(raw).trim();
  if (!str) return 0;
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    return num < 1e12 ? num * 1000 : num;
  }
  const parsed = Date.parse(str);
  return Number.isNaN(parsed) ? 0 : parsed;
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
  if (/kindle|ebook|e-book|nook|epub|digital|overdrive|libby read/.test(lower)) return 'ebook';
  return 'physical';
}

function formatToBinding(format?: BookFormat): string {
  if (format === 'audiobook') return 'Audiobook';
  if (format === 'ebook') return 'Kindle Edition';
  return 'Paperback';
}

function parseExtendedDurationToMinutes(raw?: string): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  const hmsMatch = /^(\d{1,4}):(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (hmsMatch) {
    const h = Number(hmsMatch[1]);
    const m = Number(hmsMatch[2]);
    const s = Number(hmsMatch[3]);
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
      return Math.max(0, h * 60 + m + Math.round(s / 60));
    }
  }

  const audibleTextMatch =
    /^(?:(\d+)\s*(?:hours?|hrs?|h))?(?:\s*(?:and|,)?\s*)?(?:(\d+)\s*(?:minutes?|mins?|m))?(?:\s*(?:and|,)?\s*(\d+)\s*(?:seconds?|secs?|s))?$/i.exec(
      trimmed,
    );
  if (
    audibleTextMatch &&
    (audibleTextMatch[1] !== undefined ||
      audibleTextMatch[2] !== undefined ||
      audibleTextMatch[3] !== undefined)
  ) {
    const h = audibleTextMatch[1] ? Number(audibleTextMatch[1]) : 0;
    const m = audibleTextMatch[2] ? Number(audibleTextMatch[2]) : 0;
    const s = audibleTextMatch[3] ? Number(audibleTextMatch[3]) : 0;
    const total = h * 60 + m + Math.round(s / 60);
    if (total > 0) return total;
  }

  return parseDurationToMinutes(trimmed);
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
        b.review || '',
        '',
        b.notes || '',
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
        language: 'English',
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

function makeImportShelf(
  profileId: string,
  name: string,
  color = 'amber',
  sortOrder = 0,
  now = new Date().toISOString(),
): Shelf {
  return {
    id: generateId('shelf'),
    profileId,
    name,
    color,
    icon: 'book-open',
    visible: true,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

function parseKindleClippings(
  rawText: string,
  filename: string,
  existingProfileBooks: Book[],
  targetProfileId: string,
): ImportPreview {
  const now = new Date().toISOString();
  const blocks = rawText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n\s*={5,}\s*\r?\n?/g)
    .map((b) => b.trim())
    .filter(Boolean);

  interface KindleAgg {
    title: string;
    author: string;
    maxPage: number;
    earliestDate?: string;
    latestDate?: string;
    clippings: string[];
  }

  const byBook = new Map<string, KindleAgg>();
  let totalClippings = 0;

  for (const block of blocks) {
    if (/You have reached the clipping limit/i.test(block)) continue;
    const lines = block.split(/\r?\n/).map((l) => l.trimEnd());
    if (lines.length < 2) continue;

    const headerLine = lines[0].replace(/^\uFEFF/, '').trim();
    if (!headerLine) continue;

    let title = headerLine;
    let author = 'Unknown Author';
    const titleAuthorMatch = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(headerLine);
    if (titleAuthorMatch && titleAuthorMatch[1].trim()) {
      title = titleAuthorMatch[1].trim();
      author = titleAuthorMatch[2].trim() || 'Unknown Author';
    }

    const metaLine = (lines[1] || '').trim();
    const bodyText = lines
      .slice(2)
      .join('\n')
      .trim();

    let clipType = 'Clipping';
    if (/highlight/i.test(metaLine)) clipType = 'Highlight';
    else if (/note/i.test(metaLine)) clipType = 'Note';
    else if (/bookmark/i.test(metaLine)) clipType = 'Bookmark';

    let pageNum = 0;
    const pageMatch = /page\s+(\d+)(?:-(\d+))?/i.exec(metaLine);
    if (pageMatch) {
      pageNum = Number(pageMatch[2] || pageMatch[1]) || 0;
    }

    let dateIso: string | undefined;
    const addedMatch = /Added on\s+(.+)$/i.exec(metaLine);
    if (addedMatch) {
      dateIso = fromFlexibleDate(addedMatch[1]);
    }

    const key = normalizeBookKey(title, author);
    const existing = byBook.get(key) || {
      title,
      author,
      maxPage: 0,
      clippings: [],
    };
    if (pageNum > existing.maxPage) existing.maxPage = pageNum;
    if (dateIso) {
      if (!existing.earliestDate || dateIso < existing.earliestDate) {
        existing.earliestDate = dateIso;
      }
      if (!existing.latestDate || dateIso > existing.latestDate) {
        existing.latestDate = dateIso;
      }
    }

    if (bodyText || clipType === 'Bookmark') {
      const prefix = [clipType, pageNum > 0 ? `p. ${pageNum}` : '', dateIso || '']
        .filter(Boolean)
        .join(' · ');
      existing.clippings.push(bodyText ? `[${prefix}]\n${bodyText}` : `[${prefix}]`);
      totalClippings++;
    }

    byBook.set(key, existing);
  }

  const shelf = makeImportShelf(targetProfileId, 'Kindle Highlights', 'indigo', 0, now);
  const books: Book[] = [];

  for (const agg of byBook.values()) {
    const status: ReadingStatus = 'finished';
    books.push({
      id: generateId('book'),
      profileId: targetProfileId,
      shelfIds: [shelf.id],
      title: agg.title,
      author: agg.author,
      language: 'English',
      pageCount: 0,
      currentPage: agg.maxPage,
      format: 'ebook',
      ownership: 'owned',
      status,
      rating: 0,
      dateStarted:
        agg.earliestDate && agg.earliestDate !== agg.latestDate ? agg.earliestDate : undefined,
      dateFinished: agg.latestDate,
      notes: agg.clippings.join('\n\n'),
      tags: ['kindle', 'highlights'],
      addedAt: agg.earliestDate ? `${agg.earliestDate}T12:00:00.000Z` : now,
      updatedAt: now,
    });
  }

  const warnings: string[] = [];
  if (books.length === 0) {
    warnings.push('No Kindle highlights or notes were detected in this file.');
  } else {
    warnings.push(`Grouped ${totalClippings} Kindle clipping(s) into ${books.length} book(s).`);
  }

  return {
    format: 'kindle-clippings',
    formatLabel: 'Kindle My Clippings (.txt)',
    filename,
    summaryCounts: {
      profiles: 0,
      shelves: books.length > 0 ? 1 : 0,
      books: books.length,
      readingLogs: 0,
    },
    duplicateCount: findDuplicateCount(books, existingProfileBooks),
    warnings,
    profileBundle: {
      shelves: books.length > 0 ? [shelf] : [],
      books,
      readingLogs: [],
    },
  };
}

interface RawLibbyEvent {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  coverUrl?: string;
  formatRaw?: string;
  activity: string;
  libraryName?: string;
  timestampMs: number;
  dateIso?: string;
  dueDateIso?: string;
}

function buildLibbyPreview(
  events: RawLibbyEvent[],
  format: 'libby-json' | 'libby-csv',
  formatLabel: string,
  filename: string,
  existingProfileBooks: Book[],
  targetProfileId: string,
): ImportPreview {
  const now = new Date().toISOString();
  const byBook = new Map<string, RawLibbyEvent[]>();

  for (const ev of events) {
    if (!ev.title.trim()) continue;
    const cleanIsbn = cleanGoodreadsIsbn(ev.isbn);
    const key = cleanIsbn || normalizeBookKey(ev.title, ev.author || 'Unknown Author');
    const list = byBook.get(key) || [];
    list.push(ev);
    byBook.set(key, list);
  }

  const loansShelf = makeImportShelf(targetProfileId, 'Libby Loans', 'teal', 0, now);
  const holdsShelf = makeImportShelf(targetProfileId, 'Libby Holds', 'sky', 1, now);
  const books: Book[] = [];

  for (const group of byBook.values()) {
    const sorted = [...group].sort((a, b) => a.timestampMs - b.timestampMs);
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];

    const title = sorted.find((e) => e.title)?.title.trim() || 'Untitled';
    const author = sorted.find((e) => e.author)?.author.trim() || 'Unknown Author';
    const isbn = cleanGoodreadsIsbn(sorted.find((e) => e.isbn)?.isbn) || undefined;
    const publisher = sorted.find((e) => e.publisher)?.publisher;
    const libraryName = [...sorted].reverse().find((e) => e.libraryName)?.libraryName;
    const rawCover = [...sorted].reverse().find((e) => e.coverUrl)?.coverUrl;
    const coverUrl =
      sanitizeCoverUrl(rawCover) || (isbn ? buildOpenLibraryCoverByIsbn(isbn, 'L') : undefined);

    const formatStr = [...sorted].reverse().find((e) => e.formatRaw)?.formatRaw || 'ebook';
    const bookFormat: BookFormat = /audio/i.test(formatStr) ? 'audiobook' : 'ebook';

    let status: ReadingStatus = 'want-to-read';
    let dateStarted: string | undefined;
    let dateFinished: string | undefined;
    let dueDate: string | undefined;

    for (const ev of sorted) {
      const act = ev.activity.toLowerCase();
      if (/borrow|check.?out|renew/.test(act)) {
        status = 'reading';
        if (!dateStarted && ev.dateIso) dateStarted = ev.dateIso;
        if (ev.dueDateIso) dueDate = ev.dueDateIso;
      } else if (/return|finish|complete/.test(act)) {
        status = 'finished';
        if (ev.dateIso) dateFinished = ev.dateIso;
        dueDate = undefined;
      } else if (/hold|waitlist|notify/.test(act) && status === 'want-to-read') {
        status = 'want-to-read';
      }
    }

    const latestAct = latest.activity.toLowerCase();
    if (/return|finish/.test(latestAct)) {
      status = 'finished';
      dateFinished = dateFinished || latest.dateIso;
    } else if (/borrow|renew|check.?out/.test(latestAct)) {
      status = 'reading';
    }

    const targetShelf =
      status === 'want-to-read' && /hold|waitlist/i.test(latest.activity)
        ? holdsShelf
        : loansShelf;

    books.push({
      id: generateId('book'),
      profileId: targetProfileId,
      shelfIds: [targetShelf.id],
      title,
      author,
      isbn,
      publisher,
      language: 'English',
      pageCount: 0,
      currentPage: 0,
      progressUnit: bookFormat === 'audiobook' ? 'duration' : 'pages',
      coverUrl,
      format: bookFormat,
      ownership: 'library',
      ownershipNote: libraryName,
      dueDate,
      status,
      rating: 0,
      dateStarted,
      dateFinished,
      notes: libraryName ? `Borrowed via Libby (${libraryName})` : 'Imported from Libby',
      tags: ['libby'],
      addedAt: first.dateIso ? `${first.dateIso}T12:00:00.000Z` : now,
      updatedAt: now,
    });
  }

  const usedShelves = [loansShelf, holdsShelf].filter((s) =>
    books.some((b) => b.shelfIds.includes(s.id)),
  );
  const warnings: string[] = [];
  if (books.length === 0) {
    warnings.push('No valid Libby items were found in this export.');
  }

  return {
    format,
    formatLabel,
    filename,
    summaryCounts: {
      profiles: 0,
      shelves: usedShelves.length,
      books: books.length,
      readingLogs: 0,
    },
    duplicateCount: findDuplicateCount(books, existingProfileBooks),
    warnings,
    profileBundle: {
      shelves: usedShelves,
      books,
      readingLogs: [],
    },
  };
}

function isLibbyTimelineJson(parsed: unknown): boolean {
  if (Array.isArray(parsed)) {
    return parsed.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const obj = item as Record<string, unknown>;
      const hasTitle = Boolean(obj.title || obj.titleId);
      const hasLibbySignal = Boolean(
        obj.activity !== undefined ||
          obj.library !== undefined ||
          obj.libraryName !== undefined ||
          obj.borrowDate !== undefined ||
          (obj.timestamp !== undefined && obj.cover !== undefined),
      );
      return hasTitle && hasLibbySignal;
    });
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.timeline) || Array.isArray(obj.activities)) return true;
    if (obj.version !== undefined && (Array.isArray(obj.loans) || Array.isArray(obj.holds))) {
      return true;
    }
  }
  return false;
}

function parseLibbyTimelineJson(
  parsed: unknown,
  filename: string,
  existingProfileBooks: Book[],
  targetProfileId: string,
): ImportPreview {
  let rawItems: unknown[] = [];
  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.timeline)) rawItems = obj.timeline;
    else if (Array.isArray(obj.activities)) rawItems = obj.activities;
    else {
      rawItems = [
        ...(Array.isArray(obj.loans) ? obj.loans : []),
        ...(Array.isArray(obj.holds) ? obj.holds : []),
      ];
    }
  }

  const events: RawLibbyEvent[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const titleField = obj.title;
    const title =
      typeof titleField === 'string'
        ? titleField
        : titleField && typeof titleField === 'object'
          ? String((titleField as Record<string, unknown>).text || '')
          : String(obj.name || '');

    const creators = Array.isArray(obj.creators) ? obj.creators : [];
    const firstCreator =
      creators[0] && typeof creators[0] === 'object'
        ? String((creators[0] as Record<string, unknown>).name || '')
        : '';
    const author = String(obj.author || obj.firstCreatorName || firstCreator || 'Unknown Author');

    const coverField = obj.cover;
    const coverUrl =
      typeof obj.coverUrl === 'string'
        ? obj.coverUrl
        : coverField && typeof coverField === 'object'
          ? String(
              (coverField as Record<string, unknown>).url ||
                (coverField as Record<string, unknown>).content ||
                '',
            )
          : undefined;

    const libraryField = obj.library;
    const libraryName =
      typeof obj.libraryName === 'string'
        ? obj.libraryName
        : typeof libraryField === 'string'
          ? libraryField
          : libraryField && typeof libraryField === 'object'
            ? String((libraryField as Record<string, unknown>).text || '')
            : undefined;

    const formatField = obj.format;
    const formatRaw =
      typeof formatField === 'string'
        ? formatField
        : formatField && typeof formatField === 'object'
          ? String(
              (formatField as Record<string, unknown>).name ||
                (formatField as Record<string, unknown>).id ||
                '',
            )
          : undefined;

    const rawTime = (obj.timestamp ?? obj.date ?? obj.borrowDate ?? obj.returnDate) as
      | string
      | number
      | undefined;

    events.push({
      title,
      author,
      isbn:
        typeof obj.isbn === 'string'
          ? obj.isbn
          : typeof obj.isbn13 === 'string'
            ? obj.isbn13
            : undefined,
      publisher: typeof obj.publisher === 'string' ? obj.publisher : undefined,
      coverUrl,
      formatRaw,
      activity: String(obj.activity || obj.action || obj.type || 'Borrowed'),
      libraryName: libraryName?.trim() || undefined,
      timestampMs: parseTimestampMs(rawTime),
      dateIso: fromFlexibleDate(rawTime),
      dueDateIso: fromFlexibleDate((obj.dueDate ?? obj.expireDate) as string | number | undefined),
    });
  }

  return buildLibbyPreview(
    events,
    'libby-json',
    'Libby Timeline Backup (JSON)',
    filename,
    existingProfileBooks,
    targetProfileId,
  );
}

function parseLibbyCsv(
  rows: string[][],
  colIndex: Map<string, number>,
  filename: string,
  existingProfileBooks: Book[],
  targetProfileId: string,
): ImportPreview {
  const getCell = (row: string[], ...candidates: string[]): string => {
    for (const key of candidates) {
      const idx = colIndex.get(key.toLowerCase());
      if (idx !== undefined && row[idx] !== undefined) {
        return row[idx].trim();
      }
    }
    return '';
  };

  const events: RawLibbyEvent[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => !c.trim())) continue;
    const title = getCell(row, 'title');
    if (!title) continue;

    const rawTs = getCell(row, 'timestamp', 'date', 'borrow date', 'borrowdate');
    events.push({
      title,
      author: getCell(row, 'author', 'authors') || 'Unknown Author',
      isbn: getCell(row, 'isbn', 'isbn13') || undefined,
      publisher: getCell(row, 'publisher') || undefined,
      coverUrl: getCell(row, 'cover', 'cover url') || undefined,
      formatRaw: getCell(row, 'format', 'details') || undefined,
      activity: getCell(row, 'activity', 'action', 'type') || 'Borrowed',
      libraryName: getCell(row, 'library', 'library name') || undefined,
      timestampMs: parseTimestampMs(rawTs),
      dateIso: fromFlexibleDate(rawTs),
      dueDateIso: fromFlexibleDate(getCell(row, 'due date', 'duedate')),
    });
  }

  return buildLibbyPreview(
    events,
    'libby-csv',
    'Libby Reading History (CSV)',
    filename,
    existingProfileBooks,
    targetProfileId,
  );
}

function parseAudibleCsv(
  rows: string[][],
  colIndex: Map<string, number>,
  filename: string,
  existingProfileBooks: Book[],
  targetProfileId: string,
): ImportPreview {
  const now = new Date().toISOString();
  const getCell = (row: string[], ...candidates: string[]): string => {
    for (const key of candidates) {
      const idx = colIndex.get(key.toLowerCase());
      if (idx !== undefined && row[idx] !== undefined) {
        return row[idx].trim();
      }
    }
    return '';
  };

  const isListeningLogCsv =
    colIndex.has('listening duration (milliseconds)') ||
    colIndex.has('event duration milliseconds') ||
    colIndex.has('duration milliseconds') ||
    colIndex.has('listening duration (seconds)') ||
    (colIndex.has('start date') && (colIndex.has('end date') || colIndex.has('audio type')));

  const shelf = makeImportShelf(targetProfileId, 'Audible Library', 'amber', 0, now);
  const books: Book[] = [];
  const readingLogs: ReadingLog[] = [];
  const warnings: string[] = [];

  if (isListeningLogCsv) {
    interface AudibleBookAgg {
      bookId: string;
      title: string;
      author: string;
      narrator: string;
      asin?: string;
      isbn?: string;
      totalBookMinutes: number;
      listenedTotalMinutes: number;
      firstDate?: string;
      lastDate?: string;
      dailyMinutes: Map<string, number>;
    }

    const byKey = new Map<string, AudibleBookAgg>();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => !c.trim())) continue;

      const title = getCell(row, 'book title', 'product name', 'title');
      if (!title) continue;

      const author = getCell(row, 'author', 'authors') || 'Unknown Author';
      const narrator = getCell(row, 'narrator', 'narrators');
      const asin = getCell(row, 'asin') || undefined;
      const isbn = cleanGoodreadsIsbn(getCell(row, 'isbn', 'isbn13')) || undefined;
      const key = asin ? `asin:${asin.toUpperCase()}` : normalizeBookKey(title, author);

      const msRaw = Number(
        getCell(
          row,
          'listening duration (milliseconds)',
          'event duration milliseconds',
          'duration milliseconds',
        ),
      );
      const secRaw = Number(getCell(row, 'listening duration (seconds)'));
      let sessionMinutes = 0;
      if (Number.isFinite(msRaw) && msRaw > 0) {
        sessionMinutes = Math.max(1, Math.round(msRaw / 60000));
      } else if (Number.isFinite(secRaw) && secRaw > 0) {
        sessionMinutes = Math.max(1, Math.round(secRaw / 60));
      } else {
        sessionMinutes = parseExtendedDurationToMinutes(getCell(row, 'duration', 'length'));
      }

      const bookLenMs = Number(
        getCell(row, 'book length milliseconds', 'book duration milliseconds'),
      );
      const totalBookMinutes =
        Number.isFinite(bookLenMs) && bookLenMs > 0
          ? Math.round(bookLenMs / 60000)
          : parseExtendedDurationToMinutes(getCell(row, 'book length', 'length', 'runtime'));

      const sessionDate = fromFlexibleDate(
        getCell(row, 'start date', 'date', 'end date', 'timestamp'),
      );

      const agg = byKey.get(key) || {
        bookId: generateId('book'),
        title,
        author,
        narrator,
        asin,
        isbn,
        totalBookMinutes: 0,
        listenedTotalMinutes: 0,
        dailyMinutes: new Map<string, number>(),
      };

      if (totalBookMinutes > agg.totalBookMinutes) {
        agg.totalBookMinutes = totalBookMinutes;
      }
      if (!agg.narrator && narrator) agg.narrator = narrator;
      if (sessionMinutes > 0) {
        agg.listenedTotalMinutes += sessionMinutes;
        if (sessionDate) {
          agg.dailyMinutes.set(
            sessionDate,
            (agg.dailyMinutes.get(sessionDate) || 0) + sessionMinutes,
          );
        }
      }
      if (sessionDate) {
        if (!agg.firstDate || sessionDate < agg.firstDate) agg.firstDate = sessionDate;
        if (!agg.lastDate || sessionDate > agg.lastDate) agg.lastDate = sessionDate;
      }

      byKey.set(key, agg);
    }

    for (const agg of byKey.values()) {
      const totalMinutes = agg.totalBookMinutes || agg.listenedTotalMinutes || undefined;
      const currentMinutes =
        totalMinutes !== undefined
          ? Math.min(totalMinutes, agg.listenedTotalMinutes)
          : agg.listenedTotalMinutes;
      const ratio = totalMinutes && totalMinutes > 0 ? agg.listenedTotalMinutes / totalMinutes : 0;
      const status: ReadingStatus =
        ratio >= 0.9 ? 'finished' : agg.listenedTotalMinutes > 0 ? 'reading' : 'want-to-read';

      books.push({
        id: agg.bookId,
        profileId: targetProfileId,
        shelfIds: [shelf.id],
        title: agg.title,
        author: agg.author,
        isbn: agg.isbn,
        language: 'English',
        pageCount: 0,
        currentPage: 0,
        progressUnit: 'duration',
        totalMinutes,
        currentMinutes: status === 'finished' && totalMinutes ? totalMinutes : currentMinutes,
        coverUrl: agg.isbn ? buildOpenLibraryCoverByIsbn(agg.isbn, 'L') : undefined,
        format: 'audiobook',
        ownership: 'owned',
        status,
        rating: 0,
        dateStarted: agg.firstDate,
        dateFinished: status === 'finished' ? agg.lastDate : undefined,
        notes: [
          agg.narrator ? `Narrated by ${agg.narrator}` : '',
          agg.asin ? `Audible ASIN: ${agg.asin}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        tags: ['audible'],
        addedAt: agg.firstDate ? `${agg.firstDate}T12:00:00.000Z` : now,
        updatedAt: now,
      });

      const sortedDates = Array.from(agg.dailyMinutes.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      let cumulativeMins = 0;
      for (const [date, mins] of sortedDates) {
        cumulativeMins += mins;
        readingLogs.push({
          id: generateId('log'),
          profileId: targetProfileId,
          bookId: agg.bookId,
          date,
          pagesRead: 0,
          unit: 'duration',
          minutesListened: mins,
          minuteReached: cumulativeMins,
          readCycle: 1,
          note: 'Imported from Audible Listening Log',
          createdAt: `${date}T12:00:00.000Z`,
          updatedAt: now,
        });
      }
    }

    if (books.length > 0) {
      warnings.push(
        `Grouped ${readingLogs.length} daily listening log(s) across ${books.length} Audible audiobook(s).`,
      );
    }
  } else {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => !c.trim())) continue;

      const title = getCell(row, 'title', 'book title', 'product name');
      if (!title) continue;

      const author = getCell(row, 'author', 'authors') || 'Unknown Author';
      const narrator = getCell(row, 'narrator', 'narrators');
      const asin = getCell(row, 'asin') || undefined;
      const isbn = cleanGoodreadsIsbn(getCell(row, 'isbn', 'isbn13')) || undefined;
      const totalMinutes = parseExtendedDurationToMinutes(
        getCell(row, 'length', 'duration', 'runtime', 'listening time'),
      );
      const dateAdded = fromFlexibleDate(
        getCell(row, 'date added', 'purchase date', 'date purchased', 'release date'),
      );
      const dateFinished = fromFlexibleDate(getCell(row, 'date finished', 'finished date'));
      const rawStatus = getCell(row, 'status', 'progress', 'finished', 'is finished').toLowerCase();

      let status: ReadingStatus = 'want-to-read';
      if (
        dateFinished ||
        rawStatus === 'finished' ||
        rawStatus === 'completed' ||
        rawStatus === 'true' ||
        rawStatus === 'yes' ||
        rawStatus === '100%'
      ) {
        status = 'finished';
      } else if (rawStatus === 'reading' || rawStatus === 'listening' || rawStatus === 'in progress') {
        status = 'reading';
      }

      const rating = clampRating(getCell(row, 'my rating', 'rating'));
      const series = getCell(row, 'series', 'series name') || undefined;
      const publishYearRaw = Number(getCell(row, 'release year', 'year published', 'year'));
      const publishYear =
        Number.isFinite(publishYearRaw) && publishYearRaw >= 1000 && publishYearRaw <= 2100
          ? Math.round(publishYearRaw)
          : undefined;

      books.push({
        id: generateId('book'),
        profileId: targetProfileId,
        shelfIds: [shelf.id],
        title,
        author,
        isbn,
        publishYear,
        publisher: getCell(row, 'publisher') || undefined,
        language: getCell(row, 'language') || 'English',
        pageCount: 0,
        currentPage: 0,
        progressUnit: 'duration',
        totalMinutes: totalMinutes > 0 ? totalMinutes : undefined,
        currentMinutes: status === 'finished' && totalMinutes > 0 ? totalMinutes : 0,
        coverUrl:
          sanitizeCoverUrl(getCell(row, 'cover', 'cover url')) ||
          (isbn ? buildOpenLibraryCoverByIsbn(isbn, 'L') : undefined),
        format: 'audiobook',
        ownership: 'owned',
        status,
        rating,
        dateFinished,
        series,
        notes: [
          narrator ? `Narrated by ${narrator}` : '',
          asin ? `Audible ASIN: ${asin}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        tags: ['audible'],
        addedAt: dateAdded ? `${dateAdded}T12:00:00.000Z` : now,
        updatedAt: now,
      });
    }
  }

  if (books.length === 0) {
    warnings.push('No valid Audible book rows found in CSV.');
  }

  return {
    format: 'audible-csv',
    formatLabel: 'Audible Library / Listening CSV',
    filename,
    summaryCounts: {
      profiles: 0,
      shelves: books.length > 0 ? 1 : 0,
      books: books.length,
      readingLogs: readingLogs.length,
    },
    duplicateCount: findDuplicateCount(books, existingProfileBooks),
    warnings,
    profileBundle: {
      shelves: books.length > 0 ? [shelf] : [],
      books,
      readingLogs,
    },
  };
}

function parseGoodreadsOrStoryGraphCsv(
  rows: string[][],
  colIndex: Map<string, number>,
  filename: string,
  existingProfileBooks: Book[],
  targetProfileId: string,
): ImportPreview {
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
      warnings: ['Could not detect Goodreads, StoryGraph, Audible, or Libby columns.'],
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

    const rawReview = getCell(row, 'my review', 'review').replace(/<br\s*\/?>/gi, '\n').trim();
    const privateNotes = getCell(row, 'private notes').trim();

    const review = status === 'finished' && rawReview ? rawReview : undefined;
    const combinedNotes = (
      review ? privateNotes : [rawReview, privateNotes].filter(Boolean).join('\n\n')
    ).trim();

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
      language: 'English',
      pageCount,
      currentPage: status === 'finished' ? pageCount : 0,
      coverUrl: isbn ? buildOpenLibraryCoverByIsbn(isbn, 'L') : undefined,
      format,
      status,
      rating,
      dateFinished,
      review,
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

function inspectCsvImportFile(
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

  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  const colIndex = new Map<string, number>();
  headers.forEach((h, i) => colIndex.set(h, i));

  const isGoodreadsOrStoryGraph =
    colIndex.has('exclusive shelf') ||
    colIndex.has('read status') ||
    colIndex.has('star rating') ||
    colIndex.has('isbn/uid');

  const isLibbyCsv =
    !isGoodreadsOrStoryGraph &&
    colIndex.has('title') &&
    (colIndex.has('library') || colIndex.has('library name')) &&
    (colIndex.has('activity') ||
      colIndex.has('timestamp') ||
      colIndex.has('borrow date') ||
      colIndex.has('borrowdate'));

  if (isLibbyCsv) {
    return parseLibbyCsv(rows, colIndex, filename, existingProfileBooks, targetProfileId);
  }

  const isAudibleListeningCsv =
    colIndex.has('listening duration (milliseconds)') ||
    colIndex.has('event duration milliseconds') ||
    colIndex.has('duration milliseconds') ||
    colIndex.has('listening duration (seconds)') ||
    (colIndex.has('start date') &&
      (colIndex.has('book title') || colIndex.has('product name') || colIndex.has('asin')));

  const isAudibleLibraryCsv =
    !isGoodreadsOrStoryGraph &&
    (colIndex.has('book title') || colIndex.has('title') || colIndex.has('product name')) &&
    (colIndex.has('narrator') ||
      colIndex.has('narrators') ||
      colIndex.has('asin') ||
      ((colIndex.has('length') || colIndex.has('runtime') || colIndex.has('listening time')) &&
        !colIndex.has('bookshelves')));

  if (isAudibleListeningCsv || isAudibleLibraryCsv) {
    return parseAudibleCsv(rows, colIndex, filename, existingProfileBooks, targetProfileId);
  }

  return parseGoodreadsOrStoryGraphCsv(
    rows,
    colIndex,
    filename,
    existingProfileBooks,
    targetProfileId,
  );
}

export function inspectImportFile(
  filename: string,
  rawText: string,
  currentDb: BookLibraryDatabase,
  activeProfileId: string | null,
): ImportPreview {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  const existingProfileBooks = activeProfileId
    ? currentDb.books.filter((b) => b.profileId === activeProfileId && !b.deletedAt)
    : [];
  const targetProfileId = activeProfileId || 'imported-profile';

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;

        if (
          obj.schemaVersion === 4 &&
          Array.isArray(obj.profiles) &&
          Array.isArray(obj.books)
        ) {
          const householdDb = parsed as BookLibraryDatabase;
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
          (obj.kind === 'booklibrary-profile-v4' ||
            obj.kind === 'omnilibrary-profile-v4' ||
            obj.schemaVersion === 4) &&
          obj.profile &&
          Array.isArray(obj.books)
        ) {
          const bundle = parsed as ProfileExportEnvelope;
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

        if (Array.isArray(obj.libraries)) {
          return parseV3LegacyJson(
            parsed as { libraries: LegacyV3Library[] },
            filename,
            existingProfileBooks,
            targetProfileId,
          );
        }
      }

      if (isLibbyTimelineJson(parsed)) {
        return parseLibbyTimelineJson(parsed, filename, existingProfileBooks, targetProfileId);
      }

      return {
        format: 'unknown',
        formatLabel: 'Unrecognized JSON file',
        filename,
        summaryCounts: { profiles: 0, shelves: 0, books: 0, readingLogs: 0 },
        duplicateCount: 0,
        warnings: ['JSON did not match BookLibrary, Libby Timeline, or legacy v3 schema.'],
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

  if (
    trimmed.includes('==========') &&
    (/Your Highlight/i.test(trimmed) ||
      /Your Note/i.test(trimmed) ||
      /Your Bookmark/i.test(trimmed) ||
      /Added on /i.test(trimmed))
  ) {
    return parseKindleClippings(rawText, filename, existingProfileBooks, targetProfileId);
  }

  return inspectCsvImportFile(rawText, filename, existingProfileBooks, targetProfileId);
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
