import { describe, expect, it } from 'vitest';
import type { Book, UserProfile } from '../types/library';
import { findBookDuplicates } from '../utils/duplicates';

function makeProfile(id: string, name: string, emoji: string, deletedAt?: string | null): UserProfile {
  return {
    id,
    name,
    avatarEmoji: emoji,
    avatarTheme: 'amber',
    pinHash: null,
    yearlyBookGoal: 12,
    monthlyPageGoal: 500,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt,
  };
}

function makeBook(overrides: Partial<Book> & { id: string; profileId: string; title: string; author: string }): Book {
  return {
    shelfIds: [],
    pageCount: 250,
    currentPage: 0,
    status: 'want-to-read',
    rating: 0,
    notes: '',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findBookDuplicates', () => {
  const profiles: UserProfile[] = [
    makeProfile('p1', 'Alex', '🦉'),
    makeProfile('p2', 'Maya', '🦊'),
    makeProfile('p3', 'Old Profile', '🐻', '2026-02-01T00:00:00.000Z'),
  ];

  const books: Book[] = [
    makeBook({
      id: 'b1',
      profileId: 'p1',
      title: 'Dune',
      author: 'Frank Herbert',
      isbn: '="9780441172719"',
      status: 'finished',
    }),
    makeBook({
      id: 'b2',
      profileId: 'p2',
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      isbn: '9780547928227',
      ownership: 'owned',
    }),
    makeBook({
      id: 'b3',
      profileId: 'p1',
      title: 'Deleted Draft',
      author: 'Someone',
      isbn: '9781111111111',
      deletedAt: '2026-02-01T00:00:00.000Z',
    }),
    makeBook({
      id: 'b4',
      profileId: 'p3',
      title: 'Ghost Book',
      author: 'Hidden',
      isbn: '9782222222222',
    }),
  ];

  it('detects ISBN matches on own shelf even with Goodreads quotes or hyphens', () => {
    const res = findBookDuplicates(
      { title: 'Different Edition Name', author: 'Other', isbn: '978-0-441-17271-9' },
      books,
      profiles,
      'p1',
    );
    expect(res.ownMatches.map((b) => b.id)).toEqual(['b1']);
    expect(res.householdMatches).toEqual([]);
  });

  it('detects case-insensitive title+author matches across own and household shelves', () => {
    const res = findBookDuplicates(
      { title: '  the hobbit ', author: ' j.r.r. tolkien ' },
      books,
      profiles,
      'p1',
    );
    expect(res.ownMatches).toEqual([]);
    expect(res.householdMatches).toHaveLength(1);
    expect(res.householdMatches[0]).toMatchObject({
      ownerName: 'Maya',
      ownerEmoji: '🦊',
    });
    expect(res.householdMatches[0].book.id).toBe('b2');
  });

  it('skips excludeBookId when editing an existing book and ignores deleted records', () => {
    const editingSelf = findBookDuplicates(
      { title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719', excludeBookId: 'b1' },
      books,
      profiles,
      'p1',
    );
    expect(editingSelf.ownMatches).toEqual([]);
    expect(editingSelf.householdMatches).toEqual([]);

    const deletedMatch = findBookDuplicates(
      { title: 'Deleted Draft', author: 'Someone', isbn: '9781111111111' },
      books,
      profiles,
      'p1',
    );
    expect(deletedMatch.ownMatches).toEqual([]);

    const deletedProfileBook = findBookDuplicates(
      { title: 'Ghost Book', author: 'Hidden', isbn: '9782222222222' },
      books,
      profiles,
      'p1',
    );
    expect(deletedProfileBook.householdMatches).toEqual([]);
  });
});
