import { describe, expect, it } from 'vitest';
import {
  applyImport,
  buildGoodreadsCsvString,
  inspectImportFile,
} from '../services/importExport';
import { createEmptyDatabase } from '../services/storage';
import type { Book, BookLibraryDatabase, Shelf, UserProfile } from '../types/library';

function makeBaseDb(): { db: BookLibraryDatabase; profile: UserProfile; shelf: Shelf } {
  const now = '2026-05-01T10:00:00.000Z';
  const profile: UserProfile = {
    id: 'profile-1',
    name: 'Alex',
    avatarEmoji: '🦉',
    avatarTheme: 'amber',
    role: 'admin',
    pinHash: null,
    yearlyBookGoal: 20,
    monthlyPageGoal: 600,
    createdAt: now,
    updatedAt: now,
  };
  const shelf: Shelf = {
    id: 'shelf-1',
    profileId: profile.id,
    name: 'Favorites',
    color: 'amber',
    icon: 'book-open',
    visible: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
  const db: BookLibraryDatabase = {
    ...createEmptyDatabase(),
    profiles: [profile],
    shelves: [shelf],
    books: [],
    readingLogs: [],
  };
  return { db, profile, shelf };
}

describe('import / export pipelines', () => {
  it('migrates Legacy v3 JSON, strips dead placeholder covers, and clamps ratings', () => {
    const { db, profile } = makeBaseDb();
    const v3Json = JSON.stringify({
      libraries: [
        {
          id: 'lib-1',
          name: 'My Reading List',
          type: 'book',
          visible: true,
          items: [
            {
              id: 'item-1',
              title: 'Piranesi',
              author: 'Susanna Clarke',
              cover: 'https://via.placeholder.com/150x220?text=No+Cover',
              type: 'book',
              rating: 8,
              dateRead: '2026-02-14',
              notes: 'Magical',
              tags: ['fantasy'],
            },
            {
              id: 'item-2',
              title: 'Circe',
              author: 'Madeline Miller',
              cover: 'https://covers.openlibrary.org/b/id/123-M.jpg',
              type: 'book',
              rating: -2,
              dateRead: '',
              notes: '',
              tags: [],
            },
          ],
        },
        {
          id: 'lib-2',
          name: 'Watchlist',
          type: 'movie',
          visible: true,
          items: [],
        },
      ],
    });

    const preview = inspectImportFile('v3-backup.json', v3Json, db, profile.id);
    expect(preview.format).toBe('v3-legacy-json');
    expect(preview.summaryCounts.shelves).toBe(1);
    expect(preview.summaryCounts.books).toBe(2);

    const importedBooks = preview.profileBundle!.books;
    expect(importedBooks[0].coverUrl).toBeUndefined();
    expect(importedBooks[0].rating).toBe(5);
    expect(importedBooks[0].status).toBe('finished');
    expect(importedBooks[0].dateFinished).toBe('2026-02-14');

    expect(importedBooks[1].coverUrl).toContain('default=false');
    expect(importedBooks[1].rating).toBe(0);
    expect(importedBooks[1].status).toBe('want-to-read');
  });

  it('round-trips Goodreads CSV export back into import and detects duplicates', () => {
    const { db, profile, shelf } = makeBaseDb();
    const book: Book = {
      id: 'book-1',
      profileId: profile.id,
      shelfIds: [shelf.id],
      title: 'Project Hail Mary',
      author: 'Andy Weir',
      isbn: '9780593135204',
      publishYear: 2021,
      publisher: 'Ballantine',
      pageCount: 496,
      currentPage: 496,
      format: 'audiobook',
      status: 'finished',
      rating: 4.5,
      dateFinished: '2026-04-12',
      notes: 'Amazing\nSci-Fi',
      tags: ['sci-fi'],
      addedAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-12T00:00:00.000Z',
    };

    const csv = buildGoodreadsCsvString([book], [shelf]);
    expect(csv).toContain('Audiobook');
    const dbWithBook = { ...db, books: [book] };

    // Against empty db
    const freshPreview = inspectImportFile('goodreads.csv', csv, db, profile.id);
    expect(freshPreview.format).toBe('goodreads-csv');
    expect(freshPreview.duplicateCount).toBe(0);
    const mergedFresh = applyImport(db, profile.id, freshPreview, 'merge');
    expect(mergedFresh.books).toHaveLength(1);
    expect(mergedFresh.books[0].title).toBe('Project Hail Mary');
    expect(mergedFresh.books[0].isbn).toBe('9780593135204');
    expect(mergedFresh.books[0].pageCount).toBe(496);
    expect(mergedFresh.books[0].format).toBe('audiobook');
    expect(mergedFresh.books[0].rating).toBe(4.5);
    expect(mergedFresh.books[0].dateFinished).toBe('2026-04-12');
    expect(mergedFresh.books[0].notes).toBe('Amazing\nSci-Fi');

    // Against db that already owns the book -> duplicate skipped
    const dupePreview = inspectImportFile('goodreads.csv', csv, dbWithBook, profile.id);
    expect(dupePreview.duplicateCount).toBe(1);
    const mergedDupe = applyImport(dbWithBook, profile.id, dupePreview, 'merge');
    expect(mergedDupe.books).toHaveLength(1);
  });

  it('imports StoryGraph CSV format including audio format mapping', () => {
    const { db, profile } = makeBaseDb();
    const storygraphCsv = [
      'Title,Authors,ISBN/UID,Format,Read Status,Star Rating,Last Date Read,Tags,Review',
      'Babel,R. F. Kuang,9780063021426,audio,did-not-finish,3.5,2026/03/20,"fantasy, dark",Dense footnotes',
    ].join('\n');

    const preview = inspectImportFile('storygraph.csv', storygraphCsv, db, profile.id);
    expect(preview.format).toBe('storygraph-csv');
    const imported = preview.profileBundle!.books[0];
    expect(imported.format).toBe('audiobook');
    expect(imported.status).toBe('dnf');
    expect(imported.rating).toBe(3.5);
    expect(imported.dateFinished).toBe('2026-03-20');
    expect(imported.isbn).toBe('9780063021426');
    expect(imported.notes).toBe('Dense footnotes');
  });
});
