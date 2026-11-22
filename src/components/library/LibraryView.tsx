import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Edit3,
  Heart,
  Layers,
  LayoutGrid,
  Library,
  List,
  Plus,
  Printer,
  Search,
  Sparkles,
  Star,
  Upload,
  X,
} from 'lucide-react';
import { inspectImportFile, type ImportPreview } from '../../services/importExport';
import { useLibrary } from '../../store/LibraryContext';
import type { Book, BookFormat, BookOwnership, ReadingStatus } from '../../types/library';
import { getBookProgressInfo } from '../../utils/progress';
import { BOOK_LANGUAGES, OWNERSHIP_META } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { StarRating } from '../common/StarRating';
import { ImportPreviewModal } from '../management/ImportPreviewModal';
import { LogSessionModal } from '../timeline/LogSessionModal';
import { BookCard } from './BookCard';
import { BookDetailDrawer } from './BookDetailDrawer';
import { BookFormModal } from './BookFormModal';
import { BookListRow } from './BookListRow';
import { FamilyWishlistModal } from './FamilyWishlistModal';

type AppTab = 'library' | 'search' | 'timeline' | 'management';

interface LibraryViewProps {
  onNavigateTab?: (tab: AppTab) => void;
  onOpenPdfExport?: () => void;
}

