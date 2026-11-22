import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock, FileText, Hash, Headphones, Tablet } from 'lucide-react';
import { useLibrary } from '../../store/LibraryContext';
import type {
  Book,
  BookFormat,
  OpenLibrarySearchResult,
  ProgressUnit,
  ReadingStatus,
} from '../../types/library';
import { formatMinutesHHMM, parseDurationToMinutes } from '../../utils/progress';
import { SUGGESTED_TAGS } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { Modal } from '../common/Modal';
import { StarRating } from '../common/StarRating';

interface BookFormModalProps {
  open: boolean;
  onClose: () => void;
  editBook?: Book | null;
  prefill?: OpenLibrarySearchResult | null;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const BookFormModal: React.FC<BookFormModalProps> = ({
  open,
  onClose,
  editBook,
  prefill,
}) => {
  const { profileShelves, profileBooks, addBook, updateBook, addToast } = useLibrary();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publishYear, setPublishYear] = useState('');
  const [publisher, setPublisher] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [progressUnit, setProgressUnit] = useState<ProgressUnit>('pages');
  const [totalChapters, setTotalChapters] = useState('');
  const [currentChapter, setCurrentChapter] = useState('0');
  const [totalDurationText, setTotalDurationText] = useState('');
  const [currentDurationText, setCurrentDurationText] = useState('0:00');
  const [format, setFormat] = useState<BookFormat>('physical');
  const [status, setStatus] = useState<ReadingStatus>('want-to-read');
  const [rating, setRating] = useState(0);
  const [dateStarted, setDateStarted] = useState('');
  const [dateFinished, setDateFinished] = useState('');
  const [shelfIds, setShelfIds] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;

