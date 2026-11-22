import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  AlertCircle,
  CameraOff,
  Check,
  Layers,
  Loader2,
  Plus,
  ScanBarcode,
  Trash2,
  Users,
} from 'lucide-react';
import { lookupBookByIsbn } from '../../services/openLibrary';
import { useLibrary } from '../../store/LibraryContext';
import type {
  BookFormat,
  BookOwnership,
  OpenLibrarySearchResult,
  ReadingStatus,
} from '../../types/library';
import { findBookDuplicates } from '../../utils/duplicates';
import { BookCover } from '../common/BookCover';
import { Modal } from '../common/Modal';

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (isbn: string) => void;
  initialMode?: 'single' | 'batch';
}

interface BatchQueueItem {
  isbn: string;
  status: 'loading' | 'ready' | 'not-found' | 'error';
  result?: OpenLibrarySearchResult;
  customTitle?: string;
  ownDuplicate: boolean;
  householdOwner?: string;
  errorMessage?: string;
}

const DEBOUNCE_MS = 2500;

function todayLocalIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onClose,
  onDetected,
  initialMode = 'single',
}) => {
  const { db, activeProfileId, activeProfiles, profileShelves, addBook, addToast } = useLibrary();

  const rawId = useId().replace(/:/g, '');
  const scannerRegionId = `isbn-scanner-${rawId}`;

  const [mode, setMode] = useState<'single' | 'batch'>(initialMode);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualIsbn, setManualIsbn] = useState('');
  const [batchPasteText, setBatchPasteText] = useState('');
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [lastScanBanner, setLastScanBanner] = useState<string | null>(null);

  const [bulkShelfId, setBulkShelfId] = useState<string>('');
  const [bulkStatus, setBulkStatus] = useState<ReadingStatus>('want-to-read');
  const [bulkFormat, setBulkFormat] = useState<BookFormat>('physical');
  const [bulkOwnership, setBulkOwnership] = useState<BookOwnership>('owned');
  const [bulkTags, setBulkTags] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [submittingBatch, setSubmittingBatch] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledScanRef = useRef(false);
  const modeRef = useRef<'single' | 'batch'>(initialMode);
  const queueRef = useRef<BatchQueueItem[]>([]);
  const lastScanRef = useRef<{ isbn: string; ts: number }>({ isbn: '', ts: 0 });
  const lookupControllersRef = useRef<Map<string, AbortController>>(new Map());
  const dbRef = useRef(db);
  const activeProfilesRef = useRef(activeProfiles);
  const activeProfileIdRef = useRef(activeProfileId);

  modeRef.current = mode;
  queueRef.current = queue;
  dbRef.current = db;
  activeProfilesRef.current = activeProfiles;
  activeProfileIdRef.current = activeProfileId;

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    modeRef.current = initialMode;
    setManualIsbn('');
    setBatchPasteText('');
    setLastScanBanner(null);
    setBulkShelfId((prev) => prev || profileShelves[0]?.id || '');
  }, [open, initialMode, profileShelves]);

  useEffect(() => {
    if (open) return;
    lookupControllersRef.current.forEach((ctrl) => ctrl.abort());
    lookupControllersRef.current.clear();
  }, [open]);

  const enqueueIsbn = useCallback((rawToken: string): 'added' | 'duplicate' | 'invalid' => {
    const cleaned = rawToken.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (cleaned.length < 10 || cleaned.length > 13) return 'invalid';

    if (queueRef.current.some((item) => item.isbn === cleaned)) {
      setLastScanBanner(`Already in queue: ${cleaned}`);
      return 'duplicate';
    }

    const initialDup = findBookDuplicates(
      { title: '', author: '', isbn: cleaned },
      dbRef.current.books,
      activeProfilesRef.current,
      activeProfileIdRef.current,
    );

    const pendingItem: BatchQueueItem = {
      isbn: cleaned,
      status: 'loading',
      ownDuplicate: initialDup.ownMatches.length > 0,
      householdOwner: initialDup.householdMatches[0]
        ? `${initialDup.householdMatches[0].ownerEmoji} ${initialDup.householdMatches[0].ownerName}`
        : undefined,
    };

    const nextQueue = [...queueRef.current, pendingItem];
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    setLastScanBanner(`Queued ${cleaned} — fetching book details…`);

    const controller = new AbortController();
    lookupControllersRef.current.set(cleaned, controller);

    void (async () => {
      try {
        const result = await lookupBookByIsbn(cleaned, controller.signal);
        if (controller.signal.aborted) return;

        if (!result) {
          setQueue((prev) =>
            prev.map((item) =>
              item.isbn === cleaned
                ? { ...item, status: 'not-found', errorMessage: 'No catalog match found' }
                : item,
            ),
          );
          return;
        }

        const fullDup = findBookDuplicates(
          { title: result.title, author: result.author, isbn: result.isbn || cleaned },
          dbRef.current.books,
          activeProfilesRef.current,
          activeProfileIdRef.current,
        );

        setQueue((prev) =>
          prev.map((item) =>
            item.isbn === cleaned
              ? {
                  ...item,
                  status: 'ready',
                  result,
                  ownDuplicate: fullDup.ownMatches.length > 0,
                  householdOwner: fullDup.householdMatches[0]
                    ? `${fullDup.householdMatches[0].ownerEmoji} ${fullDup.householdMatches[0].ownerName}`
                    : undefined,
                }
              : item,
          ),
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setQueue((prev) =>
          prev.map((item) =>
            item.isbn === cleaned
              ? {
                  ...item,
                  status: 'error',
                  errorMessage: err instanceof Error ? err.message : 'Lookup failed',
                }
              : item,
          ),
        );
      } finally {
        lookupControllersRef.current.delete(cleaned);
      }
    })();

    return 'added';
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    handledScanRef.current = false;
    setCameraError(null);

    const startScanner = async () => {
      try {
        const instance = new Html5Qrcode(scannerRegionId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
          ],
          verbose: false,
        });
        scannerRef.current = instance;

        await instance.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 260, height: 130 },
          },
          (decodedText) => {
            if (cancelled) return;
            const cleaned = decodedText.replace(/[^0-9Xx]/g, '').toUpperCase();
            if (cleaned.length < 10) return;

            if (modeRef.current === 'batch') {
              const now = Date.now();
              if (
                lastScanRef.current.isbn === cleaned &&
                now - lastScanRef.current.ts < DEBOUNCE_MS
              ) {
                return;
              }
              lastScanRef.current = { isbn: cleaned, ts: now };
              enqueueIsbn(cleaned);
              return;
            }

            if (handledScanRef.current) return;
            handledScanRef.current = true;
            void (async () => {
              try {
                if (instance.isScanning) await instance.stop();
                instance.clear();
              } catch {
                // ignore cleanup errors
              }
              onDetected(cleaned);
              onClose();
            })();
          },
          () => {
            // Frame scan miss — ignore silently
          },
        );

        if (cancelled) {
          try {
            if (instance.isScanning) await instance.stop();
            instance.clear();
          } catch {
            // ignore
          }
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Camera access unavailable. You can type an ISBN below instead.';
        setCameraError(message);
      }
    };

    const timer = window.setTimeout(() => {
      void startScanner();
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const instance = scannerRef.current;
      scannerRef.current = null;
      if (instance) {
        void (async () => {
          try {
            if (instance.isScanning) await instance.stop();
            instance.clear();
          } catch {
            // ignore teardown errors
          }
        })();
      }
    };
  }, [open, onClose, onDetected, scannerRegionId, enqueueIsbn]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualIsbn.replace(/[^0-9Xx]/g, '').toUpperCase();
    if (!cleaned) return;
    if (mode === 'batch') {
      const outcome = enqueueIsbn(cleaned);
      if (outcome === 'added' || outcome === 'duplicate') {
        setManualIsbn('');
      } else {
        setLastScanBanner(`"${manualIsbn.trim()}" is not a valid 10- or 13-digit ISBN.`);
      }
      return;
    }
    onDetected(cleaned);
    onClose();
  };

  const handleQueueBatchPaste = () => {
    const tokens = batchPasteText
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    let added = 0;
    let duplicates = 0;
    let invalid = 0;
    for (const token of tokens) {
      const outcome = enqueueIsbn(token);
      if (outcome === 'added') added++;
      else if (outcome === 'duplicate') duplicates++;
      else invalid++;
    }
    setBatchPasteText('');
    setLastScanBanner(
      `Queued ${added} ISBN(s)` +
        (duplicates > 0 ? ` · ${duplicates} already queued` : '') +
        (invalid > 0 ? ` · ${invalid} skipped` : ''),
    );
  };

  const handleRemoveFromQueue = (isbn: string) => {
    lookupControllersRef.current.get(isbn)?.abort();
    lookupControllersRef.current.delete(isbn);
    setQueue((prev) => prev.filter((item) => item.isbn !== isbn));
  };

  const handleClearQueue = () => {
    lookupControllersRef.current.forEach((ctrl) => ctrl.abort());
    lookupControllersRef.current.clear();
    setQueue([]);
    setLastScanBanner(null);
  };

  const addableItems = useMemo(() => {
    return queue.filter((item) => {
      if (skipDuplicates && item.ownDuplicate) return false;
      if (item.status === 'ready' && item.result) return true;
      if ((item.status === 'not-found' || item.status === 'error') && item.customTitle?.trim()) {
        return true;
      }
      return false;
    });
  }, [queue, skipDuplicates]);

  const loadingCount = useMemo(
    () => queue.filter((item) => item.status === 'loading').length,
    [queue],
  );

  const handleAddBatchToLibrary = () => {
    if (addableItems.length === 0 || submittingBatch) return;
    setSubmittingBatch(true);

    try {
      const today = todayLocalIso();
      const parsedTags = bulkTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const shelfIds = bulkShelfId ? [bulkShelfId] : [];
      const addedIsbns = new Set<string>();

      for (const item of addableItems) {
        const res = item.result;
        const title = res?.title || item.customTitle?.trim() || `ISBN ${item.isbn}`;
        const author = res?.author || 'Unknown Author';
        const pageCount = res?.pageCount || 0;
        const created = addBook({
          title,
          author,
          shelfIds,
          isbn: res?.isbn || item.isbn,
          publishYear: res?.publishYear,
          publisher: res?.publisher,
          language: res?.language || 'English',
          pageCount,
          currentPage: bulkStatus === 'finished' ? pageCount : 0,
          progressUnit: 'pages',
          coverUrl: res?.coverUrl,
          format: bulkFormat,
          ownership: bulkOwnership,
          status: bulkStatus,
          rating: 0,
          dateStarted:
            bulkStatus === 'reading' || bulkStatus === 'finished' ? today : undefined,
          dateFinished: bulkStatus === 'finished' ? today : undefined,
          synopsis: res?.synopsis,
          notes: '',
          tags: parsedTags,
          openLibraryKey: res?.key,
        });
        if (created) {
          addedIsbns.add(item.isbn);
        }
      }

      if (addedIsbns.size > 0) {
        addToast({
          title: `Added ${addedIsbns.size} book${addedIsbns.size === 1 ? '' : 's'} to library`,
          description:
            parsedTags.length > 0 ? `Tagged: ${parsedTags.join(', ')}` : undefined,
          tone: 'success',
        });
      }

      const remaining = queue.filter((item) => !addedIsbns.has(item.isbn));
      setQueue(remaining);
      if (remaining.length === 0) {
        onClose();
      }
    } finally {
      setSubmittingBatch(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'batch' ? 'Batch Scan & Queue ISBNs' : 'Scan Book ISBN Barcode'}
      subtitle={
        mode === 'batch'
          ? 'Scan a stack of books continuously or paste multiple ISBNs, then assign shelves & status once.'
          : 'Point your rear camera at the EAN/ISBN barcode on the back cover.'
      }
      maxWidthClass={mode === 'batch' ? 'max-w-xl' : 'max-w-md'}
    >
      <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-4">
        {/* Mode Switcher */}
        <div className="inline-flex rounded-xl bg-stone-100 dark:bg-stone-900 p-1 border border-stone-200/80 dark:border-stone-800">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'single'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <ScanBarcode className="w-3.5 h-3.5" /> Single Scan
          </button>
          <button
            type="button"
            onClick={() => setMode('batch')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'batch'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Batch Queue
            {queue.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px]">
                {queue.length}
              </span>
            )}
          </button>
        </div>

        {/* Live Camera Viewfinder */}
        <div className="relative rounded-2xl overflow-hidden bg-stone-950 min-h-[220px] flex items-center justify-center">
          <div id={scannerRegionId} className="w-full" />

          {cameraError && (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-stone-900/95 text-stone-200">
              <CameraOff className="w-8 h-8 text-amber-400 mb-2" />
              <p className="text-sm font-semibold">Camera unavailable</p>
              <p className="text-xs text-stone-400 mt-1 max-w-xs">{cameraError}</p>
            </div>
          )}
        </div>

        {mode === 'batch' && lastScanBanner && (
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
            <span className="truncate">{lastScanBanner}</span>
            {loadingCount > 0 && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
          </div>
        )}

        {/* Quick single / queue input */}
        <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={manualIsbn}
              onChange={(e) => setManualIsbn(e.target.value)}
              placeholder={
                mode === 'batch'
                  ? 'Type or scan ISBN and press Enter to queue…'
                  : 'Or type ISBN (e.g. 9780593135204)'
              }
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold cursor-pointer"
          >
            {mode === 'batch' ? 'Queue' : 'Lookup'}
          </button>
        </form>

        {/* Batch Mode Controls */}
        {mode === 'batch' && (
          <div className="space-y-4">
            {/* Multi-ISBN Paste Input */}
            <div className="rounded-2xl bg-stone-50 dark:bg-stone-900/70 border border-stone-200/80 dark:border-stone-800 p-3 space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Paste multiple ISBNs (comma, space, or line-separated)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  rows={2}
                  value={batchPasteText}
                  onChange={(e) => setBatchPasteText(e.target.value)}
                  placeholder="9780593135204&#10;9780441172719, 9780143127741"
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-xs font-mono text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500 resize-y"
                />
                <button
                  type="button"
                  onClick={handleQueueBatchPaste}
                  disabled={!batchPasteText.trim()}
                  className="px-3.5 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer self-end sm:self-stretch shrink-0"
                >
                  Queue List
                </button>
              </div>
            </div>

            {/* Queued Books List */}
            {queue.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Staged Queue ({queue.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleClearQueue}
                    className="text-xs font-semibold text-stone-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    Clear Queue
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                  {queue.map((item) => (
                    <div
                      key={item.isbn}
                      className="flex items-start gap-3 p-2.5 rounded-2xl bg-stone-50 dark:bg-stone-900/70 border border-stone-200/80 dark:border-stone-800"
                    >
                      <BookCover
                        title={item.result?.title || item.customTitle || item.isbn}
                        author={item.result?.author || 'Unknown'}
                        coverUrl={item.result?.coverUrl}
                        size="xs"
                        interactive={false}
                      />

                      <div className="min-w-0 flex-1">
                        {item.status === 'loading' ? (
                          <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                            <span className="font-mono">{item.isbn}</span>
                            <span>Looking up…</span>
                          </div>
                        ) : item.status === 'ready' && item.result ? (
                          <>
                            <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                              {item.result.title}
                            </p>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                              {item.result.author} · <span className="font-mono">{item.isbn}</span>
                              {item.result.pageCount ? ` · ${item.result.pageCount} pp` : ''}
                            </p>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono">{item.isbn}</span>
                              <span>· {item.errorMessage || 'Not found'}</span>
                            </div>
                            <input
                              type="text"
                              value={item.customTitle || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQueue((prev) =>
                                  prev.map((q) =>
                                    q.isbn === item.isbn ? { ...q, customTitle: val } : q,
                                  ),
                                );
                              }}
                              placeholder="Optional title to add anyway…"
                              className="w-full px-2 py-1 rounded-lg bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none"
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {item.ownDuplicate && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                              <Check className="w-2.5 h-2.5" /> Already in Library
                            </span>
                          )}
                          {!item.ownDuplicate && item.householdOwner && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-semibold">
                              <Users className="w-2.5 h-2.5" /> {item.householdOwner}&apos;s shelf
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromQueue(item.isbn)}
                        aria-label={`Remove ${item.isbn}`}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-stone-200/60 dark:hover:bg-stone-800 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bulk Assignment Tray */}
            {queue.length > 0 && (
              <div className="rounded-2xl bg-stone-50 dark:bg-stone-900/70 border border-stone-200/90 dark:border-stone-800 p-3.5 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Bulk Assignment Options
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                      Shelf
                    </label>
                    <select
                      value={bulkShelfId}
                      onChange={(e) => setBulkShelfId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-100 outline-none"
                    >
                      <option value="">No Shelf</option>
                      {profileShelves.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                      Status
                    </label>
                    <select
                      value={bulkStatus}
                      onChange={(e) => setBulkStatus(e.target.value as ReadingStatus)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-100 outline-none"
                    >
                      <option value="want-to-read">Want to Read</option>
                      <option value="reading">Reading</option>
                      <option value="finished">Finished</option>
                      <option value="dnf">Did Not Finish</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                      Format
                    </label>
                    <select
                      value={bulkFormat}
                      onChange={(e) => setBulkFormat(e.target.value as BookFormat)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-100 outline-none"
                    >
                      <option value="physical">Physical</option>
                      <option value="ebook">Ebook</option>
                      <option value="audiobook">Audiobook</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                      Ownership
                    </label>
                    <select
                      value={bulkOwnership}
                      onChange={(e) => setBulkOwnership(e.target.value as BookOwnership)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-100 outline-none"
                    >
                      <option value="owned">Owned</option>
                      <option value="library">Library Loan</option>
                      <option value="borrowed">Borrowed</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <input
                    type="text"
                    value={bulkTags}
                    onChange={(e) => setBulkTags(e.target.value)}
                    placeholder="Optional tags (comma-separated, e.g. haul, scifi)"
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-100 outline-none"
                  />

                  <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 dark:text-stone-300 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                    />
                    Skip duplicates already in library
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClearQueue}
                    className="px-3.5 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                  >
                    Clear Queue
                  </button>
                  <button
                    type="button"
                    disabled={addableItems.length === 0 || submittingBatch}
                    onClick={handleAddBatchToLibrary}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add All ({addableItems.length}) to Library
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
