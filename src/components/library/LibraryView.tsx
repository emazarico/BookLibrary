import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  History,
  LayoutGrid,
  List,
  Plus,
  Printer,
  Search,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { inspectImportFile, type ImportPreview } from '../../services/importExport';
import { useLibrary } from '../../store/LibraryContext';
import type { AppTab, Book, BookFormat, ReadingStatus } from '../../types/library';
import { getBookProgressInfo } from '../../utils/progress';
import { BookCover } from '../common/BookCover';
import { ImportPreviewModal } from '../management/ImportPreviewModal';
import { LogSessionModal } from '../timeline/LogSessionModal';
import { BookCard } from './BookCard';
import { BookDetailDrawer } from './BookDetailDrawer';
import { BookFormModal } from './BookFormModal';
import { BookListRow } from './BookListRow';

interface LibraryViewProps {
  onNavigateTab: (tab: AppTab) => void;
  onOpenPdfExport: () => void;
}

type SortKey = 'updated' | 'finished' | 'rating' | 'title' | 'author' | 'pages';

export const LibraryView: React.FC<LibraryViewProps> = ({
  onNavigateTab,
  onOpenPdfExport,
}) => {
  const {
    db,
    activeProfile,
    profileShelves,
    profileBooks,
    legacyV3Raw,
    dismissLegacyV3Banner,
  } = useLibrary();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReadingStatus>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | BookFormat>('all');
  const [shelfFilter, setShelfFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [groupByShelf, setGroupByShelf] = useState(false);

  const [detailBookId, setDetailBookId] = useState<string | null>(null);
  const [editBook, setEditBook] = useState<Book | null>(null);
  const [manualAddOpen, setManualAddOpen] = useState(false);
  const [logBookId, setLogBookId] = useState<string | undefined>(undefined);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [v3Preview, setV3Preview] = useState<ImportPreview | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const detailBook = useMemo(
    () => profileBooks.find((b) => b.id === detailBookId) || null,
    [profileBooks, detailBookId],
  );

  const currentlyReading = useMemo(
    () => profileBooks.filter((b) => b.status === 'reading'),
    [profileBooks],
  );

  const statusCounts = useMemo(() => {
    const counts = {
      all: profileBooks.length,
      reading: 0,
      finished: 0,
      'want-to-read': 0,
      dnf: 0,
    };
    for (const b of profileBooks) {
      counts[b.status] += 1;
    }
    return counts;
  }, [profileBooks]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const b of profileBooks) {
      for (const t of b.tags) {
        const key = t.trim().toLowerCase();
        if (!key) continue;
        const entry = map.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          map.set(key, { label: t.trim(), count: 1 });
        }
      }
    }
    const priority = (tag: string) =>
      tag === 'wishlist' ? 0 : tag === 'audiobook' ? 1 : 2;
    return Array.from(map.entries())
      .sort(
        (a, b) =>
          priority(a[0]) - priority(b[0]) ||
          b[1].count - a[1].count ||
          a[0].localeCompare(b[0]),
      )
      .map(([, val]) => val);
  }, [profileBooks]);

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = profileBooks.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (formatFilter !== 'all' && (b.format || 'physical') !== formatFilter) return false;
      if (shelfFilter !== 'all' && !b.shelfIds.includes(shelfFilter)) return false;
      if (tagFilter && !b.tags.some((t) => t.toLowerCase() === tagFilter.toLowerCase())) {
        return false;
      }
      if (q) {
        const hay = `${b.title} ${b.author} ${b.isbn || ''} ${b.tags.join(' ')} ${b.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'finished':
          return (b.dateFinished || '').localeCompare(a.dateFinished || '') || b.updatedAt.localeCompare(a.updatedAt);
        case 'rating':
          return b.rating - a.rating || a.title.localeCompare(b.title);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'author':
          return a.author.localeCompare(b.author);
        case 'pages':
          return b.pageCount - a.pageCount;
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [profileBooks, query, statusFilter, formatFilter, shelfFilter, tagFilter, sortBy]);

  const visibleShelves = useMemo(
    () => profileShelves.filter((s) => s.visible),
    [profileShelves],
  );

  const openLogFor = (book: Book) => {
    setLogBookId(book.id);
    setLogModalOpen(true);
  };

  return (
    <div className="space-y-7 animate-fade-slide">
      {/* Legacy v3 Migration Banner */}
      {legacyV3Raw && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <History className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                Found legacy v3 library data in browser storage
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Migrate your older shelves and books into {activeProfile?.name}&apos;s library.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setV3Preview(
                  inspectImportFile(
                    'legacy-v3-browser.json',
                    legacyV3Raw,
                    db,
                    activeProfile?.id || null,
                  ),
                )
              }
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
            >
              Preview & Migrate
            </button>
            <button
              type="button"
              onClick={dismissLegacyV3Banner}
              className="px-2 py-1.5 text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header + Quick Add */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {activeProfile?.avatarEmoji} {activeProfile?.name}&apos;s Library
          </p>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 mt-0.5">
            Bookshelf & Progress
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPdfExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-xs sm:text-sm font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Export PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setLogBookId(currentlyReading[0]?.id);
              setLogModalOpen(true);
            }}
            disabled={profileBooks.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-xs sm:text-sm font-semibold text-stone-700 dark:text-stone-200 disabled:opacity-40 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-emerald-600" /> Log Reading
          </button>
          <button
            type="button"
            onClick={() => setManualAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-xs sm:text-sm font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Manual
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('search')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-amber-600/20 cursor-pointer"
          >
            <Search className="w-4 h-4" /> Find Books
          </button>
        </div>
      </div>

      {/* Currently Reading Spotlight Strip */}
      {currentlyReading.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Currently Reading (
              {currentlyReading.length})
            </h2>
          </div>

          <div className="flex gap-3.5 overflow-x-auto custom-scrollbar pb-1">
            {currentlyReading.map((book) => {
              const progress = getBookProgressInfo(book);
              return (
                <div
                  key={book.id}
                  onClick={() => setDetailBookId(book.id)}
                  className="min-w-[270px] sm:min-w-[300px] max-w-xs shrink-0 p-3.5 rounded-2xl bg-gradient-to-br from-white to-amber-50/40 dark:from-[#171A23] dark:to-[#1B1F2B] border border-stone-200/90 dark:border-stone-800 shadow-xs hover:border-amber-400 transition-all cursor-pointer flex items-center gap-3.5"
                >
                  <BookCover
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    size="sm"
                    interactive={false}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif-display font-bold text-sm text-stone-900 dark:text-stone-100 truncate">
                      {book.title}
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                      {book.author}
                    </p>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600 dark:text-stone-300 mb-1">
                        <span className="truncate">{progress.shortLabel}</span>
                        {progress.percent !== null && <span>{progress.percent}%</span>}
                      </div>
                      <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${progress.percent ?? 20}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLogFor(book);
                    }}
                    title="Log reading session"
                    className="p-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Search, Filter & View Toolbar */}
      <section className="p-3.5 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter your books by title, author, ISBN, tag, or note… (press /)"
              className="w-full pl-10 pr-8 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value as 'all' | BookFormat)}
              aria-label="Filter by book format"
              className="px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 outline-none"
            >
              <option value="all">All Formats</option>
              <option value="audiobook">Audiobooks</option>
              <option value="physical">Print Books</option>
              <option value="ebook">E-books</option>
            </select>

            <select
              value={shelfFilter}
              onChange={(e) => setShelfFilter(e.target.value)}
              aria-label="Filter by shelf"
              className="px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 outline-none"
            >
              <option value="all">All Shelves</option>
              {profileShelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort books"
              className="px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 outline-none"
            >
              <option value="updated">Recently Updated</option>
              <option value="finished">Date Finished</option>
              <option value="rating">Highest Rated</option>
              <option value="title">Title (A–Z)</option>
              <option value="author">Author (A–Z)</option>
              <option value="pages">Page Count</option>
            </select>

            <button
              type="button"
              onClick={() => setGroupByShelf((g) => !g)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                groupByShelf
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700'
              }`}
            >
              By Shelf
            </button>

            <div className="inline-flex p-0.5 rounded-xl bg-stone-100 dark:bg-stone-800">
              <button
                type="button"
                aria-label="Showcase card grid"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-400'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Compact list view"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-[#171A23] text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-400'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'All Books' },
              { id: 'reading', label: 'Reading' },
              { id: 'finished', label: 'Finished' },
              { id: 'want-to-read', label: 'Want to Read' },
              { id: 'dnf', label: 'DNF' },
            ] as const
          ).map((pill) => {
            const active = statusFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                    : 'bg-stone-100 dark:bg-stone-800/80 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                <span>{pill.label}</span>
                <span className="opacity-70 tabular-nums">{statusCounts[pill.id]}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Tags Bar (Wishlist, Audiobook, etc.) */}
        {tagCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-stone-100 dark:border-stone-800/80">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-400 mr-1">
              <Tag className="w-3 h-3" /> Tags:
            </span>
            {tagCounts.slice(0, 12).map((item) => {
              const active = tagFilter?.toLowerCase() === item.label.toLowerCase();
              const isWishlist = item.label.toLowerCase() === 'wishlist';
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setTagFilter(active ? null : item.label)}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-600 text-white'
                      : isWishlist
                        ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-amber-500/15'
                  }`}
                >
                  <span>#{item.label}</span>
                  <span className="opacity-70 tabular-nums">{item.count}</span>
                </button>
              );
            })}
            {tagFilter && (
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer"
              >
                Clear <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* Books Display */}
      {profileBooks.length === 0 ? (
        <div className="py-16 px-4 text-center rounded-3xl bg-white/70 dark:bg-[#171A23]/70 border border-dashed border-stone-300 dark:border-stone-700">
          <BookOpen className="w-12 h-12 mx-auto text-stone-300 dark:text-stone-600 mb-3" />
          <h2 className="font-serif-display text-xl font-bold text-stone-800 dark:text-stone-200">
            Your shelf is waiting for its first book
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1 max-w-md mx-auto">
            Search Open Library, scan a physical ISBN barcode, or import from Goodreads /
            StoryGraph.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateTab('search')}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold cursor-pointer"
            >
              Search Books
            </button>
            <button
              type="button"
              onClick={() => setManualAddOpen(true)}
              className="px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-sm font-semibold cursor-pointer"
            >
              Add Manually
            </button>
          </div>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="py-14 text-center text-sm text-stone-500 dark:text-stone-400">
          No books match your active filters.
        </div>
      ) : groupByShelf ? (
        <div className="space-y-8">
          {visibleShelves.map((shelf) => {
            const shelfBooks = filteredBooks.filter((b) => b.shelfIds.includes(shelf.id));
            if (shelfBooks.length === 0) return null;
            return (
              <section key={shelf.id} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-stone-200/80 dark:border-stone-800 pb-2">
                  <h2 className="font-serif-display text-xl font-bold text-stone-900 dark:text-stone-100">
                    {shelf.name}
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-semibold">
                    {shelfBooks.length}
                  </span>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {shelfBooks.map((book) => (
                      <BookCard
                        key={`${shelf.id}-${book.id}`}
                        book={book}
                        onOpenDetail={(b) => setDetailBookId(b.id)}
                        onEdit={(b) => setEditBook(b)}
                        onLogPages={openLogFor}
                        onTagClick={(t) => setTagFilter(t)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {shelfBooks.map((book) => (
                      <BookListRow
                        key={`${shelf.id}-${book.id}`}
                        book={book}
                        onOpenDetail={(b) => setDetailBookId(b.id)}
                        onEdit={(b) => setEditBook(b)}
                        onLogPages={openLogFor}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onOpenDetail={(b) => setDetailBookId(b.id)}
              onEdit={(b) => setEditBook(b)}
              onLogPages={openLogFor}
              onTagClick={(t) => setTagFilter(t)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredBooks.map((book) => (
            <BookListRow
              key={book.id}
              book={book}
              onOpenDetail={(b) => setDetailBookId(b.id)}
              onEdit={(b) => setEditBook(b)}
              onLogPages={openLogFor}
            />
          ))}
        </div>
      )}

      <BookDetailDrawer
        book={detailBook}
        onClose={() => setDetailBookId(null)}
        onEdit={(b) => setEditBook(b)}
        onLogPages={openLogFor}
      />

      <BookFormModal
        open={manualAddOpen || editBook !== null}
        onClose={() => {
          setManualAddOpen(false);
          setEditBook(null);
        }}
        editBook={editBook}
      />

      <LogSessionModal
        open={logModalOpen}
        onClose={() => setLogModalOpen(false)}
        initialBookId={logBookId}
      />

      <ImportPreviewModal preview={v3Preview} onClose={() => setV3Preview(null)} />
    </div>
  );
};
