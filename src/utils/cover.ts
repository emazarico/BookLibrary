export interface ClothCoverStyle {
  bgFrom: string;
  bgTo: string;
  accent: string;
  ink: string;
  motif: 'arch' | 'circle' | 'lines' | 'diamond';
}

const CLOTH_PALETTES: Array<Omit<ClothCoverStyle, 'motif'>> = [
  { bgFrom: '#1E293B', bgTo: '#0F172A', accent: '#F59E0B', ink: '#F8FAFC' }, // Midnight Navy & Gold
  { bgFrom: '#14532D', bgTo: '#052E16', accent: '#FDE68A', ink: '#ECFDF5' }, // Forest Cloth & Cream
  { bgFrom: '#7F1D1D', bgTo: '#450A0A', accent: '#FBBF24', ink: '#FEF2F2' }, // Burgundy & Gilt
  { bgFrom: '#92400E', bgTo: '#451A03', accent: '#FEF3C7', ink: '#FFFBEB' }, // Ochre & Ivory
  { bgFrom: '#4C1D95', bgTo: '#2E1065', accent: '#DDD6FE', ink: '#F5F3FF' }, // Plum Linen
  { bgFrom: '#115E59', bgTo: '#042F2E', accent: '#99F6E4', ink: '#F0FDFA' }, // Deep Teal
  { bgFrom: '#9A3412', bgTo: '#431407', accent: '#FED7AA', ink: '#FFF7ED' }, // Terracotta
  { bgFrom: '#3F2E26', bgTo: '#1F1612', accent: '#E7D3B8', ink: '#FAF5EE' }, // Espresso Leather
];

const MOTIFS: ClothCoverStyle['motif'][] = ['arch', 'circle', 'lines', 'diamond'];

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Normalizes and validates book cover URLs.
 * Supports IndexedDB cover keys (`idb-cover:...`), inline data URLs, upgrades Google Books HTTP,
 * drops known dead placeholder URLs, and appends ?default=false on Open Library covers.
 */
export function sanitizeCoverUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('via.placeholder.com')) return undefined;
  if (trimmed.startsWith('idb-cover:') && trimmed.length > 'idb-cover:'.length) {
    return trimmed;
  }
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return undefined;
  }

  if (
    parsed.hostname === 'books.google.com' ||
    parsed.hostname.endsWith('.books.google.com')
  ) {
    parsed.protocol = 'https:';
  }

  if (parsed.hostname === 'covers.openlibrary.org') {
    parsed.protocol = 'https:';
    if (!parsed.searchParams.has('default')) {
      parsed.searchParams.set('default', 'false');
    }
    return parsed.toString();
  }

  return parsed.toString();
}

export function buildOpenLibraryCoverById(coverId: number | string, size: 'S' | 'M' | 'L' = 'L'): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg?default=false`;
}

export function buildOpenLibraryCoverByIsbn(isbn: string, size: 'S' | 'M' | 'L' = 'L'): string {
  const clean = isbn.replace(/[^0-9Xx]/g, '');
  return `https://covers.openlibrary.org/b/isbn/${clean}-${size}.jpg?default=false`;
}

export function getBookCoverStyle(title: string, author: string): ClothCoverStyle {
  const h = hashString(`${title}::${author}`);
  const palette = CLOTH_PALETTES[h % CLOTH_PALETTES.length];
  const motif = MOTIFS[(h >>> 4) % MOTIFS.length];
  return { ...palette, motif };
}
