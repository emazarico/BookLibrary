import { describe, expect, it } from 'vitest';
import { applyImport, inspectImportFile } from '../services/importExport';
import type { BookLibraryDatabase } from '../types/library';

function makeEmptyDb(): BookLibraryDatabase {
  const now = '2026-05-01T12:00:00.000Z';
  return {
    schemaVersion: 4,
    dbId: 'db-test',
    updatedAt: now,
    profiles: [
      {
        id: 'p1',
        name: 'Tester',
        avatarEmoji: '📚',
        avatarTheme: 'amber',
        role: 'admin',
        pinHash: null,
        yearlyBookGoal: 20,
        monthlyPageGoal: 500,
        createdAt: now,
        updatedAt: now,
      },
    ],
    shelves: [],
    books: [],
    readingLogs: [],
  };
}

describe('Audible, Libby, and Kindle importers (P5.2)', () => {
  it('parses Kindle My Clippings.txt into grouped ebook entries with notes and dates', () => {
    const clippings = [
      '\uFEFFProject Hail Mary (A Novel) (Andy Weir)',
      '- Your Highlight on page 42 | Location 615-618 | Added on Monday, May 4, 2026 8:14:22 PM',
      '',
      'Grace woke up with amnesia and two dead crewmates.',
      '==========',
      'Project Hail Mary (A Novel) (Andy Weir)',
      '- Your Note on page 98 | Location 1400 | Added on Wednesday, May 6, 2026 9:00:00 AM',
      '',
      'Great first-contact science.',
      '==========',
      'Dune (Frank Herbert)',
      '- Your Highlight on page 12 | Location 200-205 | Added on Sunday, April 12, 2026 6:10:00 PM',
      '',
      'Fear is the mind-killer.',
      '==========',
      'Dune (Frank Herbert)',
      '<You have reached the clipping limit for this item>',
      '==========',
    ].join('\n');

    const db = makeEmptyDb();
    const preview = inspectImportFile('My Clippings.txt', clippings, db, 'p1');

    expect(preview.format).toBe('kindle-clippings');
    expect(preview.summaryCounts.books).toBe(2);
    expect(preview.summaryCounts.shelves).toBe(1);

    const phm = preview.profileBundle?.books.find((b) => b.title.includes('Project Hail Mary'));
    expect(phm).toBeDefined();
    expect(phm?.author).toBe('Andy Weir');
    expect(phm?.format).toBe('ebook');
    expect(phm?.ownership).toBe('owned');
    expect(phm?.dateStarted).toBe('2026-05-04');
    expect(phm?.dateFinished).toBe('2026-05-06');
    expect(phm?.notes).toContain('Grace woke up with amnesia');
    expect(phm?.notes).toContain('Great first-contact science.');
    expect(phm?.tags).toContain('kindle');

    const merged = applyImport(db, 'p1', preview, 'merge');
    expect(merged.books).toHaveLength(2);
    expect(merged.shelves.map((s) => s.name)).toContain('Kindle Highlights');
  });

  it('parses Libby Timeline JSON exports and infers status, library ownership, and formats', () => {
    const libbyJson = JSON.stringify({
      version: 1,
      timeline: [
        {
          title: { text: 'The Heaven & Earth Grocery Store' },
          author: 'James McBride',
          isbn: '9780593422946',
          format: 'audiobook',
          activity: 'Borrowed',
          library: { text: 'Seattle Public Library' },
          timestamp: '2026-03-01T10:00:00.000Z',
        },
        {
          title: { text: 'The Heaven & Earth Grocery Store' },
          author: 'James McBride',
          isbn: '9780593422946',
          format: 'audiobook',
          activity: 'Returned',
          library: { text: 'Seattle Public Library' },
          timestamp: '2026-03-14T10:00:00.000Z',
        },
        {
          title: { text: 'Tomorrow, and Tomorrow, and Tomorrow' },
          author: 'Gabrielle Zevin',
          format: 'ebook',
          activity: 'Borrowed',
          library: { text: 'Seattle Public Library' },
          timestamp: '2026-05-10T10:00:00.000Z',
          dueDate: '2026-05-24',
        },
        {
          title: { text: 'Orbital' },
          author: 'Samantha Harvey',
          format: 'ebook',
          activity: 'Placed on hold',
          library: { text: 'King County Library' },
          timestamp: '2026-05-12T10:00:00.000Z',
        },
      ],
    });

    const db = makeEmptyDb();
    const preview = inspectImportFile('libbytimeline-activities.json', libbyJson, db, 'p1');

    expect(preview.format).toBe('libby-json');
    expect(preview.summaryCounts.books).toBe(3);

    const mcbride = preview.profileBundle?.books.find((b) =>
      b.title.includes('Heaven & Earth'),
    );
    expect(mcbride?.status).toBe('finished');
    expect(mcbride?.format).toBe('audiobook');
    expect(mcbride?.ownership).toBe('library');
    expect(mcbride?.ownershipNote).toBe('Seattle Public Library');
    expect(mcbride?.dateStarted).toBe('2026-03-01');
    expect(mcbride?.dateFinished).toBe('2026-03-14');

    const zevin = preview.profileBundle?.books.find((b) => b.title.includes('Tomorrow'));
    expect(zevin?.status).toBe('reading');
    expect(zevin?.dueDate).toBe('2026-05-24');

    const harvey = preview.profileBundle?.books.find((b) => b.title === 'Orbital');
    expect(harvey?.status).toBe('want-to-read');
  });

  it('parses Libby Reading History CSV exports', () => {
    const csv = [
      'cover,title,author,publisher,isbn,timestamp,activity,details,library,format',
      ',Piranesi,Susanna Clarke,Bloomsbury,9781635575637,2026-02-01,Borrowed,,Boston Public Library,ebook',
      ',Piranesi,Susanna Clarke,Bloomsbury,9781635575637,2026-02-08,Returned,,Boston Public Library,ebook',
    ].join('\n');

    const db = makeEmptyDb();
    const preview = inspectImportFile('libby-history.csv', csv, db, 'p1');

    expect(preview.format).toBe('libby-csv');
    expect(preview.summaryCounts.books).toBe(1);
    const book = preview.profileBundle?.books[0];
    expect(book?.status).toBe('finished');
    expect(book?.ownership).toBe('library');
    expect(book?.ownershipNote).toBe('Boston Public Library');
    expect(book?.tags).toContain('libby');
  });

  it('parses Audible Listening CSV into audiobook + duration reading logs and Audible Library CSV', () => {
    const listeningCsv = [
      'Book Title,Author,Narrator,ASIN,Start Date,End Date,Listening Duration (Milliseconds),Book Length Milliseconds',
      'The Martian,Andy Weir,R.C. Bray,B00B5HZGUG,2026-04-01,2026-04-01,3600000,7200000',
      'The Martian,Andy Weir,R.C. Bray,B00B5HZGUG,2026-04-01,2026-04-01,1800000,7200000',
      'The Martian,Andy Weir,R.C. Bray,B00B5HZGUG,2026-04-02,2026-04-02,1800000,7200000',
    ].join('\n');

    const db = makeEmptyDb();
    const preview = inspectImportFile('Audible.Listening.csv', listeningCsv, db, 'p1');

    expect(preview.format).toBe('audible-csv');
    expect(preview.summaryCounts.books).toBe(1);
    expect(preview.summaryCounts.readingLogs).toBe(2);

    const book = preview.profileBundle?.books[0];
    expect(book?.format).toBe('audiobook');
    expect(book?.progressUnit).toBe('duration');
    expect(book?.totalMinutes).toBe(120);
    expect(book?.currentMinutes).toBe(120);
    expect(book?.status).toBe('finished');
    expect(book?.notes).toContain('Narrated by R.C. Bray');

    const applied = applyImport(db, 'p1', preview, 'merge');
    expect(applied.books).toHaveLength(1);
    expect(applied.readingLogs).toHaveLength(2);
    expect(applied.readingLogs[0].unit).toBe('duration');
    expect(applied.readingLogs[0].bookId).toBe(applied.books[0].id);

    const libraryCsv = [
      'Title,Author,Narrator,Length,Date Added,Status,My Rating,ASIN',
      'Dune,Frank Herbert,Scott Brick,21 hrs and 2 mins,2026-01-15,Finished,4.5,B002V1OF70',
    ].join('\n');

    const libPreview = inspectImportFile('audible-library.csv', libraryCsv, db, 'p1');
    expect(libPreview.format).toBe('audible-csv');
    expect(libPreview.profileBundle?.books[0].totalMinutes).toBe(1262);
    expect(libPreview.profileBundle?.books[0].rating).toBe(4.5);
    expect(libPreview.profileBundle?.books[0].status).toBe('finished');
  });
});
