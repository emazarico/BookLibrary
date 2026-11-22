import React from 'react';
import {
  AlertCircle,
  Calendar,
  Edit3,
  Globe,
  Headphones,
  MessageSquareQuote,
  Plus,
  RotateCcw,
  Star,
  Tablet,
  UserCheck,
} from 'lucide-react';
import { useResolvedCover } from '../../services/coverStore';
import type { Book } from '../../types/library';
import { getBookCoverStyle } from '../../utils/cover';
import { formatMinutesHuman, getBookProgressInfo } from '../../utils/progress';
import { BOOK_FORMAT_META, OWNERSHIP_META, STATUS_META } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { StarRating } from '../common/StarRating';

interface BookCardProps {
  book: Book;
  onOpenDetail: (book: Book) => void;
  onEdit: (book: Book) => void;
  onLogPages: (book: Book) => void;
  onTagClick?: (tag: string) => void;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  onOpenDetail,
  onEdit,
  onLogPages,
  onTagClick,
}) => {
  const cleanCover = useResolvedCover(book.coverUrl);
  const cloth = getBookCoverStyle(book.title, book.author);
  const statusMeta = STATUS_META[book.status];
  const format = book.format || 'physical';
  const progress = getBookProgressInfo(book);
  const ownershipMeta = book.ownership ? OWNERSHIP_META[book.ownership] : null;
  const nonEnglishLang =
    book.language && book.language.trim() && book.language.toLowerCase() !== 'english'
      ? book.language
      : null;
  const isOverdue = Boolean(
    book.dueDate &&
      (book.ownership === 'library' || book.ownership === 'borrowed') &&
      book.dueDate < todayIso(),
  );
  const hasWantSnippet = Boolean(book.recommendedBy || book.wantToReadNote);
  const pastReadCount = book.readHistory?.length ?? 0;

  return (
    <article
      onClick={() => onOpenDetail(book)}
      className="group relative rounded-3xl bg-white dark:bg-[#171A23] border border-stone-200/90 dark:border-stone-800/90 shadow-xs hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 overflow-hidden cursor-pointer flex flex-col"
    >
      {/* Subtle Ambient Blurred Cover Backdrop (Zero CORS issues) */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        {cleanCover ? (
          <img
            src={cleanCover}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover blur-3xl opacity-15 dark:opacity-20 scale-125"
          />
        ) : (
          <div
            className="w-full h-full opacity-10 dark:opacity-20"
            style={{
              background: `radial-gradient(circle at top left, ${cloth.bgFrom}, transparent 70%)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/85 to-white dark:from-[#171A23]/55 dark:via-[#171A23]/90 dark:to-[#171A23]" />
      </div>

      {/* Card Body */}
      <div className="relative z-10 p-4 sm:p-5 flex gap-4 flex-1">
        <div className="shrink-0 pt-0.5">
          <BookCover
            title={book.title}
            author={book.author}
            coverUrl={book.coverUrl}
            size="md"
          />
        </div>

        <div className="min-w-0 flex-1 flex flex-col">
          {/* Status, Format, Language, Ownership Pills + Quick Edit */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex flex-wrap items-center gap-1 min-w-0">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusMeta.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                {statusMeta.shortLabel}
              </span>

              {pastReadCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/12 text-amber-800 dark:text-amber-300 border border-amber-500/20">
                  <RotateCcw className="w-2.5 h-2.5" />
                  {book.status === 'reading'
                    ? `Re-read #${pastReadCount + 1}`
                    : `${pastReadCount + (book.status === 'finished' ? 1 : 0)}× read`}
                </span>
              )}

              {format === 'audiobook' && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${BOOK_FORMAT_META.audiobook.badgeClass}`}
                >
                  <Headphones className="w-2.5 h-2.5" /> Audiobook
                </span>
              )}
              {format === 'ebook' && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${BOOK_FORMAT_META.ebook.badgeClass}`}
                >
                  <Tablet className="w-2.5 h-2.5" /> E-book
                </span>
              )}

              {nonEnglishLang && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                  <Globe className="w-2.5 h-2.5" />
                  {nonEnglishLang}
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
                  <UserCheck className="w-2.5 h-2.5" /> Lent: {book.lentTo}
                </span>
              )}

              {book.review && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  <Star className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" /> Reviewed
                </span>
              )}
            </div>

            <button
              type="button"
              aria-label={`Edit ${book.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(book);
              }}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100/80 dark:hover:bg-stone-800/80 transition-colors cursor-pointer shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Series Kicker */}
          {book.series && (
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 truncate mb-0.5">
              {book.series}
              {book.seriesIndex ? ` #${book.seriesIndex}` : ''}
            </p>
          )}

          {/* Title & Author */}
          <h3
            title={book.title}
            className="font-serif-display font-bold text-base sm:text-[17px] leading-snug text-stone-900 dark:text-stone-100 line-clamp-2"
          >
            {book.title}
          </h3>
          <p className="text-xs font-medium text-stone-500 dark:text-stone-400 truncate mt-0.5">
            {book.author}
          </p>

          {/* Rating + Metadata */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2">
            {book.rating > 0 && <StarRating value={book.rating} size="sm" showNumeric />}
            {book.pageCount > 0 && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                {book.pageCount} pp
              </span>
            )}
            {book.totalMinutes && book.totalMinutes > 0 && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                {formatMinutesHuman(book.totalMinutes)}
              </span>
            )}
            {book.dateFinished && (
              <span className="inline-flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
                <Calendar className="w-3 h-3" />
                {book.dateFinished}
              </span>
            )}
          </div>

          {/* Want-to-Read Recommendation / Comment Snippet */}
          {hasWantSnippet && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-sky-800 dark:text-sky-300 bg-sky-500/8 border border-sky-500/15 rounded-xl px-2.5 py-1.5">
              <MessageSquareQuote className="w-3 h-3 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
              <p className="line-clamp-2 leading-snug">
                {book.recommendedBy && (
                  <span className="font-semibold">
                    Rec: {book.recommendedBy}
                    {book.wantToReadNote ? ' — ' : ''}
                  </span>
                )}
                {book.wantToReadNote}
              </p>
            </div>
          )}

          {/* Review or Notes Excerpt */}
          {!hasWantSnippet && (book.review || book.notes) && (
            <p className="text-xs text-stone-600 dark:text-stone-300/90 italic line-clamp-2 mt-2.5 leading-relaxed">
              &ldquo;{book.review || book.notes}&rdquo;
            </p>
          )}

          {/* Tags */}
          {book.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-auto pt-3">
              {book.tags.slice(0, 3).map((tag) => {
                const isWishlist = tag.toLowerCase() === 'wishlist';
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagClick?.(tag);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                      isWishlist
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25'
                        : 'bg-stone-100/90 dark:bg-stone-800/90 text-stone-600 dark:text-stone-300 hover:bg-amber-500/15 hover:text-amber-700 dark:hover:text-amber-300'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
              {book.tags.length > 3 && (
                <span className="text-[10px] text-stone-400 px-1 py-0.5">
                  +{book.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress Footer for Reading Books */}
      {book.status === 'reading' && (
        <div className="relative z-10 px-4 sm:px-5 py-2.5 bg-stone-50/90 dark:bg-stone-900/60 border-t border-stone-100 dark:border-stone-800/80 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600 dark:text-stone-300 mb-1">
              <span className="truncate">{progress.label}</span>
              {progress.percent !== null && <span>{progress.percent}%</span>}
            </div>
            <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                style={{ width: `${progress.percent ?? 18}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLogPages(book);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Log
          </button>
        </div>
      )}
    </article>
  );
};
