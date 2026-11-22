import { describe, expect, it } from 'vitest';
import type { Book, ReadingLog } from '../types/library';
import {
  buildDailyActivityHeatmap,
  computeAnalyticsBreakdown,
} from '../utils/analytics';

function makeBook(id: string, overrides: Partial<Book> = {}): Book {
  return {
    id,
    profileId: 'p1',
    shelfIds: [],
    title: `Book ${id}`,
    author: 'Author',
    pageCount: 300,
    currentPage: 300,
    format: 'physical',
    status: 'finished',
    rating: 4.5,
    notes: '',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLog(
  id: string,
  bookId: string,
  date: string,
  overrides: Partial<ReadingLog> = {},
): ReadingLog {
  return {
    id,
    profileId: 'p1',
    bookId,
    date,
    pagesRead: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('reading heatmap (P2.2) & breakdown analytics (P2.3)', () => {
  it('builds 365-day trailing heatmap when yearFilter is "all" and full-year grid for specific years', () => {
    const books: Book[] = [
      makeBook('b1', {
        dateFinished: '2026-05-03',
        readHistory: [{ id: 's1', startedAt: '2025-11-01', finishedAt: '2025-11-12', rating: 4 }],
      }),
    ];
    const logs: ReadingLog[] = [
      makeLog('l1', 'b1', '2026-05-01', { pagesRead: 40 }),
      makeLog('l2', 'b1', '2026-05-02', { pagesRead: 0, chaptersRead: 2 }),
      makeLog('l3', 'b1', '2026-05-03', { pagesRead: 80, minutesListened: 30 }),
      makeLog('l4', 'b1', '2026-05-04', { pagesRead: 25 }),
      makeLog('l5', 'b1', '2025-11-12', { pagesRead: 50 }),
    ];

    const ref = new Date(2026, 4, 10); // May 10, 2026
    const allHeatmap = buildDailyActivityHeatmap(books, logs, 'all', ref);

    expect(allHeatmap.endDate).toBe('2026-05-10');
    const inRangeDays = allHeatmap.weeks.flat().filter((d) => d.inRange);
    expect(inRangeDays).toHaveLength(365);
    expect(allHeatmap.longestStreak).toBe(4);
    expect(allHeatmap.totalActiveDays).toBe(5); // Nov 12 + May 1..4
    expect(allHeatmap.weeks.every((w) => w.length === 7)).toBe(true);

    const may3 = inRangeDays.find((d) => d.date === '2026-05-03')!;
    // score: 80 + 0 + round(30*0.8)=24 + 1*30 = 134 -> level 4 (maxDailyScore)
    expect(may3.score).toBe(134);
    expect(may3.level).toBe(4);
    expect(may3.finishedBooks).toBe(1);

    const year2026Heatmap = buildDailyActivityHeatmap(books, logs, 2026, ref);
    expect(year2026Heatmap.startDate).toBe('2026-01-01');
    expect(year2026Heatmap.endDate).toBe('2026-12-31');
    expect(year2026Heatmap.totalActiveDays).toBe(4); // May 1..4 only
  });

  it('computes format percentages, top non-meta tags, rating buckets, and pace stats', () => {
    const books: Book[] = [
      makeBook('b1', {
        format: 'physical',
        rating: 5,
        dateStarted: '2026-01-01',
        dateFinished: '2026-01-10', // 10 days inclusive
        tags: ['sci-fi', 'space', 'wishlist', 'favorite'],
      }),
      makeBook('b2', {
        format: 'audiobook',
        totalMinutes: 600,
        rating: 4,
        dateStarted: '2026-02-01',
        dateFinished: '2026-02-19', // 19 days inclusive
        tags: ['sci-fi', 'audiobook'],
      }),
      makeBook('b3', {
        format: 'ebook',
        rating: 3,
        dateStarted: '2026-03-01',
        dateFinished: '2026-03-01', // same-day finish -> 1 day
        tags: ['mystery'],
      }),
    ];

    const logs: ReadingLog[] = [
      makeLog('l1', 'b1', '2026-01-05', { pagesRead: 100 }),
      makeLog('l2', 'b1', '2026-01-06', { pagesRead: 200 }),
      makeLog('l3', 'b2', '2026-02-04', { pagesRead: 0, minutesListened: 180 }),
    ];

    const breakdown = computeAnalyticsBreakdown(books, logs, 2026, new Date(2026, 2, 20));
    expect(breakdown.scopeLabel).toBe('finished reads');
    expect(breakdown.totalBooksEvaluated).toBe(3);

    const byFmt = new Map(breakdown.formatBreakdown.map((f) => [f.format, f]));
    expect(byFmt.get('physical')?.count).toBe(1);
    expect(byFmt.get('audiobook')?.count).toBe(1);
    expect(byFmt.get('ebook')?.count).toBe(1);

    // Excludes 'wishlist', 'audiobook', 'favorite'
    expect(breakdown.topTags.map((t) => [t.tag, t.count])).toEqual([
      ['sci-fi', 2],
      ['mystery', 1],
      ['space', 1],
    ]);

    const ratingMap = new Map(breakdown.ratingDistribution.map((r) => [r.stars, r.count]));
    expect(ratingMap.get(5)).toBe(1);
    expect(ratingMap.get(4)).toBe(1);
    expect(ratingMap.get(3)).toBe(1);

    // Pace: 3 finished / 3 months (Jan-Mar 2026) = 1.0 books/mo
    // 300 logged pages / 2 active page days = 150 pages/day
    // avg days = round((10 + 19 + 1) / 3) = 10 days
    // audio logged = 180 mins -> 3.0h (not backfilled since b2 has audio logs)
    expect(breakdown.pace).toEqual({
      booksPerMonth: 1,
      pagesPerActiveDay: 150,
      avgDaysToFinish: 10,
      totalAudioHours: 3,
    });
  });
});
