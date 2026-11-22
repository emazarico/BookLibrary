import { describe, expect, it } from 'vitest';
import type { Book, ReadingLog } from '../types/library';
import { buildTimelineGroups, computeMonthlyStats } from '../utils/stats';

function makeFinishedBook(id: string, title: string, pageCount: number, dateFinished: string): Book {
  return {
    id,
    profileId: 'p1',
    shelfIds: [],
    title,
    author: 'Author',
    pageCount,
    currentPage: pageCount,
    status: 'finished',
    rating: 4.5,
    dateFinished,
    notes: '',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeLog(id: string, bookId: string, date: string, pagesRead: number): ReadingLog {
  return {
    id,
    profileId: 'p1',
    bookId,
    date,
    pagesRead,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('reading stats & timeline calculations', () => {
  it('avoids double-counting logged pages and finished-book backfill', () => {
    const books: Book[] = [
      // Book 1: 300 pages, 120 logged across Jan & Feb, remaining 180 backfilled into Feb
      makeFinishedBook('b1', 'Book One', 300, '2026-02-14'),
      // Book 2: 200 pages, 250 logged (exceeds pageCount) -> 0 backfill
      makeFinishedBook('b2', 'Book Two', 200, '2026-03-10'),
      // Book 3: 400 pages, 0 logged -> full 400 backfilled into April
      makeFinishedBook('b3', 'Book Three', 400, '2026-04-05'),
    ];

    const logs: ReadingLog[] = [
      makeLog('l1', 'b1', '2026-01-20', 50),
      makeLog('l2', 'b1', '2026-02-10', 70),
      makeLog('l3', 'b2', '2026-03-08', 250),
    ];

    const withBackfill = computeMonthlyStats(books, logs, 2026, true);
    expect(withBackfill[0].pagesRead).toBe(50); // Jan
    expect(withBackfill[1].loggedPages).toBe(70); // Feb logged
    expect(withBackfill[1].backfillPages).toBe(180); // Feb backfill (300 - 120)
    expect(withBackfill[1].pagesRead).toBe(250);
    expect(withBackfill[1].booksFinished).toBe(1);

    expect(withBackfill[2].loggedPages).toBe(250); // Mar
    expect(withBackfill[2].backfillPages).toBe(0);

    expect(withBackfill[3].loggedPages).toBe(0); // Apr
    expect(withBackfill[3].backfillPages).toBe(400);
    expect(withBackfill[3].pagesRead).toBe(400);

    // Toggle backfill off
    const withoutBackfill = computeMonthlyStats(books, logs, 2026, false);
    expect(withoutBackfill[1].pagesRead).toBe(70);
    expect(withoutBackfill[3].pagesRead).toBe(0);
  });

  it('groups finished books chronologically descending by YYYY-MM', () => {
    const books: Book[] = [
      makeFinishedBook('b1', 'Jan Read', 200, '2026-01-12'),
      makeFinishedBook('b2', 'May Read 1', 300, '2026-05-02'),
      makeFinishedBook('b3', 'May Read 2', 150, '2026-05-20'),
      makeFinishedBook('b4', 'Prior Year', 250, '2025-11-10'),
    ];

    const groups2026 = buildTimelineGroups(books, 2026);
    expect(groups2026.map((g) => g.monthKey)).toEqual(['2026-05', '2026-01']);
    expect(groups2026[0].totalPages).toBe(450);
    expect(groups2026[0].books.map((b) => b.title)).toEqual(['May Read 2', 'May Read 1']);

    const groupsAll = buildTimelineGroups(books, 'all');
    expect(groupsAll.map((g) => g.monthKey)).toEqual(['2026-05', '2026-01', '2025-11']);
  });
});
