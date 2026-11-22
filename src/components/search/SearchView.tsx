import React, { useMemo, useRef, useState } from 'react';
import {
  BookPlus,
  Check,
  Loader2,
  Plus,
  ScanBarcode,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { lookupBookByIsbn, searchOpenLibrary } from '../../services/openLibrary';
import { useLibrary } from '../../store/LibraryContext';
import type { OpenLibrarySearchResult, SearchLanguage } from '../../types/library';
import { cleanGoodreadsIsbn } from '../../utils/csv';
import { BookCover } from '../common/BookCover';
import { BookFormModal } from '../library/BookFormModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';

export const SearchView: React.FC = () => {
  const { profileBooks, addToast } = useLibrary();

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | 'title' | 'author' | 'isbn'>('all');
  const [language, setLanguage] = useState<SearchLanguage>('eng');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [yearStart, setYearStart] = useState('');
  const [yearEnd, setYearEnd] = useState('');
  const [titleRegex, setTitleRegex] = useState('');
  const [authorRegex, setAuthorRegex] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OpenLibrarySearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [prefillBook, setPrefillBook] = useState<OpenLibrarySearchResult | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const ownedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const b of profileBooks) {
      if (b.isbn) set.add(`isbn:${cleanGoodreadsIsbn(b.isbn)}`);
      if (b.openLibraryKey) set.add(`ol:${b.openLibraryKey}`);
      set.add(`ta:${b.title.trim().toLowerCase()}::${b.author.trim().toLowerCase()}`);
    }
    return set;
  }, [profileBooks]);

  const isOwned = (item: OpenLibrarySearchResult) => {
    if (item.isbn && ownedKeys.has(`isbn:${cleanGoodreadsIsbn(item.isbn)}`)) return true;
    if (item.key && ownedKeys.has(`ol:${item.key}`)) return true;
    return ownedKeys.has(
      `ta:${item.title.trim().toLowerCase()}::${item.author.trim().toLowerCase()}`,
    );
  };

  const runSearch = async (overrideQuery?: string, overrideMode?: 'all' | 'title' | 'author' | 'isbn') => {
    const q = overrideQuery !== undefined ? overrideQuery : query;
    const m = overrideMode !== undefined ? overrideMode : mode;

    if (!q.trim() && !yearStart.trim() && !yearEnd.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const data = await searchOpenLibrary({
        query: q,
        mode: m,
        language,
        yearStart,
        yearEnd,
        titleRegex,
        authorRegex,
        signal: controller.signal,
      });
      setResults(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to reach Open Library.');
    } finally {
      setLoading(false);
    }
  };

  const handleIsbnDetected = async (isbn: string) => {
    setQuery(isbn);
    setMode('isbn');
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const exact = await lookupBookByIsbn(isbn);
      if (exact) {
        setResults([exact]);
        setPrefillBook(exact);
      } else {
        setResults([]);
        addToast({
          title: `No exact match for ISBN ${isbn}`,
          description: 'You can add it manually or try searching by title.',
          tone: 'info',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ISBN lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-slide">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100">
            Search & Add Books
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Look up millions of editions via Open Library, scan a physical barcode, or add manually.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-sm font-semibold text-stone-800 dark:text-stone-100 cursor-pointer self-start"
        >
          <BookPlus className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Add Manually
        </button>
      </div>

      {/* Search Card */}
      <section className="p-5 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            Open Library Catalog
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                advancedOpen
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Advanced
            </button>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <ScanBarcode className="w-3.5 h-3.5" /> Scan ISBN
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by book title, author name, or ISBN…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            aria-label="Search field"
            className="px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-medium text-stone-800 dark:text-stone-100 outline-none"
          >
            <option value="all">All Fields</option>
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="isbn">ISBN</option>
          </select>

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as SearchLanguage)}
            aria-label="Edition language"
            className="px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm font-medium text-stone-800 dark:text-stone-100 outline-none"
          >
            <option value="eng">English</option>
            <option value="fre">French</option>
            <option value="spa">Spanish</option>
            <option value="ger">German</option>
            <option value="any">Any Language</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-md shadow-amber-600/20 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {advancedOpen && (
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Publish Year Range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={yearStart}
                  onChange={(e) => setYearStart(e.target.value)}
                  placeholder="Min"
                  className="w-full px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs outline-none"
                />
                <span className="text-stone-400">–</span>
                <input
                  type="number"
                  value={yearEnd}
                  onChange={(e) => setYearEnd(e.target.value)}
                  placeholder="Max"
                  className="w-full px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Title Regex
              </label>
              <input
                type="text"
                value={titleRegex}
                onChange={(e) => setTitleRegex(e.target.value)}
                placeholder="e.g. ^The.*"
                className="w-full px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Author Regex
              </label>
              <input
                type="text"
                value={authorRegex}
                onChange={(e) => setAuthorRegex(e.target.value)}
                placeholder="e.g. Weir$"
                className="w-full px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setYearStart('');
                  setYearEnd('');
                  setTitleRegex('');
                  setAuthorRegex('');
                }}
                className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer pb-1.5"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Results */}
      {loading ? (
        <div className="py-20 text-center text-stone-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-600 mb-3" />
          <p className="text-sm font-medium">Searching Open Library…</p>
        </div>
      ) : error ? (
        <div className="py-16 text-center rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-sm">
          {error}
        </div>
      ) : !hasSearched ? (
        <div className="py-20 text-center rounded-3xl bg-white/60 dark:bg-[#171A23]/60 border border-dashed border-stone-300 dark:border-stone-800 text-stone-400">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            Try searching &ldquo;Project Hail Mary&rdquo;, &ldquo;Ursula K. Le Guin&rdquo;, or scan
            an ISBN barcode.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="py-16 text-center rounded-3xl bg-white/60 dark:bg-[#171A23]/60 border border-dashed border-stone-300 dark:border-stone-800 text-stone-500">
          <p className="text-sm font-medium">No books matched your query.</p>
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
          >
            Add this book manually instead
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {results.map((item) => {
            const owned = isOwned(item);
            return (
              <div
                key={item.key}
                className="group p-4 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 hover:shadow-lg transition-all flex gap-4"
              >
                <BookCover
                  title={item.title}
                  author={item.author}
                  coverUrl={item.coverUrl}
                  size="md"
                />

                <div className="min-w-0 flex-1 flex flex-col">
                  <h3 className="font-serif-display font-bold text-base text-stone-900 dark:text-stone-100 line-clamp-2 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs font-medium text-stone-500 dark:text-stone-400 truncate mt-0.5">
                    {item.author}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-2 text-[11px] text-stone-500 dark:text-stone-400">
                    {item.publishYear && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800">
                        {item.publishYear}
                      </span>
                    )}
                    {item.pageCount && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800">
                        {item.pageCount} pp
                      </span>
                    )}
                    {item.isbn && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 font-mono">
                        {item.isbn}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    {owned ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5" /> In Library
                      </span>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      onClick={() => setPrefillBook(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> {owned ? 'Add Copy' : 'Add'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(isbn) => void handleIsbnDetected(isbn)}
      />

      <BookFormModal
        open={prefillBook !== null || manualOpen}
        onClose={() => {
          setPrefillBook(null);
          setManualOpen(false);
        }}
        prefill={prefillBook}
      />
    </div>
  );
};
