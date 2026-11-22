import { describe, expect, it } from 'vitest';
import type { Book, ReadingLog } from '../types/library';
import { computeReadingBadges, READING_BADGE_DEFINITIONS } from '../utils/badges';

function makeBook(
  id: string,
  overrides: Partial<Book> = {},
): Book {
  return {
    id,
    profileId: 'p1',
    shelfIds: [],
    title: `Book ${id}`,
    author: 'Author',
    pageCount: 250,
    currentPage: 250,
    status: 'finished',
    rating: 4,
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
  pagesRead: number,
  minutesListened?: number,
): ReadingLog {
  return {
    id,
    profileId: 'p1',
    bookId,
    date,
    pagesRead,
    minutesListened,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('computeReadingBadges', () => {
  it('returns all 9 definitions locked when library is empty', () => {
    const badges = computeReadingBadges([], []);
    expect(badges).toHaveLength(READING_BADGE_DEFINITIONS.length);
    expect(badges).toHaveLength(9);
    expect(badges.every((b) => !b.unlocked && b.current === 0 && b.progressPct === 0)).toBe(true);
  });

  it('unlocks milestone badges cleanly, filters meta-tags, counts streaks, and attaches reward notes', () => {
    const books: Book[] = [
      makeBook('b1', {
        pageCount: 300,
        series: 'Stormlight',
        seriesIndex: 1,
        tags: ['fantasy', 'wishlist'],
        review: 'Loved the world-building.',
      }),
      makeBook('b2', {
        pageCount: 350,
        series: 'stormlight',
        seriesIndex: 2,
        tags: ['fantasy', 'sci-fi', 'audiobook'],
        review: 'Even better sequel.',
      }),
      makeBook('b3', {
        pageCount: 200,
        format: 'audiobook',
        tags: ['mystery'],
        review: 'Great narrator!',
      }),
      makeBook('b4', {
        pageCount: 150,
        tags: ['history'],
      }),
      makeBook('b5', {
        pageCount: 120,
        tags: ['biography', 'favorite'],
      }),
      makeBook('b6', {
        pageCount: 500,
        tags: ['romance'],
        deletedAt: '2026-03-01T00:00:00.000Z', // soft-deleted, ignored
      }),
    ];

    const logs: ReadingLog[] = [
      makeLog('l1', 'b1', '2026-03-10', 20),
      makeLog('l2', 'b1', '2026-03-11', 25),
      makeLog('l3', 'b1', '2026-03-12', 30),
      makeLog('l4', 'b1', '2026-03-13', 20),
      makeLog('l5', 'b1', '2026-03-14', 25),
    ];

    const rewards = {
      'bookworm-5': 'Pick our next bookstore trip read!',
    };

    const refDate = new Date('2026-05-01T12:00:00.000Z');
    const result = computeReadingBadges(books, logs, rewards, refDate);
    const byId = new Map(result.map((b) => [b.id, b]));

    expect(byId.get('first-finish')?.unlocked).toBe(true);
    expect(byId.get('bookworm-5')).toMatchObject({
      unlocked: true,
      current: 5,
      rewardNote: 'Pick our next bookstore trip read!',
    });
    expect(byId.get('library-legend-12')).toMatchObject({
      unlocked: false,
      current: 5,
    });
    expect(byId.get('page-turner-1000')).toMatchObject({
      unlocked: true,
      current: 1120, // 300+350+200+150+120 = 1120 (since logs are for b1 and b1 backfills remainder)
    });
    expect(byId.get('audiobook-explorer')?.unlocked).toBe(true);
    expect(byId.get('streak-5')).toMatchObject({
      unlocked: true,
      current: 5,
    });
    expect(byId.get('critic-3')).toMatchObject({
      unlocked: true,
      current: 3,
    });
    // Distinct tags excluding wishlist/audiobook/favorite: fantasy, sci-fi, mystery, history, biography = 5
    expect(byId.get('genre-explorer')).toMatchObject({
      unlocked: true,
      current: 5,
    });
    // Stormlight series matched case-insensitively -> 2
    expect(byId.get('series-finisher')).toMatchObject({
      unlocked: true,
      current: 2,
    });
  });

  it('unlocks Audio Adventurer from audio reading logs even without a tagged audiobook format', () => {
    const books = [makeBook('b1', { status: 'reading', format: 'physical', currentPage: 0 })];
    const logs = [makeLog('l1', 'b1', '2026-04-02', 0, 45)];

    const result = computeReadingBadges(books, logs);
    const audioBadge = result.find((b) => b.id === 'audiobook-explorer');
    expect(audioBadge?.unlocked).toBe(true);
    expect(audioBadge?.current).toBe(1);
  });
});
