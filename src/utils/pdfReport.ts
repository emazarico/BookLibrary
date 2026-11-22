import type {
  Book,
  BookFormat,
  BookLibraryDatabase,
  ReadingLog,
  ReadingStatus,
  UserProfile,
} from '../types/library';
import {
  buildTimelineGroups,
  computeMonthlyStats,
  type MonthlyBucket,
  type TimelineMonthGroup,
} from './stats';

export type PdfReportLayout = 'cards' | 'table' | 'poster' | 'checklist' | 'handout';
export type PdfReportTheme = 'classic' | 'modern' | 'minimal';

export interface PdfReportOptions {
  profileIds: string[];
  dateFrom: string;
  dateTo: string;
  statuses: ReadingStatus[];
  formatFilter: 'all' | BookFormat;
  tagFilter: string;
  layout: PdfReportLayout;
  theme?: PdfReportTheme;
  handoutBookId?: string;
  orientation: 'portrait' | 'landscape';
  includeSummaryAndChart: boolean;
  includeTimeline: boolean;
  includeNotes: boolean;
  includeReadingLogs: boolean;
  title: string;
}

export interface PdfReportData {
  generatedAt: string;
  profiles: UserProfile[];
  books: Book[];
  logs: ReadingLog[];
  totalBooks: number;
  finishedCount: number;
  readingCount: number;
  audiobookCount: number;
  totalPagesRead: number;
  averageRating: number;
  chartYear: number;
  monthlyBuckets: MonthlyBucket[];
  timelineGroups: TimelineMonthGroup[];
}

interface ThemeTokens {
  headingFont: string;
  bodyFont: string;
  surfaceTint: string;
  borderColor: string;
  accentColor: string;
  chartAccent: string;
  pillBg: string;
  pillColor: string;
  formatBg: string;
  formatColor: string;
  textColor: string;
  mutedColor: string;
}

const THEME_TOKENS: Record<PdfReportTheme, ThemeTokens> = {
  classic: {
    headingFont: 'Georgia, "Times New Roman", serif',
    bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    surfaceTint: '#faf8f4',
    borderColor: '#e7e5e4',
    accentColor: '#b45309',
    chartAccent: '#d97706',
    pillBg: '#f5f5f4',
    pillColor: '#44403c',
    formatBg: '#fef3c7',
    formatColor: '#92400e',
    textColor: '#1c1917',
    mutedColor: '#57534e',
  },
  modern: {
    headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    surfaceTint: '#f5f7ff',
    borderColor: '#dbeafe',
    accentColor: '#4f46e5',
    chartAccent: '#4f46e5',
    pillBg: '#eef2ff',
    pillColor: '#3730a3',
    formatBg: '#e0e7ff',
    formatColor: '#4338ca',
    textColor: '#0f172a',
    mutedColor: '#475569',
  },
  minimal: {
    headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    surfaceTint: '#ffffff',
    borderColor: '#d4d4d8',
    accentColor: '#18181b',
    chartAccent: '#3f3f46',
    pillBg: '#f4f4f5',
    pillColor: '#18181b',
    formatBg: '#f4f4f5',
    formatColor: '#27272a',
    textColor: '#111827',
    mutedColor: '#52525b',
  },
};

export const BOOK_CLUB_QUESTIONS: string[] = [
  'What moment, scene, or decision by a central character stayed with you most after closing the book?',
  'How did the setting or atmosphere shape the choices and conflicts throughout the story?',
  'Was there an unexpected turning point, reveal, or shift in perspective that changed how you read earlier chapters?',
  'What core themes or questions does the book raise, and how did its ending leave you feeling about them?',
  'If you listened to the audiobook or read a specific edition, how did narration, pacing, or structure affect the experience?',
  'Who else in the household or friend group would you recommend this book to, and why?',
];

