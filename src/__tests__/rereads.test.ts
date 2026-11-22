import { describe, expect, it } from 'vitest';
import type { Book, ReadingLog } from '../types/library';
import {
  buildTimelineGroups,
  computeMonthlyStats,
  computeReadingSummary,
  getAvailableYears,
  getBookFinishedOccurrences,
} from '../utils/stats';

function makeRereadBook(): Book {
  return {
    id: 'b-reread',
    profileId: 'p1',
    shelfIds: [],
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    pageCount: 310,
    currentPage: 310,
    status: 'finished',
    rating: 5,
    dateStarted: '2026-04-01',
    dateFinished: '2026-04-20',
    readHistory: [
      {
        id: 'span-1',
        startedAt: '2024-07-01',
        finishedAt: '2024-07-15',
        rating: 4.5,
      },
      {
        id: 'span-2',
        startedAt: '2026-01-02',
        finishedAt: '2026-01-18',
        rating: 5,
      },
      // Duplicate of active finish date should be deduplicated
      {
        id: 'span-dup',
        startedAt: '2026-04-01',
        finishedAt: '2026-04-20',
        rating: 5,
      },
    ],
    notes: '',
    tags: ['fantasy'],
    addedAt: '2024-07-01T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
  };
}

describe('re-read history stats & timeline support (P2.4)', () => {
  it('deduplicates active finish date from readHistory and surfaces all finish years', () => {
    const book = makeRereadBook();
    const occurrences = getBookFinishedOccurrences(book);
    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((o) => o.dateFinished)).toEqual([
      '2024-07-15',
      '2026-01-18',
      '2026-04-20',
    ]);

    const years = getAvailableYears([book], []);
    expect(years).toContain(2024);
    expect(years).toContain(2026);
  });

  it('counts multiple reads within the same year without double-counting cycle logs', () => {
    const book = makeRereadBook();
    const logs: ReadingLog[] = [
      // Active read (cycleIndex 4 because 3 entries exist in readHistory)
      {
        id: 'l-active',
        profileId: 'p1',
        bookId: 'b-reread',
        date: '2026-04-10',
        pagesRead: 110,
        readCycle: 4,
        createdAt: '2026-04-10T00:00:00.000Z',
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
    ];

    const buckets2026 = computeMonthlyStats([book], logs, 2026, true);
    expect(buckets2026[0].booksFinished).toBe(1); // Jan (historical span-2)
    expect(buckets2026[0].pagesRead).toBe(310);
    expect(buckets2026[3].booksFinished).toBe(1); // Apr (active finish)
    expect(buckets2026[3].loggedPages).toBe(110);
    expect(buckets2026[3].backfillPages).toBe(200);
    expect(buckets2026[3].pagesRead).toBe(310);

    const summary2026 = computeReadingSummary([book], logs, 2026, true);
    expect(summary2026.booksFinished).toBe(2);
    expect(summary2026.totalPages).toBe(620);

    const summaryAll = computeReadingSummary([book], logs, 'all', true);
    expect(summaryAll.booksFinished).toBe(3);
    expect(summaryAll.totalPages).toBe(930);

    const timeline2026 = buildTimelineGroups([book], 2026);
    expect(timeline2026.map((g) => g.monthKey)).toEqual(['2026-04', '2026-01']);
  });
});
