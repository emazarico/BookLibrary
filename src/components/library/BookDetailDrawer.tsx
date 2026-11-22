import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  Check,
  Edit3,
  Flame,
  Globe,
  Headphones,
  MessageSquareQuote,
  Plus,
  Send,
  Star,
  Tablet,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useResolvedCover } from '../../services/coverStore';
import { useLibrary } from '../../store/LibraryContext';
import type {
  Book,
  BookFormat,
  BookOwnership,
  ProgressUnit,
  ReadingStatus,
} from '../../types/library';
import { formatMinutesHHMM, formatReadingLogBadge, getBookProgressInfo } from '../../utils/progress';
import { OWNERSHIP_META, STATUS_META, SUGGESTED_TAGS } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { StarRating } from '../common/StarRating';

interface BookDetailDrawerProps {
  book: Book | null;
  onClose: () => void;
  onEdit: (book: Book) => void;
  onLogPages: (book: Book) => void;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const BookDetailDrawer: React.FC<BookDetailDrawerProps> = ({
  book,
  onClose,
  onEdit,
  onLogPages,
}) => {
  const {
    activeProfiles,
    profileShelves,
    profileLogs,
    updateBook,
    deleteBook,
    recommendBookToProfile,
    addToast,
  } = useLibrary();

  const [newTagInput, setNewTagInput] = useState('');
  const [reviewDraft, setReviewDraft] = useState('');
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [recByDraft, setRecByDraft] = useState('');
  const [wantNoteDraft, setWantNoteDraft] = useState('');
  const [ownershipNoteDraft, setOwnershipNoteDraft] = useState('');
  const [lentToDraft, setLentToDraft] = useState('');
  const [lentDateDraft, setLentDateDraft] = useState('');
  const [recommendTargetId, setRecommendTargetId] = useState('');
  const [recommendNote, setRecommendNote] = useState('');

  const cleanCover = useResolvedCover(book?.coverUrl);

  useEffect(() => {
    if (!book) return;
    setNewTagInput('');
    setReviewDraft(book.review || '');
    setReviewExpanded(book.status === 'finished' || Boolean(book.review));
    setRecByDraft(book.recommendedBy || '');
    setWantNoteDraft(book.wantToReadNote || '');
    setOwnershipNoteDraft(book.ownershipNote || '');
    setLentToDraft(book.lentTo || '');
    setLentDateDraft(book.lentDate || todayIso());
    setRecommendNote('');
    const others = activeProfiles.filter((p) => p.id !== book.profileId);
    setRecommendTargetId((prev) =>
      prev && others.some((o) => o.id === prev) ? prev : others[0]?.id || '',
    );
  }, [book?.id, book?.status, book?.review, book?.recommendedBy, book?.wantToReadNote, book?.ownershipNote, book?.lentTo, book?.lentDate, book?.profileId, activeProfiles]);

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

  const today = todayIso();
  const bookShelves = profileShelves.filter((s) => book.shelfIds.includes(s.id));
  const bookLogs = profileLogs.filter((l) => l.bookId === book.id);
  const currentFormat: BookFormat = book.format || 'physical';
  const progressInfo = getBookProgressInfo(book);
  const activeUnit: ProgressUnit = progressInfo.unit;
  const ownershipMeta = book.ownership ? OWNERSHIP_META[book.ownership] : null;
  const isOverdue = Boolean(
    book.dueDate &&
      (book.ownership === 'library' || book.ownership === 'borrowed') &&
      book.dueDate < today,
  );
  const otherHouseholdReaders = activeProfiles.filter((p) => p.id !== book.profileId);

  const handleStatusChange = (status: ReadingStatus) => {
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
    if (status === 'finished') {
      setReviewExpanded(true);
    }
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

  const handleOwnershipSelect = (next?: BookOwnership) => {
    const resolved = book.ownership === next ? undefined : next;
    updateBook(book.id, {
      ownership: resolved,
      dueDate: resolved === 'library' || resolved === 'borrowed' ? book.dueDate : undefined,
      lentTo: resolved === 'owned' ? book.lentTo : undefined,
      lentDate: resolved === 'owned' ? book.lentDate : undefined,
      ownershipNote: resolved ? book.ownershipNote : undefined,
    });
  };

  const handleSaveOwnershipNote = () => {
    updateBook(book.id, { ownershipNote: ownershipNoteDraft.trim() || undefined });
    addToast({ title: 'Saved ownership note', tone: 'success' });
  };

  const handleSaveLoan = () => {
    updateBook(book.id, {
      ownership: 'owned',
      lentTo: lentToDraft.trim() || undefined,
      lentDate: lentToDraft.trim() ? lentDateDraft || today : undefined,
    });
    addToast({
      title: lentToDraft.trim() ? `Marked lent to ${lentToDraft.trim()}` : 'Cleared lending info',
      tone: 'success',
    });
  };

  const handleMarkReturned = () => {
    setLentToDraft('');
    updateBook(book.id, { lentTo: undefined, lentDate: undefined });
    addToast({ title: 'Marked book as returned', tone: 'success' });
  };

  const handleSaveWantNote = () => {
    updateBook(book.id, {
      recommendedBy: recByDraft.trim() || undefined,
      wantToReadNote: wantNoteDraft.trim() || undefined,
    });
    addToast({ title: 'Saved want-to-read note', tone: 'success' });
  };

  const handleSaveReview = () => {
    updateBook(book.id, { review: reviewDraft.trim() || undefined });
    addToast({
      title: reviewDraft.trim() ? 'Final review saved' : 'Final review cleared',
      tone: 'success',
    });
  };

  const handleSendRecommendation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recommendTargetId) return;
    const res = recommendBookToProfile(book.id, recommendTargetId, recommendNote);
    if (res.ok) {
      setRecommendNote('');
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

  const showWantToReadBox =
    book.status === 'want-to-read' || Boolean(book.recommendedBy || book.wantToReadNote);
  const showReviewBox = book.status === 'finished' || Boolean(book.review) || reviewExpanded;

  return createPortal(
    <div
      className="fixed inset-0 h-[100dvh] z-50 flex justify-end bg-stone-950/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg h-full bg-white dark:bg-[#151821] border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col overflow-hidden animate-fade-slide"
      >
        {/* Ambient Header */}
        <div className="relative px-6 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] pb-5 border-b border-stone-100 dark:border-stone-800 overflow-hidden shrink-0">
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-stone-500 dark:text-stone-400">
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

                {/* Metadata Badges */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {book.series && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/20">
                      {book.series}
                      {book.seriesIndex ? ` #${book.seriesIndex}` : ''}
                    </span>
                  )}

                  {book.language && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                      <Globe className="w-2.5 h-2.5" />
                      {book.language}
                    </span>
                  )}

                  {ownershipMeta && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ownershipMeta.badgeClass}`}
                    >
                      {ownershipMeta.shortLabel}
                    </span>
                  )}

                  {book.dueDate && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        isOverdue
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                          : 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/20'
                      }`}
                    >
                      {isOverdue && <AlertCircle className="w-2.5 h-2.5" />}
                      {isOverdue ? 'Overdue' : 'Due'} {book.dueDate}
                    </span>
                  )}

                  {book.lentTo && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25">
                      <UserCheck className="w-2.5 h-2.5" />
                      Lent to {book.lentTo}
                    </span>
                  )}
                </div>

                {book.isbn && (
                  <p className="text-[11px] font-mono text-stone-400 mt-1.5">ISBN {book.isbn}</p>
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
        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-6 space-y-6">
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

          {/* Ownership, Library Due Date & Physical Lending Tracker (P3.2) */}
          <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Ownership &amp; Lending
              </p>
              {book.ownership && (
                <button
                  type="button"
                  onClick={() => handleOwnershipSelect(undefined)}
                  className="text-[11px] font-medium text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(['owned', 'library', 'borrowed', 'other'] as BookOwnership[]).map((opt) => {
                const meta = OWNERSHIP_META[opt];
                const active = book.ownership === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleOwnershipSelect(opt)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:border-amber-400'
                    }`}
                  >
                    {meta.shortLabel}
                  </button>
                );
              })}
            </div>

            {(book.ownership === 'library' || book.ownership === 'borrowed') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={book.dueDate || ''}
                    onChange={(e) => updateBook(book.id, { dueDate: e.target.value || undefined })}
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                    {book.ownership === 'library' ? 'Library Branch' : 'Borrowed From'}
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={ownershipNoteDraft}
                      onChange={(e) => setOwnershipNoteDraft(e.target.value)}
                      placeholder="Source…"
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleSaveOwnershipNote}
                      className="px-2.5 py-1.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 hover:bg-amber-600 hover:text-white text-xs font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {book.ownership === 'owned' && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                      Lent Out To
                    </label>
                    <input
                      type="text"
                      value={lentToDraft}
                      onChange={(e) => setLentToDraft(e.target.value)}
                      placeholder="e.g. Aunt Clara (optional)"
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                      Lent Date
                    </label>
                    <input
                      type="date"
                      value={lentDateDraft}
                      onChange={(e) => setLentDateDraft(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {book.lentTo && (
                    <button
                      type="button"
                      onClick={handleMarkReturned}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Mark Returned
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveLoan}
                    className="px-3 py-1.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 hover:bg-amber-600 hover:text-white text-xs font-semibold cursor-pointer"
                  >
                    {book.lentTo ? 'Update Loan' : 'Lend Out'}
                  </button>
                </div>
              </div>
            )}

            {book.ownership === 'other' && (
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={ownershipNoteDraft}
                  onChange={(e) => setOwnershipNoteDraft(e.target.value)}
                  placeholder="Ownership note (e.g. Libby, School copy, Gift idea)…"
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={handleSaveOwnershipNote}
                  className="px-3 py-1.5 rounded-xl bg-stone-200/80 dark:bg-stone-800 hover:bg-amber-600 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Save
                </button>
              </div>
            )}
          </div>

          {/* Want-to-Read Comment & Recommendation */}
          {showWantToReadBox && (
            <div className="p-4 rounded-2xl bg-sky-500/8 border border-sky-500/20 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                <MessageSquareQuote className="w-4 h-4" />
                <span>Want to Read Comment</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={recByDraft}
                  onChange={(e) => setRecByDraft(e.target.value)}
                  placeholder="Recommended by…"
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="text"
                  value={wantNoteDraft}
                  onChange={(e) => setWantNoteDraft(e.target.value)}
                  placeholder="Why I want to read it…"
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveWantNote}
                  className="px-3 py-1 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Save Comment
                </button>
              </div>
            </div>
          )}

          {/* Final Review Editor (auto-expanded when Finished) */}
          {showReviewBox && (
            <div className="p-4 rounded-2xl bg-emerald-500/8 border border-emerald-500/25 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                  Final Review
                </span>
                <StarRating
                  value={book.rating}
                  onChange={(rating) => updateBook(book.id, { rating })}
                  size="sm"
                  showNumeric
                />
              </div>
              <textarea
                rows={3}
                value={reviewDraft}
                onChange={(e) => setReviewDraft(e.target.value)}
                placeholder="Write your final review after finishing — featured in your Library Reviews tab…"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveReview}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Save Final Review
                </button>
              </div>
            </div>
          )}

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
              Tags &amp; Wishlist
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

          {/* Recommend to Another Household Reader (P3.1) */}
          {otherHouseholdReaders.length > 0 && (
            <form
              onSubmit={handleSendRecommendation}
              className="p-4 rounded-2xl bg-amber-500/8 border border-amber-500/20 space-y-2.5"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                Recommend to Household Reader
              </p>
              <div className="flex flex-wrap gap-1.5">
                {otherHouseholdReaders.map((member) => {
                  const selected = recommendTargetId === member.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setRecommendTargetId(member.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 hover:border-amber-400'
                      }`}
                    >
                      <span>{member.avatarEmoji}</span>
                      <span>{member.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={recommendNote}
                  onChange={(e) => setRecommendNote(e.target.value)}
                  placeholder="Why they'll love it (optional)…"
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={!recommendTargetId}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-40 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" /> Recommend
                </button>
              </div>
            </form>
          )}

          {/* Synopsis */}
          {book.synopsis && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
                Synopsis
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-900/40 p-3.5 rounded-2xl border border-stone-200/70 dark:border-stone-800">
                {book.synopsis}
              </p>
            </div>
          )}

          {/* Personal Notes */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              Personal Notes
            </p>
            {book.notes ? (
              <p className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap leading-relaxed bg-stone-50 dark:bg-stone-900/50 p-3.5 rounded-2xl border border-stone-200/70 dark:border-stone-800">
                {book.notes}
              </p>
            ) : (
              <p className="text-xs italic text-stone-400">No personal notes yet.</p>
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

        {/* Footer Actions — padded above iOS Safari bottom toolbar zone */}
        <div className="px-6 pt-3.5 pb-[max(4rem,calc(env(safe-area-inset-bottom)+3rem))] sm:py-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between shrink-0 bg-stone-50/70 dark:bg-stone-900/40">
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
