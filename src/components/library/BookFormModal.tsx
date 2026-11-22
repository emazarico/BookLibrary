import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Clock,
  FileText,
  Globe,
  Hash,
  Headphones,
  Info,
  Tablet,
  Upload,
  X,
} from 'lucide-react';
import { saveCustomCover } from '../../services/coverStore';
import { useLibrary } from '../../store/LibraryContext';
import type {
  Book,
  BookFormat,
  BookOwnership,
  OpenLibrarySearchResult,
  ProgressUnit,
  ReadingStatus,
} from '../../types/library';
import { findBookDuplicates } from '../../utils/duplicates';
import { formatMinutesHHMM, parseDurationToMinutes } from '../../utils/progress';
import { BOOK_LANGUAGES, OWNERSHIP_META, SUGGESTED_TAGS } from '../../utils/themes';
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

const PRESET_LANGUAGES = BOOK_LANGUAGES.filter((l) => l !== 'Other') as readonly string[];

function splitLanguage(raw?: string): { select: string; custom: string } {
  const clean = raw?.trim() || 'English';
  const match = PRESET_LANGUAGES.find((l) => l.toLowerCase() === clean.toLowerCase());
  if (match) return { select: match, custom: '' };
  return { select: 'Other', custom: clean };
}

export const BookFormModal: React.FC<BookFormModalProps> = ({
  open,
  onClose,
  editBook,
  prefill,
}) => {
  const {
    db,
    activeProfiles,
    activeProfileId,
    profileShelves,
    profileBooks,
    addBook,
    updateBook,
    addToast,
  } = useLibrary();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [isbn, setIsbn] = useState('');
  const [publishYear, setPublishYear] = useState('');
  const [publisher, setPublisher] = useState('');
  const [languageSelect, setLanguageSelect] = useState('English');
  const [customLanguage, setCustomLanguage] = useState('');
  const [series, setSeries] = useState('');
  const [seriesIndex, setSeriesIndex] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [progressUnit, setProgressUnit] = useState<ProgressUnit>('pages');
  const [totalChapters, setTotalChapters] = useState('');
  const [currentChapter, setCurrentChapter] = useState('0');
  const [totalDurationText, setTotalDurationText] = useState('');
  const [currentDurationText, setCurrentDurationText] = useState('0:00');
  const [format, setFormat] = useState<BookFormat>('physical');
  const [ownership, setOwnership] = useState<BookOwnership | undefined>(undefined);
  const [ownershipNote, setOwnershipNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lentTo, setLentTo] = useState('');
  const [lentDate, setLentDate] = useState('');
  const [status, setStatus] = useState<ReadingStatus>('want-to-read');
  const [rating, setRating] = useState(0);
  const [dateStarted, setDateStarted] = useState('');
  const [dateFinished, setDateFinished] = useState('');
  const [recommendedBy, setRecommendedBy] = useState('');
  const [wantToReadNote, setWantToReadNote] = useState('');
  const [review, setReview] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [shelfIds, setShelfIds] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;

    if (editBook) {
      const lang = splitLanguage(editBook.language);
      setTitle(editBook.title);
      setAuthor(editBook.author);
      setCoverUrl(editBook.coverUrl || '');
      setIsbn(editBook.isbn || '');
      setPublishYear(editBook.publishYear ? String(editBook.publishYear) : '');
      setPublisher(editBook.publisher || '');
      setLanguageSelect(lang.select);
      setCustomLanguage(lang.custom);
      setSeries(editBook.series || '');
      setSeriesIndex(editBook.seriesIndex ? String(editBook.seriesIndex) : '');
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
      setOwnership(editBook.ownership);
      setOwnershipNote(editBook.ownershipNote || '');
      setDueDate(editBook.dueDate || '');
      setLentTo(editBook.lentTo || '');
      setLentDate(editBook.lentDate || '');
      setStatus(editBook.status);
      setRating(editBook.rating);
      setDateStarted(editBook.dateStarted || '');
      setDateFinished(editBook.dateFinished || '');
      setRecommendedBy(editBook.recommendedBy || '');
      setWantToReadNote(editBook.wantToReadNote || '');
      setReview(editBook.review || '');
      setSynopsis(editBook.synopsis || '');
      setShelfIds(editBook.shelfIds);
      setTagsText(editBook.tags.join(', '));
      setNotes(editBook.notes);
    } else if (prefill) {
      const lang = splitLanguage(prefill.language);
      setTitle(prefill.title);
      setAuthor(prefill.author);
      setCoverUrl(prefill.coverUrl || '');
      setIsbn(prefill.isbn || '');
      setPublishYear(prefill.publishYear ? String(prefill.publishYear) : '');
      setPublisher(prefill.publisher || '');
      setLanguageSelect(lang.select);
      setCustomLanguage(lang.custom);
      setSeries('');
      setSeriesIndex('');
      setPageCount(prefill.pageCount ? String(prefill.pageCount) : '');
      setCurrentPage('0');
      setProgressUnit('pages');
      setTotalChapters('');
      setCurrentChapter('0');
      setTotalDurationText('');
      setCurrentDurationText('0:00');
      setFormat('physical');
      setOwnership(undefined);
      setOwnershipNote('');
      setDueDate('');
      setLentTo('');
      setLentDate('');
      setStatus('want-to-read');
      setRating(0);
      setDateStarted('');
      setDateFinished('');
      setRecommendedBy('');
      setWantToReadNote('');
      setReview('');
      setSynopsis(prefill.synopsis || '');
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
      setLanguageSelect('English');
      setCustomLanguage('');
      setSeries('');
      setSeriesIndex('');
      setPageCount('');
      setCurrentPage('0');
      setProgressUnit('pages');
      setTotalChapters('');
      setCurrentChapter('0');
      setTotalDurationText('');
      setCurrentDurationText('0:00');
      setFormat('physical');
      setOwnership(undefined);
      setOwnershipNote('');
      setDueDate('');
      setLentTo('');
      setLentDate('');
      setStatus('want-to-read');
      setRating(0);
      setDateStarted('');
      setDateFinished('');
      setRecommendedBy('');
      setWantToReadNote('');
      setReview('');
      setSynopsis('');
      setShelfIds(profileShelves[0] ? [profileShelves[0].id] : []);
      setTagsText('');
      setNotes('');
    }
  }, [open, editBook, prefill, profileShelves]);

  // Support pasting an image directly from clipboard while modal is open
  useEffect(() => {
    if (!open) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          try {
            setUploadingCover(true);
            const idbKey = await saveCustomCover(file);
            setCoverUrl(idbKey);
            addToast({ title: 'Pasted cover image saved', tone: 'success' });
          } catch (err) {
            addToast({
              title: 'Could not process pasted image',
              description: err instanceof Error ? err.message : undefined,
              tone: 'error',
            });
          } finally {
            setUploadingCover(false);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open, addToast]);

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setUploadingCover(true);
      const idbKey = await saveCustomCover(file);
      setCoverUrl(idbKey);
      addToast({ title: 'Custom cover saved locally', tone: 'success' });
    } catch (err) {
      addToast({
        title: 'Failed to load cover image',
        description: err instanceof Error ? err.message : undefined,
        tone: 'error',
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const duplicateCheck = useMemo(() => {
    if (!open || (!title.trim() && !isbn.trim())) {
      return { ownMatches: [], householdMatches: [] };
    }
    return findBookDuplicates(
      {
        title,
        author,
        isbn,
        excludeBookId: editBook?.id,
      },
      db.books,
      activeProfiles,
      activeProfileId,
    );
  }, [open, title, author, isbn, editBook?.id, db.books, activeProfiles, activeProfileId]);

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
    if (
      !editBook &&
      nextFormat === 'audiobook' &&
      progressUnit === 'pages' &&
      (Number(currentPage) || 0) === 0
    ) {
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
    const seriesIdxNum = Number(seriesIndex);
    const effectiveLanguage =
      languageSelect === 'Other' ? customLanguage.trim() || 'Other' : languageSelect;

    const payload = {
      title: title.trim(),
      author: author.trim() || 'Unknown Author',
      coverUrl: coverUrl.trim() || undefined,
      isbn: isbn.trim() || undefined,
      publishYear: Number.isFinite(yearNum) && yearNum > 0 ? yearNum : undefined,
      publisher: publisher.trim() || undefined,
      language: effectiveLanguage,
      series: series.trim() || undefined,
      seriesIndex:
        series.trim() && Number.isFinite(seriesIdxNum) && seriesIdxNum > 0
          ? seriesIdxNum
          : undefined,
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
      ownership,
      ownershipNote: ownership ? ownershipNote.trim() || undefined : undefined,
      dueDate:
        ownership === 'library' || ownership === 'borrowed'
          ? dueDate || undefined
          : undefined,
      lentTo: ownership === 'owned' ? lentTo.trim() || undefined : undefined,
      lentDate: ownership === 'owned' && lentTo.trim() ? lentDate || undefined : undefined,
      status,
      rating,
      dateStarted: dateStarted || undefined,
      dateFinished: dateFinished || undefined,
      recommendedBy: recommendedBy.trim() || undefined,
      wantToReadNote: wantToReadNote.trim() || undefined,
      review: review.trim() || undefined,
      synopsis: synopsis.trim() || undefined,
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
  const showWantToReadSection =
    status === 'want-to-read' || Boolean(recommendedBy.trim() || wantToReadNote.trim());
  const showFinalReviewSection = status === 'finished' || Boolean(review.trim());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editBook ? 'Edit Book Details' : prefill ? 'Add Book to Library' : 'Add Book Manually'}
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        {/* P1.3 Duplicate Detection Banners */}
        {(duplicateCheck.ownMatches.length > 0 || duplicateCheck.householdMatches.length > 0) && (
          <div className="space-y-2">
            {duplicateCheck.ownMatches.length > 0 && (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-amber-500/12 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Already in your library:</p>
                  <p className="text-[11px] opacity-90 mt-0.5">
                    {duplicateCheck.ownMatches
                      .map(
                        (b) =>
                          `"${b.title}" (${b.status}${b.format && b.format !== 'physical' ? `, ${b.format}` : ''})`,
                      )
                      .join(' · ')}
                  </p>
                </div>
              </div>
            )}
            {duplicateCheck.householdMatches.length > 0 && (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-xs text-sky-900 dark:text-sky-200">
                <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Also on household shelves:</p>
                  <p className="text-[11px] opacity-90 mt-0.5">
                    {duplicateCheck.householdMatches
                      .map(
                        (m) =>
                          `${m.ownerEmoji} ${m.ownerName} has "${m.book.title}"${m.book.ownership ? ` (${OWNERSHIP_META[m.book.ownership].shortLabel})` : ''}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top Cover Preview + Upload/Paste + Core Metadata */}
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex flex-col items-center gap-2.5 shrink-0">
            <BookCover
              title={title || 'Untitled Book'}
              author={author || 'Author'}
              coverUrl={coverUrl}
              size="lg"
              interactive={false}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverFileChange}
              className="hidden"
            />

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={uploadingCover}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-stone-100 dark:bg-stone-800 hover:bg-amber-500/15 text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-stone-700 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3 h-3" />
                {uploadingCover ? 'Saving…' : 'Upload Cover'}
              </button>
              {coverUrl && (
                <button
                  type="button"
                  onClick={() => setCoverUrl('')}
                  title="Clear cover image"
                  className="p-1 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-stone-400 text-center max-w-[140px]">
              Tip: Paste an image with Cmd/Ctrl+V
            </p>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  Language
                </label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={languageSelect}
                    onChange={(e) => setLanguageSelect(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {BOOK_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
                {languageSelect === 'Other' && (
                  <input
                    type="text"
                    value={customLanguage}
                    onChange={(e) => setCustomLanguage(e.target.value)}
                    placeholder="Enter language…"
                    className="mt-1.5 w-full px-3 py-1.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                )}
              </div>
            </div>

            {/* Series & Volume Number (P1.5) */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Series (Optional)
                </label>
                <input
                  type="text"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  placeholder="e.g. Wings of Fire"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Book #
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={500}
                  value={seriesIndex}
                  onChange={(e) => setSeriesIndex(e.target.value)}
                  placeholder="1"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                Cover Image URL (or upload/paste — clothbound fallback if blank)
              </label>
              <input
                type="text"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://covers.openlibrary.org/... or idb-cover:..."
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

        {/* Ownership & Lending / Library Due Date (P3.2) */}
        <div className="space-y-2.5 p-3.5 rounded-2xl bg-stone-50/70 dark:bg-stone-900/40 border border-stone-200/80 dark:border-stone-800">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Ownership & Lending (Optional)
            </label>
            {ownership && (
              <button
                type="button"
                onClick={() => setOwnership(undefined)}
                className="text-[11px] font-medium text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['owned', 'library', 'borrowed', 'other'] as BookOwnership[]).map((opt) => {
              const meta = OWNERSHIP_META[opt];
              const selected = ownership === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setOwnership(selected ? undefined : opt)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-amber-400'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          {(ownership === 'library' || ownership === 'borrowed') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  {ownership === 'library' ? 'Library Branch / Source' : 'Borrowed From'}
                </label>
                <input
                  type="text"
                  value={ownershipNote}
                  onChange={(e) => setOwnershipNote(e.target.value)}
                  placeholder={ownership === 'library' ? 'e.g. City Public Library' : 'e.g. Aunt Sarah'}
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {ownership === 'owned' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Lent To (If Currently Loaned Out)
                </label>
                <input
                  type="text"
                  value={lentTo}
                  onChange={(e) => setLentTo(e.target.value)}
                  placeholder="e.g. Emma (leave blank if at home)"
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Lent Date
                </label>
                <input
                  type="date"
                  value={lentDate}
                  onChange={(e) => setLentDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {ownership === 'other' && (
            <div className="pt-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                Ownership / Source Note
              </label>
              <input
                type="text"
                value={ownershipNote}
                onChange={(e) => setOwnershipNote(e.target.value)}
                placeholder="e.g. Libby / Hoopla, Kindle Unlimited, School copy…"
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}
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

        {/* Want-to-Read Note & Recommender */}
        {showWantToReadSection && (
          <div className="p-3.5 rounded-2xl bg-sky-500/8 border border-sky-500/20 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-300">
              Want to Read Note & Recommendation
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Recommended By (Optional)
                </label>
                <input
                  type="text"
                  value={recommendedBy}
                  onChange={(e) => setRecommendedBy(e.target.value)}
                  placeholder="e.g. Uncle Alex, Book Club, Librarian…"
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
                  Why I Want to Read
                </label>
                <input
                  type="text"
                  value={wantToReadNote}
                  onChange={(e) => setWantToReadNote(e.target.value)}
                  placeholder="e.g. Read next on summer road trip"
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>
        )}

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

        {/* Final Review (shown when Finished or review exists) */}
        {showFinalReviewSection && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Final Review
            </label>
            <textarea
              rows={3}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Write your finished thoughts, favorite moments, or recommendation for the Reviews tab…"
              className="w-full px-3.5 py-2 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/25 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}

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

        {/* Synopsis (when present) & Personal Notes */}
        {synopsis && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
              Book Synopsis
            </label>
            <textarea
              rows={2}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-700 dark:text-stone-300 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
            Personal Notes
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Favorite quotes, narrator notes, or private reminders…"
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
