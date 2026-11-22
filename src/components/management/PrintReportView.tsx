import React, { useMemo } from 'react';
import { useLibrary } from '../../store/LibraryContext';
import {
  BOOK_CLUB_QUESTIONS,
  buildPdfReportData,
  type PdfReportOptions,
  type PdfReportTheme,
} from '../../utils/pdfReport';
import { STATUS_META } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { StarRating } from '../common/StarRating';
import { MonthlyChart } from '../timeline/MonthlyChart';

interface PrintReportViewProps {
  options: PdfReportOptions;
}

const PRINT_THEME_STYLES: Record<
  PdfReportTheme,
  {
    rootText: string;
    headingFont: string;
    borderClass: string;
    cardSurface: string;
    accentText: string;
    pillClass: string;
  }
> = {
  classic: {
    rootText: 'text-stone-900',
    headingFont: 'font-serif-display',
    borderClass: 'border-stone-200',
    cardSurface: 'bg-stone-50',
    accentText: 'text-amber-800',
    pillClass: 'bg-stone-100 text-stone-700',
  },
  modern: {
    rootText: 'text-slate-900',
    headingFont: 'font-sans',
    borderClass: 'border-indigo-200',
    cardSurface: 'bg-indigo-50/50',
    accentText: 'text-indigo-700',
    pillClass: 'bg-indigo-100 text-indigo-800',
  },
  minimal: {
    rootText: 'text-zinc-900',
    headingFont: 'font-sans',
    borderClass: 'border-zinc-300',
    cardSurface: 'bg-white',
    accentText: 'text-zinc-900',
    pillClass: 'bg-zinc-100 text-zinc-800',
  },
};

