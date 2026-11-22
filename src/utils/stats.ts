import type { Book, ReadingLog } from '../types/library';

export interface MonthlyBucket {
  month: number; // 0..11
  label: string;
  monthKey: string; // YYYY-MM
  pagesRead: number;
  loggedPages: number;
  backfillPages: number;
  booksFinished: number;
  sessionCount: number;
}

export interface ReadingSummary {
  booksFinished: number;
  currentlyReadingCount: number;
  totalPages: number;
  loggedPages: number;
  backfillPages: number;
  currentMonthPages: number;
  averageRating: number;
  ratedBooksCount: number;
  averagePagesPerBook: number;
  activeReadingDays: number;
  currentDailyStreak: number;
}

export interface TimelineMonthGroup {
  monthKey: string; // YYYY-MM
  label: string;
  year: number;
  month: number;
  books: Book[];
  totalPages: number;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function parseYearMonth(dateStr?: string): { year: number; month: number } | null {
  if (!dateStr) return null;
  const match = /^(\d{4})-(\d{2})/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (!Number.isFinite(year) || month < 0 || month > 11) return null;
  return { year, month };
}

export function getAvailableYears(books: Book[], logs: ReadingLog[]): number[] {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const b of books) {
    if (b.deletedAt) continue;
    const fin = parseYearMonth(b.dateFinished);
    if (fin) years.add(fin.year);
    const start = parseYearMonth(b.dateStarted);
    if (start) years.add(start.year);
  }
  for (const l of logs) {
    if (l.deletedAt) continue;
    const ym = parseYearMonth(l.date);
    if (ym) years.add(ym.year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

/**
 * Computes 12 monthly buckets for a given calendar year.
 * Guards against double-counting: each book's active ReadingLogs are summed across all dates,
 * and finished-book page backfill only adds `max(0, pageCount - totalLoggedForBook)` to `dateFinished`'s month.
 */
export function computeMonthlyStats(
  books: Book[],
  logs: ReadingLog[],
  year: number,
  includeBackfill = true,
): MonthlyBucket[] {
  const buckets: MonthlyBucket[] = MONTH_SHORT.map((label, month) => ({
    month,
    label,
    monthKey: `${year}-${String(month + 1).padStart(2, '0')}`,
    pagesRead: 0,
    loggedPages: 0,
    backfillPages: 0,
    booksFinished: 0,
    sessionCount: 0,
  }));

  const activeLogs = logs.filter((l) => !l.deletedAt);
  const activeBooks = books.filter((b) => !b.deletedAt);

  const loggedByBook = new Map<string, number>();
  for (const log of activeLogs) {
    const pages = Math.max(0, log.pagesRead || 0);
    loggedByBook.set(log.bookId, (loggedByBook.get(log.bookId) ?? 0) + pages);

    const ym = parseYearMonth(log.date);
    if (ym && ym.year === year) {
      const bucket = buckets[ym.month];
      bucket.loggedPages += pages;
      bucket.pagesRead += pages;
      bucket.sessionCount += 1;
    }
  }

  for (const book of activeBooks) {
    if (book.status !== 'finished') continue;
    const fin = parseYearMonth(book.dateFinished);
    if (!fin || fin.year !== year) continue;

    const bucket = buckets[fin.month];
    bucket.booksFinished += 1;

    if (includeBackfill && book.pageCount > 0) {
      const loggedTotal = loggedByBook.get(book.id) ?? 0;
      const remaining = Math.max(0, book.pageCount - loggedTotal);
      if (remaining > 0) {
        bucket.backfillPages += remaining;
        bucket.pagesRead += remaining;
      }
    }
  }

  return buckets;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeDailyStreak(logs: ReadingLog[], referenceDate: Date = new Date()): number {
  const activeDates = new Set(
    logs.filter((l) => !l.deletedAt && l.pagesRead > 0 && l.date).map((l) => l.date.slice(0, 10)),
  );
  if (activeDates.size === 0) return 0;

  const cursor = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const todayIso = toIsoDate(cursor);
  if (!activeDates.has(todayIso)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!activeDates.has(toIsoDate(cursor))) {
      return 0;
    }
  }

  let streak = 0;
  while (activeDates.has(toIsoDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function computeReadingSummary(
  books: Book[],
  logs: ReadingLog[],
  yearFilter: number | 'all',
  includeBackfill = true,
  referenceDate: Date = new Date(),
): ReadingSummary {
  const activeBooks = books.filter((b) => !b.deletedAt);
  const activeLogs = logs.filter((l) => !l.deletedAt);

  const loggedByBook = new Map<string, number>();
  for (const log of activeLogs) {
    loggedByBook.set(log.bookId, (loggedByBook.get(log.bookId) ?? 0) + Math.max(0, log.pagesRead));
  }

  const finishedInScope = activeBooks.filter((b) => {
    if (b.status !== 'finished') return false;
    if (yearFilter === 'all') return true;
    const fin = parseYearMonth(b.dateFinished);
    return fin !== null && fin.year === yearFilter;
  });

  const logsInScope = activeLogs.filter((l) => {
    if (yearFilter === 'all') return true;
    const ym = parseYearMonth(l.date);
    return ym !== null && ym.year === yearFilter;
  });

  const loggedPages = logsInScope.reduce((sum, l) => sum + Math.max(0, l.pagesRead || 0), 0);

  let backfillPages = 0;
  if (includeBackfill) {
    for (const book of finishedInScope) {
      if (book.pageCount > 0) {
        const loggedTotal = loggedByBook.get(book.id) ?? 0;
        backfillPages += Math.max(0, book.pageCount - loggedTotal);
      }
    }
  }

  const ratedBooks = finishedInScope.filter((b) => b.rating > 0);
  const averageRating =
    ratedBooks.length > 0
      ? Number((ratedBooks.reduce((s, b) => s + b.rating, 0) / ratedBooks.length).toFixed(2))
      : 0;

  const pagedFinished = finishedInScope.filter((b) => b.pageCount > 0);
  const averagePagesPerBook =
    pagedFinished.length > 0
      ? Math.round(pagedFinished.reduce((s, b) => s + b.pageCount, 0) / pagedFinished.length)
      : 0;

  // Current calendar month pages (respecting backfill setting)
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth();
  const currentYearBuckets = computeMonthlyStats(activeBooks, activeLogs, currentYear, includeBackfill);
  const currentMonthPages = currentYearBuckets[currentMonth]?.pagesRead ?? 0;

  const activeDaysSet = new Set(logsInScope.map((l) => l.date.slice(0, 10)).filter(Boolean));

  return {
    booksFinished: finishedInScope.length,
    currentlyReadingCount: activeBooks.filter((b) => b.status === 'reading').length,
    totalPages: loggedPages + backfillPages,
    loggedPages,
    backfillPages,
    currentMonthPages,
    averageRating,
    ratedBooksCount: ratedBooks.length,
    averagePagesPerBook,
    activeReadingDays: activeDaysSet.size,
    currentDailyStreak: computeDailyStreak(activeLogs, referenceDate),
  };
}

/**
 * Groups finished books chronologically by YYYY-MM descending with monthly book and page totals.
 */
export function buildTimelineGroups(
  books: Book[],
  yearFilter: number | 'all',
): TimelineMonthGroup[] {
  const activeFinished = books.filter((b) => {
    if (b.deletedAt || b.status !== 'finished') return false;
    if (yearFilter === 'all') return true;
    const fin = parseYearMonth(b.dateFinished);
    return fin !== null && fin.year === yearFilter;
  });

  const groupMap = new Map<string, TimelineMonthGroup>();

  for (const book of activeFinished) {
    const fin = parseYearMonth(book.dateFinished);
    const monthKey = fin
      ? `${fin.year}-${String(fin.month + 1).padStart(2, '0')}`
      : '0000-00';

    let group = groupMap.get(monthKey);
    if (!group) {
      group = {
        monthKey,
        label: fin ? `${MONTH_LONG[fin.month]} ${fin.year}` : 'Date Unspecified',
        year: fin ? fin.year : 0,
        month: fin ? fin.month : -1,
        books: [],
        totalPages: 0,
      };
      groupMap.set(monthKey, group);
    }
    group.books.push(book);
    group.totalPages += Math.max(0, book.pageCount || 0);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  for (const group of groups) {
    group.books.sort((a, b) => (b.dateFinished || b.updatedAt).localeCompare(a.dateFinished || a.updatedAt));
  }
  return groups;
}
