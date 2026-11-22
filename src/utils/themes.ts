import type { AvatarTheme, BookFormat, BookOwnership, ReadingStatus } from '../types/library';

export const AVATAR_EMOJIS = [
  '🦉',
  '🦊',
  '🐻',
  '🐱',
  '🦋',
  '🌿',
  '☕',
  '🚀',
  '📚',
  '✨',
  '🎧',
  '🌙',
];

export const AVATAR_THEME_MAP: Record<
  AvatarTheme,
  {
    label: string;
    gradient: string;
    ring: string;
    softBg: string;
    text: string;
  }
> = {
  amber: {
    label: 'Warm Amber',
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    ring: 'ring-amber-400/50',
    softBg: 'bg-amber-500/10 dark:bg-amber-400/15',
    text: 'text-amber-700 dark:text-amber-300',
  },
  indigo: {
    label: 'Midnight Indigo',
    gradient: 'from-indigo-400 via-blue-600 to-violet-600',
    ring: 'ring-indigo-400/50',
    softBg: 'bg-indigo-500/10 dark:bg-indigo-400/15',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  emerald: {
    label: 'Forest Sage',
    gradient: 'from-emerald-400 via-teal-500 to-cyan-600',
    ring: 'ring-emerald-400/50',
    softBg: 'bg-emerald-500/10 dark:bg-emerald-400/15',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  rose: {
    label: 'Velvet Rose',
    gradient: 'from-rose-400 via-pink-500 to-fuchsia-600',
    ring: 'ring-rose-400/50',
    softBg: 'bg-rose-500/10 dark:bg-rose-400/15',
    text: 'text-rose-700 dark:text-rose-300',
  },
  violet: {
    label: 'Royal Plum',
    gradient: 'from-violet-400 via-purple-600 to-indigo-700',
    ring: 'ring-violet-400/50',
    softBg: 'bg-violet-500/10 dark:bg-violet-400/15',
    text: 'text-violet-700 dark:text-violet-300',
  },
  teal: {
    label: 'Sea Glass',
    gradient: 'from-teal-400 via-cyan-500 to-sky-600',
    ring: 'ring-teal-400/50',
    softBg: 'bg-teal-500/10 dark:bg-teal-400/15',
    text: 'text-teal-700 dark:text-teal-300',
  },
  coral: {
    label: 'Terracotta',
    gradient: 'from-orange-400 via-red-500 to-rose-600',
    ring: 'ring-orange-400/50',
    softBg: 'bg-orange-500/10 dark:bg-orange-400/15',
    text: 'text-orange-700 dark:text-orange-300',
  },
  slate: {
    label: 'Ink & Slate',
    gradient: 'from-slate-500 via-zinc-700 to-stone-900',
    ring: 'ring-slate-400/50',
    softBg: 'bg-slate-500/10 dark:bg-slate-400/15',
    text: 'text-slate-700 dark:text-slate-300',
  },
};

export const BOOK_LANGUAGES = [
  'English',
  'French',
  'Spanish',
  'German',
  'Italian',
  'Portuguese',
  'Japanese',
  'Chinese',
  'Dutch',
  'Other',
] as const;

export function searchLangToBookLanguage(code?: string): string {
  if (!code) return 'English';
  const clean = code.trim().toLowerCase().replace(/^\/languages\//, '');
  switch (clean) {
    case 'eng':
    case 'en':
      return 'English';
    case 'fre':
    case 'fra':
    case 'fr':
      return 'French';
    case 'spa':
    case 'es':
      return 'Spanish';
    case 'ger':
    case 'deu':
    case 'de':
      return 'German';
    case 'ita':
    case 'it':
      return 'Italian';
    case 'por':
    case 'pt':
      return 'Portuguese';
    case 'jpn':
    case 'ja':
      return 'Japanese';
    case 'chi':
    case 'zho':
    case 'zh':
      return 'Chinese';
    case 'dut':
    case 'nld':
    case 'nl':
      return 'Dutch';
    default:
      return 'English';
  }
}

export const STATUS_META: Record<
  ReadingStatus,
  {
    label: string;
    shortLabel: string;
    badgeClass: string;
    dotClass: string;
  }
> = {
  reading: {
    label: 'Reading',
    shortLabel: 'Reading',
    badgeClass:
      'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300 border-emerald-500/20',
    dotClass: 'bg-emerald-500',
  },
  finished: {
    label: 'Finished',
    shortLabel: 'Finished',
    badgeClass:
      'bg-amber-500/12 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300 border-amber-500/20',
    dotClass: 'bg-amber-500',
  },
  'want-to-read': {
    label: 'Want to Read',
    shortLabel: 'To Read',
    badgeClass:
      'bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300 border-sky-500/20',
    dotClass: 'bg-sky-500',
  },
  dnf: {
    label: 'Did Not Finish',
    shortLabel: 'DNF',
    badgeClass:
      'bg-rose-500/12 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300 border-rose-500/20',
    dotClass: 'bg-rose-500',
  },
};

export const BOOK_FORMAT_META: Record<
  BookFormat,
  {
    label: string;
    shortLabel: string;
    badgeClass: string;
  }
> = {
  physical: {
    label: 'Print Book',
    shortLabel: 'Print',
    badgeClass:
      'bg-stone-500/10 text-stone-700 dark:bg-stone-400/15 dark:text-stone-300 border-stone-500/20',
  },
  ebook: {
    label: 'E-book',
    shortLabel: 'E-book',
    badgeClass:
      'bg-cyan-500/12 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300 border-cyan-500/20',
  },
  audiobook: {
    label: 'Audiobook',
    shortLabel: 'Audiobook',
    badgeClass:
      'bg-violet-500/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300 border-violet-500/20',
  },
};

export const OWNERSHIP_META: Record<
  BookOwnership,
  {
    label: string;
    shortLabel: string;
    badgeClass: string;
  }
> = {
  owned: {
    label: 'Owned',
    shortLabel: 'Owned',
    badgeClass:
      'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300 border-emerald-500/20',
  },
  library: {
    label: 'Public Library',
    shortLabel: 'Library',
    badgeClass:
      'bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300 border-sky-500/20',
  },
  borrowed: {
    label: 'Borrowed',
    shortLabel: 'Borrowed',
    badgeClass:
      'bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300 border-orange-500/20',
  },
  other: {
    label: 'Other',
    shortLabel: 'Other',
    badgeClass:
      'bg-slate-500/12 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300 border-slate-500/20',
  },
};

export const SUGGESTED_TAGS = [
  'wishlist',
  'audiobook',
  'favorite',
  'book-club',
  'borrowed',
  'owned',
  'to-buy',
  're-read',
];

export const SHELF_COLORS: Record<string, { label: string; badge: string; dot: string }> = {
  amber: {
    label: 'Amber',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  indigo: {
    label: 'Indigo',
    badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-500',
  },
  emerald: {
    label: 'Emerald',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  rose: {
    label: 'Rose',
    badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  violet: {
    label: 'Violet',
    badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  teal: {
    label: 'Teal',
    badge: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
};