function isDateInRange(dateStr: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const day = dateStr.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function buildPdfReportData(
  db: BookLibraryDatabase,
  options: PdfReportOptions,
): PdfReportData {
  const allActiveProfiles = db.profiles.filter((p) => !p.deletedAt);
  const selectedProfiles =
    options.profileIds.length === 0
      ? allActiveProfiles
      : allActiveProfiles.filter((p) => options.profileIds.includes(p.id));

  const profileIdSet = new Set(selectedProfiles.map((p) => p.id));
  const statusSet = new Set(options.statuses);
  const tagNeedle = options.tagFilter.trim().toLowerCase();

  const logsInRange = db.readingLogs.filter(
    (l) =>
      !l.deletedAt &&
      profileIdSet.has(l.profileId) &&
      isDateInRange(l.date, options.dateFrom, options.dateTo),
  );
  const bookIdsWithLogsInRange = new Set(logsInRange.map((l) => l.bookId));

  const matchingBooks = db.books
    .filter((b) => {
      if (b.deletedAt || !profileIdSet.has(b.profileId)) return false;
      if (!statusSet.has(b.status)) return false;
      if (options.formatFilter !== 'all' && (b.format || 'physical') !== options.formatFilter) {
        return false;
      }
      if (tagNeedle && !b.tags.some((t) => t.toLowerCase() === tagNeedle)) {
        return false;
      }

      if (options.dateFrom || options.dateTo) {
        const anchorDate = b.dateFinished || b.dateStarted || b.addedAt.slice(0, 10);
        const anchorMatches = isDateInRange(anchorDate, options.dateFrom, options.dateTo);
        if (!anchorMatches && !bookIdsWithLogsInRange.has(b.id)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) =>
      (b.dateFinished || b.dateStarted || b.updatedAt).localeCompare(
        a.dateFinished || a.dateStarted || a.updatedAt,
      ),
    );

  const matchingBookIds = new Set(matchingBooks.map((b) => b.id));
  const matchingLogs = logsInRange
    .filter((l) => matchingBookIds.has(l.bookId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  // Total pages read in report scope (avoiding double counting across logs + finished backfill)
  const allActiveLogsByBook = new Map<string, number>();
  for (const log of db.readingLogs) {
    if (log.deletedAt || !matchingBookIds.has(log.bookId)) continue;
    allActiveLogsByBook.set(
      log.bookId,
      (allActiveLogsByBook.get(log.bookId) ?? 0) + Math.max(0, log.pagesRead || 0),
    );
  }

  let totalPagesRead = matchingLogs.reduce((sum, l) => sum + Math.max(0, l.pagesRead || 0), 0);
  for (const b of matchingBooks) {
    if (b.status !== 'finished' || b.pageCount <= 0) continue;
    const finMatches =
      !options.dateFrom && !options.dateTo
        ? true
        : isDateInRange(b.dateFinished, options.dateFrom, options.dateTo);
    if (finMatches) {
      const loggedAllTime = allActiveLogsByBook.get(b.id) ?? 0;
      totalPagesRead += Math.max(0, b.pageCount - loggedAllTime);
    }
  }

  const finishedBooks = matchingBooks.filter((b) => b.status === 'finished');
  const ratedBooks = matchingBooks.filter((b) => b.rating > 0);
  const averageRating =
    ratedBooks.length > 0
      ? Number(
          (ratedBooks.reduce((sum, b) => sum + b.rating, 0) / ratedBooks.length).toFixed(2),
        )
      : 0;

  const yearCandidate = options.dateTo
    ? Number(options.dateTo.slice(0, 4))
    : options.dateFrom
      ? Number(options.dateFrom.slice(0, 4))
      : new Date().getFullYear();
  const chartYear = Number.isFinite(yearCandidate) && yearCandidate > 1900
    ? yearCandidate
    : new Date().getFullYear();

  const monthlyBuckets = computeMonthlyStats(matchingBooks, matchingLogs, chartYear, true);
  const timelineGroups = buildTimelineGroups(matchingBooks, 'all');

  return {
    generatedAt: new Date().toISOString(),
    profiles: selectedProfiles,
    books: matchingBooks,
    logs: matchingLogs,
    totalBooks: matchingBooks.length,
    finishedCount: finishedBooks.length,
    readingCount: matchingBooks.filter((b) => b.status === 'reading').length,
    audiobookCount: matchingBooks.filter((b) => b.format === 'audiobook').length,
    totalPagesRead,
    averageRating,
    chartYear,
    monthlyBuckets,
    timelineGroups,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isExternalHttpOrDataUrl(url?: string): url is string {
  if (!url) return false;
  return /^https?:\/\//i.test(url) || /^data:image\//i.test(url);
}

function renderInlineChartSvg(
  buckets: MonthlyBucket[],
  year: number,
  chartAccent = '#d97706',
): string {
  const maxVal = Math.max(10, ...buckets.map((b) => b.pagesRead));
  const width = 680;
  const height = 160;
  const topPad = 14;
  const bottomPad = 24;
  const plotH = height - topPad - bottomPad;
  const leftPad = 36;
  const slotW = (width - leftPad - 10) / 12;
  const barW = Math.min(30, slotW * 0.62);

  const bars = buckets
    .map((b, i) => {
      const x = leftPad + i * slotW + (slotW - barW) / 2;
      const barH = Math.round((b.pagesRead / maxVal) * plotH);
      const y = topPad + plotH - barH;
      return `
        <rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${barH}" rx="4" fill="${escapeHtml(chartAccent)}" />
        <text x="${(x + barW / 2).toFixed(1)}" y="${height - 7}" text-anchor="middle" font-size="10" fill="#57534e">${escapeHtml(b.label)}</text>
      `;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" style="max-height:170px" role="img" aria-label="${year} monthly pages chart">
      <line x1="${leftPad}" x2="${width - 10}" y1="${topPad + plotH}" y2="${topPad + plotH}" stroke="#d6d3d1" stroke-width="1" />
      <text x="${leftPad - 5}" y="${topPad + 8}" text-anchor="end" font-size="9" fill="#78716c">${maxVal}</text>
      <text x="${leftPad - 5}" y="${topPad + plotH}" text-anchor="end" font-size="9" fill="#78716c">0</text>
      ${bars}
    </svg>
  `;
}

function renderStandloneCoverThumb(book: Book, className = 'cover-thumb'): string {
  if (isExternalHttpOrDataUrl(book.coverUrl)) {
    return `<img class="${className}" src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" />`;
  }
  return `
    <div class="${className} poster-fallback" aria-hidden="true">
      <div class="fallback-title">${escapeHtml(book.title)}</div>
      <div class="fallback-author">${escapeHtml(book.author)}</div>
    </div>
  `;
}

export function buildStandaloneReportHtml(
  report: PdfReportData,
  options: PdfReportOptions,
): string {
  const theme: PdfReportTheme = options.theme ?? 'classic';
  const tokens = THEME_TOKENS[theme];
  const profileNames =
    report.profiles.map((p) => `${p.avatarEmoji} ${p.name}`).join(', ') || 'All Readers';
  const dateLabel =
    options.dateFrom || options.dateTo
      ? `${options.dateFrom || 'Start'} → ${options.dateTo || 'Present'}`
      : 'All Dates';

  const bookMap = new Map(report.books.map((b) => [b.id, b]));
  const profileMap = new Map(report.profiles.map((p) => [p.id, p]));

  const featuredBook =
    options.layout === 'handout'
      ? (options.handoutBookId ? bookMap.get(options.handoutBookId) : undefined) ?? report.books[0]
      : undefined;

  let booksSection = '';

  if (options.layout === 'handout') {
    if (!featuredBook) {
      booksSection = `<p class="sub">No matching book available to generate a Book Club Handout.</p>`;
    } else {
      const owner = profileMap.get(featuredBook.profileId);
      const seriesLabel = featuredBook.series
        ? `${featuredBook.series}${featuredBook.seriesIndex ? ` #${featuredBook.seriesIndex}` : ''}`
        : '';
      const metaItems = [
        featuredBook.publisher,
        featuredBook.publishYear ? String(featuredBook.publishYear) : '',
        featuredBook.pageCount > 0 ? `${featuredBook.pageCount} pages` : '',
        featuredBook.format ? featuredBook.format : '',
        featuredBook.language || '',
        seriesLabel,
        featuredBook.isbn ? `ISBN ${featuredBook.isbn}` : '',
        featuredBook.rating > 0 ? `${featuredBook.rating} ★` : '',
      ].filter(Boolean);

      booksSection = `
        <section class="handout-sheet">
          <div class="handout-kicker">Book Club Discussion Sheet${owner ? ` · ${escapeHtml(owner.avatarEmoji)} ${escapeHtml(owner.name)}` : ''}</div>
          <div class="handout-header">
            ${renderStandloneCoverThumb(featuredBook, 'handout-cover')}
            <div class="handout-meta-col">
              <h2>${escapeHtml(featuredBook.title)}</h2>
              <p class="handout-author">by ${escapeHtml(featuredBook.author)}</p>
              <div class="handout-pills">
                <span class="pill">${escapeHtml(featuredBook.status)}</span>
                ${featuredBook.ownership ? `<span class="pill format">${escapeHtml(featuredBook.ownership)}</span>` : ''}
                ${featuredBook.tags.map((t) => `<span class="pill">#${escapeHtml(t)}</span>`).join('')}
              </div>
              ${metaItems.length > 0 ? `<p class="handout-specs">${escapeHtml(metaItems.join(' · '))}</p>` : ''}
            </div>
          </div>

          ${
            featuredBook.synopsis
              ? `<div class="handout-box"><h3>Synopsis</h3><p>${escapeHtml(featuredBook.synopsis)}</p></div>`
              : ''
          }

          ${
            options.includeNotes && (featuredBook.review || featuredBook.notes || featuredBook.wantToReadNote)
              ? `
            <div class="handout-box">
              <h3>Reader Review &amp; Notes</h3>
              ${featuredBook.review ? `<p><strong>Review:</strong> ${escapeHtml(featuredBook.review)}</p>` : ''}
              ${featuredBook.wantToReadNote ? `<p><strong>Why Read:</strong> ${escapeHtml(featuredBook.wantToReadNote)}</p>` : ''}
              ${featuredBook.notes ? `<p><strong>Notes:</strong> ${escapeHtml(featuredBook.notes)}</p>` : ''}
            </div>`
              : ''
          }

          <div class="handout-box">
            <h3>Discussion Prompts</h3>
            <ol class="prompt-list">
              ${BOOK_CLUB_QUESTIONS.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}
            </ol>
          </div>

          <div class="handout-box">
            <h3>Meeting &amp; Takeaways Notes</h3>
            <div class="writing-lines">
              ${Array.from({ length: 8 })
                .map(() => `<div class="writing-line"></div>`)
                .join('')}
            </div>
          </div>
        </section>
      `;
    }
  } else if (options.layout === 'table') {
    booksSection = `
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Author</th>
            <th>Format</th>
            <th>Status</th>
            <th>Pages</th>
            <th>Rating</th>
            <th>Finished</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          ${report.books
            .map(
              (b) => `
            <tr>
              <td><strong>${escapeHtml(b.title)}</strong>${options.includeNotes && b.notes ? `<div class="note">${escapeHtml(b.notes)}</div>` : ''}</td>
              <td>${escapeHtml(b.author)}</td>
              <td>${escapeHtml(b.format || 'physical')}</td>
              <td>${escapeHtml(b.status)}</td>
              <td>${b.pageCount > 0 ? b.pageCount : '—'}</td>
              <td>${b.rating > 0 ? `${b.rating} ★` : '—'}</td>
              <td>${escapeHtml(b.dateFinished || '—')}</td>
              <td>${escapeHtml(b.tags.map((t) => `#${t}`).join(' '))}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  } else if (options.layout === 'poster') {
    booksSection = `
      <div class="poster-grid">
        ${report.books
          .map(
            (b) => `
          <div class="poster-tile">
            ${renderStandloneCoverThumb(b, 'poster-cover')}
            <div class="poster-title">${escapeHtml(b.title)}</div>
            <div class="poster-author">${escapeHtml(b.author)}</div>
            <div class="poster-meta">
              ${b.rating > 0 ? `<span class="pill">${b.rating} ★</span>` : `<span class="pill">${escapeHtml(b.status)}</span>`}
            </div>
          </div>`,
          )
          .join('')}
      </div>
    `;
  } else if (options.layout === 'checklist') {
    booksSection = `
      <table class="checklist">
        <thead>
          <tr>
            <th style="width:28px">Done</th>
            <th>Title</th>
            <th>Author</th>
            <th>Format / Ownership</th>
            <th>Pages</th>
            <th>Status</th>
            <th>ISBN</th>
          </tr>
        </thead>
        <tbody>
          ${report.books
            .map(
              (b) => `
            <tr>
              <td class="check-box">☐</td>
              <td><strong>${escapeHtml(b.title)}</strong></td>
              <td>${escapeHtml(b.author)}</td>
              <td>${escapeHtml([b.format || 'physical', b.ownership || 'owned'].join(' · '))}</td>
              <td>${b.pageCount > 0 ? b.pageCount : '—'}</td>
              <td>${escapeHtml(b.status)}</td>
              <td class="mono">${escapeHtml(b.isbn || '—')}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  } else {
    booksSection = `
      <div class="cards-grid">
        ${report.books
          .map((b) => {
            const owner = profileMap.get(b.profileId);
            return `
            <div class="book-card">
              <div class="card-row">
                ${isExternalHttpOrDataUrl(b.coverUrl) ? renderStandloneCoverThumb(b, 'card-cover') : ''}
                <div class="card-body">
                  <div class="card-head">
                    <span class="pill">${escapeHtml(b.status)}</span>
                    ${b.format && b.format !== 'physical' ? `<span class="pill format">${escapeHtml(b.format)}</span>` : ''}
                    ${report.profiles.length > 1 && owner ? `<span class="owner">${escapeHtml(owner.avatarEmoji)} ${escapeHtml(owner.name)}</span>` : ''}
                  </div>
                  <h3>${escapeHtml(b.title)}</h3>
                  <p class="author">${escapeHtml(b.author)}</p>
                  <p class="meta">
                    ${b.rating > 0 ? `${b.rating} ★` : 'Unrated'}
                    ${b.pageCount > 0 ? ` · ${b.pageCount} pp` : ''}
                    ${b.dateFinished ? ` · Finished ${escapeHtml(b.dateFinished)}` : ''}
                  </p>
                  ${options.includeNotes && b.review ? `<p class="note"><strong>Review:</strong> “${escapeHtml(b.review)}”</p>` : ''}
                  ${options.includeNotes && b.notes ? `<p class="note">“${escapeHtml(b.notes)}”</p>` : ''}
                  ${b.tags.length > 0 ? `<p class="tags">${escapeHtml(b.tags.map((t) => `#${t}`).join(' '))}</p>` : ''}
                </div>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    `;
  }

  const timelineSection =
    options.layout !== 'handout' && options.includeTimeline && report.timelineGroups.length > 0
      ? `
      <section>
        <h2>Reading Timeline</h2>
        ${report.timelineGroups
          .map(
            (g) => `
          <div class="timeline-group">
            <h4>${escapeHtml(g.label)} <span>(${g.books.length} books · ${g.totalPages.toLocaleString()} pp)</span></h4>
            <ul>
              ${g.books
                .map(
                  (b) =>
                    `<li><strong>${escapeHtml(b.title)}</strong> — ${escapeHtml(b.author)} ${b.dateFinished ? `(${escapeHtml(b.dateFinished)})` : ''}</li>`,
                )
                .join('')}
            </ul>
          </div>`,
          )
          .join('')}
      </section>
    `
      : '';

  const scopedLogs =
    options.layout === 'handout' && featuredBook
      ? report.logs.filter((l) => l.bookId === featuredBook.id)
      : report.logs;

  const logsSection =
    options.includeReadingLogs && scopedLogs.length > 0
      ? `
      <section>
        <h2>Reading Log Sessions (${scopedLogs.length})</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Book</th><th>Pages Read</th><th>Page Reached</th><th>Note</th></tr>
          </thead>
          <tbody>
            ${scopedLogs
              .map((l) => {
                const book = bookMap.get(l.bookId);
                return `
                  <tr>
                    <td>${escapeHtml(l.date)}</td>
                    <td>${escapeHtml(book?.title || 'Unknown')}</td>
                    <td>+${l.pagesRead}</td>
                    <td>${l.pageReached ?? '—'}</td>
                    <td>${escapeHtml(l.note || '')}</td>
                  </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </section>
    `
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(options.title || 'BookLibrary Report')}</title>
<style>
  @page { size: ${options.orientation}; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${tokens.bodyFont}; color: ${tokens.textColor}; background: #fff; margin: 0; padding: 24px; line-height: 1.45; }
  .no-print { margin-bottom: 16px; display: flex; justify-content: flex-end; }
  .print-btn { background: ${tokens.accentColor}; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  @media print { .no-print { display: none; } body { padding: 0; } }
  header { border-bottom: 2px solid ${tokens.borderColor}; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-family: ${tokens.headingFont}; margin: 0 0 6px; font-size: 24px; color: ${tokens.textColor}; }
  h2 { font-family: ${tokens.headingFont}; margin: 22px 0 10px; font-size: 18px; border-bottom: 1px solid ${tokens.borderColor}; padding-bottom: 4px; color: ${tokens.textColor}; }
  .sub { font-size: 12px; color: ${tokens.mutedColor}; margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi { border: 1px solid ${tokens.borderColor}; border-radius: 10px; padding: 10px 12px; background: ${tokens.surfaceTint}; }
  .kpi .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${tokens.mutedColor}; }
  .kpi .val { font-size: 18px; font-weight: 700; margin-top: 2px; color: ${tokens.accentColor}; }
  .cards-grid { display: grid; grid-template-columns: repeat(${options.orientation === 'landscape' ? 3 : 2}, 1fr); gap: 12px; }
  .book-card { border: 1px solid ${tokens.borderColor}; background: ${tokens.surfaceTint}; border-radius: 12px; padding: 12px; break-inside: avoid; page-break-inside: avoid; }
  .card-row { display: flex; gap: 10px; align-items: flex-start; }
  .card-cover { width: 48px; height: 72px; object-fit: cover; border-radius: 4px; border: 1px solid ${tokens.borderColor}; flex-shrink: 0; }
  .card-body { min-width: 0; flex: 1; }
  .book-card h3 { font-family: ${tokens.headingFont}; margin: 6px 0 2px; font-size: 14px; }
  .author, .meta { font-size: 11px; color: ${tokens.mutedColor}; margin: 0; }
  .note { font-size: 11px; color: ${tokens.textColor}; font-style: italic; margin: 6px 0 0; }
  .tags { font-size: 10px; color: ${tokens.accentColor}; margin: 6px 0 0; font-weight: 600; }
  .card-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pill { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: ${tokens.pillBg}; color: ${tokens.pillColor}; }
  .pill.format { background: ${tokens.formatBg}; color: ${tokens.formatColor}; }
  .owner { font-size: 10px; color: ${tokens.mutedColor}; margin-left: auto; }
  .poster-grid { display: grid; grid-template-columns: repeat(${options.orientation === 'landscape' ? 5 : 4}, 1fr); gap: 14px; }
  .poster-tile { border: 1px solid ${tokens.borderColor}; background: ${tokens.surfaceTint}; border-radius: 10px; padding: 8px; text-align: center; break-inside: avoid; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; }
  .poster-cover { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 6px; border: 1px solid ${tokens.borderColor}; margin-bottom: 6px; }
  .poster-fallback { width: 100%; aspect-ratio: 2 / 3; border-radius: 6px; border: 1px solid ${tokens.borderColor}; background: ${tokens.pillBg}; padding: 10px 8px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .fallback-title { font-family: ${tokens.headingFont}; font-weight: 700; font-size: 11px; line-height: 1.25; color: ${tokens.textColor}; }
  .fallback-author { font-size: 10px; color: ${tokens.mutedColor}; margin-top: 4px; }
  .poster-title { font-family: ${tokens.headingFont}; font-weight: 700; font-size: 11px; line-height: 1.25; margin-top: 2px; }
  .poster-author { font-size: 10px; color: ${tokens.mutedColor}; margin: 2px 0 4px; }
  .poster-meta { margin-top: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid ${tokens.borderColor}; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; color: ${tokens.mutedColor}; background: ${tokens.surfaceTint}; }
  .check-box { text-align: center; font-size: 14px; line-height: 1; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
  .handout-sheet { border: 1.5px solid ${tokens.borderColor}; background: ${tokens.surfaceTint}; border-radius: 14px; padding: 18px; }
  .handout-kicker { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${tokens.accentColor}; margin-bottom: 10px; }
  .handout-header { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 14px; }
  .handout-cover { width: 96px; height: 144px; object-fit: cover; border-radius: 8px; border: 1px solid ${tokens.borderColor}; flex-shrink: 0; }
  .handout-meta-col { flex: 1; min-width: 0; }
  .handout-meta-col h2 { margin: 0 0 4px; border: none; padding: 0; font-size: 20px; }
  .handout-author { margin: 0 0 8px; font-size: 13px; color: ${tokens.mutedColor}; font-weight: 600; }
  .handout-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .handout-specs { font-size: 11px; color: ${tokens.mutedColor}; margin: 0; }
  .handout-box { background: #fff; border: 1px solid ${tokens.borderColor}; border-radius: 10px; padding: 12px 14px; margin-top: 12px; break-inside: avoid; page-break-inside: avoid; }
  .handout-box h3 { font-family: ${tokens.headingFont}; font-size: 13px; margin: 0 0 6px; color: ${tokens.accentColor}; }
  .handout-box p { font-size: 11px; margin: 4px 0 0; }
  .prompt-list { margin: 4px 0 0; padding-left: 18px; font-size: 11px; }
  .prompt-list li { margin-bottom: 5px; }
  .writing-lines { margin-top: 6px; }
  .writing-line { height: 22px; border-bottom: 1px dashed ${tokens.borderColor}; }
  .timeline-group { margin-bottom: 10px; break-inside: avoid; }
  .timeline-group h4 { margin: 0 0 4px; font-size: 13px; }
  .timeline-group h4 span { font-weight: 400; color: ${tokens.mutedColor}; font-size: 11px; }
  .timeline-group ul { margin: 0; padding-left: 18px; font-size: 11px; }
</style>
</head>
<body data-theme="${theme}" data-layout="${options.layout}">
  <div class="no-print"><button class="print-btn" onclick="window.print()">Print / Save as PDF</button></div>
  <header>
    <h1>${escapeHtml(options.title || 'BookLibrary Reading Report')}</h1>
    <p class="sub">Readers: ${escapeHtml(profileNames)} · Dates: ${escapeHtml(dateLabel)} · Format: ${escapeHtml(options.formatFilter)} ${options.tagFilter ? `· Tag: #${escapeHtml(options.tagFilter)}` : ''} · Theme: ${escapeHtml(theme)} · Generated ${escapeHtml(report.generatedAt.split('T')[0])}</p>
  </header>

  ${
    options.layout !== 'handout' && options.includeSummaryAndChart
      ? `
    <div class="kpis">
      <div class="kpi"><div class="lbl">Books</div><div class="val">${report.totalBooks}</div></div>
      <div class="kpi"><div class="lbl">Finished</div><div class="val">${report.finishedCount}</div></div>
      <div class="kpi"><div class="lbl">Pages Read</div><div class="val">${report.totalPagesRead.toLocaleString()}</div></div>
      <div class="kpi"><div class="lbl">Avg Rating</div><div class="val">${report.averageRating > 0 ? `${report.averageRating} ★` : '—'}</div></div>
    </div>
    <h2>${report.chartYear} Monthly Pages</h2>
    ${renderInlineChartSvg(report.monthlyBuckets, report.chartYear, tokens.chartAccent)}
  `
      : ''
  }

  ${
    options.layout === 'handout'
      ? booksSection
      : `<section><h2>Library Catalog (${report.books.length})</h2>${booksSection}</section>`
  }
  ${timelineSection}
  ${logsSection}
</body>
</html>`;
}
