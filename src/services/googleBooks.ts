import type { OpenLibrarySearchResult, SearchLanguage } from '../types/library';
import { buildOpenLibraryCoverByIsbn, sanitizeCoverUrl } from '../utils/cover';
import { searchLangToBookLanguage } from '../utils/themes';
import type { OpenLibrarySearchParams } from './openLibrary';

interface GoogleVolumeItem {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
}

const SHORT_LANG_PARAM: Record<Exclude<SearchLanguage, 'any'>, string> = {
  eng: 'en',
  fre: 'fr',
  spa: 'es',
  ger: 'de',
};

function cleanDescription(raw?: string): string | undefined {
  if (!raw) return undefined;
  const plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return undefined;
  return plain.length > 600 ? `${plain.slice(0, 597).trimEnd()}…` : plain;
}

function compileOptionalRegex(pattern?: string): RegExp | null {
  const trimmed = pattern?.trim();
  if (!trimmed) return null;
  try {
    return new RegExp(trimmed, 'i');
  } catch {
    return null;
  }
}

export async function searchGoogleBooks(
  params: OpenLibrarySearchParams,
): Promise<OpenLibrarySearchResult[]> {
  const trimmedQuery = params.query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const language: SearchLanguage = params.language ?? 'eng';
  let q = trimmedQuery;
  if (params.mode === 'isbn') {
    const cleanIsbn = trimmedQuery.replace(/[^0-9Xx]/g, '');
    q = `isbn:${cleanIsbn || trimmedQuery}`;
  } else if (params.mode === 'title') {
    q = `intitle:${trimmedQuery}`;
  } else if (params.mode === 'author') {
    q = `inauthor:${trimmedQuery}`;
  }

  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', q);
  url.searchParams.set('maxResults', String(Math.min(20, params.limit ?? 15)));
  url.searchParams.set('printType', 'books');

  if (params.mode !== 'isbn' && language !== 'any') {
    url.searchParams.set('langRestrict', SHORT_LANG_PARAM[language]);
  }

  try {
    const res = await fetch(url.toString(), { signal: params.signal });
    if (!res.ok) {
      return [];
    }

    const payload = (await res.json()) as { items?: GoogleVolumeItem[] };
    const items = Array.isArray(payload.items) ? payload.items : [];

    let mapped: OpenLibrarySearchResult[] = items.map((item) => {
      const info = item.volumeInfo || {};
      const title = info.title?.trim() || 'Untitled Book';
      const authors =
        Array.isArray(info.authors) && info.authors.length > 0
          ? info.authors
          : ['Unknown Author'];

      const ids = info.industryIdentifiers || [];
      const isbn13 = ids
        .find((i) => i.type === 'ISBN_13')
        ?.identifier?.replace(/[^0-9Xx]/g, '');
      const isbn10 = ids
        .find((i) => i.type === 'ISBN_10')
        ?.identifier?.replace(/[^0-9Xx]/g, '');
      const isbn = isbn13 || isbn10 || undefined;

      const yearMatch = info.publishedDate
        ? /\b(1\d{3}|20\d{2})\b/.exec(info.publishedDate)
        : null;
      const publishYear = yearMatch ? Number(yearMatch[1]) : undefined;

      const rawThumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
      const normalizedThumb = rawThumb
        ? sanitizeCoverUrl(rawThumb.replace(/&edge=curl/gi, ''))
        : undefined;

      const candidates: string[] = [];
      if (normalizedThumb) candidates.push(normalizedThumb);
      if (isbn) {
        const olFallback = sanitizeCoverUrl(buildOpenLibraryCoverByIsbn(isbn, 'L'));
        if (olFallback && !candidates.includes(olFallback)) {
          candidates.push(olFallback);
        }
      }

      return {
        key: `gb:${item.id}`,
        title,
        author: authors[0],
        authors,
        publishYear,
        coverUrl: candidates[0],
        alternateCoverUrls: candidates,
        isbn,
        pageCount:
          typeof info.pageCount === 'number' && info.pageCount > 0 ? info.pageCount : undefined,
        publisher: info.publisher?.trim() || undefined,
        language: searchLangToBookLanguage(info.language),
        synopsis: cleanDescription(info.description),
        source: 'googlebooks',
        subjects: Array.isArray(info.categories) ? info.categories.slice(0, 6) : [],
      };
    });

    const startNum = params.yearStart?.trim() ? Number(params.yearStart) : null;
    const endNum = params.yearEnd?.trim() ? Number(params.yearEnd) : null;
    if (startNum !== null || endNum !== null) {
      mapped = mapped.filter((r) => {
        if (!r.publishYear) return true;
        if (startNum !== null && !Number.isNaN(startNum) && r.publishYear < startNum) return false;
        if (endNum !== null && !Number.isNaN(endNum) && r.publishYear > endNum) return false;
        return true;
      });
    }

    const titleRe = compileOptionalRegex(params.titleRegex);
    if (titleRe) {
      mapped = mapped.filter((r) => titleRe.test(r.title));
    }

    const authorRe = compileOptionalRegex(params.authorRegex);
    if (authorRe) {
      mapped = mapped.filter((r) => r.authors.some((a) => authorRe.test(a)));
    }

    return mapped;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    return [];
  }
}
