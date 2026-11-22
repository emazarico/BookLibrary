import { describe, expect, it } from 'vitest';
import type { Book, BookLibraryDatabase } from '../types/library';
import { mergeDatabases } from '../utils/merge';

function makeBook(id: string, title: string, updatedAt: string, deletedAt: string | null = null): Book {
  return {
    id,
    profileId: 'p1',
    shelfIds: ['s1'],
    title,
    author: 'Author',
    pageCount: 300,
    currentPage: 100,
    status: 'reading',
    rating: 0,
    notes: '',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    deletedAt,
  };
}

describe('mergeDatabases (LWW sync)', () => {
  it('merges disjoint additions, keeps newer updates, and propagates tombstones', () => {
    const local: BookLibraryDatabase = {
      schemaVersion: 4,
      dbId: 'db-1',
      updatedAt: '2026-06-02T12:00:00.000Z',
      profiles: [],
      shelves: [],
      books: [
        makeBook('b-local-only', 'Local Book', '2026-06-01T10:00:00.000Z'),
        makeBook('b-conflict', 'Older Local Title', '2026-06-01T10:00:00.000Z'),
        makeBook('b-deleted-remote', 'Not Yet Deleted Locally', '2026-06-01T10:00:00.000Z'),
      ],
      readingLogs: [],
    };

    const remote: BookLibraryDatabase = {
      schemaVersion: 4,
      dbId: 'db-1',
      updatedAt: '2026-06-03T12:00:00.000Z',
      profiles: [],
      shelves: [],
      books: [
        makeBook('b-remote-only', 'Remote Book', '2026-06-01T11:00:00.000Z'),
        makeBook('b-conflict', 'Newer Remote Title', '2026-06-03T10:00:00.000Z'),
        makeBook(
          'b-deleted-remote',
          'Not Yet Deleted Locally',
          '2026-06-03T11:00:00.000Z',
          '2026-06-03T11:00:00.000Z',
        ),
      ],
      readingLogs: [],
    };

    const merged = mergeDatabases(local, remote);
    const byId = new Map(merged.books.map((b) => [b.id, b]));

    expect(merged.books).toHaveLength(4);
    expect(byId.get('b-local-only')?.title).toBe('Local Book');
    expect(byId.get('b-remote-only')?.title).toBe('Remote Book');
    expect(byId.get('b-conflict')?.title).toBe('Newer Remote Title');
    expect(byId.get('b-deleted-remote')?.deletedAt).toBe('2026-06-03T11:00:00.000Z');
  });
});
