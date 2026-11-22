import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Calendar, Edit3, Flame, Headphones, Plus, Tablet, Trash2, X } from 'lucide-react';
import { useLibrary } from '../../store/LibraryContext';
import type { Book, BookFormat, ProgressUnit, ReadingStatus } from '../../types/library';
import { sanitizeCoverUrl } from '../../utils/cover';
import { formatMinutesHHMM, formatReadingLogBadge, getBookProgressInfo } from '../../utils/progress';
import { STATUS_META, SUGGESTED_TAGS } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { StarRating } from '../common/StarRating';

interface BookDetailDrawerProps {
  book: Book | null;
  onClose: () => void;
  onEdit: (book: Book) => void;
  onLogPages: (book: Book) => void;
}

export const BookDetailDrawer: React.FC<BookDetailDrawerProps> = ({
  book,
  onClose,
  onEdit,
  onLogPages,
}) => {
  const { profileShelves, profileLogs, updateBook, deleteBook } = useLibrary();
  const [newTagInput, setNewTagInput] = useState('');

  useEffect(() => {
    setNewTagInput('');
  }, [book?.id]);

  useEffect(() => {
    if (!book) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [book, onClose]);

  if (!book || typeof document === 'undefined') return null;

  const cleanCover = sanitizeCoverUrl(book.coverUrl);
  const bookShelves = profileShelves.filter((s) => book.shelfIds.includes(s.id));
  const bookLogs = profileLogs.filter((l) => l.bookId === book.id);
  const currentFormat: BookFormat = book.format || 'physical';
  const progressInfo = getBookProgressInfo(book);
  const activeUnit: ProgressUnit = progressInfo.unit;

  const handleStatusChange = (status: ReadingStatus) => {
    const today = new Date().toISOString().split('T')[0];
    updateBook(book.id, {
      status,
      dateStarted: status === 'reading' && !book.dateStarted ? today : book.dateStarted,
      dateFinished: status === 'finished' && !book.dateFinished ? today : book.dateFinished,
      currentPage: status === 'finished' && book.pageCount > 0 ? book.pageCount : book.currentPage,
      currentChapter:
        status === 'finished' && (book.totalChapters ?? 0) > 0
          ? book.totalChapters
          : book.currentChapter,
      currentMinutes:
        status === 'finished' && (book.totalMinutes ?? 0) > 0
          ? book.totalMinutes
          : book.currentMinutes,
    });
  };

  const handleSliderChange = (value: number) => {
    if (activeUnit === 'duration') {
      updateBook(book.id, { currentMinutes: value });
    } else if (activeUnit === 'chapters') {
      updateBook(book.id, { currentChapter: value });
    } else {
      updateBook(book.id, { currentPage: value });
    }
  };

  const addTag = (raw: string) => {
    const clean = raw.trim().replace(/^#/, '');
    if (!clean) return;
    if (book.tags.some((t) => t.toLowerCase() === clean.toLowerCase())) return;
    updateBook(book.id, { tags: [...book.tags, clean] });
  };

  const removeTag = (tagToRemove: string) => {
    updateBook(book.id, {
      tags: book.tags.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase()),
    });
  };

  const handleAddTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTag(newTagInput);
    setNewTagInput('');
  };

  const unusedSuggestedTags = SUGGESTED_TAGS.filter(
    (st) => !book.tags.some((t) => t.toLowerCase() === st.toLowerCase()),
  ).slice(0, 6);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-stone-950/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg h-full bg-white dark:bg-[#151821] border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col overflow-hidden animate-fade-slide"
      >
        {/* Ambient Header */}
        <div className="relative px-6 pt-6 pb-5 border-b border-stone-100 dark:border-stone-800 overflow-hidden shrink-0">
          {cleanCover && (
            <img
              src={cleanCover}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-20 scale-125 pointer-events-none"
            />
          )}
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex gap-4 min-w-0">
              <BookCover
                title={book.title}
                author={book.author}
                coverUrl={book.coverUrl}
                size="md"
              />
              <div className="min-w-0">
                <h2 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100 leading-snug">
                  {book.title}
                </h2>
                <p className="text-sm text-stone-600 dark:text-stone-300 mt-0.5">{book.author}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-stone-500 dark:text-stone-400">
                  {book.publishYear && <span>{book.publishYear}</span>}
                  {book.totalMinutes && book.totalMinutes > 0 ? (
                    <span>· {formatMinutesHHMM(book.totalMinutes)} audio</span>
                  ) : book.totalChapters && book.totalChapters > 0 && activeUnit === 'chapters' ? (
                    <span>· {book.totalChapters} chapters</span>
                  ) : book.pageCount > 0 ? (
                    <span>· {book.pageCount} pages</span>
                  ) : null}
                  {book.publisher && <span>· {book.publisher}</span>}
                </div>
                {book.isbn && (
                  <p className="text-[11px] font-mono text-stone-400 mt-1">ISBN {book.isbn}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close book details"
              className="p-2 rounded-xl bg-white/80 dark:bg-stone-800/80 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* Status Switcher */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              Reading Status
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['want-to-read', 'reading', 'finished', 'dnf'] as ReadingStatus[]).map((st) => {
                const meta = STATUS_META[st];
                const active = book.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(st)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:border-amber-400'
                    }`}
                  >
                    {meta.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Book Format Switcher */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              Format
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'physical', label: 'Print Book', icon: BookOpen },
                  { id: 'ebook', label: 'E-book', icon: Tablet },
                  { id: 'audiobook', label: 'Audiobook', icon: Headphones },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = currentFormat === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateBook(book.id, { format: opt.id })}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? opt.id === 'audiobook'
                          ? 'bg-violet-600 text-white border-violet-600'
                          : opt.id === 'ebook'
                            ? 'bg-cyan-600 text-white border-cyan-600'
                            : 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-transparent'
                        : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:border-amber-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Rating */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              My Rating
            </span>
            <StarRating
              value={book.rating}
              onChange={(rating) => updateBook(book.id, { rating })}
              size="lg"
              showNumeric
            />
          </div>

          {/* Reading Progress & Quick Slider */}
          <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Progress
                  </p>
                  <div className="inline-flex rounded-lg bg-stone-200/70 dark:bg-stone-800 p-0.5 text-[10px] font-semibold">
                    {(
                      [
                        { id: 'pages', label: 'Pages' },
                        { id: 'chapters', label: 'Chapters' },
                        { id: 'duration', label: 'Duration' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateBook(book.id, { progressUnit: opt.id })}
                        className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          activeUnit === opt.id
                            ? 'bg-white dark:bg-[#151821] text-amber-700 dark:text-amber-300 shadow-xs'
                            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-1">
                  {progressInfo.label}
                  {progressInfo.percent !== null ? ` (${progressInfo.percent}%)` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onLogPages(book)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm cursor-pointer shrink-0"
              >
                <Flame className="w-3.5 h-3.5" /> Log Session
              </button>
            </div>

            {progressInfo.total > 0 ? (
              <input
                type="range"
                min={0}
                max={progressInfo.total}
                value={Math.min(progressInfo.total, progressInfo.current)}
                onChange={(e) => handleSliderChange(Number(e.target.value))}
                className="w-full accent-amber-600 cursor-pointer"
              />
            ) : (
              <p className="text-[11px] text-stone-400">
                Use <strong>Log Session</strong> to record progress, or set an optional total in{' '}
                <strong>Edit Details</strong>.
              </p>
            )}

            {(book.dateStarted || book.dateFinished) && (
              <div className="flex flex-wrap gap-4 pt-1 text-xs text-stone-500 dark:text-stone-400">
                {book.dateStarted && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Started {book.dateStarted}
                  </span>
                )}
                {book.dateFinished && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" /> Finished {book.dateFinished}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Shelves */}
          {bookShelves.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-stone-400 mr-1">Shelves:</span>
              {bookShelves.map((s) => (
                <span
                  key={s.id}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/12 text-amber-800 dark:text-amber-300"
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}

          {/* Inline Tags Manager */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Tags & Wishlist
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {book.tags.map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    t.toLowerCase() === 'wishlist'
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  #{t}
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => removeTag(t)}
                    className="hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={handleAddTagSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="Add a tag (e.g. wishlist, favorite)…"
                className="flex-1 px-3 py-1.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 hover:bg-amber-600 hover:text-white text-xs font-semibold text-stone-700 dark:text-stone-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </form>

            {unusedSuggestedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {unusedSuggestedTags.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => addTag(st)}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-dashed border-stone-300 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-amber-500 hover:text-amber-700 dark:hover:text-amber-300 cursor-pointer"
                  >
                    + {st}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              Notes & Review
            </p>
            {book.notes ? (
              <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed bg-stone-50 dark:bg-stone-900/50 p-3.5 rounded-2xl border border-stone-200/70 dark:border-stone-800">
                {book.notes}
              </p>
            ) : (
              <p className="text-xs italic text-stone-400">No notes yet.</p>
            )}
          </div>

          {/* Reading Session History for this Book */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
              Session History ({bookLogs.length})
            </p>
            {bookLogs.length === 0 ? (
              <p className="text-xs text-stone-400 italic">No logged sessions for this book yet.</p>
            ) : (
              <div className="space-y-2">
                {bookLogs.map((log) => {
                  const badge = formatReadingLogBadge(log);
                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-800 dark:text-stone-200">
                          {log.date}{' '}
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {badge.deltaLabel}
                          </span>
                        </p>
                        {log.note && (
                          <p className="text-stone-500 dark:text-stone-400 truncate mt-0.5">
                            {log.note}
                          </p>
                        )}
                      </div>
                      {badge.reachedLabel && (
                        <span className="text-[11px] font-mono text-stone-400 shrink-0">
                          {badge.reachedLabel}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between shrink-0 bg-stone-50/70 dark:bg-stone-900/40">
          <button
            type="button"
            onClick={() => {
              deleteBook(book.id);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" /> Remove Book
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(book);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:opacity-90 cursor-pointer"
          >
            <Edit3 className="w-4 h-4" /> Edit Details
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
};