    if (editBook) {
      setTitle(editBook.title);
      setAuthor(editBook.author);
      setCoverUrl(editBook.coverUrl || '');
      setIsbn(editBook.isbn || '');
      setPublishYear(editBook.publishYear ? String(editBook.publishYear) : '');
      setPublisher(editBook.publisher || '');
      setPageCount(editBook.pageCount > 0 ? String(editBook.pageCount) : '');
      setCurrentPage(editBook.currentPage > 0 ? String(editBook.currentPage) : '0');
      setProgressUnit(
        editBook.progressUnit ||
          (editBook.format === 'audiobook' && (editBook.totalMinutes || editBook.currentMinutes)
            ? 'duration'
            : 'pages'),
      );
      setTotalChapters(
        editBook.totalChapters && editBook.totalChapters > 0 ? String(editBook.totalChapters) : '',
      );
      setCurrentChapter(
        editBook.currentChapter && editBook.currentChapter > 0
          ? String(editBook.currentChapter)
          : '0',
      );
      setTotalDurationText(
        editBook.totalMinutes && editBook.totalMinutes > 0
          ? formatMinutesHHMM(editBook.totalMinutes)
          : '',
      );
      setCurrentDurationText(
        editBook.currentMinutes && editBook.currentMinutes > 0
          ? formatMinutesHHMM(editBook.currentMinutes)
          : '0:00',
      );
      setFormat(editBook.format || 'physical');
      setStatus(editBook.status);
      setRating(editBook.rating);
      setDateStarted(editBook.dateStarted || '');
      setDateFinished(editBook.dateFinished || '');
      setShelfIds(editBook.shelfIds);
      setTagsText(editBook.tags.join(', '));
      setNotes(editBook.notes);
    } else if (prefill) {
      setTitle(prefill.title);
      setAuthor(prefill.author);
      setCoverUrl(prefill.coverUrl || '');
      setIsbn(prefill.isbn || '');
      setPublishYear(prefill.publishYear ? String(prefill.publishYear) : '');
      setPublisher(prefill.publisher || '');
      setPageCount(prefill.pageCount ? String(prefill.pageCount) : '');
      setCurrentPage('0');
      setProgressUnit('pages');
      setTotalChapters('');
      setCurrentChapter('0');
      setTotalDurationText('');
      setCurrentDurationText('0:00');
      setFormat('physical');
      setStatus('want-to-read');
      setRating(0);
      setDateStarted('');
      setDateFinished('');
      setShelfIds(profileShelves[0] ? [profileShelves[0].id] : []);
      setTagsText(prefill.subjects.slice(0, 3).map((s) => s.toLowerCase()).join(', '));
      setNotes('');
    } else {
      setTitle('');
      setAuthor('');
      setCoverUrl('');
      setIsbn('');
      setPublishYear('');
      setPublisher('');
      setPageCount('');
      setCurrentPage('0');
      setProgressUnit('pages');
      setTotalChapters('');
      setCurrentChapter('0');
      setTotalDurationText('');
      setCurrentDurationText('0:00');
      setFormat('physical');
      setStatus('want-to-read');
      setRating(0);
      setDateStarted('');
      setDateFinished('');
      setShelfIds(profileShelves[0] ? [profileShelves[0].id] : []);
      setTagsText('');
      setNotes('');
    }
  }, [open, editBook, prefill, profileShelves]);

  const parsedTags = useMemo(
    () =>
      tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsText],
  );

  const quickTagOptions = useMemo(() => {
    const existing = new Set<string>(SUGGESTED_TAGS);
    for (const b of profileBooks) {
      for (const t of b.tags) {
        if (t.trim()) existing.add(t.trim().toLowerCase());
      }
    }
    return Array.from(existing).slice(0, 14);
  }, [profileBooks]);

  const handleFormatSelect = (nextFormat: BookFormat) => {
    setFormat(nextFormat);
    if (!editBook && nextFormat === 'audiobook' && progressUnit === 'pages' && (Number(currentPage) || 0) === 0) {
      setProgressUnit('duration');
    }
  };

  const toggleQuickTag = (tag: string) => {
    const lower = tag.toLowerCase();
    const exists = parsedTags.some((t) => t.toLowerCase() === lower);
    let next: string[];
    if (exists) {
      next = parsedTags.filter((t) => t.toLowerCase() !== lower);
    } else {
      next = [...parsedTags, tag];
      if (!editBook && lower === 'wishlist') {
        setStatus('want-to-read');
      }
      if (!editBook && lower === 'audiobook' && format === 'physical') {
        handleFormatSelect('audiobook');
      }
    }
    setTagsText(next.join(', '));
  };

  const handleStatusChange = (nextStatus: ReadingStatus) => {
    setStatus(nextStatus);
    const total = Number(pageCount) || 0;
    const totCh = Number(totalChapters) || 0;
    const totMin = parseDurationToMinutes(totalDurationText);
    if (nextStatus === 'reading' && !dateStarted) {
      setDateStarted(todayIso());
    }
    if (nextStatus === 'finished') {
      if (!dateFinished) setDateFinished(todayIso());
      if (total > 0) setCurrentPage(String(total));
      if (totCh > 0) setCurrentChapter(String(totCh));
      if (totMin > 0) setCurrentDurationText(formatMinutesHHMM(totMin));
    }
  };

  const toggleShelf = (id: string) => {
    setShelfIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const totalPages = Math.max(0, Math.round(Number(pageCount) || 0));
    const curPages = Math.max(0, Math.round(Number(currentPage) || 0));
    const totChapters = Math.max(0, Math.round(Number(totalChapters) || 0));
    const curChapters = Math.max(0, Math.round(Number(currentChapter) || 0));
    const totMinutes = parseDurationToMinutes(totalDurationText);
    const curMinutes = parseDurationToMinutes(currentDurationText);
    const yearNum = Number(publishYear);

    const payload = {
      title: title.trim(),
      author: author.trim() || 'Unknown Author',
      coverUrl: coverUrl.trim() || undefined,
      isbn: isbn.trim() || undefined,
      publishYear: Number.isFinite(yearNum) && yearNum > 0 ? yearNum : undefined,
      publisher: publisher.trim() || undefined,
      pageCount: totalPages,
      currentPage: status === 'finished' && totalPages > 0 ? totalPages : curPages,
      progressUnit,
      totalChapters: totChapters > 0 ? totChapters : undefined,
      currentChapter:
        status === 'finished' && totChapters > 0
          ? totChapters
          : curChapters > 0 || progressUnit === 'chapters'
            ? curChapters
            : undefined,
      totalMinutes: totMinutes > 0 ? totMinutes : undefined,
      currentMinutes:
        status === 'finished' && totMinutes > 0
          ? totMinutes
          : curMinutes > 0 || progressUnit === 'duration'
            ? curMinutes
            : undefined,
      format,
      status,
      rating,
      dateStarted: dateStarted || undefined,
      dateFinished: dateFinished || undefined,
      shelfIds,
      tags: parsedTags,
      notes: notes.trim(),
      openLibraryKey: editBook?.openLibraryKey || prefill?.key,
    };

    if (editBook) {
      updateBook(editBook.id, payload);
      addToast({ title: `Updated "${payload.title}"`, tone: 'success' });
    } else {
      addBook(payload);
    }
    onClose();
  };

  const alternateCovers = prefill?.alternateCoverUrls || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editBook ? 'Edit Book Details' : prefill ? 'Add Book to Library' : 'Add Book Manually'}
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        {/* Top Cover Preview + Core Metadata */}
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex flex-col items-center gap-2.5 shrink-0">
            <BookCover
              title={title || 'Untitled Book'}
              author={author || 'Author'}
              coverUrl={coverUrl}
              size="lg"
              interactive={false}
            />

            {alternateCovers.length > 1 && (
              <div className="space-y-1 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  Switch cover edition
                </p>
                <div className="flex flex-wrap justify-center gap-1.5 max-w-[160px]">
                  {alternateCovers.map((altUrl, idx) => {
                    const active = coverUrl === altUrl;
                    return (
                      <button
                        key={altUrl}
                        type="button"
                        onClick={() => setCoverUrl(altUrl)}
                        title={`Cover edition ${idx + 1}`}
                        className={`w-7 h-10 rounded overflow-hidden border transition-all cursor-pointer ${
                          active
                            ? 'ring-2 ring-amber-500 border-amber-500 scale-105'
                            : 'border-stone-200 dark:border-stone-700 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={altUrl}
                          alt={`Edition cover ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                Book Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Project Hail Mary"
                className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-medium text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                Author
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Andy Weir"
                className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                Cover Image URL (Optional — clothbound fallback if blank)
              </label>
              <input
                type="url"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://covers.openlibrary.org/..."
                className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Book Format */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
            Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'physical', label: 'Print Book', icon: BookOpen },
                { id: 'ebook', label: 'E-book', icon: Tablet },
                { id: 'audiobook', label: 'Audiobook', icon: Headphones },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = format === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleFormatSelect(opt.id)}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    selected
                      ? opt.id === 'audiobook'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : opt.id === 'ebook'
                          ? 'bg-cyan-600 text-white border-cyan-600'
                          : 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-transparent'
                      : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-amber-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Track Progress By */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
            Track Progress By
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'pages', label: 'Pages', icon: FileText },
                { id: 'chapters', label: 'Chapters', icon: Hash },
                { id: 'duration', label: 'Duration (hh:mm)', icon: Clock },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = progressUnit === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProgressUnit(opt.id)}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
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

        {/* Status & Unit-Aware Progress Fields */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                Reading Status
              </label>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as ReadingStatus)}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="want-to-read">Want to Read</option>
                <option value="reading">Currently Reading</option>
                <option value="finished">Finished</option>
                <option value="dnf">Did Not Finish</option>
              </select>
            </div>

            {progressUnit === 'pages' && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                    Total Pages
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20000}
                    value={pageCount}
                    onChange={(e) => setPageCount(e.target.value)}
                    placeholder="e.g. 384 (optional)"
                    className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                    Current Page
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20000}
                    value={currentPage}
                    onChange={(e) => setCurrentPage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </>
            )}

            {progressUnit === 'chapters' && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                    Total Chapters (Optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={totalChapters}
                    onChange={(e) => setTotalChapters(e.target.value)}
                    placeholder="e.g. 24"
                    className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                    Current Chapter
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={currentChapter}
                    onChange={(e) => setCurrentChapter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </>
            )}

            {progressUnit === 'duration' && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                    Total Duration (hh:mm)
                  </label>
                  <input
                    type="text"
                    value={totalDurationText}
                    onChange={(e) => setTotalDurationText(e.target.value)}
                    placeholder="e.g. 14:30 (optional)"
                    className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-mono text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                    Listened So Far (hh:mm)
                  </label>
                  <input
                    type="text"
                    value={currentDurationText}
                    onChange={(e) => setCurrentDurationText(e.target.value)}
                    placeholder="e.g. 4:15"
                    className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-mono text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </>
            )}
          </div>

          {progressUnit !== 'pages' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800">
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                {progressUnit === 'duration'
                  ? 'Enter duration as hh:mm (e.g. 16:10 or 1h 30m). Optional page count below is used only if you switch back to pages or for proportional page estimates.'
                  : 'Leave Total Chapters blank if unknown — your chapter number still updates cleanly.'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 whitespace-nowrap">
                  Pages (opt.):
                </label>
                <input
                  type="number"
                  min={0}
                  max={20000}
                  value={pageCount}
                  onChange={(e) => setPageCount(e.target.value)}
                  placeholder="—"
                  className="w-20 px-2.5 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Dates & Star Rating */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Date Started
            </label>
            <input
              type="date"
              value={dateStarted}
              onChange={(e) => setDateStarted(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Date Finished
            </label>
            <input
              type="date"
              value={dateFinished}
              onChange={(e) => setDateFinished(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="pb-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              My Rating
            </label>
            <StarRating value={rating} onChange={setRating} size="md" showNumeric />
          </div>
        </div>

        {/* Shelves */}
        {profileShelves.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
              Shelves
            </label>
            <div className="flex flex-wrap gap-2">
              {profileShelves.map((shelf) => {
                const selected = shelfIds.includes(shelf.id);
                return (
                  <button
                    key={shelf.id}
                    type="button"
                    onClick={() => toggleShelf(shelf.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-amber-400'
                    }`}
                  >
                    {shelf.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ISBN, Year, Publisher */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              ISBN
            </label>
            <input
              type="text"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="978..."
              className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-mono text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Publish Year
            </label>
            <input
              type="number"
              value={publishYear}
              onChange={(e) => setPublishYear(e.target.value)}
              placeholder="2024"
              className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Publisher
            </label>
            <input
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="Publisher"
              className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Tags & Quick Tag Chips */}
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="wishlist, audiobook, sci-fi, book-club"
              className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-stone-400 mr-1">Quick tags:</span>
            {quickTagOptions.map((tag) => {
              const active = parsedTags.some((t) => t.toLowerCase() === tag.toLowerCase());
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleQuickTag(tag)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-600 text-white'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-amber-500/15 hover:text-amber-800 dark:hover:text-amber-300'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Personal Notes */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
            Personal Notes & Review
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Favorite quotes, narrator notes, impressions, or who recommended it…"
            className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

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
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 cursor-pointer"
          >
            {editBook ? 'Save Changes' : 'Add to Library'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
