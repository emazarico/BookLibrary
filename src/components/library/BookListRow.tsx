import React from 'react';
import {
  AlertCircle,
  Calendar,
  Edit3,
  Globe,
  Headphones,
  Plus,
  RotateCcw,
  Star,
  Tablet,
  UserCheck,
} from 'lucide-react';
import type { Book } from '../../types/library';
import { getBookProgressInfo } from '../../utils/progress';
import { BOOK_FORMAT_META, OWNERSHIP_META, STATUS_META } from '../../utils/themes';
import { BookCover } from '../common/BookCover';
import { StarRating } from '../common/StarRating';

interface BookListRowProps {
  book: Book;
  onOpenDetail: (book: Book) => void;
  onEdit: (book: Book) => void;
  onLogPages: (book: Book) => void;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const BookListRow: React.FC<BookListRowProps> = ({
  book,
  onOpenDetail,
  onEdit,
  onLogPages,
}) => {
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
  const pastReadCount = book.readHistory?.length ?? 0;

  return (
    <div
      onClick={() => onOpenDetail(book)}
      className="group flex items-center gap-3.5 p-3 rounded-2xl bg-white dark:bg-[#171A23] border border-stone-200/80 dark:border-stone-800 hover:border-amber-400/70 transition-all cursor-pointer"
    >
      <BookCover
        title={book.title}
        author={book.author}
        coverUrl={book.coverUrl}
        size="sm"
        interactive={false}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-serif-display font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100 truncate">
            {book.title}
          </h3>
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
              <Headphones className="w-2.5 h-2.5" /> Audio
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
              <Globe className="w-2.5 h-2.5" /> {nonEnglishLang}
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
        <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
          {book.author}
          {book.series && (
            <span className="ml-1.5 text-amber-700 dark:text-amber-400 font-medium">
              · {book.series}
              {book.seriesIndex ? ` #${book.seriesIndex}` : ''}
            </span>
          )}
        </p>

        {book.status === 'reading' && (
          <div className="mt-1.5 flex items-center gap-2 max-w-xs">
            <div className="flex-1 h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${progress.percent ?? 20}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-stone-500 tabular-nums">
              {progress.percent !== null ? `${progress.percent}%` : progress.shortLabel}
            </span>
          </div>
        )}
      </div>

      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
        {book.rating > 0 && <StarRating value={book.rating} size="sm" />}
        <div className="flex items-center gap-2 text-[11px] text-stone-400">
          {book.pageCount > 0 && <span>{book.pageCount} pp</span>}
          {book.dateFinished && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {book.dateFinished}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {book.status === 'reading' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLogPages(book);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Log
          </button>
        )}
        <button
          type="button"
          aria-label={`Edit ${book.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(book);
          }}
          className="p-2 rounded-xl text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
        >
          <Edit3 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
