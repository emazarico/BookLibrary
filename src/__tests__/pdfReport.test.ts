import { describe, expect, it } from 'vitest';
import { createEmptyDatabase } from '../services/storage';
import type { Book, BookLibraryDatabase, ReadingLog, UserProfile } from '../types/library';
import { buildPdfReportData, buildStandaloneReportHtml, type PdfReportOptions } from '../utils/pdfReport';

function makeFixtureDb(): BookLibraryDatabase {
  const now = '2026-06-01T00:00:00.000Z';
  const alex: UserProfile = {
    id: 'p-alex',
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
  const maya: UserProfile = {
    id: 'p-maya',
    name: 'Maya',
    avatarEmoji: '🦊',
    avatarTheme: 'indigo',
    role: 'member',
    pinHash: null,
    yearlyBookGoal: 12,
    monthlyPageGoal: 400,
    createdAt: now,
    updatedAt: now,
  };

  const books: Book[] = [
    {
      id: 'b-audio',
      profileId: 'p-alex',
      shelfIds: [],
      title: 'Project Hail Mary',
      author: 'Andy Weir',
      pageCount: 496,
      currentPage: 496,
      format: 'audiobook',
      status: 'finished',
      rating: 5,
      dateFinished: '2026-05-12',
      notes: 'Great narration',
      tags: ['audiobook', 'sci-fi'],
      addedAt: '2026-05-01T00:00:00.000Z',
      updatedAt: now,
    },
    {
      id: 'b-wishlist',
      profileId: 'p-alex',
      shelfIds: [],
      title: 'Circe',
      author: 'Madeline Miller',
      pageCount: 393,
      currentPage: 0,
      format: 'physical',
      status: 'want-to-read',
      rating: 0,
      notes: '',
      tags: ['wishlist', 'mythology'],
      addedAt: '2026-05-20T00:00:00.000Z',
      updatedAt: now,
    },
    {
      id: 'b-old',
      profileId: 'p-maya',
      shelfIds: [],
      title: 'Old Read',
      author: 'Someone',
      pageCount: 220,
      currentPage: 220,
      format: 'physical',
      status: 'finished',
      rating: 4,
      dateFinished: '2025-11-10',
      notes: '',
      tags: [],
      addedAt: '2025-10-01T00:00:00.000Z',
      updatedAt: now,
    },
  ];

  const logs: ReadingLog[] = [
    {
      id: 'l-1',
      profileId: 'p-alex',
      bookId: 'b-audio',
      date: '2026-05-05',
      pagesRead: 120,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    ...createEmptyDatabase(),
    profiles: [alex, maya],
    books,
    readingLogs: logs,
  };
}

const baseOptions: PdfReportOptions = {
  profileIds: [],
  dateFrom: '',
  dateTo: '',
  statuses: ['finished', 'reading', 'want-to-read', 'dnf'],
  formatFilter: 'all',
  tagFilter: '',
  layout: 'cards',
  orientation: 'portrait',
  includeSummaryAndChart: true,
  includeTimeline: true,
  includeNotes: true,
  includeReadingLogs: true,
  title: 'Household Reading Report',
};

describe('PDF report filtering & standalone HTML generation', () => {
  it('filters by profileIds, dateFrom/dateTo, formatFilter, and tagFilter', () => {
    const db = makeFixtureDb();

    const alexOnly = buildPdfReportData(db, { ...baseOptions, profileIds: ['p-alex'] });
    expect(alexOnly.books.map((b) => b.id)).toEqual(['b-wishlist', 'b-audio']);

    const date2026 = buildPdfReportData(db, {
      ...baseOptions,
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
    });
    expect(date2026.books.some((b) => b.id === 'b-old')).toBe(false);
    expect(date2026.totalPagesRead).toBe(496); // 120 logged + 376 backfill, not double counted

    const audioOnly = buildPdfReportData(db, { ...baseOptions, formatFilter: 'audiobook' });
    expect(audioOnly.books.map((b) => b.title)).toEqual(['Project Hail Mary']);

    const wishlistOnly = buildPdfReportData(db, { ...baseOptions, tagFilter: 'wishlist' });
    expect(wishlistOnly.books.map((b) => b.title)).toEqual(['Circe']);
  });

  it('builds valid standalone HTML with inline SVG chart and escaped metadata', () => {
    const db = makeFixtureDb();
    const opts: PdfReportOptions = { ...baseOptions, title: 'Alex & <Family> Report' };
    const report = buildPdfReportData(db, opts);
    const html = buildStandaloneReportHtml(report, opts);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Alex &amp; &lt;Family&gt; Report');
    expect(html).toContain('Project Hail Mary');
    expect(html).toContain('<svg');
    expect(html).toContain('Reading Timeline');
    expect(html).toContain('Reading Log Sessions');
  });
});
