import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  FolderPlus,
  Pencil,
  Printer,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { getStorageEngineInfo, type StorageEngineInfo } from '../../services/idbStorage';
import {
  exportGoodreadsCsv,
  exportHouseholdJson,
  exportProfileJson,
  exportReadingLogsCsv,
  inspectImportFile,
  type ImportPreview,
} from '../../services/importExport';
import { useLibrary } from '../../store/LibraryContext';
import { SHELF_COLORS } from '../../utils/themes';
import { HouseholdAdminModal } from '../profiles/HouseholdAdminModal';
import { CloudSyncModal } from './CloudSyncModal';
import { ImportPreviewModal } from './ImportPreviewModal';

interface ShelvesDataViewProps {
  onOpenPdfExport: () => void;
}

function formatByteCount(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ShelvesDataView: React.FC<ShelvesDataViewProps> = ({ onOpenPdfExport }) => {
  const {
    db,
    activeProfile,
    isActiveProfileAdmin,
    profileShelves,
    profileBooks,
    profileLogs,
    addShelf,
    updateShelf,
    deleteShelf,
    loadSampleHousehold,
    resetAllLocalData,
    legacyV3Raw,
    storageEngine,
    syncStatus,
    driveConfig,
    addToast,
  } = useLibrary();

  const [newShelfName, setNewShelfName] = useState('');
  const [newShelfColor, setNewShelfColor] = useState('amber');
  const [editingShelfId, setEditingShelfId] = useState<string | null>(null);
  const [editingShelfName, setEditingShelfName] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageEngineInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void getStorageEngineInfo(db).then((info) => {
      if (active) setStorageInfo(info);
    });
    return () => {
      active = false;
    };
  }, [db]);

  const handleCreateShelf = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShelfName.trim()) return;
    addShelf(newShelfName.trim(), newShelfColor);
    setNewShelfName('');
  };

  const handleStartRename = (id: string, currentName: string) => {
    setEditingShelfId(id);
    setEditingShelfName(currentName);
  };

  const handleCommitRename = (id: string) => {
    if (editingShelfName.trim()) {
      updateShelf(id, { name: editingShelfName.trim() });
    }
    setEditingShelfId(null);
  };

  const handleReorder = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= profileShelves.length) return;
    const a = profileShelves[index];
    const b = profileShelves[targetIdx];
    updateShelf(a.id, { sortOrder: targetIdx });
    updateShelf(b.id, { sortOrder: index });
  };

  const processImportedFile = async (file: File) => {
    const text = await file.text();
    const preview = inspectImportFile(file.name, text, db, activeProfile?.id || null);
    if (preview.format === 'unknown') {
      addToast({
        title: 'Unsupported import file',
        description:
          preview.warnings[0] ||
          'Expected BookLibrary JSON, Goodreads/StoryGraph/Audible CSV, Libby JSON/CSV, or Kindle Clippings (.txt).',
        tone: 'error',
      });
      return;
    }
    setImportPreview(preview);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processImportedFile(file);
  };

  const effectiveEngine = storageInfo?.engine || storageEngine;

  return (
    <div className="space-y-8 animate-fade-slide">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100">
            Shelves, Import & Sync
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Organize {activeProfile?.name}&apos;s shelves, import from Goodreads, StoryGraph, Audible,
            Libby, or Kindle, or back up your household library.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCloudModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-[#171A23] border border-stone-200 dark:border-stone-800 hover:border-amber-400 text-sm font-semibold text-stone-800 dark:text-stone-100 shadow-xs cursor-pointer self-start"
        >
          <Cloud className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          {syncStatus === 'synced'
            ? `Synced (${driveConfig.userEmail || 'Drive'})`
            : 'Configure Google Drive Sync'}
        </button>
      </div>

      {/* Shelves Management */}
      <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100">
              My Shelves
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Books can belong to one or multiple shelves at once.
            </p>
          </div>

          <form onSubmit={handleCreateShelf} className="flex items-center gap-2">
            <select
              value={newShelfColor}
              onChange={(e) => setNewShelfColor(e.target.value)}
              aria-label="New shelf color"
              className="px-2.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-700 dark:text-stone-200 outline-none"
            >
              {Object.entries(SHELF_COLORS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newShelfName}
              onChange={(e) => setNewShelfName(e.target.value)}
              placeholder="New shelf name…"
              className="w-40 sm:w-52 px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold cursor-pointer shrink-0"
            >
              <FolderPlus className="w-4 h-4" /> Add
            </button>
          </form>
        </div>

        <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
          {profileShelves.length === 0 ? (
            <p className="p-6 text-sm text-stone-500 dark:text-stone-400 text-center">
              No shelves yet. Create one above to organize your books.
            </p>
          ) : (
            profileShelves.map((shelf, index) => {
              const count = profileBooks.filter((b) => b.shelfIds.includes(shelf.id)).length;
              const colorMeta = SHELF_COLORS[shelf.color] || SHELF_COLORS.amber;

              return (
                <div
                  key={shelf.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-stone-50/70 dark:hover:bg-stone-900/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${colorMeta.dot}`} />
                    {editingShelfId === shelf.id ? (
                      <input
                        type="text"
                        value={editingShelfName}
                        onChange={(e) => setEditingShelfName(e.target.value)}
                        onBlur={() => handleCommitRename(shelf.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCommitRename(shelf.id);
                          if (e.key === 'Escape') setEditingShelfId(null);
                        }}
                        autoFocus
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-stone-900 border border-amber-500 text-sm font-semibold text-stone-900 dark:text-stone-100 outline-none"
                      />
                    ) : (
                      <span className="font-semibold text-sm text-stone-900 dark:text-stone-100 truncate">
                        {shelf.name}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 shrink-0">
                      {count} {count === 1 ? 'book' : 'books'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleReorder(index, -1)}
                      title="Move up"
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === profileShelves.length - 1}
                      onClick={() => handleReorder(index, 1)}
                      title="Move down"
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateShelf(shelf.id, { visible: !shelf.visible })}
                      title={shelf.visible ? 'Hide shelf in Library' : 'Show shelf in Library'}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        shelf.visible
                          ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                          : 'text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      {shelf.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartRename(shelf.id, shelf.name)}
                      title="Rename shelf"
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete shelf "${shelf.name}"? Books will remain in your library.`,
                          )
                        ) {
                          deleteShelf(shelf.id);
                        }
                      }}
                      title="Delete shelf"
                      className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Import & Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Import Card */}
        <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 p-5 space-y-4">
          <div>
            <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100">
              Import Books & Backups
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Supports Goodreads CSV, StoryGraph CSV, Audible CSV, Libby Timeline JSON/CSV, Kindle
              &ldquo;My Clippings.txt&rdquo;, BookLibrary JSON, and Legacy v3 JSON.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-7 rounded-2xl border-2 border-dashed text-center transition-colors cursor-pointer ${
              dragging
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-stone-300 dark:border-stone-700 hover:border-amber-400 hover:bg-stone-50 dark:hover:bg-stone-900/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void processImportedFile(file);
                e.target.value = '';
              }}
              className="hidden"
            />
            <Upload className="w-8 h-8 mx-auto text-amber-600 dark:text-amber-400 mb-2" />
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
              Drop a CSV, JSON, or Clippings .txt file here, or click to browse
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Preview counts and choose Merge or Replace before anything changes
            </p>
          </div>

          {legacyV3Raw && (
            <button
              type="button"
              onClick={() =>
                setImportPreview(
                  inspectImportFile(
                    'legacy-v3-browser-storage.json',
                    legacyV3Raw,
                    db,
                    activeProfile?.id || null,
                  ),
                )
              }
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Import Detected Legacy v3 Data from Browser Storage
            </button>
          )}
        </section>

        {/* Export Card */}
        <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 p-5 space-y-3">
          <div>
            <h2 className="font-serif-display text-lg font-bold text-stone-900 dark:text-stone-100">
              Export & Backups
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Portable formats compatible with Goodreads, StoryGraph, PDF reports, Excel, and JSON.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onOpenPdfExport}
              className="sm:col-span-2 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <Printer className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Export Library to PDF / Printable HTML
                  </p>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400">
                    Themes, posters, checklists, book club handouts &amp; customizable reports
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300 shrink-0">
                Configure →
              </span>
            </button>

            <button
              type="button"
              onClick={() => exportHouseholdJson(db)}
              className="flex items-start gap-3 p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/70 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200/80 dark:border-stone-800 text-left transition-colors cursor-pointer"
            >
              <FileJson className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  Household JSON
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Full lossless backup (all profiles)
                </p>
              </div>
            </button>

            <button
              type="button"
              disabled={!activeProfile}
              onClick={() => activeProfile && exportProfileJson(db, activeProfile.id)}
              className="flex items-start gap-3 p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/70 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200/80 dark:border-stone-800 text-left transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  My Profile JSON
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Only {activeProfile?.name}&apos;s books & logs
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                exportGoodreadsCsv(profileBooks, profileShelves, activeProfile?.name || 'library')
              }
              className="flex items-start gap-3 p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/70 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200/80 dark:border-stone-800 text-left transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  Goodreads CSV
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Standard book catalog format
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                exportReadingLogsCsv(profileLogs, profileBooks, activeProfile?.name || 'reader')
              }
              className="flex items-start gap-3 p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-900/70 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200/80 dark:border-stone-800 text-left transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  Reading Log CSV
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Session dates & pages for Sheets
                </p>
              </div>
            </button>
          </div>
        </section>
      </div>

      {/* Household Tools / Reset */}
      <section className="rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Workspace Tools & Reset
            </h3>
            <span
              title={
                storageInfo?.quotaBytes
                  ? `Estimated quota: ${formatByteCount(storageInfo.quotaBytes)}`
                  : undefined
              }
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                effectiveEngine === 'indexeddb'
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/12 text-amber-800 dark:text-amber-300'
              }`}
            >
              <Database className="w-3 h-3" />
              {effectiveEngine === 'indexeddb' ? 'IndexedDB' : 'localStorage'}
              {storageInfo ? ` · ${formatByteCount(storageInfo.estimatedBytes)}` : ''}
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Manage household roles/PINs, load sample readers, or clear local browser storage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isActiveProfileAdmin && (
            <button
              type="button"
              onClick={() => setAdminModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-xs font-semibold text-amber-800 dark:text-amber-300 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Manage Household & PINs
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Replace local profiles with the Sample Household (Alex & Maya)? Export first if you want to keep current books.',
                )
              ) {
                void loadSampleHousehold();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Load Sample Household
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Clear ALL local BookLibrary data on this device? This cannot be undone unless synced or exported.',
                )
              ) {
                resetAllLocalData();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Reset Local Data
          </button>
        </div>
      </section>

      <HouseholdAdminModal open={adminModalOpen} onClose={() => setAdminModalOpen(false)} />
      <CloudSyncModal open={cloudModalOpen} onClose={() => setCloudModalOpen(false)} />
      <ImportPreviewModal preview={importPreview} onClose={() => setImportPreview(null)} />
    </div>
  );
};
