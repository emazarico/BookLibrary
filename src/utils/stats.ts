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

export interface FinishedOccurrence {
  dateFinished?: string;
  startedAt?: string;
  rating?: number;
  cycleIndex: number;
  isHistorical: boolean;
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

/**
 * Returns every completed read for a book (active finished state + historical re-read spans),
 * deduplicating any historical span whose finishedAt matches the currently active dateFinished.
 */
export function getBookFinishedOccurrences(book: Book): FinishedOccurrence[] {
  const history = Array.isArray(book.readHistory) ? book.readHistory : [];
  const occurrences: FinishedOccurrence[] = [];

  history.forEach((span, idx) => {
    if (!span.finishedAt) return;
    if (
      book.status === 'finished' &&
      book.dateFinished &&
      span.finishedAt === book.dateFinished
    ) {
      return;
    }
    occurrences.push({
      dateFinished: span.finishedAt,
      startedAt: span.startedAt,
      rating: span.rating && span.rating > 0 ? span.rating : undefined,
      cycleIndex: idx + 1,
      isHistorical: true,
    });
  });

  if (book.status === 'finished') {
    occurrences.push({
      dateFinished: book.dateFinished,
      startedAt: book.dateStarted,
      rating: book.rating > 0 ? book.rating : undefined,
      cycleIndex: history.length + 1,
      isHistorical: false,
    });
  }

  return occurrences;
}

export function getAvailableYears(books: Book[], logs: ReadingLog[]): number[] {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const b of books) {
    if (b.deletedAt) continue;
    const fin = parseYearMonth(b.dateFinished);
    if (fin) years.add(fin.year);
    const start = parseYearMonth(b.dateStarted);
    if (start) years.add(start.year);
    for (const span of b.readHistory || []) {
      const hFin = parseYearMonth(span.finishedAt);
      if (hFin) years.add(hFin.year);
      const hStart = parseYearMonth(span.startedAt);
      if (hStart) years.add(hStart.year);
    }
  }
  for (const l of logs) {
    if (l.deletedAt) continue;
    const ym = parseYearMonth(l.date);
    if (ym) years.add(ym.year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

function buildLoggedPagesByBookCycle(activeLogs: ReadingLog[]): {
  totalByBook: Map<string, number>;
  byBookAndCycle: Map<string, number>;
} {
  const totalByBook = new Map<string, number>();
  const byBookAndCycle = new Map<string, number>();

  for (const log of activeLogs) {
    const pages = Math.max(0, log.pagesRead || 0);
    totalByBook.set(log.bookId, (totalByBook.get(log.bookId) ?? 0) + pages);
    if (log.readCycle && log.readCycle > 0) {
      const key = `${log.bookId}::${log.readCycle}`;
      byBookAndCycle.set(key, (byBookAndCycle.get(key) ?? 0) + pages);
    }
  }

  return { totalByBook, byBookAndCycle };
}

function getLoggedPagesForOccurrence(
  book: Book,
  occ: FinishedOccurrence,
  totals: { totalByBook: Map<string, number>; byBookAndCycle: Map<string, number> },
): number {
  const cycleKey = `${book.id}::${occ.cycleIndex}`;
  if (totals.byBookAndCycle.has(cycleKey)) {
    return totals.byBookAndCycle.get(cycleKey) ?? 0;
  }
  if (occ.isHistorical) {
    return 0;
  }
  // Primary read with legacy logs lacking explicit readCycle
  const totalAll = totals.totalByBook.get(book.id) ?? 0;
  const historyLen = book.readHistory?.length ?? 0;
  if (historyLen === 0) return totalAll;
  let explicitOtherCycles = 0;
  for (let c = 1; c <= historyLen; c++) {
    explicitOtherCycles += totals.byBookAndCycle.get(`${book.id}::${c}`) ?? 0;
  }
  return Math.max(0, totalAll - explicitOtherCycles);
}

/**
 * Computes 12 monthly buckets for a given calendar year.
 * Guards against double-counting: each book's active ReadingLogs are summed across all dates,
 * and finished-book page backfill only adds `max(0, pageCount - totalLoggedForCycle)` to `dateFinished`'s month.
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
  const logTotals = buildLoggedPagesByBookCycle(activeLogs);

  for (const log of activeLogs) {
    const pages = Math.max(0, log.pagesRead || 0);
    const ym = parseYearMonth(log.date);
    if (ym && ym.year === year) {
      const bucket = buckets[ym.month];
      bucket.loggedPages += pages;
      bucket.pagesRead += pages;
      bucket.sessionCount += 1;
    }
  }

  for (const book of activeBooks) {
    for (const occ of getBookFinishedOccurrences(book)) {
      const fin = parseYearMonth(occ.dateFinished);
      if (!fin || fin.year !== year) continue;

      const bucket = buckets[fin.month];
      bucket.booksFinished += 1;

      if (includeBackfill && book.pageCount > 0) {
        const loggedForCycle = getLoggedPagesForOccurrence(book, occ, logTotals);
        const remaining = Math.max(0, book.pageCount - loggedForCycle);
        if (remaining > 0) {
          bucket.backfillPages += remaining;
          bucket.pagesRead += remaining;
        }
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
    logs
      .filter(
        (l) =>
          !l.deletedAt &&
          l.date &&
          ((l.pagesRead || 0) > 0 || (l.chaptersRead ?? 0) > 0 || (l.minutesListened ?? 0) > 0),
      )
      .map((l) => l.date.slice(0, 10)),
  );
  if (activeDates.size === 0) return 0;

  const cursor = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
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
  const logTotals = buildLoggedPagesByBookCycle(activeLogs);

  const occurrencesInScope: Array<{ book: Book; occ: FinishedOccurrence }> = [];
  for (const book of activeBooks) {
    for (const occ of getBookFinishedOccurrences(book)) {
      if (yearFilter !== 'all') {
        const fin = parseYearMonth(occ.dateFinished);
        if (!fin || fin.year !== yearFilter) continue;
      }
      occurrencesInScope.push({ book, occ });
    }
  }

  const logsInScope = activeLogs.filter((l) => {
    if (yearFilter === 'all') return true;
    const ym = parseYearMonth(l.date);
    return ym !== null && ym.year === yearFilter;
  });

  const loggedPages = logsInScope.reduce((sum, l) => sum + Math.max(0, l.pagesRead || 0), 0);

  let backfillPages = 0;
  if (includeBackfill) {
    for (const { book, occ } of occurrencesInScope) {
      if (book.pageCount > 0) {
        const loggedForCycle = getLoggedPagesForOccurrence(book, occ, logTotals);
        backfillPages += Math.max(0, book.pageCount - loggedForCycle);
      }
    }
  }

  const ratedOccurrences = occurrencesInScope.filter(({ occ }) => (occ.rating ?? 0) > 0);
  const averageRating =
    ratedOccurrences.length > 0
      ? Number(
          (
            ratedOccurrences.reduce((s, { occ }) => s + (occ.rating ?? 0), 0) /
            ratedOccurrences.length
          ).toFixed(2),
        )
      : 0;

  const pagedOccurrences = occurrencesInScope.filter(({ book }) => book.pageCount > 0);
  const averagePagesPerBook =
    pagedOccurrences.length > 0
      ? Math.round(
          pagedOccurrences.reduce((s, { book }) => s + book.pageCount, 0) /
            pagedOccurrences.length,
        )
      : 0;

  // Current calendar month pages (respecting backfill setting)
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth();
  const currentYearBuckets = computeMonthlyStats(
    activeBooks,
    activeLogs,
    currentYear,
    includeBackfill,
  );
  const currentMonthPages = currentYearBuckets[currentMonth]?.pagesRead ?? 0;

  const activeDaysSet = new Set(logsInScope.map((l) => l.date.slice(0, 10)).filter(Boolean));

  return {
    booksFinished: occurrencesInScope.length,
    currentlyReadingCount: activeBooks.filter((b) => b.status === 'reading').length,
    totalPages: loggedPages + backfillPages,
    loggedPages,
    backfillPages,
    currentMonthPages,
    averageRating,
    ratedBooksCount: ratedOccurrences.length,
    averagePagesPerBook,
    activeReadingDays: activeDaysSet.size,
    currentDailyStreak: computeDailyStreak(activeLogs, referenceDate),
  };
}

/**
 * Groups finished reads (including historical re-read spans) chronologically by YYYY-MM descending.
 */
export function buildTimelineGroups(
  books: Book[],
  yearFilter: number | 'all',
): TimelineMonthGroup[] {
  const groupMap = new Map<string, TimelineMonthGroup>();

  for (const book of books) {
    if (book.deletedAt) continue;
    for (const occ of getBookFinishedOccurrences(book)) {
      const fin = parseYearMonth(occ.dateFinished);
      if (yearFilter !== 'all' && (!fin || fin.year !== yearFilter)) continue;

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

      if (!group.books.some((existing) => existing.id === book.id)) {
        group.books.push(book);
      }
      group.totalPages += Math.max(0, book.pageCount || 0);
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    b.monthKey.localeCompare(a.monthKey),
  );
  for (const group of groups) {
    group.books.sort((a, b) =>
      (b.dateFinished || b.updatedAt).localeCompare(a.dateFinished || a.updatedAt),
    );
  }
  return groups;
}
