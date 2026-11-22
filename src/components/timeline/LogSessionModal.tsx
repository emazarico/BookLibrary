import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Clock, FileText, Flame, Hash } from 'lucide-react';
import { useLibrary } from '../../store/LibraryContext';
import type { ProgressUnit } from '../../types/library';
import {
  formatMinutesHHMM,
  formatMinutesHuman,
  getBookProgressInfo,
  parseDurationToMinutes,
} from '../../utils/progress';
import { BookCover } from '../common/BookCover';
import { Modal } from '../common/Modal';
import { StarRating } from '../common/StarRating';

interface LogSessionModalProps {
  open: boolean;
  onClose: () => void;
  initialBookId?: string;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const LogSessionModal: React.FC<LogSessionModalProps> = ({
  open,
  onClose,
  initialBookId,
}) => {
  const { profileBooks, logReadingSession } = useLibrary();

  const sortedBooks = useMemo(() => {
    const rank = (status: string) =>
      status === 'reading' ? 0 : status === 'want-to-read' ? 1 : status === 'finished' ? 2 : 3;
    return [...profileBooks].sort(
      (a, b) => rank(a.status) - rank(b.status) || b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [profileBooks]);

  const [selectedBookId, setSelectedBookId] = useState('');
  const [unit, setUnit] = useState<ProgressUnit>('pages');
  const [inputMode, setInputMode] = useState<'delta' | 'reached'>('delta');
  const [pagesDelta, setPagesDelta] = useState('25');
  const [pageReachedInput, setPageReachedInput] = useState('');
  const [chaptersDelta, setChaptersDelta] = useState('1');
  const [chapterReachedInput, setChapterReachedInput] = useState('');
  const [durationDeltaText, setDurationDeltaText] = useState('0:30');
  const [durationReachedText, setDurationReachedText] = useState('');
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState('');
  const [markFinished, setMarkFinished] = useState(false);
  const [finalRating, setFinalRating] = useState(0);
  const [finalReview, setFinalReview] = useState('');

  const selectedBook = useMemo(
    () => sortedBooks.find((b) => b.id === selectedBookId) || sortedBooks[0] || null,
    [sortedBooks, selectedBookId],
  );

  useEffect(() => {
    if (!open) return;
    const defaultBook =
      (initialBookId && sortedBooks.find((b) => b.id === initialBookId)) || sortedBooks[0];
    setSelectedBookId(defaultBook?.id || '');
    setInputMode('delta');
    setPagesDelta('25');
    setChaptersDelta('1');
    setDurationDeltaText('0:30');
    setDate(todayIso());
    setNote('');
    setMarkFinished(false);
    setFinalRating(defaultBook?.rating || 0);
    setFinalReview(defaultBook?.review || '');
  }, [open, initialBookId, sortedBooks]);

  useEffect(() => {
    if (!selectedBook || !open) return;
    const bookProgress = getBookProgressInfo(selectedBook);
    setUnit(bookProgress.unit);
    setPageReachedInput(
      String(
        selectedBook.pageCount > 0
          ? Math.min(selectedBook.pageCount, selectedBook.currentPage + 25)
          : selectedBook.currentPage + 25,
      ),
    );
    const curCh = selectedBook.currentChapter ?? 0;
    const totCh = selectedBook.totalChapters ?? 0;
    setChapterReachedInput(
      String(totCh > 0 ? Math.min(totCh, curCh + 1) : curCh + 1),
    );
    const curMin = selectedBook.currentMinutes ?? 0;
    const totMin = selectedBook.totalMinutes ?? 0;
    const suggestedMin = totMin > 0 ? Math.min(totMin, curMin + 30) : curMin + 30;
    setDurationReachedText(formatMinutesHHMM(suggestedMin));
    setFinalRating(selectedBook.rating || 0);
    setFinalReview(selectedBook.review || '');
  }, [selectedBook, open]);

  const computedPagesDelta = useMemo(() => {
    if (!selectedBook) return 0;
    if (inputMode === 'delta') {
      return Math.max(0, Number(pagesDelta) || 0);
    }
    const reached = Math.max(0, Number(pageReachedInput) || 0);
    return Math.max(0, reached - selectedBook.currentPage);
  }, [inputMode, pagesDelta, pageReachedInput, selectedBook]);

  const projectedPage = useMemo(() => {
    if (!selectedBook) return 0;
    if (inputMode === 'reached') {
      return Math.max(0, Number(pageReachedInput) || 0);
    }
    return selectedBook.currentPage + computedPagesDelta;
  }, [computedPagesDelta, inputMode, pageReachedInput, selectedBook]);

  const computedChaptersDelta = useMemo(() => {
    if (!selectedBook) return 0;
    const curCh = selectedBook.currentChapter ?? 0;
    if (inputMode === 'delta') {
      return Math.max(0, Math.round(Number(chaptersDelta) || 0));
    }
    const reached = Math.max(0, Math.round(Number(chapterReachedInput) || 0));
    return Math.max(0, reached - curCh);
  }, [inputMode, chaptersDelta, chapterReachedInput, selectedBook]);

  const projectedChapter = useMemo(() => {
    if (!selectedBook) return 0;
    if (inputMode === 'reached') {
      return Math.max(0, Math.round(Number(chapterReachedInput) || 0));
    }
    return (selectedBook.currentChapter ?? 0) + computedChaptersDelta;
  }, [computedChaptersDelta, inputMode, chapterReachedInput, selectedBook]);

  const computedMinutesDelta = useMemo(() => {
    if (!selectedBook) return 0;
    const curMin = selectedBook.currentMinutes ?? 0;
    if (inputMode === 'delta') {
      return parseDurationToMinutes(durationDeltaText);
    }
    const reached = parseDurationToMinutes(durationReachedText);
    return Math.max(0, reached - curMin);
  }, [inputMode, durationDeltaText, durationReachedText, selectedBook]);

  const projectedMinute = useMemo(() => {
    if (!selectedBook) return 0;
    if (inputMode === 'reached') {
      return parseDurationToMinutes(durationReachedText);
    }
    return (selectedBook.currentMinutes ?? 0) + computedMinutesDelta;
  }, [computedMinutesDelta, inputMode, durationReachedText, selectedBook]);

  const activeDelta =
    unit === 'pages'
      ? computedPagesDelta
      : unit === 'chapters'
        ? computedChaptersDelta
        : computedMinutesDelta;

  useEffect(() => {
    if (!selectedBook || selectedBook.status === 'finished') return;
    const reachedTotal =
      (unit === 'pages' && selectedBook.pageCount > 0 && projectedPage >= selectedBook.pageCount) ||
      (unit === 'chapters' &&
        (selectedBook.totalChapters ?? 0) > 0 &&
        projectedChapter >= (selectedBook.totalChapters ?? 0)) ||
      (unit === 'duration' &&
        (selectedBook.totalMinutes ?? 0) > 0 &&
        projectedMinute >= (selectedBook.totalMinutes ?? 0));
    if (reachedTotal) {
      setMarkFinished(true);
    }
  }, [projectedPage, projectedChapter, projectedMinute, unit, selectedBook]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook) return;
    logReadingSession({
      bookId: selectedBook.id,
      date: date || todayIso(),
      unit,
      pagesRead: unit === 'pages' ? computedPagesDelta : 0,
      pageReached: unit === 'pages' ? projectedPage : undefined,
      chaptersRead: unit === 'chapters' ? computedChaptersDelta : undefined,
      chapterReached: unit === 'chapters' ? projectedChapter : undefined,
      minutesListened: unit === 'duration' ? computedMinutesDelta : undefined,
      minuteReached: unit === 'duration' ? projectedMinute : undefined,
      note,
      markFinished,
      finalRating: markFinished && finalRating > 0 ? finalRating : undefined,
      finalReview: markFinished && finalReview.trim() ? finalReview.trim() : undefined,
    });
    onClose();
  };

  const currentProgressLabel = selectedBook ? getBookProgressInfo(selectedBook).label : '';

  const afterSessionText = useMemo(() => {
    if (!selectedBook) return '';
    if (unit === 'chapters') {
      return `After session: Ch. ${projectedChapter} (+${computedChaptersDelta} ch)`;
    }
    if (unit === 'duration') {
      return `After session: ${formatMinutesHHMM(projectedMinute)} (+${formatMinutesHuman(computedMinutesDelta)})`;
    }
    return `After session: p. ${projectedPage} (+${computedPagesDelta} pp)`;
  }, [
    selectedBook,
    unit,
    projectedChapter,
    computedChaptersDelta,
    projectedMinute,
    computedMinutesDelta,
    projectedPage,
    computedPagesDelta,
  ]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log Reading Session"
      subtitle="Track pages, chapters, or hh:mm audio duration to grow your timeline."
      maxWidthClass="max-w-md"
    >
      {sortedBooks.length === 0 ? (
        <div className="p-6 text-center text-sm text-stone-500">
          Add a book to your library first before logging a reading session.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Book Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              Book
            </label>
            <select
              value={selectedBook?.id || ''}
              onChange={(e) => setSelectedBookId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-medium text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            >
              {sortedBooks.map((b) => {
                const prog = getBookProgressInfo(b);
                return (
                  <option key={b.id} value={b.id}>
                    {b.title} — {b.author} ({b.status === 'reading' ? prog.shortLabel : b.status})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Selected Book Preview */}
          {selectedBook && (
            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800">
              <BookCover
                title={selectedBook.title}
                author={selectedBook.author}
                coverUrl={selectedBook.coverUrl}
                size="sm"
                interactive={false}
              />
              <div className="min-w-0 flex-1">
                <p className="font-serif-display font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
                  {selectedBook.title}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  Currently: {currentProgressLabel}
                </p>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1">
                  {afterSessionText}
                </p>
              </div>
            </div>
          )}

          {/* Unit Switcher */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              Progress Unit
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'pages', label: 'Pages', icon: FileText },
                  { id: 'chapters', label: 'Chapters', icon: Hash },
                  { id: 'duration', label: 'Duration (hh:mm)', icon: Clock },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = unit === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setUnit(opt.id)}
                    className={`inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-amber-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800/80">
            <button
              type="button"
              onClick={() => setInputMode('delta')}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                inputMode === 'delta'
                  ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              {unit === 'duration'
                ? 'Added (+hh:mm)'
                : unit === 'chapters'
                  ? 'Chapters Read (+)'
                  : 'Pages Read (+)'}
            </button>
            <button
              type="button"
              onClick={() => setInputMode('reached')}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                inputMode === 'reached'
                  ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              {unit === 'duration'
                ? 'Timestamp (hh:mm)'
                : unit === 'chapters'
                  ? 'Reached Chapter (#)'
                  : 'Reached Page (#)'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {unit === 'pages' && inputMode === 'delta' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Pages Read
                </label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={pagesDelta}
                  onChange={(e) => setPagesDelta(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-semibold text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {unit === 'pages' && inputMode === 'reached' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Bookmark Page
                </label>
                <input
                  type="number"
                  min={0}
                  max={selectedBook?.pageCount ? selectedBook.pageCount * 2 : 10000}
                  value={pageReachedInput}
                  onChange={(e) => setPageReachedInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-semibold text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {unit === 'chapters' && inputMode === 'delta' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Chapters Read
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={chaptersDelta}
                  onChange={(e) => setChaptersDelta(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-semibold text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {unit === 'chapters' && inputMode === 'reached' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Reached Chapter
                </label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  value={chapterReachedInput}
                  onChange={(e) => setChapterReachedInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-semibold text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {unit === 'duration' && inputMode === 'delta' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Listened (hh:mm)
                </label>
                <input
                  type="text"
                  value={durationDeltaText}
                  onChange={(e) => setDurationDeltaText(e.target.value)}
                  placeholder="0:45 or 1h 15m"
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-mono font-semibold text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {unit === 'duration' && inputMode === 'reached' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Reached Time (hh:mm)
                </label>
                <input
                  type="text"
                  value={durationReachedText}
                  onChange={(e) => setDurationReachedText(e.target.value)}
                  placeholder="10:50"
                  className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-mono font-semibold text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Session Note (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Thoughts, chapter, or quote…"
              className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {selectedBook && selectedBook.status !== 'finished' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={markFinished}
                  onChange={(e) => setMarkFinished(e.target.checked)}
                  className="accent-emerald-600 w-4 h-4"
                />
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <BookOpenCheck className="w-4 h-4" /> Mark book as Finished today
                </span>
              </label>

              {markFinished && (
                <div className="p-3.5 rounded-xl bg-emerald-500/6 border border-emerald-500/20 space-y-2.5 animate-fade-slide">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      Rating & Final Review (Optional)
                    </span>
                    <StarRating
                      value={finalRating}
                      onChange={setFinalRating}
                      size="sm"
                      showNumeric
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={finalReview}
                    onChange={(e) => setFinalReview(e.target.value)}
                    placeholder="Write your final thoughts for the Reviews tab…"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={activeDelta <= 0 && !markFinished}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 disabled:opacity-40 cursor-pointer"
            >
              <Flame className="w-4 h-4" /> Save Session
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
