import React, { useMemo, useState } from 'react';
import { Check, Heart, MessageSquareQuote, Plus, Search } from 'lucide-react';
import { useLibrary } from '../../store/LibraryContext';
import type { Book, UserProfile } from '../../types/library';
import { findBookDuplicates } from '../../utils/duplicates';
import { BOOK_FORMAT_META, OWNERSHIP_META } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { Modal } from '../common/Modal';

interface FamilyWishlistModalProps {
  open: boolean;
  onClose: () => void;
}

interface WishlistEntry {
  book: Book;
  owner: UserProfile;
  alreadyOnMyShelf: boolean;
}

export const FamilyWishlistModal: React.FC<FamilyWishlistModalProps> = ({ open, onClose }) => {
  const { db, activeProfiles, activeProfileId, profileShelves, addBook } = useLibrary();

  const [selectedReaderId, setSelectedReaderId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeAllWantToRead, setIncludeAllWantToRead] = useState(false);

  const profileMap = useMemo(
    () => new Map(activeProfiles.map((p) => [p.id, p])),
    [activeProfiles],
  );

  const wishlistEntries = useMemo<WishlistEntry[]>(() => {
    const q = searchQuery.trim().toLowerCase();

    return db.books
      .filter((b) => {
        if (b.deletedAt) return false;
        if (!profileMap.has(b.profileId)) return false;

        const hasWishlistTag = b.tags.some((t) => t.toLowerCase() === 'wishlist');
        const matchesKind =
          hasWishlistTag || (includeAllWantToRead && b.status === 'want-to-read');
        if (!matchesKind) return false;

        if (selectedReaderId !== 'all' && b.profileId !== selectedReaderId) {
          return false;
        }

        if (q) {
          const hay = [
            b.title,
            b.author,
            b.series || '',
            b.language || '',
            b.recommendedBy || '',
            b.wantToReadNote || '',
            ...b.tags,
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((book) => {
        const owner = profileMap.get(book.profileId)!;
        const isMine = book.profileId === activeProfileId;
        let alreadyOnMyShelf = isMine;
        if (!isMine && activeProfileId) {
          const dup = findBookDuplicates(
            { title: book.title, author: book.author, isbn: book.isbn },
            db.books,
            activeProfiles,
            activeProfileId,
          );
          alreadyOnMyShelf = dup.ownMatches.length > 0;
        }
        return { book, owner, alreadyOnMyShelf };
      });
  }, [
    db.books,
    profileMap,
    includeAllWantToRead,
    selectedReaderId,
    searchQuery,
    activeProfileId,
    activeProfiles,
  ]);

  const handleCopyToMyWishlist = (entry: WishlistEntry) => {
    if (!activeProfileId || entry.alreadyOnMyShelf) return;
    const { book, owner } = entry;
    const mergedTags = Array.from(
      new Set([
        ...book.tags.filter((t) => t.toLowerCase() !== 'wishlist'),
        'wishlist',
      ]),
    );

    addBook({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      publishYear: book.publishYear,
      publisher: book.publisher,
      language: book.language || 'English',
      pageCount: book.pageCount,
      currentPage: 0,
      progressUnit: book.progressUnit || 'pages',
      totalChapters: book.totalChapters,
      totalMinutes: book.totalMinutes,
      coverUrl: book.coverUrl,
      format: book.format || 'physical',
      ownership: 'other',
      ownershipNote: `From ${owner.name}'s wishlist`,
      status: 'want-to-read',
      rating: 0,
      recommendedBy: book.recommendedBy || owner.name,
      wantToReadNote: book.wantToReadNote,
      synopsis: book.synopsis,
      series: book.series,
      seriesIndex: book.seriesIndex,
      shelfIds: profileShelves[0] ? [profileShelves[0].id] : [],
      tags: mergedTags,
      notes: '',
      openLibraryKey: book.openLibraryKey,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Family Wishlist"
      subtitle="Browse #wishlist and Want-to-Read picks across every reader in your household — great for library trips & gifts."
      maxWidthClass="max-w-3xl"
    >
      <div className="p-5 space-y-4">
        {/* Controls: Reader Filter + Search + Scope Toggle */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedReaderId('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                selectedReaderId === 'all'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-amber-400'
              }`}
            >
              All Readers
            </button>
            {activeProfiles.map((member) => {
              const selected = selectedReaderId === member.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setSelectedReaderId(member.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-stone-50 dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:border-amber-400'
                  }`}
                >
                  <span>{member.avatarEmoji}</span>
                  <span>{member.name}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by title, author, recommender, series…"
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300 cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                checked={includeAllWantToRead}
                onChange={(e) => setIncludeAllWantToRead(e.target.checked)}
                className="accent-amber-600 w-4 h-4 rounded"
              />
              <span>Include all Want to Read</span>
            </label>
          </div>
        </div>

        {/* Wishlist Items */}
        {wishlistEntries.length === 0 ? (
          <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40">
            <Heart className="w-8 h-8 text-rose-400 mx-auto mb-2.5 opacity-80" />
            <p className="font-serif-display font-semibold text-base text-stone-800 dark:text-stone-100">
              No wishlist titles match your filter
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-md mx-auto">
              Tag any book with <span className="font-semibold">#wishlist</span> or turn on
              &ldquo;Include all Want to Read&rdquo; to see every reader&rsquo;s upcoming picks.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {wishlistEntries.map((entry) => {
              const { book, owner, alreadyOnMyShelf } = entry;
              const isMine = book.profileId === activeProfileId;
              const formatMeta =
                book.format && book.format !== 'physical'
                  ? BOOK_FORMAT_META[book.format]
                  : null;
              const ownershipMeta = book.ownership ? OWNERSHIP_META[book.ownership] : null;
              const lang = book.language && book.language !== 'English' ? book.language : null;

              return (
                <div
                  key={book.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-3.5 rounded-2xl bg-stone-50/80 dark:bg-stone-900/50 border border-stone-200/80 dark:border-stone-800"
                >
                  <div className="flex gap-3.5 min-w-0 flex-1">
                    <BookCover
                      title={book.title}
                      author={book.author}
                      coverUrl={book.coverUrl}
                      size="sm"
                      interactive={false}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/20">
                          <span>{owner.avatarEmoji}</span>
                          <span>{owner.name}</span>
                        </span>

                        {formatMeta && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${formatMeta.badgeClass}`}
                          >
                            {formatMeta.shortLabel}
                          </span>
                        )}

                        {lang && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                            {lang}
                          </span>
                        )}

                        {ownershipMeta && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ownershipMeta.badgeClass}`}
                          >
                            {ownershipMeta.shortLabel}
                          </span>
                        )}
                      </div>

                      <h4 className="font-serif-display font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100 leading-snug">
                        {book.title}
                      </h4>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {book.author}
                        {book.series && (
                          <span className="ml-1.5 text-amber-700 dark:text-amber-400 font-medium">
                            · {book.series}
                            {book.seriesIndex ? ` #${book.seriesIndex}` : ''}
                          </span>
                        )}
                      </p>

                      {(book.recommendedBy || book.wantToReadNote) && (
                        <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-white/80 dark:bg-stone-800/70 border border-stone-200/70 dark:border-stone-700/70 text-xs text-stone-600 dark:text-stone-300 flex items-start gap-1.5">
                          <MessageSquareQuote className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            {book.recommendedBy && (
                              <span className="font-semibold text-stone-800 dark:text-stone-100">
                                Rec by {book.recommendedBy}
                                {book.wantToReadNote ? ': ' : ''}
                              </span>
                            )}
                            {book.wantToReadNote && <span>{book.wantToReadNote}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-end justify-end shrink-0">
                    {isMine ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                        Your Wishlist
                      </span>
                    ) : alreadyOnMyShelf ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                        <Check className="w-3.5 h-3.5" /> On Your Shelf
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCopyToMyWishlist(entry)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add to My Wishlist
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