export const PrintReportView: React.FC<PrintReportViewProps> = ({ options }) => {
  const { db } = useLibrary();

  const report = useMemo(() => buildPdfReportData(db, options), [db, options]);
  const profileMap = useMemo(
    () => new Map(report.profiles.map((p) => [p.id, p])),
    [report.profiles],
  );
  const bookMap = useMemo(
    () => new Map(report.books.map((b) => [b.id, b])),
    [report.books],
  );

  const themeKey: PdfReportTheme = options.theme ?? 'classic';
  const styles = PRINT_THEME_STYLES[themeKey];

  const readerLabel =
    report.profiles.map((p) => `${p.avatarEmoji} ${p.name}`).join(', ') || 'All Readers';
  const dateRangeLabel =
    options.dateFrom || options.dateTo
      ? `${options.dateFrom || 'Beginning'} → ${options.dateTo || 'Present'}`
      : 'All Dates';

  const avgMonthlyPageGoal =
    report.profiles.reduce((sum, p) => sum + (p.monthlyPageGoal || 500), 0) || 500;
  const sumYearlyBookGoal =
    report.profiles.reduce((sum, p) => sum + (p.yearlyBookGoal || 12), 0) || 12;

  const featuredBook =
    options.layout === 'handout'
      ? (options.handoutBookId ? bookMap.get(options.handoutBookId) : undefined) ?? report.books[0]
      : undefined;

  const scopedLogs =
    options.layout === 'handout' && featuredBook
      ? report.logs.filter((l) => l.bookId === featuredBook.id)
      : report.logs;

  return (
    <div id="print-report-root" className={`hidden print:block bg-white p-2 ${styles.rootText}`}>
      <style>{`@page { size: ${options.orientation}; margin: 12mm; }`}</style>

      {/* Report Header */}
      <header className={`border-b-2 ${styles.borderClass} pb-4 mb-5`}>
        <h1 className={`${styles.headingFont} text-2xl font-bold`}>
          {options.title || 'BookLibrary Reading Report'}
        </h1>
        <p className="text-xs opacity-75 mt-1">
          Readers: <strong>{readerLabel}</strong> · Dates: <strong>{dateRangeLabel}</strong>
          {options.formatFilter !== 'all' ? ` · Format: ${options.formatFilter}` : ''}
          {options.tagFilter ? ` · Tag: #${options.tagFilter}` : ''} · Theme: {themeKey} · Generated{' '}
          {report.generatedAt.split('T')[0]}
        </p>
      </header>

      {/* Summary & Monthly Chart (omitted in handout mode) */}
      {options.layout !== 'handout' && options.includeSummaryAndChart && (
        <section className="mb-6 space-y-4 print-avoid-break">
          <div className="grid grid-cols-4 gap-3">
            <div className={`p-3 rounded-xl border ${styles.borderClass} ${styles.cardSurface}`}>
              <p className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">
                Books Matched
              </p>
              <p className={`text-xl font-bold mt-0.5 ${styles.accentText}`}>
                {report.totalBooks}
              </p>
            </div>
            <div className={`p-3 rounded-xl border ${styles.borderClass} ${styles.cardSurface}`}>
              <p className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">
                Finished
              </p>
              <p className={`text-xl font-bold mt-0.5 ${styles.accentText}`}>
                {report.finishedCount}
              </p>
            </div>
            <div className={`p-3 rounded-xl border ${styles.borderClass} ${styles.cardSurface}`}>
              <p className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">
                Pages Read
              </p>
              <p className={`text-xl font-bold mt-0.5 ${styles.accentText}`}>
                {report.totalPagesRead.toLocaleString()}
              </p>
            </div>
            <div className={`p-3 rounded-xl border ${styles.borderClass} ${styles.cardSurface}`}>
              <p className="text-[10px] uppercase tracking-wider opacity-70 font-semibold">
                Avg Rating
              </p>
              <p className={`text-xl font-bold mt-0.5 ${styles.accentText}`}>
                {report.averageRating > 0 ? `${report.averageRating} ★` : '—'}
              </p>
            </div>
          </div>

          <div className={`p-3 rounded-xl border ${styles.borderClass}`}>
            <MonthlyChart
              buckets={report.monthlyBuckets}
              year={report.chartYear}
              metric="pages"
              monthlyPageGoal={avgMonthlyPageGoal}
              yearlyBookGoal={sumYearlyBookGoal}
              selectedMonth={null}
              onSelectMonth={() => undefined}
            />
          </div>
        </section>
      )}

      {/* Main Content By Layout */}
      <section className="mb-6">
        {options.layout !== 'handout' && (
          <h2 className={`${styles.headingFont} text-lg font-bold border-b ${styles.borderClass} pb-1.5 mb-3`}>
            Library Catalog ({report.books.length})
          </h2>
        )}

        {options.layout === 'handout' ? (
          featuredBook ? (
            <div className={`p-5 rounded-2xl border-2 ${styles.borderClass} ${styles.cardSurface} space-y-4`}>
              <div className={`text-[11px] font-bold uppercase tracking-widest ${styles.accentText}`}>
                Book Club Discussion Sheet
              </div>

              <div className="flex gap-4 items-start">
                <BookCover
                  title={featuredBook.title}
                  author={featuredBook.author}
                  coverUrl={featuredBook.coverUrl}
                  size="lg"
                  interactive={false}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h2 className={`${styles.headingFont} text-xl font-bold`}>
                    {featuredBook.title}
                  </h2>
                  <p className="text-sm font-semibold opacity-80">by {featuredBook.author}</p>
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${styles.pillClass}`}>
                      {STATUS_META[featuredBook.status].shortLabel}
                    </span>
                    {featuredBook.ownership && (
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${styles.pillClass}`}>
                        {featuredBook.ownership}
                      </span>
                    )}
                    {featuredBook.tags.map((t) => (
                      <span key={t} className={`px-2 py-0.5 rounded-full font-semibold ${styles.pillClass}`}>
                        #{t}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs opacity-75">
                    {[
                      featuredBook.publisher,
                      featuredBook.publishYear,
                      featuredBook.pageCount > 0 ? `${featuredBook.pageCount} pages` : null,
                      featuredBook.format,
                      featuredBook.language,
                      featuredBook.series
                        ? `${featuredBook.series}${featuredBook.seriesIndex ? ` #${featuredBook.seriesIndex}` : ''}`
                        : null,
                      featuredBook.isbn ? `ISBN ${featuredBook.isbn}` : null,
                      featuredBook.rating > 0 ? `${featuredBook.rating} ★` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>

              {featuredBook.synopsis && (
                <div className={`p-3 rounded-xl bg-white border ${styles.borderClass} print-avoid-break`}>
                  <h3 className={`${styles.headingFont} text-xs font-bold uppercase tracking-wider ${styles.accentText} mb-1`}>
                    Synopsis
                  </h3>
                  <p className="text-xs leading-relaxed">{featuredBook.synopsis}</p>
                </div>
              )}

              {options.includeNotes &&
                (featuredBook.review || featuredBook.notes || featuredBook.wantToReadNote) && (
                  <div className={`p-3 rounded-xl bg-white border ${styles.borderClass} print-avoid-break space-y-1`}>
                    <h3 className={`${styles.headingFont} text-xs font-bold uppercase tracking-wider ${styles.accentText}`}>
                      Reader Review &amp; Notes
                    </h3>
                    {featuredBook.review && (
                      <p className="text-xs">
                        <strong>Review:</strong> {featuredBook.review}
                      </p>
                    )}
                    {featuredBook.wantToReadNote && (
                      <p className="text-xs">
                        <strong>Why Read:</strong> {featuredBook.wantToReadNote}
                      </p>
                    )}
                    {featuredBook.notes && (
                      <p className="text-xs">
                        <strong>Notes:</strong> {featuredBook.notes}
                      </p>
                    )}
                  </div>
                )}

              <div className={`p-3 rounded-xl bg-white border ${styles.borderClass} print-avoid-break`}>
                <h3 className={`${styles.headingFont} text-xs font-bold uppercase tracking-wider ${styles.accentText} mb-2`}>
                  Discussion Prompts
                </h3>
                <ol className="list-decimal pl-5 text-xs space-y-1.5">
                  {BOOK_CLUB_QUESTIONS.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
                </ol>
              </div>

              <div className={`p-3 rounded-xl bg-white border ${styles.borderClass} print-avoid-break`}>
                <h3 className={`${styles.headingFont} text-xs font-bold uppercase tracking-wider ${styles.accentText} mb-2`}>
                  Meeting &amp; Takeaways Notes
                </h3>
                <div className="space-y-4 pt-1">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div key={idx} className={`border-b border-dashed ${styles.borderClass} h-3`} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs opacity-70">No matching book available for Book Club Handout.</p>
          )
        ) : options.layout === 'table' ? (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b ${styles.borderClass} opacity-75 uppercase text-[10px]`}>
                <th className="py-1.5 pr-2">Title</th>
                <th className="py-1.5 pr-2">Author</th>
                {report.profiles.length > 1 && <th className="py-1.5 pr-2">Reader</th>}
                <th className="py-1.5 pr-2">Format</th>
                <th className="py-1.5 pr-2">Status</th>
                <th className="py-1.5 pr-2">Pages</th>
                <th className="py-1.5 pr-2">Rating</th>
                <th className="py-1.5 pr-2">Finished</th>
                <th className="py-1.5">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {report.books.map((book) => {
                const owner = profileMap.get(book.profileId);
                return (
                  <tr key={book.id} className="print-avoid-break">
                    <td className="py-2 pr-2 font-semibold">
                      {book.title}
                      {options.includeNotes && book.notes && (
                        <p className="font-normal italic text-[11px] opacity-80 mt-0.5">
                          &ldquo;{book.notes}&rdquo;
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-2 opacity-85">{book.author}</td>
                    {report.profiles.length > 1 && (
                      <td className="py-2 pr-2">{owner?.name || ''}</td>
                    )}
                    <td className="py-2 pr-2">{book.format || 'physical'}</td>
                    <td className="py-2 pr-2">{STATUS_META[book.status].shortLabel}</td>
                    <td className="py-2 pr-2">{book.pageCount > 0 ? book.pageCount : '—'}</td>
                    <td className="py-2 pr-2">{book.rating > 0 ? `${book.rating} ★` : '—'}</td>
                    <td className="py-2 pr-2">{book.dateFinished || '—'}</td>
                    <td className="py-2 opacity-80">
                      {book.tags.map((t) => `#${t}`).join(' ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : options.layout === 'checklist' ? (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b ${styles.borderClass} opacity-75 uppercase text-[10px]`}>
                <th className="py-1.5 pr-2 w-10 text-center">Done</th>
                <th className="py-1.5 pr-2">Title</th>
                <th className="py-1.5 pr-2">Author</th>
                <th className="py-1.5 pr-2">Format / Ownership</th>
                <th className="py-1.5 pr-2">Pages</th>
                <th className="py-1.5 pr-2">Status</th>
                <th className="py-1.5">ISBN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {report.books.map((book) => (
                <tr key={book.id} className="print-avoid-break">
                  <td className="py-1.5 pr-2 text-center text-sm leading-none">☐</td>
                  <td className="py-1.5 pr-2 font-semibold">{book.title}</td>
                  <td className="py-1.5 pr-2 opacity-85">{book.author}</td>
                  <td className="py-1.5 pr-2">
                    {[book.format || 'physical', book.ownership || 'owned'].join(' · ')}
                  </td>
                  <td className="py-1.5 pr-2">{book.pageCount > 0 ? book.pageCount : '—'}</td>
                  <td className="py-1.5 pr-2">{STATUS_META[book.status].shortLabel}</td>
                  <td className="py-1.5 font-mono text-[10px]">{book.isbn || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : options.layout === 'poster' ? (
          <div
            className={`grid gap-3 ${
              options.orientation === 'landscape' ? 'grid-cols-5' : 'grid-cols-4'
            }`}
          >
            {report.books.map((book) => (
              <div
                key={book.id}
                className={`p-2 rounded-xl border ${styles.borderClass} ${styles.cardSurface} flex flex-col items-center text-center print-avoid-break`}
              >
                <BookCover
                  title={book.title}
                  author={book.author}
                  coverUrl={book.coverUrl}
                  size="lg"
                  interactive={false}
                />
                <h3 className={`${styles.headingFont} font-bold text-xs leading-snug mt-2 line-clamp-2`}>
                  {book.title}
                </h3>
                <p className="text-[10px] opacity-75 truncate w-full">{book.author}</p>
                <div className="mt-1">
                  {book.rating > 0 ? (
                    <StarRating value={book.rating} size="sm" />
                  ) : (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${styles.pillClass}`}>
                      {STATUS_META[book.status].shortLabel}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`grid gap-3 ${
              options.orientation === 'landscape' ? 'grid-cols-3' : 'grid-cols-2'
            }`}
          >
            {report.books.map((book) => {
              const owner = profileMap.get(book.profileId);
              return (
                <article
                  key={book.id}
                  className={`p-3 rounded-xl border ${styles.borderClass} ${styles.cardSurface} flex gap-3 print-avoid-break`}
                >
                  <BookCover
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    size="sm"
                    interactive={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] mb-1">
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${styles.pillClass}`}>
                        {STATUS_META[book.status].shortLabel}
                      </span>
                      {book.format && book.format !== 'physical' && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">
                          {book.format}
                        </span>
                      )}
                      {report.profiles.length > 1 && owner && (
                        <span className="opacity-70 ml-auto">
                          {owner.avatarEmoji} {owner.name}
                        </span>
                      )}
                    </div>
                    <h3 className={`${styles.headingFont} font-bold text-sm leading-snug`}>
                      {book.title}
                    </h3>
                    <p className="text-xs opacity-75">{book.author}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] opacity-75">
                      {book.rating > 0 && <StarRating value={book.rating} size="sm" />}
                      {book.pageCount > 0 && <span>{book.pageCount} pp</span>}
                      {book.dateFinished && <span>· {book.dateFinished}</span>}
                    </div>
                    {options.includeNotes && book.review && (
                      <p className="text-[11px] italic opacity-85 mt-1 line-clamp-2">
                        <strong>Review:</strong> &ldquo;{book.review}&rdquo;
                      </p>
                    )}
                    {options.includeNotes && book.notes && (
                      <p className="text-[11px] italic opacity-80 mt-1 line-clamp-3">
                        &ldquo;{book.notes}&rdquo;
                      </p>
                    )}
                    {book.tags.length > 0 && (
                      <p className={`text-[10px] font-semibold mt-1 ${styles.accentText}`}>
                        {book.tags.map((t) => `#${t}`).join(' ')}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Reading Timeline (omitted in handout mode) */}
      {options.layout !== 'handout' &&
        options.includeTimeline &&
        report.timelineGroups.length > 0 && (
          <section className="mb-6">
            <h2 className={`${styles.headingFont} text-lg font-bold border-b ${styles.borderClass} pb-1.5 mb-3`}>
              Reading Timeline
            </h2>
            <div className="space-y-3">
              {report.timelineGroups.map((group) => (
                <div key={group.monthKey} className="print-avoid-break">
                  <h3 className="font-semibold text-sm">
                    {group.label}{' '}
                    <span className="font-normal text-xs opacity-70">
                      ({group.books.length} books · {group.totalPages.toLocaleString()} pp)
                    </span>
                  </h3>
                  <ul className="list-disc pl-5 text-xs opacity-85 mt-1 space-y-0.5">
                    {group.books.map((b) => (
                      <li key={b.id}>
                        <strong>{b.title}</strong> — {b.author}
                        {b.dateFinished ? ` (${b.dateFinished})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

      {/* Reading Log Sessions */}
      {options.includeReadingLogs && scopedLogs.length > 0 && (
        <section>
          <h2 className={`${styles.headingFont} text-lg font-bold border-b ${styles.borderClass} pb-1.5 mb-3`}>
            Reading Log Sessions ({scopedLogs.length})
          </h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b ${styles.borderClass} opacity-75 uppercase text-[10px]`}>
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Book</th>
                <th className="py-1 pr-2">Pages Read</th>
                <th className="py-1 pr-2">Page Reached</th>
                <th className="py-1">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {scopedLogs.map((log) => (
                <tr key={log.id} className="print-avoid-break">
                  <td className="py-1.5 pr-2">{log.date}</td>
                  <td className="py-1.5 pr-2 font-medium">
                    {bookMap.get(log.bookId)?.title || 'Unknown'}
                  </td>
                  <td className="py-1.5 pr-2">+{log.pagesRead}</td>
                  <td className="py-1.5 pr-2">{log.pageReached ?? '—'}</td>
                  <td className="py-1.5 opacity-80">{log.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
