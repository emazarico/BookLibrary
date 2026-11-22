import { describe, expect, it } from 'vitest';
import type { Book, ReadingLog } from '../types/library';
import {
  formatMinutesHHMM,
  formatMinutesHuman,
  formatReadingLogBadge,
  getBookProgressInfo,
  parseDurationToMinutes,
} from '../utils/progress';

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'b-test',
    profileId: 'p1',
    shelfIds: [],
    title: 'Sample Book',
    author: 'Sample Author',
    pageCount: 0,
    currentPage: 0,
    status: 'reading',
    rating: 0,
    notes: '',
    tags: [],
    addedAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLog(overrides: Partial<ReadingLog> = {}): ReadingLog {
  return {
    id: 'l-test',
    profileId: 'p1',
    bookId: 'b-test',
    date: '2026-11-22',
    pagesRead: 0,
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('chapter and hh:mm duration progress helpers', () => {
  it('parses hh:mm, Xh Ym, and integer minute durations', () => {
    expect(parseDurationToMinutes('16:10')).toBe(970);
    expect(parseDurationToMinutes('0:45')).toBe(45);
    expect(parseDurationToMinutes('1h 30m')).toBe(90);
    expect(parseDurationToMinutes('2h')).toBe(120);
    expect(parseDurationToMinutes('45m')).toBe(45);
    expect(parseDurationToMinutes('90')).toBe(90);
    expect(parseDurationToMinutes('-15')).toBe(0);
    expect(parseDurationToMinutes('invalid')).toBe(0);
    expect(parseDurationToMinutes('1:75')).toBe(0);
  });

  it('formats minutes into hh:mm and human-readable strings', () => {
    expect(formatMinutesHHMM(0)).toBe('0:00');
    expect(formatMinutesHHMM(45)).toBe('0:45');
    expect(formatMinutesHHMM(970)).toBe('16:10');

    expect(formatMinutesHuman(0)).toBe('0m');
    expect(formatMinutesHuman(45)).toBe('45m');
    expect(formatMinutesHuman(60)).toBe('1h');
    expect(formatMinutesHuman(970)).toBe('16h 10m');
  });

  it('computes progress info across pages, chapters, and duration units with or without totals', () => {
    expect(
      getBookProgressInfo(
        makeBook({ progressUnit: 'pages', currentPage: 120, pageCount: 400 }),
      ),
    ).toEqual({
      unit: 'pages',
      current: 120,
      total: 400,
      percent: 30,
      label: '120 / 400 pp',
      shortLabel: 'p. 120/400',
    });

    expect(
      getBookProgressInfo(
        makeBook({ progressUnit: 'pages', currentPage: 55, pageCount: 0 }),
      ),
    ).toEqual({
      unit: 'pages',
      current: 55,
      total: 0,
      percent: null,
      label: 'Page 55',
      shortLabel: 'p. 55',
    });

    expect(
      getBookProgressInfo(
        makeBook({ progressUnit: 'chapters', currentChapter: 9, totalChapters: 18 }),
      ),
    ).toEqual({
      unit: 'chapters',
      current: 9,
      total: 18,
      percent: 50,
      label: 'Ch. 9 / 18',
      shortLabel: 'Ch. 9 / 18',
    });

    expect(
      getBookProgressInfo(
        makeBook({ progressUnit: 'chapters', currentChapter: 7 }),
      ),
    ).toEqual({
      unit: 'chapters',
      current: 7,
      total: 0,
      percent: null,
      label: 'Ch. 7',
      shortLabel: 'Ch. 7',
    });

    expect(
      getBookProgressInfo(
        makeBook({ progressUnit: 'duration', currentMinutes: 620, totalMinutes: 970 }),
      ),
    ).toEqual({
      unit: 'duration',
      current: 620,
      total: 970,
      percent: 64,
      label: '10h 20m / 16h 10m',
      shortLabel: '10:20 / 16:10',
    });

    expect(
      getBookProgressInfo(
        makeBook({ progressUnit: 'duration', currentMinutes: 95 }),
      ),
    ).toEqual({
      unit: 'duration',
      current: 95,
      total: 0,
      percent: null,
      label: '1h 35m listened',
      shortLabel: '1:35',
    });
  });

  it('formats reading log badges for page, chapter, and duration entries', () => {
    expect(
      formatReadingLogBadge(makeLog({ unit: 'pages', pagesRead: 32, pageReached: 152 })),
    ).toEqual({
      deltaLabel: '+32 pp',
      reachedLabel: 'Reached p. 152',
    });

    expect(
      formatReadingLogBadge(makeLog({ unit: 'chapters', chaptersRead: 3, chapterReached: 12 })),
    ).toEqual({
      deltaLabel: '+3 ch',
      reachedLabel: 'Reached Ch. 12',
    });

    expect(
      formatReadingLogBadge(
        makeLog({ unit: 'duration', minutesListened: 30, minuteReached: 650 }),
      ),
    ).toEqual({
      deltaLabel: '+30m',
      reachedLabel: 'Reached 10:50',
    });
  });
});
