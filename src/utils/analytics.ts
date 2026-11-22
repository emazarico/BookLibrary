import type { Book, BookFormat, ReadingLog } from '../types/library';
import { getBookFinishedOccurrences, parseYearMonth } from './stats';

export interface HeatmapDay {
  date: string;
  inRange: boolean;
  pages: number;
  chapters: number;
  minutes: number;
  sessions: number;
  finishedBooks: number;
  score: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface HeatmapMonthLabel {
  weekIndex: number;
  label: string;
}

export interface HeatmapData {
  startDate: string;
  endDate: string;
  weeks: HeatmapDay[][];
  monthLabels: HeatmapMonthLabel[];
  totalActiveDays: number;
  longestStreak: number;
  totalSessions: number;
  maxDailyScore: number;
}

export interface FormatSlice {
  format: BookFormat;
  label: string;
  count: number;
  percent: number;
  color: string;
}

export interface TagBreakdownItem {
  tag: string;
  count: number;
  percent: number;
}

export interface RatingBucket {
  stars: 1 | 2 | 3 | 4 | 5;
  label: string;
  count: number;
  percent: number;
}

export interface ReadingPaceStats {
  booksPerMonth: number;
  pagesPerActiveDay: number;
  avgDaysToFinish: number | null;
  totalAudioHours: number;
}

export interface AnalyticsBreakdown {
  scopeLabel: 'finished reads' | 'all books';
  totalBooksEvaluated: number;
  formatBreakdown: FormatSlice[];
  topTags: TagBreakdownItem[];
  ratingDistribution: RatingBucket[];
  pace: ReadingPaceStats;
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

const IGNORED_TAGS = new Set([
  'wishlist',
  'audiobook',
  'ebook',
  'favorite',
  'favorites',
  're-read',
]);

function parseIsoDayUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

function formatUtcDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatLocalDayAsIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_MS = 86_400_000;

export function buildDailyActivityHeatmap(
  books: Book[],
  logs: ReadingLog[],
  yearFilter: number | 'all',
  referenceDate: Date = new Date(),
): HeatmapData {
  const startDate =
    typeof yearFilter === 'number'
      ? `${yearFilter}-01-01`
      : formatUtcDay(
          (parseIsoDayUtc(formatLocalDayAsIso(referenceDate)) ?? Date.UTC(2026, 0, 1)) -
            364 * DAY_MS,
        );
  const endDate =
    typeof yearFilter === 'number'
      ? `${yearFilter}-12-31`
      : formatLocalDayAsIso(referenceDate);

  const startMs = parseIsoDayUtc(startDate) ?? Date.UTC(2026, 0, 1);
  const endMs = parseIsoDayUtc(endDate) ?? startMs + 364 * DAY_MS;

  const dailyMap = new Map<
    string,
    { pages: number; chapters: number; minutes: number; sessions: number; finishedBooks: number }
  >();

  const ensureDay = (iso: string) => {
    let entry = dailyMap.get(iso);
    if (!entry) {
      entry = { pages: 0, chapters: 0, minutes: 0, sessions: 0, finishedBooks: 0 };
      dailyMap.set(iso, entry);
    }
    return entry;
  };

  let totalSessions = 0;
  for (const log of logs) {
    if (log.deletedAt || !log.date) continue;
    const dayIso = log.date.slice(0, 10);
    if (dayIso < startDate || dayIso > endDate) continue;
    const entry = ensureDay(dayIso);
    entry.pages += Math.max(0, log.pagesRead || 0);
    entry.chapters += Math.max(0, log.chaptersRead || 0);
    entry.minutes += Math.max(0, log.minutesListened || 0);
    entry.sessions += 1;
    totalSessions += 1;
  }

  for (const book of books) {
    if (book.deletedAt) continue;
    for (const occ of getBookFinishedOccurrences(book)) {
      const finIso = occ.dateFinished?.slice(0, 10);
      if (!finIso || finIso < startDate || finIso > endDate) continue;
      ensureDay(finIso).finishedBooks += 1;
    }
  }

  let maxDailyScore = 0;
  let totalActiveDays = 0;
  let longestStreak = 0;
  let currentRun = 0;

  const scoreByDay = new Map<string, number>();
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const iso = formatUtcDay(ms);
    const rec = dailyMap.get(iso);
    const score = rec
      ? rec.pages +
        rec.chapters * 15 +
        Math.round(rec.minutes * 0.8) +
        rec.finishedBooks * 30
      : 0;
    if (score > 0) {
      scoreByDay.set(iso, score);
      totalActiveDays += 1;
      currentRun += 1;
      if (currentRun > longestStreak) longestStreak = currentRun;
      if (score > maxDailyScore) maxDailyScore = score;
    } else {
      currentRun = 0;
    }
  }

