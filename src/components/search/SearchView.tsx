import React, { useMemo, useRef, useState } from 'react';
import {
  BookPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Plus,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import {
  fetchWorkEditions,
  lookupBookByIsbn,
  searchBooksCombined,
} from '../../services/openLibrary';
import { useLibrary } from '../../store/LibraryContext';
import type {
  BookEditionOption,
  OpenLibrarySearchResult,
  SearchLanguage,
} from '../../types/library';
import { findBookDuplicates } from '../../utils/duplicates';
import { BookCover } from '../common/BookCover';
import { BookFormModal } from '../library/BookFormModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';

export const SearchView: React.FC = () => {
  const { db, activeProfileId, activeProfiles, addToast } = useLibrary();

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

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [workEditionsByKey, setWorkEditionsByKey] = useState<Record<string, BookEditionOption[]>>({});
  const [loadingEditionsKey, setLoadingEditionsKey] = useState<string | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'single' | 'batch'>('single');
  const [prefillBook, setPrefillBook] = useState<OpenLibrarySearchResult | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const duplicateLookupMap = useMemo(() => {
    const map = new Map<
      string,
      { own: boolean; householdOwner?: string }
    >();
    for (const item of results) {
      const check = findBookDuplicates(
        { title: item.title, author: item.author, isbn: item.isbn },
        db.books,
        activeProfiles,
        activeProfileId,
      );
      map.set(item.key, {
        own: check.ownMatches.length > 0,
        householdOwner: check.householdMatches[0]
          ? `${check.householdMatches[0].ownerEmoji} ${check.householdMatches[0].ownerName}`
          : undefined,
      });
    }
    return map;
  }, [results, db.books, activeProfiles, activeProfileId]);

  const runSearch = async (
    overrideQuery?: string,
    overrideMode?: 'all' | 'title' | 'author' | 'isbn',
  ) => {
    const q = overrideQuery !== undefined ? overrideQuery : query;
    const m = overrideMode !== undefined ? overrideMode : mode;

    if (!q.trim() && !yearStart.trim() && !yearEnd.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setExpandedKey(null);

    try {
      const data = await searchBooksCombined({
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
      setError(err instanceof Error ? err.message : 'Failed to reach catalog search.');
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
    setExpandedKey(null);

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

  const handleToggleEditions = async (item: OpenLibrarySearchResult) => {
    if (expandedKey === item.key) {
      setExpandedKey(null);
      return;
    }

    setExpandedKey(item.key);
    if (workEditionsByKey[item.key]) {
      return;
    }

    if (item.key.startsWith('/works/')) {
      setLoadingEditionsKey(item.key);
      try {
        const fetched = await fetchWorkEditions(item.key);
        const fallback = item.editions || [];
        const combined = fetched.length > 0 ? fetched : fallback;
        setWorkEditionsByKey((prev) => ({ ...prev, [item.key]: combined }));
      } finally {
        setLoadingEditionsKey(null);
      }
    } else if (item.editions) {
      setWorkEditionsByKey((prev) => ({ ...prev, [item.key]: item.editions || [] }));
    }
  };

  const handleUseEdition = (item: OpenLibrarySearchResult, ed: BookEditionOption) => {
    const covers = Array.from(
      new Set([ed.coverUrl, ...(item.alternateCoverUrls || []), item.coverUrl].filter(Boolean)),
    ) as string[];

    setPrefillBook({
      ...item,
      title: ed.title || item.title,
      isbn: ed.isbn || item.isbn,
      publisher: ed.publisher || item.publisher,
      publishYear: ed.publishYear || item.publishYear,
      pageCount: ed.pageCount || item.pageCount,
      language: ed.language || item.language,
      coverUrl: ed.coverUrl || item.coverUrl,
      alternateCoverUrls: covers,
    });
  };

  const renderSourceBadge = (source?: OpenLibrarySearchResult['source']) => {
    if (source === 'googlebooks') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold">
          Google Books
        </span>
      );
    }
    if (source === 'merged') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold">
          OL + Google
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
        Open Library
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-slide">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100">
            Search & Add Books
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Searches Open Library &amp; Google Books together, browse editions, or scan an ISBN.
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
            Open Library + Google Books
          </span>
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => {
                setScannerMode('single');
                setScannerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <ScanBarcode className="w-3.5 h-3.5" /> Scan ISBN
            </button>
            <button
              type="button"
              onClick={() => {
                setScannerMode('batch');
                setScannerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-800 dark:text-indigo-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" /> Batch Scan
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
          <p className="text-sm font-medium">Searching Open Library &amp; Google Books…</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
          {results.map((item) => {
            const dup = duplicateLookupMap.get(item.key);
            const hasEditionControl =
              item.key.startsWith('/works/') || (item.editions?.length ?? 0) > 0;
            const isExpanded = expandedKey === item.key;
            const editions = workEditionsByKey[item.key] || item.editions || [];

            return (
              <div
                key={item.key}
                className="group p-4 rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 hover:shadow-lg transition-all flex flex-col gap-3"
              >
                <div className="flex gap-4">
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
                      {renderSourceBadge(item.source)}
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
                      {item.language && item.language !== 'English' && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold">
                          {item.language}
                        </span>
                      )}
                      {item.isbn && (
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 font-mono">
                          {item.isbn}
                        </span>
                      )}
                    </div>

                    {item.synopsis && (
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2 mt-2 leading-relaxed">
                        {item.synopsis}
                      </p>
                    )}

                    <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        {dup?.own && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <Check className="w-3.5 h-3.5" /> In Library
                          </span>
                        )}
                        {!dup?.own && dup?.householdOwner && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                            <Users className="w-3 h-3" /> {dup.householdOwner}&apos;s shelf
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 ml-auto">
                        {hasEditionControl && (
                          <button
                            type="button"
                            onClick={() => void handleToggleEditions(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-[11px] font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
                          >
                            <Layers className="w-3 h-3" />
                            Editions
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPrefillBook(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> {dup?.own ? 'Add Copy' : 'Add'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expandable Edition & ISBN Switcher */}
                {isExpanded && (
                  <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                      Available Editions
                    </p>
                    {loadingEditionsKey === item.key ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-stone-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading editions…
                      </div>
                    ) : editions.length === 0 ? (
                      <p className="text-xs text-stone-400 italic">
                        No separate editions listed for this work.
                      </p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                        {editions.slice(0, 10).map((ed) => (
                          <div
                            key={ed.key}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-800 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {ed.coverUrl && (
                                <img
                                  src={ed.coverUrl}
                                  alt=""
                                  className="w-7 h-10 object-cover rounded shrink-0 border border-stone-200 dark:border-stone-700"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                                  {ed.title}
                                </p>
                                <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                                  {[
                                    ed.language,
                                    ed.publishYear,
                                    ed.publisher,
                                    ed.pageCount ? `${ed.pageCount} pp` : null,
                                    ed.isbn ? `ISBN ${ed.isbn}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || 'Edition'}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleUseEdition(item, ed)}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold cursor-pointer shrink-0"
                            >
                              Use Edition
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(isbn) => void handleIsbnDetected(isbn)}
        initialMode={scannerMode}
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
