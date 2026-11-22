import React, { useMemo } from 'react';
import { useLibrary } from '../../store/LibraryContext';
import { buildPdfReportData, type PdfReportOptions } from '../../utils/pdfReport';
import { STATUS_META } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { StarRating } from '../common/StarRating';
import { MonthlyChart } from '../timeline/MonthlyChart';

interface PrintReportViewProps {
  options: PdfReportOptions;
}

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

  return (
    <div id="print-report-root" className="hidden print:block bg-white text-stone-900 p-2">
      <style>{`@page { size: ${options.orientation}; margin: 12mm; }`}</style>

      {/* Report Header */}
      <header className="border-b-2 border-stone-200 pb-4 mb-5">
        <h1 className="font-serif-display text-2xl font-bold text-stone-900">
          {options.title || 'BookLibrary Reading Report'}
        </h1>
        <p className="text-xs text-stone-600 mt-1">
          Readers: <strong>{readerLabel}</strong> · Dates: <strong>{dateRangeLabel}</strong>
          {options.formatFilter !== 'all' ? ` · Format: ${options.formatFilter}` : ''}
          {options.tagFilter ? ` · Tag: #${options.tagFilter}` : ''} · Generated{' '}
          {report.generatedAt.split('T')[0]}
        </p>
      </header>

      {/* Summary & Monthly Chart */}
      {options.includeSummaryAndChart && (
        <section className="mb-6 space-y-4 print-avoid-break">
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                Books Matched
              </p>
              <p className="text-xl font-bold text-stone-900 mt-0.5">{report.totalBooks}</p>
            </div>
            <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                Finished
              </p>
              <p className="text-xl font-bold text-stone-900 mt-0.5">{report.finishedCount}</p>
            </div>
            <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                Pages Read
              </p>
              <p className="text-xl font-bold text-stone-900 mt-0.5">
                {report.totalPagesRead.toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                Avg Rating
              </p>
              <p className="text-xl font-bold text-stone-900 mt-0.5">
                {report.averageRating > 0 ? `${report.averageRating} ★` : '—'}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-stone-200">
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

      {/* Catalog Section */}
      <section className="mb-6">
        <h2 className="font-serif-display text-lg font-bold border-b border-stone-200 pb-1.5 mb-3">
          Library Catalog ({report.books.length})
        </h2>

        {options.layout === 'table' ? (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-300 text-stone-500 uppercase text-[10px]">
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
                        <p className="font-normal italic text-[11px] text-stone-600 mt-0.5">
                          &ldquo;{book.notes}&rdquo;
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-stone-700">{book.author}</td>
                    {report.profiles.length > 1 && (
                      <td className="py-2 pr-2">{owner?.name || ''}</td>
                    )}
                    <td className="py-2 pr-2">{book.format || 'physical'}</td>
                    <td className="py-2 pr-2">{STATUS_META[book.status].shortLabel}</td>
                    <td className="py-2 pr-2">{book.pageCount > 0 ? book.pageCount : '—'}</td>
                    <td className="py-2 pr-2">{book.rating > 0 ? `${book.rating} ★` : '—'}</td>
                    <td className="py-2 pr-2">{book.dateFinished || '—'}</td>
                    <td className="py-2 text-stone-600">
                      {book.tags.map((t) => `#${t}`).join(' ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                  className="p-3 rounded-xl border border-stone-200 flex gap-3 print-avoid-break"
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
                      <span className="px-1.5 py-0.5 rounded bg-stone-100 font-semibold">
                        {STATUS_META[book.status].shortLabel}
                      </span>
                      {book.format && book.format !== 'physical' && (
                        <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">
                          {book.format}
                        </span>
                      )}
                      {report.profiles.length > 1 && owner && (
                        <span className="text-stone-500 ml-auto">
                          {owner.avatarEmoji} {owner.name}
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif-display font-bold text-sm leading-snug">
                      {book.title}
                    </h3>
                    <p className="text-xs text-stone-600">{book.author}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-500">
                      {book.rating > 0 && <StarRating value={book.rating} size="sm" />}
                      {book.pageCount > 0 && <span>{book.pageCount} pp</span>}
                      {book.dateFinished && <span>· {book.dateFinished}</span>}
                    </div>
                    {options.includeNotes && book.notes && (
                      <p className="text-[11px] italic text-stone-600 mt-1 line-clamp-3">
                        &ldquo;{book.notes}&rdquo;
                      </p>
                    )}
                    {book.tags.length > 0 && (
                      <p className="text-[10px] font-semibold text-amber-800 mt-1">
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

      {/* Reading Timeline */}
      {options.includeTimeline && report.timelineGroups.length > 0 && (
        <section className="mb-6">
          <h2 className="font-serif-display text-lg font-bold border-b border-stone-200 pb-1.5 mb-3">
            Reading Timeline
          </h2>
          <div className="space-y-3">
            {report.timelineGroups.map((group) => (
              <div key={group.monthKey} className="print-avoid-break">
                <h3 className="font-semibold text-sm">
                  {group.label}{' '}
                  <span className="font-normal text-xs text-stone-500">
                    ({group.books.length} books · {group.totalPages.toLocaleString()} pp)
                  </span>
                </h3>
                <ul className="list-disc pl-5 text-xs text-stone-700 mt-1 space-y-0.5">
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
      {options.includeReadingLogs && report.logs.length > 0 && (
        <section>
          <h2 className="font-serif-display text-lg font-bold border-b border-stone-200 pb-1.5 mb-3">
            Reading Log Sessions ({report.logs.length})
          </h2>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-stone-300 text-stone-500 uppercase text-[10px]">
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Book</th>
                <th className="py-1 pr-2">Pages Read</th>
                <th className="py-1 pr-2">Page Reached</th>
                <th className="py-1">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {report.logs.map((log) => (
                <tr key={log.id} className="print-avoid-break">
                  <td className="py-1.5 pr-2">{log.date}</td>
                  <td className="py-1.5 pr-2 font-medium">
                    {bookMap.get(log.bookId)?.title || 'Unknown'}
                  </td>
                  <td className="py-1.5 pr-2">+{log.pagesRead}</td>
                  <td className="py-1.5 pr-2">{log.pageReached ?? '—'}</td>
                  <td className="py-1.5 text-stone-600">{log.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