  const startDow = new Date(startMs).getUTCDay();
  const endDow = new Date(endMs).getUTCDay();
  const gridStartMs = startMs - startDow * DAY_MS;
  const gridEndMs = endMs + (6 - endDow) * DAY_MS;

  const weeks: HeatmapDay[][] = [];
  const monthLabels: HeatmapMonthLabel[] = [];
  let lastLabeledMonth = -1;
  let lastLabeledWeek = -10;

  let currentWeek: HeatmapDay[] = [];
  for (let ms = gridStartMs; ms <= gridEndMs; ms += DAY_MS) {
    const d = new Date(ms);
    const iso = formatUtcDay(ms);
    const inRange = ms >= startMs && ms <= endMs;
    const rec = inRange ? dailyMap.get(iso) : undefined;
    const score = inRange ? scoreByDay.get(iso) ?? 0 : 0;

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (score > 0 && maxDailyScore > 0) {
      const ratio = score / maxDailyScore;
      if (ratio >= 0.75) level = 4;
      else if (ratio >= 0.45) level = 3;
      else if (ratio >= 0.2) level = 2;
      else level = 1;
    }

    if (inRange) {
      const month = d.getUTCMonth();
      const dayOfMonth = d.getUTCDate();
      const weekIndex = weeks.length;
      if (month !== lastLabeledMonth && (dayOfMonth <= 7 || weekIndex === 0)) {
        if (weekIndex - lastLabeledWeek >= 2) {
          monthLabels.push({ weekIndex, label: MONTH_SHORT[month] });
          lastLabeledMonth = month;
          lastLabeledWeek = weekIndex;
        }
      }
    }

    currentWeek.push({
      date: iso,
      inRange,
      pages: rec?.pages ?? 0,
      chapters: rec?.chapters ?? 0,
      minutes: rec?.minutes ?? 0,
      sessions: rec?.sessions ?? 0,
      finishedBooks: rec?.finishedBooks ?? 0,
      score,
      level,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return {
    startDate,
    endDate,
    weeks,
    monthLabels,
    totalActiveDays,
    longestStreak,
    totalSessions,
    maxDailyScore,
  };
}

export function computeAnalyticsBreakdown(
  books: Book[],
  logs: ReadingLog[],
  yearFilter: number | 'all',
  referenceDate: Date = new Date(),
): AnalyticsBreakdown {
  const activeBooks = books.filter((b) => !b.deletedAt);
  const activeLogs = logs.filter((l) => !l.deletedAt);

  const occurrencesInScope: Array<{
    book: Book;
    dateFinished?: string;
    startedAt?: string;
    rating?: number;
  }> = [];

  for (const book of activeBooks) {
    for (const occ of getBookFinishedOccurrences(book)) {
      if (yearFilter !== 'all') {
        const fin = parseYearMonth(occ.dateFinished);
        if (!fin || fin.year !== yearFilter) continue;
      }
      occurrencesInScope.push({
        book,
        dateFinished: occ.dateFinished,
        startedAt: occ.startedAt,
        rating: occ.rating,
      });
    }
  }

  const hasFinishes = occurrencesInScope.length > 0;
  const scopeLabel: 'finished reads' | 'all books' = hasFinishes
    ? 'finished reads'
    : 'all books';

  const evaluatedItems = hasFinishes
    ? occurrencesInScope.map((o) => ({
        book: o.book,
        rating: o.rating ?? (o.book.rating > 0 ? o.book.rating : 0),
      }))
    : activeBooks.map((book) => ({
        book,
        rating: book.rating > 0 ? book.rating : 0,
      }));

  const totalEvaluated = evaluatedItems.length;

  // Format Breakdown
  const formatCounts: Record<BookFormat, number> = {
    physical: 0,
    ebook: 0,
    audiobook: 0,
  };
  for (const { book } of evaluatedItems) {
    const fmt: BookFormat = book.format || 'physical';
    formatCounts[fmt] = (formatCounts[fmt] ?? 0) + 1;
  }

  const formatBreakdown: FormatSlice[] = (
    [
      { format: 'physical', label: 'Print', color: '#d97706' },
      { format: 'ebook', label: 'E-book', color: '#0891b2' },
      { format: 'audiobook', label: 'Audiobook', color: '#7c3aed' },
    ] as const
  ).map((item) => {
    const count = formatCounts[item.format];
    return {
      ...item,
      count,
      percent: totalEvaluated > 0 ? Math.round((count / totalEvaluated) * 100) : 0,
    };
  });

  // Top Topic Tags
  const tagCounts = new Map<string, number>();
  for (const { book } of evaluatedItems) {
    const seenOnBook = new Set<string>();
    for (const rawTag of book.tags) {
      const clean = rawTag.trim().toLowerCase();
      if (!clean || IGNORED_TAGS.has(clean) || seenOnBook.has(clean)) continue;
      seenOnBook.add(clean);
      tagCounts.set(clean, (tagCounts.get(clean) ?? 0) + 1);
    }
  }

  const topTags: TagBreakdownItem[] = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([tag, count]) => ({
      tag,
      count,
      percent: totalEvaluated > 0 ? Math.round((count / totalEvaluated) * 100) : 0,
    }));

  // Rating Distribution (on rated items in evaluated set)
  const ratingCounts: Record<1 | 2 | 3 | 4 | 5, number> = {
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  };
  let ratedTotal = 0;
  for (const item of evaluatedItems) {
    const r = item.rating;
    if (!r || r <= 0) continue;
    ratedTotal += 1;
    if (r >= 4.5) ratingCounts[5] += 1;
    else if (r >= 3.5) ratingCounts[4] += 1;
    else if (r >= 2.5) ratingCounts[3] += 1;
    else if (r >= 1.5) ratingCounts[2] += 1;
    else ratingCounts[1] += 1;
  }

  const ratingDistribution: RatingBucket[] = ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    label: `${stars}★`,
    count: ratingCounts[stars],
    percent: ratedTotal > 0 ? Math.round((ratingCounts[stars] / ratedTotal) * 100) : 0,
  }));

