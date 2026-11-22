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

export interface PdfReportOptions {
  profileIds: string[];
  dateFrom: string;
  dateTo: string;
  statuses: ReadingStatus[];
  formatFilter: 'all' | BookFormat;
  tagFilter: string;
  layout: 'cards' | 'table';
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

function renderInlineChartSvg(buckets: MonthlyBucket[], year: number): string {
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
        <rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${barH}" rx="4" fill="#d97706" />
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

export function buildStandaloneReportHtml(
  report: PdfReportData,
  options: PdfReportOptions,
): string {
  const profileNames = report.profiles.map((p) => `${p.avatarEmoji} ${p.name}`).join(', ') || 'All Readers';
  const dateLabel =
    options.dateFrom || options.dateTo
      ? `${options.dateFrom || 'Start'} → ${options.dateTo || 'Present'}`
      : 'All Dates';

  const bookMap = new Map(report.books.map((b) => [b.id, b]));
  const profileMap = new Map(report.profiles.map((p) => [p.id, p]));

  const booksSection =
    options.layout === 'table'
      ? `
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
      `
      : `
        <div class="cards-grid">
          ${report.books
            .map((b) => {
              const owner = profileMap.get(b.profileId);
              return `
              <div class="book-card">
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
                ${options.includeNotes && b.notes ? `<p class="note">“${escapeHtml(b.notes)}”</p>` : ''}
                ${b.tags.length > 0 ? `<p class="tags">${escapeHtml(b.tags.map((t) => `#${t}`).join(' '))}</p>` : ''}
              </div>`;
            })
            .join('')}
        </div>
      `;

  const timelineSection =
    options.includeTimeline && report.timelineGroups.length > 0
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

  const logsSection =
    options.includeReadingLogs && report.logs.length > 0
      ? `
      <section>
        <h2>Reading Log Sessions (${report.logs.length})</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Book</th><th>Pages Read</th><th>Page Reached</th><th>Note</th></tr>
          </thead>
          <tbody>
            ${report.logs
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
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1c1917; background: #fff; margin: 0; padding: 24px; line-height: 1.45; }
  .no-print { margin-bottom: 16px; display: flex; justify-content: flex-end; }
  .print-btn { background: #d97706; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  @media print { .no-print { display: none; } body { padding: 0; } }
  header { border-bottom: 2px solid #e7e5e4; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-family: Georgia, serif; margin: 0 0 6px; font-size: 24px; }
  h2 { font-family: Georgia, serif; margin: 22px 0 10px; font-size: 18px; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; }
  .sub { font-size: 12px; color: #57534e; margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi { border: 1px solid #e7e5e4; border-radius: 10px; padding: 10px 12px; background: #fafaf9; }
  .kpi .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #78716c; }
  .kpi .val { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .cards-grid { display: grid; grid-template-columns: repeat(${options.orientation === 'landscape' ? 3 : 2}, 1fr); gap: 12px; }
  .book-card { border: 1px solid #e7e5e4; border-radius: 12px; padding: 12px; break-inside: avoid; page-break-inside: avoid; }
  .book-card h3 { font-family: Georgia, serif; margin: 6px 0 2px; font-size: 14px; }
  .author, .meta { font-size: 11px; color: #57534e; margin: 0; }
  .note { font-size: 11px; color: #44403c; font-style: italic; margin: 6px 0 0; }
  .tags { font-size: 10px; color: #b45309; margin: 6px 0 0; font-weight: 600; }
  .card-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pill { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: #f5f5f4; color: #44403c; }
  .pill.format { background: #ede9fe; color: #6d28d9; }
  .owner { font-size: 10px; color: #78716c; margin-left: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border-bottom: 1px solid #e7e5e4; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; color: #78716c; background: #fafaf9; }
  .timeline-group { margin-bottom: 10px; break-inside: avoid; }
  .timeline-group h4 { margin: 0 0 4px; font-size: 13px; }
  .timeline-group h4 span { font-weight: 400; color: #78716c; font-size: 11px; }
  .timeline-group ul { margin: 0; padding-left: 18px; font-size: 11px; }
</style>
</head>
<body>
  <div class="no-print"><button class="print-btn" onclick="window.print()">Print / Save as PDF</button></div>
  <header>
    <h1>${escapeHtml(options.title || 'BookLibrary Reading Report')}</h1>
    <p class="sub">Readers: ${escapeHtml(profileNames)} · Dates: ${escapeHtml(dateLabel)} · Format: ${escapeHtml(options.formatFilter)} ${options.tagFilter ? `· Tag: #${escapeHtml(options.tagFilter)}` : ''} · Generated ${escapeHtml(report.generatedAt.split('T')[0])}</p>
  </header>

  ${
    options.includeSummaryAndChart
      ? `
    <div class="kpis">
      <div class="kpi"><div class="lbl">Books</div><div class="val">${report.totalBooks}</div></div>
      <div class="kpi"><div class="lbl">Finished</div><div class="val">${report.finishedCount}</div></div>
      <div class="kpi"><div class="lbl">Pages Read</div><div class="val">${report.totalPagesRead.toLocaleString()}</div></div>
      <div class="kpi"><div class="lbl">Avg Rating</div><div class="val">${report.averageRating > 0 ? `${report.averageRating} ★` : '—'}</div></div>
    </div>
    <h2>${report.chartYear} Monthly Pages</h2>
    ${renderInlineChartSvg(report.monthlyBuckets, report.chartYear)}
  `
      : ''
  }

  <section>
    <h2>Library Catalog (${report.books.length})</h2>
    ${booksSection}
  </section>
  ${timelineSection}
  ${logsSection}
</body>
</html>`;
}
