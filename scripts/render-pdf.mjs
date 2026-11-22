#!/usr/bin/env node
/**
 * Optional CLI PDF & Printable HTML Renderer for BookLibrary JSON backups (P5.4).
 *
 * Usage:
 *   npm run pdf:cli -- --input household.json --output yearbook.pdf --layout cards --theme classic
 *   node scripts/render-pdf.mjs --input household.json --output report.html --html-only
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const USAGE = `BookLibrary CLI Report & Yearbook Renderer

Usage:
  node scripts/render-pdf.mjs --input <backup.json> [options]

Options:
  --input <file>          Path to BookLibrary Household or Profile JSON backup (required)
  --output <file>         Output PDF or HTML path (default: booklibrary-report.pdf or .html)
  --reader <name|id>      Filter reader(s) by name or ID (repeatable or comma-separated)
  --from <YYYY-MM-DD>     Start date filter
  --to <YYYY-MM-DD>       End date filter
  --status <csv>          Statuses to include (finished,reading,want-to-read,dnf)
  --format <fmt>          Filter format: all | physical | ebook | audiobook (default: all)
  --tag <tag>             Filter tag (without #)
  --layout <layout>       cards | table | poster | checklist | handout (default: cards)
  --theme <theme>         classic | modern | minimal (default: classic)
  --orientation <orient>  portrait | landscape (default: portrait)
  --title <text>          Custom report title
  --book <title|id>       Book ID or title substring for --layout handout
  --no-chart              Omit KPIs and monthly pages chart
  --no-timeline           Omit Reading Timeline section
  --no-notes              Omit reviews and notes
  --with-logs             Include Reading Log sessions table
  --html-only             Write standalone printable HTML without launching Playwright
  -h, --help              Show this help text
`;

const THEME_TOKENS = {
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

const BOOK_CLUB_QUESTIONS = [
  'What moment, scene, or decision by a central character stayed with you most after closing the book?',
  'How did the setting or atmosphere shape the choices and conflicts throughout the story?',
  'Was there an unexpected turning point, reveal, or shift in perspective that changed how you read earlier chapters?',
  'What core themes or questions does the book raise, and how did its ending leave you feeling about them?',
  'If you listened to the audiobook or read a specific edition, how did narration, pacing, or structure affect the experience?',
  'Who else in the household or friend group would you recommend this book to, and why?',
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseArgs(argv) {
  const opts = {
    input: '',
    output: '',
    readers: [],
    dateFrom: '',
    dateTo: '',
    statuses: ['finished', 'reading', 'want-to-read', 'dnf'],
    formatFilter: 'all',
    tagFilter: '',
    layout: 'cards',
    theme: 'classic',
    orientation: 'portrait',
    title: 'BookLibrary Reading Report',
    bookQuery: '',
    includeSummaryAndChart: true,
    includeTimeline: true,
    includeNotes: true,
    includeReadingLogs: false,
    htmlOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[++i];
    };

    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--input') opts.input = next();
    else if (arg === '--output') opts.output = next();
    else if (arg === '--reader') {
      opts.readers.push(
        ...next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (arg === '--from') opts.dateFrom = next();
    else if (arg === '--to') opts.dateTo = next();
    else if (arg === '--status') {
      opts.statuses = next()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === '--format') opts.formatFilter = next();
    else if (arg === '--tag') opts.tagFilter = next().replace(/^#/, '');
    else if (arg === '--layout') opts.layout = next();
    else if (arg === '--theme') opts.theme = next();
    else if (arg === '--orientation') opts.orientation = next();
    else if (arg === '--title') opts.title = next();
    else if (arg === '--book') opts.bookQuery = next();
    else if (arg === '--no-chart') opts.includeSummaryAndChart = false;
    else if (arg === '--no-timeline') opts.includeTimeline = false;
    else if (arg === '--no-notes') opts.includeNotes = false;
    else if (arg === '--with-logs') opts.includeReadingLogs = true;
    else if (arg === '--html-only') opts.htmlOnly = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return opts;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isExternalHttpOrDataUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https?:\/\//i.test(url) || /^data:image\//i.test(url);
}

function isDateInRange(dateStr, from, to) {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const day = String(dateStr).slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function parseInputDatabase(rawJson) {
  const parsed = JSON.parse(rawJson);
  if (parsed && Array.isArray(parsed.profiles) && Array.isArray(parsed.books)) {
    return {
      profiles: parsed.profiles.filter((p) => !p.deletedAt),
      books: parsed.books.filter((b) => !b.deletedAt),
      readingLogs: (parsed.readingLogs || []).filter((l) => !l.deletedAt),
    };
  }
  if (parsed && parsed.profile && Array.isArray(parsed.books)) {
    return {
      profiles: parsed.profile.deletedAt ? [] : [parsed.profile],
      books: parsed.books.filter((b) => !b.deletedAt),
      readingLogs: (parsed.readingLogs || []).filter((l) => !l.deletedAt),
    };
  }
  throw new Error('Input JSON is not a valid BookLibrary Household or Profile backup.');
}

function buildReportData(db, opts) {
  const selectedProfiles =
    opts.readers.length === 0
      ? db.profiles
      : db.profiles.filter((p) =>
          opts.readers.some(
            (r) =>
              p.id === r || p.name.toLowerCase() === r.toLowerCase(),
          ),
        );

  const profileIdSet = new Set(selectedProfiles.map((p) => p.id));
  const statusSet = new Set(opts.statuses);
  const tagNeedle = opts.tagFilter.trim().toLowerCase();

  const logsInRange = db.readingLogs.filter(
    (l) => profileIdSet.has(l.profileId) && isDateInRange(l.date, opts.dateFrom, opts.dateTo),
  );
  const bookIdsWithLogsInRange = new Set(logsInRange.map((l) => l.bookId));

  const matchingBooks = db.books
    .filter((b) => {
      if (!profileIdSet.has(b.profileId)) return false;
      if (!statusSet.has(b.status)) return false;
      if (opts.formatFilter !== 'all' && (b.format || 'physical') !== opts.formatFilter) {
        return false;
      }
      if (tagNeedle && !(b.tags || []).some((t) => t.toLowerCase() === tagNeedle)) {
        return false;
      }
      if (opts.dateFrom || opts.dateTo) {
        const anchorDate = b.dateFinished || b.dateStarted || (b.addedAt || '').slice(0, 10);
        const anchorMatches = isDateInRange(anchorDate, opts.dateFrom, opts.dateTo);
        if (!anchorMatches && !bookIdsWithLogsInRange.has(b.id)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) =>
      String(b.dateFinished || b.dateStarted || b.updatedAt || '').localeCompare(
        String(a.dateFinished || a.dateStarted || a.updatedAt || ''),
      ),
    );

  const matchingBookIds = new Set(matchingBooks.map((b) => b.id));
  const matchingLogs = logsInRange
    .filter((l) => matchingBookIds.has(l.bookId))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const allActiveLogsByBook = new Map();
  for (const log of db.readingLogs) {
    if (!matchingBookIds.has(log.bookId)) continue;
    allActiveLogsByBook.set(
      log.bookId,
      (allActiveLogsByBook.get(log.bookId) ?? 0) + Math.max(0, log.pagesRead || 0),
    );
  }

  let totalPagesRead = matchingLogs.reduce((sum, l) => sum + Math.max(0, l.pagesRead || 0), 0);
  for (const b of matchingBooks) {
    if (b.status !== 'finished' || (b.pageCount || 0) <= 0) continue;
    const finMatches =
      !opts.dateFrom && !opts.dateTo
        ? true
        : isDateInRange(b.dateFinished, opts.dateFrom, opts.dateTo);
    if (finMatches) {
      const loggedAllTime = allActiveLogsByBook.get(b.id) ?? 0;
      totalPagesRead += Math.max(0, b.pageCount - loggedAllTime);
    }
  }

  const finishedBooks = matchingBooks.filter((b) => b.status === 'finished');
  const ratedBooks = matchingBooks.filter((b) => (b.rating || 0) > 0);
  const averageRating =
    ratedBooks.length > 0
      ? Number((ratedBooks.reduce((s, b) => s + b.rating, 0) / ratedBooks.length).toFixed(2))
      : 0;

  const yearCandidate = opts.dateTo
    ? Number(opts.dateTo.slice(0, 4))
    : opts.dateFrom
      ? Number(opts.dateFrom.slice(0, 4))
      : new Date().getFullYear();
  const chartYear = Number.isFinite(yearCandidate) && yearCandidate > 1900 ? yearCandidate : new Date().getFullYear();

  const monthlyBuckets = MONTH_LABELS.map((label) => ({ label, pagesRead: 0 }));
  for (const log of matchingLogs) {
    if (!String(log.date).startsWith(`${chartYear}-`)) continue;
    const mIdx = Number(log.date.slice(5, 7)) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      monthlyBuckets[mIdx].pagesRead += Math.max(0, log.pagesRead || 0);
    }
  }
  for (const b of finishedBooks) {
    if (!b.dateFinished || !String(b.dateFinished).startsWith(`${chartYear}-`) || (b.pageCount || 0) <= 0) continue;
    const mIdx = Number(b.dateFinished.slice(5, 7)) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      const logged = allActiveLogsByBook.get(b.id) ?? 0;
      monthlyBuckets[mIdx].pagesRead += Math.max(0, b.pageCount - logged);
    }
  }

  const timelineMap = new Map();
  for (const b of finishedBooks) {
    if (!b.dateFinished) continue;
    const monthKey = b.dateFinished.slice(0, 7);
    const list = timelineMap.get(monthKey) || [];
    list.push(b);
    timelineMap.set(monthKey, list);
  }
  const timelineGroups = Array.from(timelineMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, books]) => {
      const [y, m] = monthKey.split('-').map(Number);
      const label = `${MONTH_LABELS[(m || 1) - 1]} ${y}`;
      const totalPages = books.reduce((s, b) => s + Math.max(0, b.pageCount || 0), 0);
      return { monthKey, label, books, totalPages };
    });

  return {
    generatedAt: new Date().toISOString(),
    profiles: selectedProfiles,
    books: matchingBooks,
    logs: matchingLogs,
    totalBooks: matchingBooks.length,
    finishedCount: finishedBooks.length,
    totalPagesRead,
    averageRating,
    chartYear,
    monthlyBuckets,
    timelineGroups,
  };
}

function renderInlineChartSvg(buckets, year, chartAccent) {
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

function renderCoverThumb(book, className) {
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

function buildHtmlDocument(report, opts) {
  const theme = THEME_TOKENS[opts.theme] ? opts.theme : 'classic';
  const tokens = THEME_TOKENS[theme];
  const profileNames = report.profiles.map((p) => `${p.avatarEmoji || ''} ${p.name}`).join(', ') || 'All Readers';
  const dateLabel = opts.dateFrom || opts.dateTo ? `${opts.dateFrom || 'Start'} -> ${opts.dateTo || 'Present'}` : 'All Dates';
  const bookMap = new Map(report.books.map((b) => [b.id, b]));
  const profileMap = new Map(report.profiles.map((p) => [p.id, p]));

  const featuredBook =
    opts.layout === 'handout'
      ? (opts.bookQuery
          ? report.books.find(
              (b) =>
                b.id === opts.bookQuery ||
                b.title.toLowerCase().includes(opts.bookQuery.toLowerCase()),
            )
          : undefined) ?? report.books[0]
      : undefined;

  let booksSection = '';

  if (opts.layout === 'handout') {
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
        featuredBook.format || '',
        featuredBook.language || '',
        seriesLabel,
        featuredBook.isbn ? `ISBN ${featuredBook.isbn}` : '',
        featuredBook.rating > 0 ? `${featuredBook.rating} ★` : '',
      ].filter(Boolean);

      booksSection = `
        <section class="handout-sheet">
          <div class="handout-kicker">Book Club Discussion Sheet${owner ? ` · ${escapeHtml(owner.avatarEmoji || '')} ${escapeHtml(owner.name)}` : ''}</div>
          <div class="handout-header">
            ${renderCoverThumb(featuredBook, 'handout-cover')}
            <div class="handout-meta-col">
              <h2>${escapeHtml(featuredBook.title)}</h2>
              <p class="handout-author">by ${escapeHtml(featuredBook.author)}</p>
              <div class="handout-pills">
                <span class="pill">${escapeHtml(featuredBook.status)}</span>
                ${featuredBook.ownership ? `<span class="pill format">${escapeHtml(featuredBook.ownership)}</span>` : ''}
                ${(featuredBook.tags || []).map((t) => `<span class="pill">#${escapeHtml(t)}</span>`).join('')}
              </div>
              ${metaItems.length > 0 ? `<p class="handout-specs">${escapeHtml(metaItems.join(' · '))}</p>` : ''}
            </div>
          </div>
          ${featuredBook.synopsis ? `<div class="handout-box"><h3>Synopsis</h3><p>${escapeHtml(featuredBook.synopsis)}</p></div>` : ''}
          ${
            opts.includeNotes && (featuredBook.review || featuredBook.notes || featuredBook.wantToReadNote)
              ? `<div class="handout-box"><h3>Reader Review &amp; Notes</h3>${featuredBook.review ? `<p><strong>Review:</strong> ${escapeHtml(featuredBook.review)}</p>` : ''}${featuredBook.wantToReadNote ? `<p><strong>Why Read:</strong> ${escapeHtml(featuredBook.wantToReadNote)}</p>` : ''}${featuredBook.notes ? `<p><strong>Notes:</strong> ${escapeHtml(featuredBook.notes)}</p>` : ''}</div>`
              : ''
          }
          <div class="handout-box">
            <h3>Discussion Prompts</h3>
            <ol class="prompt-list">${BOOK_CLUB_QUESTIONS.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ol>
          </div>
          <div class="handout-box">
            <h3>Meeting &amp; Takeaways Notes</h3>
            <div class="writing-lines">${Array.from({ length: 8 }).map(() => `<div class="writing-line"></div>`).join('')}</div>
          </div>
        </section>
      `;
    }
  } else if (opts.layout === 'table') {
    booksSection = `
      <table>
        <thead><tr><th>Title</th><th>Author</th><th>Format</th><th>Status</th><th>Pages</th><th>Rating</th><th>Finished</th><th>Tags</th></tr></thead>
        <tbody>
          ${report.books
            .map(
              (b) => `
            <tr>
              <td><strong>${escapeHtml(b.title)}</strong>${opts.includeNotes && b.notes ? `<div class="note">${escapeHtml(b.notes)}</div>` : ''}</td>
              <td>${escapeHtml(b.author)}</td>
              <td>${escapeHtml(b.format || 'physical')}</td>
              <td>${escapeHtml(b.status)}</td>
              <td>${b.pageCount > 0 ? b.pageCount : '—'}</td>
              <td>${b.rating > 0 ? `${b.rating} ★` : '—'}</td>
              <td>${escapeHtml(b.dateFinished || '—')}</td>
              <td>${escapeHtml((b.tags || []).map((t) => `#${t}`).join(' '))}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  } else if (opts.layout === 'poster') {
    booksSection = `
      <div class="poster-grid">
        ${report.books
          .map(
            (b) => `
          <div class="poster-tile">
            ${renderCoverThumb(b, 'poster-cover')}
            <div class="poster-title">${escapeHtml(b.title)}</div>
            <div class="poster-author">${escapeHtml(b.author)}</div>
            <div class="poster-meta">${b.rating > 0 ? `<span class="pill">${b.rating} ★</span>` : `<span class="pill">${escapeHtml(b.status)}</span>`}</div>
          </div>`,
          )
          .join('')}
      </div>
    `;
  } else if (opts.layout === 'checklist') {
    booksSection = `
      <table class="checklist">
        <thead><tr><th style="width:28px">Done</th><th>Title</th><th>Author</th><th>Format / Ownership</th><th>Pages</th><th>Status</th><th>ISBN</th></tr></thead>
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
                ${isExternalHttpOrDataUrl(b.coverUrl) ? renderCoverThumb(b, 'card-cover') : ''}
                <div class="card-body">
                  <div class="card-head">
                    <span class="pill">${escapeHtml(b.status)}</span>
                    ${b.format && b.format !== 'physical' ? `<span class="pill format">${escapeHtml(b.format)}</span>` : ''}
                    ${report.profiles.length > 1 && owner ? `<span class="owner">${escapeHtml(owner.avatarEmoji || '')} ${escapeHtml(owner.name)}</span>` : ''}
                  </div>
                  <h3>${escapeHtml(b.title)}</h3>
                  <p class="author">${escapeHtml(b.author)}</p>
                  <p class="meta">${b.rating > 0 ? `${b.rating} ★` : 'Unrated'}${b.pageCount > 0 ? ` · ${b.pageCount} pp` : ''}${b.dateFinished ? ` · Finished ${escapeHtml(b.dateFinished)}` : ''}</p>
                  ${opts.includeNotes && b.review ? `<p class="note"><strong>Review:</strong> “${escapeHtml(b.review)}”</p>` : ''}
                  ${opts.includeNotes && b.notes ? `<p class="note">“${escapeHtml(b.notes)}”</p>` : ''}
                  ${(b.tags || []).length > 0 ? `<p class="tags">${escapeHtml(b.tags.map((t) => `#${t}`).join(' '))}</p>` : ''}
                </div>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    `;
  }

  const timelineSection =
    opts.layout !== 'handout' && opts.includeTimeline && report.timelineGroups.length > 0
      ? `
      <section>
        <h2>Reading Timeline</h2>
        ${report.timelineGroups
          .map(
            (g) => `
          <div class="timeline-group">
            <h4>${escapeHtml(g.label)} <span>(${g.books.length} books · ${g.totalPages.toLocaleString()} pp)</span></h4>
            <ul>${g.books.map((b) => `<li><strong>${escapeHtml(b.title)}</strong> — ${escapeHtml(b.author)} ${b.dateFinished ? `(${escapeHtml(b.dateFinished)})` : ''}</li>`).join('')}</ul>
          </div>`,
          )
          .join('')}
      </section>`
      : '';

  const scopedLogs =
    opts.layout === 'handout' && featuredBook
      ? report.logs.filter((l) => l.bookId === featuredBook.id)
      : report.logs;

  const logsSection =
    opts.includeReadingLogs && scopedLogs.length > 0
      ? `
      <section>
        <h2>Reading Log Sessions (${scopedLogs.length})</h2>
        <table>
          <thead><tr><th>Date</th><th>Book</th><th>Pages Read</th><th>Page Reached</th><th>Note</th></tr></thead>
          <tbody>
            ${scopedLogs
              .map((l) => {
                const book = bookMap.get(l.bookId);
                return `<tr><td>${escapeHtml(l.date)}</td><td>${escapeHtml(book?.title || 'Unknown')}</td><td>+${l.pagesRead}</td><td>${l.pageReached ?? '—'}</td><td>${escapeHtml(l.note || '')}</td></tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </section>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(opts.title)}</title>
<style>
  @page { size: ${opts.orientation}; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: ${tokens.bodyFont}; color: ${tokens.textColor}; background: #fff; margin: 0; padding: 24px; line-height: 1.45; }
  header { border-bottom: 2px solid ${tokens.borderColor}; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-family: ${tokens.headingFont}; margin: 0 0 6px; font-size: 24px; }
  h2 { font-family: ${tokens.headingFont}; margin: 22px 0 10px; font-size: 18px; border-bottom: 1px solid ${tokens.borderColor}; padding-bottom: 4px; }
  .sub { font-size: 12px; color: ${tokens.mutedColor}; margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi { border: 1px solid ${tokens.borderColor}; border-radius: 10px; padding: 10px 12px; background: ${tokens.surfaceTint}; }
  .kpi .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${tokens.mutedColor}; }
  .kpi .val { font-size: 18px; font-weight: 700; margin-top: 2px; color: ${tokens.accentColor}; }
  .cards-grid { display: grid; grid-template-columns: repeat(${opts.orientation === 'landscape' ? 3 : 2}, 1fr); gap: 12px; }
  .book-card { border: 1px solid ${tokens.borderColor}; background: ${tokens.surfaceTint}; border-radius: 12px; padding: 12px; break-inside: avoid; }
  .card-row { display: flex; gap: 10px; align-items: flex-start; }
  .card-cover { width: 48px; height: 72px; object-fit: cover; border-radius: 4px; border: 1px solid ${tokens.borderColor}; flex-shrink: 0; }
  .card-body { min-width: 0; flex: 1; }
  .book-card h3 { font-family: ${tokens.headingFont}; margin: 6px 0 2px; font-size: 14px; }
  .author, .meta { font-size: 11px; color: ${tokens.mutedColor}; margin: 0; }
  .note { font-size: 11px; font-style: italic; margin: 6px 0 0; }
  .tags { font-size: 10px; color: ${tokens.accentColor}; margin: 6px 0 0; font-weight: 600; }
  .card-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pill { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: ${tokens.pillBg}; color: ${tokens.pillColor}; }
  .pill.format { background: ${tokens.formatBg}; color: ${tokens.formatColor}; }
  .owner { font-size: 10px; color: ${tokens.mutedColor}; margin-left: auto; }
  .poster-grid { display: grid; grid-template-columns: repeat(${opts.orientation === 'landscape' ? 5 : 4}, 1fr); gap: 14px; }
  .poster-tile { border: 1px solid ${tokens.borderColor}; background: ${tokens.surfaceTint}; border-radius: 10px; padding: 8px; text-align: center; break-inside: avoid; display: flex; flex-direction: column; align-items: center; }
  .poster-cover { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 6px; border: 1px solid ${tokens.borderColor}; margin-bottom: 6px; }
  .poster-fallback { width: 100%; aspect-ratio: 2 / 3; border-radius: 6px; border: 1px solid ${tokens.borderColor}; background: ${tokens.pillBg}; padding: 10px 8px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .fallback-title { font-family: ${tokens.headingFont}; font-weight: 700; font-size: 11px; line-height: 1.25; }
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
  .handout-box { background: #fff; border: 1px solid ${tokens.borderColor}; border-radius: 10px; padding: 12px 14px; margin-top: 12px; break-inside: avoid; }
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
<body data-theme="${escapeHtml(theme)}" data-layout="${escapeHtml(opts.layout)}">
  <header>
    <h1>${escapeHtml(opts.title)}</h1>
    <p class="sub">Readers: ${escapeHtml(profileNames)} · Dates: ${escapeHtml(dateLabel)} · Format: ${escapeHtml(opts.formatFilter)} ${opts.tagFilter ? `· Tag: #${escapeHtml(opts.tagFilter)}` : ''} · Theme: ${escapeHtml(theme)} · Generated ${escapeHtml(report.generatedAt.split('T')[0])}</p>
  </header>
  ${
    opts.layout !== 'handout' && opts.includeSummaryAndChart
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
  ${opts.layout === 'handout' ? booksSection : `<section><h2>Library Catalog (${report.books.length})</h2>${booksSection}</section>`}
  ${timelineSection}
  ${logsSection}
</body>
</html>`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!opts.input) {
    process.stderr.write('Error: --input <backup.json> is required.\n\n' + USAGE);
    process.exitCode = 1;
    return;
  }

  const validLayouts = new Set(['cards', 'table', 'poster', 'checklist', 'handout']);
  if (!validLayouts.has(opts.layout)) {
    throw new Error(`Unsupported layout "${opts.layout}". Expected: cards, table, poster, checklist, handout.`);
  }
  if (!THEME_TOKENS[opts.theme]) {
    throw new Error(`Unsupported theme "${opts.theme}". Expected: classic, modern, minimal.`);
  }

  const rawJson = await fs.readFile(path.resolve(opts.input), 'utf8');
  const db = parseInputDatabase(rawJson);
  const report = buildReportData(db, opts);
  const html = buildHtmlDocument(report, opts);

  const defaultOut = opts.htmlOnly ? 'booklibrary-report.html' : 'booklibrary-report.pdf';
  const outPath = path.resolve(opts.output || defaultOut);

  if (opts.htmlOnly || outPath.toLowerCase().endsWith('.html')) {
    await fs.writeFile(outPath, html, 'utf8');
    process.stdout.write(`Wrote printable HTML report (${report.totalBooks} books) to ${outPath}\n`);
    return;
  }

  let playwrightMod = null;
  try {
    playwrightMod = await import('playwright');
  } catch {
    try {
      playwrightMod = await import('playwright-core');
    } catch {
      playwrightMod = null;
    }
  }

  if (!playwrightMod?.chromium) {
    process.stderr.write(
      'Playwright is not installed in this environment.\n' +
        'Install Chromium support temporarily with:\n' +
        '  npm install --no-save playwright && npx playwright install chromium\n' +
        'Or pass --html-only to output standalone printable HTML instead.\n',
    );
    process.exitCode = 1;
    return;
  }

  const browser = await playwrightMod.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: outPath,
      format: 'Letter',
      landscape: opts.orientation === 'landscape',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
    process.stdout.write(`Rendered PDF report (${report.totalBooks} books) to ${outPath}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`render-pdf error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
