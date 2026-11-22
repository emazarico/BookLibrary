import type { Book, ReadingLog } from '../types/library';
import { computeDailyStreak, computeReadingSummary } from './stats';

export interface ReadingBadgeDefinition {
  id: string;
  title: string;
  description: string;
  emoji: string;
  target: number;
  unitLabel: string;
}

export interface ReadingBadge extends ReadingBadgeDefinition {
  current: number;
  unlocked: boolean;
  progressPct: number;
  rewardNote?: string;
}

export const READING_BADGE_DEFINITIONS: ReadingBadgeDefinition[] = [
  {
    id: 'first-finish',
    emoji: '🎉',
    title: 'First Finish',
    description: 'Finish your very first book.',
    target: 1,
    unitLabel: 'book',
  },
  {
    id: 'bookworm-5',
    emoji: '🐛',
    title: 'Bookworm',
    description: 'Finish 5 books across your library.',
    target: 5,
    unitLabel: 'books',
  },
  {
    id: 'library-legend-12',
    emoji: '🏆',
    title: 'Library Legend',
    description: 'Finish 12 books across your library.',
    target: 12,
    unitLabel: 'books',
  },
  {
    id: 'page-turner-1000',
    emoji: '🗺️',
    title: '1,000-Page Explorer',
    description: 'Read 1,000 total pages (logged + finished books).',
    target: 1000,
    unitLabel: 'pages',
  },
  {
    id: 'audiobook-explorer',
    emoji: '🎧',
    title: 'Audio Adventurer',
    description: 'Start or finish an audiobook or log audio listening.',
    target: 1,
    unitLabel: 'audiobook',
  },
  {
    id: 'streak-5',
    emoji: '🔥',
    title: '5-Day Streak',
    description: 'Log reading activity 5 days in a row.',
    target: 5,
    unitLabel: 'days',
  },
  {
    id: 'critic-3',
    emoji: '✍️',
    title: 'Book Critic',
    description: 'Write 3 final book reviews.',
    target: 3,
    unitLabel: 'reviews',
  },
  {
    id: 'genre-explorer',
    emoji: '🧭',
    title: 'Genre Explorer',
    description: 'Finish books across 4 distinct topic tags.',
    target: 4,
    unitLabel: 'tags',
  },
  {
    id: 'series-finisher',
    emoji: '📚',
    title: 'Series Champion',
    description: 'Finish 2 or more books in the same series.',
    target: 2,
    unitLabel: 'books in a series',
  },
];

const IGNORED_GENRE_TAGS = new Set([
  'wishlist',
  'audiobook',
  'ebook',
  'favorite',
  'favorites',
  're-read',
]);

function parseDayNumberUtc(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function computeBestLogStreak(logs: ReadingLog[], referenceDate: Date): number {
  const dayNumbers = Array.from(
    new Set(
      logs
        .filter(
          (l) =>
            !l.deletedAt &&
            l.date &&
            ((l.pagesRead || 0) > 0 ||
              (l.chaptersRead ?? 0) > 0 ||
              (l.minutesListened ?? 0) > 0),
        )
        .map((l) => parseDayNumberUtc(l.date))
        .filter((d): d is number => d !== null),
    ),
  ).sort((a, b) => a - b);

  let bestHistorical = 0;
  let run = 0;
  for (let i = 0; i < dayNumbers.length; i++) {
    if (i === 0 || dayNumbers[i] === dayNumbers[i - 1] + 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > bestHistorical) bestHistorical = run;
  }

  return Math.max(bestHistorical, computeDailyStreak(logs, referenceDate));
}

/**
 * Evaluates all kid-friendly reading milestones & optional parent-configured rewards.
 */
export function computeReadingBadges(
  books: Book[],
  logs: ReadingLog[],
  badgeRewards?: Record<string, string>,
  referenceDate: Date = new Date(),
): ReadingBadge[] {
  const activeBooks = books.filter((b) => !b.deletedAt);
  const activeLogs = logs.filter((l) => !l.deletedAt);

  const finishedBooks = activeBooks.filter((b) => b.status === 'finished');
  const finishedCount = finishedBooks.length;

  const totalPages = computeReadingSummary(
    activeBooks,
    activeLogs,
    'all',
    true,
    referenceDate,
  ).totalPages;

  const audiobookBooksCount = activeBooks.filter(
    (b) => b.format === 'audiobook' && (b.status === 'finished' || b.status === 'reading'),
  ).length;
  const hasAudioLog = activeLogs.some((l) => (l.minutesListened ?? 0) > 0);
  const audiobookProgress = audiobookBooksCount > 0 ? audiobookBooksCount : hasAudioLog ? 1 : 0;

  const bestStreak = computeBestLogStreak(activeLogs, referenceDate);

  const reviewsWritten = activeBooks.filter((b) => Boolean(b.review?.trim())).length;

  const distinctTags = new Set<string>();
  for (const b of finishedBooks) {
    for (const rawTag of b.tags) {
      const clean = rawTag.trim().toLowerCase();
      if (clean && !IGNORED_GENRE_TAGS.has(clean)) {
        distinctTags.add(clean);
      }
    }
  }

  const seriesCounts = new Map<string, number>();
  let maxSeriesFinished = 0;
  for (const b of finishedBooks) {
    const key = b.series?.trim().toLowerCase();
    if (!key) continue;
    const next = (seriesCounts.get(key) ?? 0) + 1;
    seriesCounts.set(key, next);
    if (next > maxSeriesFinished) maxSeriesFinished = next;
  }

  const metricById: Record<string, number> = {
    'first-finish': finishedCount,
    'bookworm-5': finishedCount,
    'library-legend-12': finishedCount,
    'page-turner-1000': totalPages,
    'audiobook-explorer': audiobookProgress,
    'streak-5': bestStreak,
    'critic-3': reviewsWritten,
    'genre-explorer': distinctTags.size,
    'series-finisher': maxSeriesFinished,
  };

  return READING_BADGE_DEFINITIONS.map((def) => {
    const current = Math.max(0, metricById[def.id] ?? 0);
    const unlocked = current >= def.target;
    const progressPct = Math.min(
      100,
      Math.round((Math.min(current, def.target) / def.target) * 100),
    );
    const rewardNote = badgeRewards?.[def.id]?.trim() || undefined;

    return {
      ...def,
      current,
      unlocked,
      progressPct,
      rewardNote,
    };
  });
}
