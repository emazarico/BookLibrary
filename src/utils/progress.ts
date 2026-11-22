import type { Book, ProgressUnit, ReadingLog } from '../types/library';

export interface BookProgressInfo {
  unit: ProgressUnit;
  current: number;
  total: number;
  percent: number | null;
  label: string;
  shortLabel: string;
}

/**
 * Parses duration strings into whole minutes:
 * - "16:10" -> 970
 * - "0:45"  -> 45
 * - "4h 35m" -> 275
 * - "2h" -> 120
 * - "45m" -> 45
 * - "90" -> 90
 */
export function parseDurationToMinutes(input: string): number {
  const trimmed = input.trim();
  if (!trimmed || trimmed.startsWith('-')) return 0;

  // hh:mm format
  const colonMatch = /^(\d{1,4}):(\d{1,2})$/.exec(trimmed);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const mins = Number(colonMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(mins) && hours >= 0 && mins >= 0 && mins < 60) {
      return hours * 60 + mins;
    }
    return 0;
  }

  // Xh Ym / Xh / Ym format
  const hmMatch = /^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/i.exec(
    trimmed,
  );
  if (hmMatch && (hmMatch[1] !== undefined || hmMatch[2] !== undefined)) {
    const hours = hmMatch[1] ? Number(hmMatch[1]) : 0;
    const mins = hmMatch[2] ? Number(hmMatch[2]) : 0;
    if (Number.isFinite(hours) && Number.isFinite(mins)) {
      return Math.max(0, hours * 60 + mins);
    }
  }

  // Plain integer minutes
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) && num >= 0 ? Math.round(num) : 0;
  }

  return 0;
}

export function formatMinutesHHMM(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatMinutesHuman(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes || 0));
  if (safe === 0) return '0m';
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function getBookProgressInfo(book: Book): BookProgressInfo {
  const unit: ProgressUnit = book.progressUnit || 'pages';

  if (unit === 'duration') {
    const current = Math.max(0, book.currentMinutes ?? 0);
    const total = Math.max(0, book.totalMinutes ?? 0);
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null;
    const label =
      total > 0
        ? `${formatMinutesHuman(current)} / ${formatMinutesHuman(total)}`
        : `${formatMinutesHuman(current)} listened`;
    const shortLabel =
      total > 0
        ? `${formatMinutesHHMM(current)} / ${formatMinutesHHMM(total)}`
        : formatMinutesHHMM(current);
    return { unit, current, total, percent, label, shortLabel };
  }

  if (unit === 'chapters') {
    const current = Math.max(0, book.currentChapter ?? 0);
    const total = Math.max(0, book.totalChapters ?? 0);
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null;
    const label = total > 0 ? `Ch. ${current} / ${total}` : `Ch. ${current}`;
    return { unit, current, total, percent, label, shortLabel: label };
  }

  const current = Math.max(0, book.currentPage || 0);
  const total = Math.max(0, book.pageCount || 0);
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null;
  const label = total > 0 ? `${current} / ${total} pp` : `Page ${current}`;
  const shortLabel = total > 0 ? `p. ${current}/${total}` : `p. ${current}`;
  return { unit, current, total, percent, label, shortLabel };
}

export function formatReadingLogBadge(log: ReadingLog): {
  deltaLabel: string;
  reachedLabel?: string;
} {
  const unit: ProgressUnit =
    log.unit ||
    (log.minutesListened !== undefined
      ? 'duration'
      : log.chaptersRead !== undefined
        ? 'chapters'
        : 'pages');

  if (unit === 'duration') {
    const mins = Math.max(0, log.minutesListened ?? 0);
    return {
      deltaLabel: `+${formatMinutesHuman(mins)}`,
      reachedLabel:
        log.minuteReached !== undefined
          ? `Reached ${formatMinutesHHMM(log.minuteReached)}`
          : undefined,
    };
  }

  if (unit === 'chapters') {
    const ch = Math.max(0, log.chaptersRead ?? 0);
    return {
      deltaLabel: `+${ch} ch`,
      reachedLabel:
        log.chapterReached !== undefined ? `Reached Ch. ${log.chapterReached}` : undefined,
    };
  }

  return {
    deltaLabel: `+${Math.max(0, log.pagesRead)} pp`,
    reachedLabel: log.pageReached !== undefined ? `Reached p. ${log.pageReached}` : undefined,
  };
}