  // Reading Pace Metrics
  const logsInScope = activeLogs.filter((l) => {
    if (yearFilter === 'all') return true;
    const ym = parseYearMonth(l.date);
    return ym !== null && ym.year === yearFilter;
  });

  let monthsInScope = 1;
  if (typeof yearFilter === 'number') {
    monthsInScope =
      yearFilter === referenceDate.getFullYear() ? referenceDate.getMonth() + 1 : 12;
  } else {
    const monthKeys = new Set<string>();
    for (const o of occurrencesInScope) {
      const ym = parseYearMonth(o.dateFinished);
      if (ym) monthKeys.add(`${ym.year}-${String(ym.month + 1).padStart(2, '0')}`);
    }
    for (const l of logsInScope) {
      const ym = parseYearMonth(l.date);
      if (ym) monthKeys.add(`${ym.year}-${String(ym.month + 1).padStart(2, '0')}`);
    }
    if (monthKeys.size > 0) {
      const sorted = Array.from(monthKeys).sort();
      const first = parseYearMonth(`${sorted[0]}-01`);
      const last = parseYearMonth(`${sorted[sorted.length - 1]}-01`);
      if (first && last) {
        monthsInScope = Math.max(
          1,
          (last.year - first.year) * 12 + (last.month - first.month) + 1,
        );
      }
    }
  }

  const booksPerMonth = Number(
    (occurrencesInScope.length / Math.max(1, monthsInScope)).toFixed(1),
  );

  const logActiveDays = new Set<string>();
  let totalLoggedPages = 0;
  let totalAudioMinutes = 0;
  const audioLoggedBookIds = new Set<string>();
  for (const log of logsInScope) {
    if (log.date && (log.pagesRead || 0) > 0) {
      logActiveDays.add(log.date.slice(0, 10));
      totalLoggedPages += Math.max(0, log.pagesRead || 0);
    }
    if ((log.minutesListened ?? 0) > 0) {
      totalAudioMinutes += log.minutesListened ?? 0;
      audioLoggedBookIds.add(log.bookId);
    }
  }
  for (const occ of occurrencesInScope) {
    if (
      occ.book.format === 'audiobook' &&
      (occ.book.totalMinutes ?? 0) > 0 &&
      !audioLoggedBookIds.has(occ.book.id)
    ) {
      totalAudioMinutes += occ.book.totalMinutes ?? 0;
    }
  }

  const pagesPerActiveDay =
    logActiveDays.size > 0 ? Math.round(totalLoggedPages / logActiveDays.size) : 0;

  let totalDurationDays = 0;
  let durationCount = 0;
  for (const occ of occurrencesInScope) {
    if (!occ.startedAt || !occ.dateFinished) continue;
    const startMs = parseIsoDayUtc(occ.startedAt);
    const endMs = parseIsoDayUtc(occ.dateFinished);
    if (startMs !== null && endMs !== null && endMs >= startMs) {
      const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1);
      totalDurationDays += days;
      durationCount += 1;
    }
  }
  const avgDaysToFinish =
    durationCount > 0 ? Math.round(totalDurationDays / durationCount) : null;

  const totalAudioHours = Math.round((totalAudioMinutes / 60) * 10) / 10;

  return {
    scopeLabel,
    totalBooksEvaluated: totalEvaluated,
    formatBreakdown,
    topTags,
    ratingDistribution,
    pace: {
      booksPerMonth,
      pagesPerActiveDay,
      avgDaysToFinish,
      totalAudioHours,
    },
  };
}