type StatusFilter = 'all' | ReadingStatus | 'wishlist' | 'reviews';
type OwnershipFilter = 'all' | BookOwnership | 'lent' | 'due';
type SortOption = 'updated' | 'finished' | 'title' | 'author' | 'rating' | 'series';
type GroupMode = 'flat' | 'shelf' | 'series';

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onNavigateTab,
  onOpenPdfExport,
}) => {
  const {
    db,
    activeProfiles,
    activeProfile,
    profileShelves,
    profileBooks,
    addToast,
  } = useLibrary();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [shelfFilter, setShelfFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | BookFormat>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [groupMode, setGroupMode] = useState<GroupMode>('flat');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [detailBookId, setDetailBookId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logBookId, setLogBookId] = useState<string | undefined>(undefined);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const currentlyReading = useMemo(
    () =>
      profileBooks
        .filter((b) => b.status === 'reading')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [profileBooks],
  );

  const counts = useMemo(() => {
    let reading = 0;
    let wantToRead = 0;
    let finished = 0;
    let dnf = 0;
    let wishlist = 0;
    let reviews = 0;
    for (const b of profileBooks) {
      if (b.status === 'reading') reading++;
      else if (b.status === 'want-to-read') wantToRead++;
      else if (b.status === 'finished') finished++;
      else if (b.status === 'dnf') dnf++;
      if (b.tags.some((t) => t.toLowerCase() === 'wishlist')) wishlist++;
      if (b.review && b.review.trim().length > 0) reviews++;
    }
    return {
      all: profileBooks.length,
      reading,
      wantToRead,
      finished,
      dnf,
      wishlist,
      reviews,
    };
  }, [profileBooks]);

  const householdWishlistCount = useMemo(() => {
    const activeIds = new Set(activeProfiles.map((p) => p.id));
    return db.books.filter(
      (b) =>
        !b.deletedAt &&
        activeIds.has(b.profileId) &&
        b.tags.some((t) => t.toLowerCase() === 'wishlist'),
    ).length;
  }, [db.books, activeProfiles]);

  const availableLanguages = useMemo(() => {
    const set = new Set<string>(['English']);
    for (const lang of BOOK_LANGUAGES) {
      if (lang !== 'Other') set.add(lang);
    }
    for (const b of profileBooks) {
      if (b.language && b.language.trim()) set.add(b.language.trim());
    }
    return Array.from(set);
  }, [profileBooks]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = profileBooks.filter((b) => {
      if (statusFilter === 'wishlist') {
        if (!b.tags.some((t) => t.toLowerCase() === 'wishlist')) return false;
      } else if (statusFilter === 'reviews') {
        if (!b.review || !b.review.trim()) return false;
      } else if (statusFilter !== 'all') {
        if (b.status !== statusFilter) return false;
      }

      if (shelfFilter !== 'all' && !b.shelfIds.includes(shelfFilter)) {
        return false;
      }

      const bookFormat: BookFormat = b.format || 'physical';
      if (formatFilter !== 'all' && bookFormat !== formatFilter) {
        return false;
      }

      if (languageFilter !== 'all') {
        const lang = (b.language || 'English').toLowerCase();
        if (lang !== languageFilter.toLowerCase()) return false;
      }

      if (ownershipFilter !== 'all') {
        if (ownershipFilter === 'lent') {
          if (!b.lentTo?.trim()) return false;
        } else if (ownershipFilter === 'due') {
          if (!b.dueDate) return false;
        } else if (b.ownership !== ownershipFilter) {
          return false;
        }
      }

      if (tagFilter) {
        if (!b.tags.some((t) => t.toLowerCase() === tagFilter.toLowerCase())) {
          return false;
        }
      }

      if (q) {
        const hay = [
          b.title,
          b.author,
          b.series || '',
          b.language || '',
          b.notes,
          b.review || '',
          b.recommendedBy || '',
          b.wantToReadNote || '',
          b.ownershipNote || '',
          b.lentTo || '',
          b.isbn || '',
          ...b.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'author') return a.author.localeCompare(b.author);
      if (sortBy === 'rating') {
        return b.rating - a.rating || b.updatedAt.localeCompare(a.updatedAt);
      }
      if (sortBy === 'finished') {
        return (
          (b.dateFinished || '').localeCompare(a.dateFinished || '') ||
          b.updatedAt.localeCompare(a.updatedAt)
        );
      }
      if (sortBy === 'series') {
        const sa = (a.series || 'zzzz').toLowerCase();
        const sb = (b.series || 'zzzz').toLowerCase();
        if (sa !== sb) return sa.localeCompare(sb);
        const ia = a.seriesIndex ?? 9999;
        const ib = b.seriesIndex ?? 9999;
        if (ia !== ib) return ia - ib;
        return a.title.localeCompare(b.title);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    return sorted;
  }, [
    profileBooks,
    statusFilter,
    shelfFilter,
    formatFilter,
    languageFilter,
    ownershipFilter,
    tagFilter,
    searchQuery,
    sortBy,
  ]);

  const shelfGroups = useMemo(() => {
    if (groupMode !== 'shelf') return [];
    const visibleShelves = [...profileShelves].sort((a, b) => a.sortOrder - b.sortOrder);
    const groups = visibleShelves
      .map((shelf) => ({
        id: shelf.id,
        name: shelf.name,
        books: filteredBooks.filter((b) => b.shelfIds.includes(shelf.id)),
      }))
      .filter((g) => g.books.length > 0);

    const shelfIdSet = new Set(profileShelves.map((s) => s.id));
    const unshelved = filteredBooks.filter(
      (b) => !b.shelfIds.some((id) => shelfIdSet.has(id)),
    );
    if (unshelved.length > 0) {
      groups.push({ id: '__unshelved__', name: 'Unshelved', books: unshelved });
    }
    return groups;
  }, [groupMode, profileShelves, filteredBooks]);

  const seriesGroups = useMemo(() => {
    if (groupMode !== 'series') return { named: [], standalone: [] as Book[] };
    const map = new Map<string, Book[]>();
    const standalone: Book[] = [];

    for (const book of filteredBooks) {
      const cleanSeries = book.series?.trim();
      if (!cleanSeries) {
        standalone.push(book);
        continue;
      }
      const existing = map.get(cleanSeries) || [];
      existing.push(book);
      map.set(cleanSeries, existing);
    }

    const named = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, books]) => {
        const sortedBooks = [...books].sort((a, b) => {
          const ia = a.seriesIndex ?? 9999;
          const ib = b.seriesIndex ?? 9999;
          if (ia !== ib) return ia - ib;
          const ya = a.publishYear ?? 9999;
          const yb = b.publishYear ?? 9999;
          if (ya !== yb) return ya - yb;
          return a.title.localeCompare(b.title);
        });
        const finishedCount = sortedBooks.filter((b) => b.status === 'finished').length;
        return {
          name,
          books: sortedBooks,
          finishedCount,
          totalCount: sortedBooks.length,
        };
      });

    return { named, standalone };
  }, [groupMode, filteredBooks]);

  const detailBook = useMemo(
    () => profileBooks.find((b) => b.id === detailBookId) || null,
    [profileBooks, detailBookId],
  );

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const preview = inspectImportFile(file.name, text, db, activeProfile?.id || null);
    if (preview.format === 'unknown') {
      addToast({
        title: 'Unsupported import file',
        description:
          preview.warnings[0] || 'Expected BookLibrary JSON or Goodreads/StoryGraph CSV.',
        tone: 'error',
      });
      return;
    }
    setImportPreview(preview);
  };

  const openAddManual = () => {
    setEditBook(null);
    setFormOpen(true);
  };

  const openEditBook = (book: Book) => {
    setEditBook(book);
    setFormOpen(true);
  };

  const openLogBook = (book: Book) => {
    setLogBookId(book.id);
    setLogModalOpen(true);
  };

  const hasActiveFilters =
    statusFilter !== 'all' ||
    shelfFilter !== 'all' ||
    formatFilter !== 'all' ||
    languageFilter !== 'all' ||
    ownershipFilter !== 'all' ||
    Boolean(tagFilter) ||
    Boolean(searchQuery.trim());

  const clearAllFilters = () => {
    setStatusFilter('all');
    setShelfFilter('all');
    setFormatFilter('all');
    setLanguageFilter('all');
    setOwnershipFilter('all');
    setTagFilter('');
    setSearchQuery('');
  };

  const renderBooksCollection = (books: Book[]) => {
    if (viewMode === 'list') {
      return (
        <div className="space-y-2.5">
          {books.map((book) => (
            <BookListRow
              key={book.id}
              book={book}
              onOpenDetail={(b) => setDetailBookId(b.id)}
              onEdit={openEditBook}
              onLogPages={openLogBook}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {books.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            onOpenDetail={(b) => setDetailBookId(b.id)}
            onEdit={openEditBook}
            onLogPages={openLogBook}
            onTagClick={(tag) => setTagFilter((prev) => (prev === tag ? '' : tag))}
          />
        ))}
      </div>
    );
  };

  const today = todayIso();

  return (
    <div className="space-y-7 animate-fade-slide">
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.csv"
        onChange={handleImportFileChange}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100">
            {activeProfile?.name ? `${activeProfile.name}'s Library` : 'My Library'}
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            {profileBooks.length} {profileBooks.length === 1 ? 'book' : 'books'} across{' '}
            {profileShelves.length} {profileShelves.length === 1 ? 'shelf' : 'shelves'} ·{' '}
            {counts.finished} finished · {counts.reviews}{' '}
            {counts.reviews === 1 ? 'review' : 'reviews'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWishlistOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/20 text-sm font-semibold cursor-pointer transition-colors"
          >
            <Heart className="w-4 h-4 fill-rose-500/30" />
            <span>Family Wishlist</span>
            {householdWishlistCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-rose-600 text-white">
                {householdWishlistCount}
              </span>
            )}
          </button>

          {onOpenPdfExport && (
            <button
              type="button"
              onClick={onOpenPdfExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-sm font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden md:inline">PDF</span>
            </button>
          )}

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('search')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-sm font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
            >
              <Search className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Find & Add</span>
            </button>
          )}

          <button
            type="button"
            onClick={openAddManual}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-md shadow-amber-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Book
          </button>
        </div>
      </div>

      {/* Currently Reading Spotlight Strip */}
      {currentlyReading.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Currently Reading (
              {currentlyReading.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {currentlyReading.map((book) => {
              const progress = getBookProgressInfo(book);
              const isOverdue = Boolean(
                book.dueDate &&
                  (book.ownership === 'library' || book.ownership === 'borrowed') &&
                  book.dueDate < today,
              );
              return (
                <div
                  key={book.id}
                  onClick={() => setDetailBookId(book.id)}
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#171A23] border border-emerald-500/25 shadow-xs hover:shadow-md hover:border-emerald-500/50 transition-all cursor-pointer flex items-center gap-3.5"
                >
                  <BookCover
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    size="sm"
                    interactive={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif-display font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100 truncate">
                        {book.title}
                      </h3>
                      {book.dueDate && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                            isOverdue
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                          }`}
                        >
                          {isOverdue ? 'Overdue' : 'Due'} {book.dueDate}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                      {book.author}
                    </p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                          style={{ width: `${progress.percent ?? 18}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 shrink-0 tabular-nums">
                        {progress.percent !== null ? `${progress.percent}%` : progress.shortLabel}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLogBook(book);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Log
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Status + Wishlist + Reviews Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'all', label: 'All Books', count: counts.all },
            { id: 'reading', label: 'Reading', count: counts.reading },
            { id: 'want-to-read', label: 'Want to Read', count: counts.wantToRead },
            { id: 'finished', label: 'Finished', count: counts.finished },
            { id: 'wishlist', label: '#Wishlist', count: counts.wishlist },
            { id: 'reviews', label: 'Reviews', count: counts.reviews },
            ...(counts.dnf > 0 ? [{ id: 'dnf', label: 'DNF', count: counts.dnf }] : []),
          ] as Array<{ id: StatusFilter; label: string; count: number }>
        ).map((tab) => {
          const active = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                active
                  ? tab.id === 'reviews'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : tab.id === 'wishlist'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white dark:bg-[#171A23] text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:border-amber-400'
              }`}
            >
              {tab.id === 'reviews' && <Star className="w-3 h-3 fill-current" />}
              {tab.id === 'wishlist' && <Heart className="w-3 h-3 fill-current" />}
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  active
                    ? 'bg-white/25 text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter & Grouping Toolbar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter title, author, series, review, recommender, tags…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs sm:text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={shelfFilter}
              onChange={(e) => setShelfFilter(e.target.value)}
              aria-label="Filter by shelf"
              className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 outline-none"
            >
              <option value="all">All Shelves</option>
              {profileShelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value as 'all' | BookFormat)}
              aria-label="Filter by format"
              className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 outline-none"
            >
              <option value="all">All Formats</option>
              <option value="physical">Print</option>
              <option value="ebook">E-book</option>
              <option value="audiobook">Audiobook</option>
            </select>

            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              aria-label="Filter by language"
              className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 outline-none"
            >
              <option value="all">All Languages</option>
              {availableLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>

            <select
              value={ownershipFilter}
              onChange={(e) => setOwnershipFilter(e.target.value as OwnershipFilter)}
              aria-label="Filter by ownership"
              className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 outline-none"
            >
              <option value="all">All Ownership</option>
              <option value="owned">{OWNERSHIP_META.owned.label}</option>
              <option value="library">{OWNERSHIP_META.library.label}</option>
              <option value="borrowed">{OWNERSHIP_META.borrowed.label}</option>
              <option value="other">{OWNERSHIP_META.other.label}</option>
              <option value="lent">Lent Out to Someone</option>
              <option value="due">Has Due Date</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              aria-label="Sort books"
              className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 outline-none"
            >
              <option value="updated">Sort: Recent</option>
              <option value="finished">Sort: Date Finished</option>
              <option value="rating">Sort: Highest Rated</option>
              <option value="title">Sort: Title (A–Z)</option>
              <option value="author">Sort: Author (A–Z)</option>
              <option value="series">Sort: Series Order</option>
            </select>
          </div>
        </div>

        {/* Grouping Mode + View Mode + Active Tag Pill */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-100 dark:border-stone-800/80">
          <div className="flex flex-wrap items-center gap-2">
            {statusFilter !== 'reviews' && (
              <div className="inline-flex p-0.5 rounded-xl bg-stone-100 dark:bg-stone-800/80">
                {(
                  [
                    { id: 'flat', label: 'Flat' },
                    { id: 'shelf', label: 'By Shelf' },
                    { id: 'series', label: 'By Series' },
                  ] as Array<{ id: GroupMode; label: string }>
                ).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupMode(g.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      groupMode === g.id
                        ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                        : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}

            {tagFilter && (
              <button
                type="button"
                onClick={() => setTagFilter('')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer"
              >
                #{tagFilter} <X className="w-3 h-3" />
              </button>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-medium text-stone-500 hover:text-amber-600 cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV/JSON
            </button>

            {statusFilter !== 'reviews' && (
              <div className="inline-flex p-0.5 rounded-xl bg-stone-100 dark:bg-stone-800/80">
                <button
                  type="button"
                  aria-label="Grid view"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-400'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-400'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredBooks.length === 0 ? (
        <div className="py-16 px-4 text-center rounded-3xl bg-white/70 dark:bg-[#171A23]/70 border border-dashed border-stone-300 dark:border-stone-700 space-y-3">
          <Library className="w-10 h-10 text-amber-500/80 mx-auto" />
          <h3 className="font-serif-display text-lg font-bold text-stone-800 dark:text-stone-100">
            {statusFilter === 'reviews'
              ? 'No written book reviews yet'
              : profileBooks.length === 0
                ? 'Your library shelf is empty'
                : 'No books match your filters'}
          </h3>
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
            {statusFilter === 'reviews'
              ? 'Open any finished book (or mark a book Finished) to write your Final Review — it will appear right here.'
              : profileBooks.length === 0
                ? 'Search Open Library & Google Books, scan an ISBN barcode, import your Goodreads CSV, or add a book manually.'
                : 'Try adjusting your status tab, language, ownership, or search query.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 cursor-pointer"
              >
                Show All Books
              </button>
            )}
            {profileBooks.length === 0 && onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('search')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 text-white cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" /> Search Catalog
              </button>
            )}
          </div>
        </div>
      ) : statusFilter === 'reviews' ? (
        /* Dedicated Reviews Tab View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBooks.map((book) => (
            <article
              key={book.id}
              onClick={() => setDetailBookId(book.id)}
              className="p-5 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 hover:border-emerald-400/70 shadow-xs hover:shadow-lg transition-all cursor-pointer flex gap-4"
            >
              <div className="shrink-0">
                <BookCover
                  title={book.title}
                  author={book.author}
                  coverUrl={book.coverUrl}
                  size="sm"
                />
              </div>

              <div className="min-w-0 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {book.series && (
                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                        {book.series}
                        {book.seriesIndex ? ` #${book.seriesIndex}` : ''}
                      </p>
                    )}
                    <h3 className="font-serif-display font-bold text-base text-stone-900 dark:text-stone-100 leading-snug">
                      {book.title}
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{book.author}</p>
                  </div>

                  <button
                    type="button"
                    aria-label={`Edit review for ${book.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditBook(book);
                    }}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer shrink-0"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 mt-2">
                  {book.rating > 0 && <StarRating value={book.rating} size="sm" showNumeric />}
                  {book.dateFinished && (
                    <span className="text-[11px] text-stone-400">
                      Finished {book.dateFinished}
                    </span>
                  )}
                  {book.language && book.language !== 'English' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                      {book.language}
                    </span>
                  )}
                </div>

                <div className="mt-3 p-3.5 rounded-2xl bg-emerald-500/6 border border-emerald-500/15 text-sm text-stone-700 dark:text-stone-200 whitespace-pre-wrap leading-relaxed">
                  {book.review}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : groupMode === 'shelf' ? (
        <div className="space-y-8">
          {shelfGroups.map((group) => (
            <section key={group.id} className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800 pb-2">
                <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-600" />
                  {group.name}
                </h2>
                <span className="text-xs font-semibold text-stone-500">
                  {group.books.length} {group.books.length === 1 ? 'book' : 'books'}
                </span>
              </div>
              {renderBooksCollection(group.books)}
            </section>
          ))}
        </div>
      ) : groupMode === 'series' ? (
        <div className="space-y-8">
          {seriesGroups.named.map((group) => {
            const pct = Math.round((group.finishedCount / Math.max(1, group.totalCount)) * 100);
            return (
              <section key={group.name} className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/80 dark:border-stone-800 pb-2.5">
                  <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-600" />
                    {group.name}
                  </h2>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                      {group.finishedCount} / {group.totalCount} finished
                    </span>
                    <div className="w-24 h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
                {renderBooksCollection(group.books)}
              </section>
            );
          })}

          {seriesGroups.standalone.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800 pb-2">
                <h2 className="font-serif-display text-lg font-bold text-stone-700 dark:text-stone-300">
                  Standalone Titles
                </h2>
                <span className="text-xs font-semibold text-stone-500">
                  {seriesGroups.standalone.length}{' '}
                  {seriesGroups.standalone.length === 1 ? 'book' : 'books'}
                </span>
              </div>
              {renderBooksCollection(seriesGroups.standalone)}
            </section>
          )}
        </div>
      ) : (
        renderBooksCollection(filteredBooks)
      )}

      {/* Modals & Drawers */}
      <BookDetailDrawer
        book={detailBook}
        onClose={() => setDetailBookId(null)}
        onEdit={openEditBook}
        onLogPages={openLogBook}
      />

      <BookFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditBook(null);
        }}
        editBook={editBook}
      />

      <LogSessionModal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        initialBookId={logBookId}
      />

      <FamilyWishlistModal
        open={wishlistOpen}
        onClose={() => setWishlistOpen(false)}
      />

      <ImportPreviewModal
        preview={importPreview}
        onClose={() => setImportPreview(null)}
      />
    </div>
  );
};
