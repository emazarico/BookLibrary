import type {
  BookEditionOption,
  BookFormat,
  OpenLibrarySearchResult,
  SearchLanguage,
} from '../types/library';
import { buildOpenLibraryCoverById, buildOpenLibraryCoverByIsbn, sanitizeCoverUrl } from '../utils/cover';
import { cleanGoodreadsIsbn } from '../utils/csv';
import { searchLangToBookLanguage } from '../utils/themes';
import { searchGoogleBooks } from './googleBooks';

export interface OpenLibrarySearchParams {
  query: string;
  mode: 'all' | 'title' | 'author' | 'isbn';
  language?: SearchLanguage;
  yearStart?: string;
  yearEnd?: string;
  titleRegex?: string;
  authorRegex?: string;
  limit?: number;
  signal?: AbortSignal;
}

interface RawEditionDoc {
  key?: string;
  title?: string;
  cover_i?: number;
  isbn?: string[];
  language?: string[];
  publisher?: string[];
  publish_year?: number[];
  number_of_pages_median?: number;
}

interface RawWorkEditionEntry {
  key?: string;
  title?: string;
  covers?: number[];
  isbn_13?: string[];
  isbn_10?: string[];
  languages?: Array<{ key?: string }>;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  physical_format?: string;
}

interface RawOpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  cover_edition_key?: string;
  isbn?: string[];
  number_of_pages_median?: number;
  publisher?: string[];
  subject?: string[];
  editions?: {
    docs?: RawEditionDoc[];
  };
}

interface RawBooksApiEntry {
  title?: string;
  authors?: Array<{ name?: string }>;
  publishers?: Array<{ name?: string }>;
  publish_date?: string;
  number_of_pages?: number;
  cover?: { large?: string; medium?: string; small?: string };
  subjects?: Array<{ name?: string }>;
  url?: string;
}

const SHORT_LANG_PARAM: Record<Exclude<SearchLanguage, 'any'>, string> = {
  eng: 'en',
  fre: 'fr',
  spa: 'es',
  ger: 'de',
};

function pickBestIsbn(isbns?: string[]): string | undefined {
  if (!isbns || isbns.length === 0) return undefined;
  const cleanList = isbns.map((s) => s.replace(/[^0-9Xx]/g, '')).filter(Boolean);
  return cleanList.find((s) => s.length === 13) || cleanList.find((s) => s.length === 10) || cleanList[0];
}

function editionMatchesLang(ed: RawEditionDoc, preferredLang: SearchLanguage): boolean {
  if (preferredLang === 'any') return true;
  if (!Array.isArray(ed.language) || ed.language.length === 0) return false;
  return ed.language.some((entry) => {
    const clean = entry.trim().toLowerCase();
    return clean === preferredLang || clean.endsWith(`/${preferredLang}`);
  });
}

function inferFormatFromPhysical(physicalFormat?: string): BookFormat | undefined {
  if (!physicalFormat) return undefined;
  const lower = physicalFormat.toLowerCase();
  if (/audio|cd\b|mp3|spoken/.test(lower)) return 'audiobook';
  if (/ebook|e-book|kindle|electronic|epub|pdf/.test(lower)) return 'ebook';
  return 'physical';
}

function mapDocToResult(
  doc: RawOpenLibraryDoc,
  preferredLang: SearchLanguage,
): OpenLibrarySearchResult {
  const editions = Array.isArray(doc.editions?.docs) ? doc.editions.docs : [];
  const langEditions =
    preferredLang === 'any'
      ? editions
      : editions.filter((ed) => editionMatchesLang(ed, preferredLang));

  const preferredWithCover =
    langEditions.find((ed) => typeof ed.cover_i === 'number') ||
    editions.find((ed) => typeof ed.cover_i === 'number');
  const preferredWithIsbn =
    langEditions.find((ed) => Array.isArray(ed.isbn) && ed.isbn.length > 0) ||
    editions[0];

  const title =
    doc.title?.trim() ||
    preferredWithCover?.title?.trim() ||
    preferredWithIsbn?.title?.trim() ||
    'Untitled Book';
  const authors =
    Array.isArray(doc.author_name) && doc.author_name.length > 0
      ? doc.author_name
      : ['Unknown Author'];

  const isbn =
    pickBestIsbn(preferredWithCover?.isbn) ||
    pickBestIsbn(preferredWithIsbn?.isbn) ||
    pickBestIsbn(doc.isbn);

  // Build deduplicated cover candidates prioritizing language-matched editions first
  const candidates: string[] = [];
  const pushUrl = (raw?: string) => {
    const clean = sanitizeCoverUrl(raw);
    if (clean && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  for (const ed of langEditions) {
    if (ed.cover_i) pushUrl(buildOpenLibraryCoverById(ed.cover_i, 'L'));
    const edIsbn = pickBestIsbn(ed.isbn);
    if (edIsbn && !ed.cover_i) pushUrl(buildOpenLibraryCoverByIsbn(edIsbn, 'L'));
  }

  for (const ed of editions) {
    if (ed.cover_i) pushUrl(buildOpenLibraryCoverById(ed.cover_i, 'L'));
  }

  if (doc.cover_i) pushUrl(buildOpenLibraryCoverById(doc.cover_i, 'L'));
  if (isbn) pushUrl(buildOpenLibraryCoverByIsbn(isbn, 'L'));

  const alternateCoverUrls = candidates.slice(0, 5);
  const coverUrl = alternateCoverUrls[0];

  const sourceEditions = (langEditions.length > 0 ? langEditions : editions).slice(0, 12);
  const mappedEditions: BookEditionOption[] = sourceEditions.map((ed, idx) => {
    const edIsbn = pickBestIsbn(ed.isbn);
    const edCover = ed.cover_i
      ? sanitizeCoverUrl(buildOpenLibraryCoverById(ed.cover_i, 'L'))
      : edIsbn
        ? sanitizeCoverUrl(buildOpenLibraryCoverByIsbn(edIsbn, 'L'))
        : undefined;
    return {
      key: ed.key || `${doc.key || title}-ed-${idx}`,
      title: ed.title?.trim() || title,
      language: ed.language?.[0] ? searchLangToBookLanguage(ed.language[0]) : undefined,
      publisher: Array.isArray(ed.publisher) ? ed.publisher[0] : undefined,
      publishYear: Array.isArray(ed.publish_year) ? ed.publish_year[0] : undefined,
      isbn: edIsbn,
      pageCount:
        typeof ed.number_of_pages_median === 'number' && ed.number_of_pages_median > 0
          ? ed.number_of_pages_median
          : undefined,
      coverUrl: edCover,
    };
  });

  const resolvedLang =
    preferredWithCover?.language?.[0]
      ? searchLangToBookLanguage(preferredWithCover.language[0])
      : preferredLang !== 'any'
        ? searchLangToBookLanguage(preferredLang)
        : 'English';

  return {
    key: doc.key || `${title}::${authors[0]}`,
    title,
    author: authors[0],
    authors,
    publishYear: doc.first_publish_year,
    coverUrl,
    alternateCoverUrls,
    isbn,
    pageCount:
      typeof doc.number_of_pages_median === 'number' && doc.number_of_pages_median > 0
        ? doc.number_of_pages_median
        : undefined,
    publisher:
      Array.isArray(doc.publisher) && doc.publisher.length > 0 ? doc.publisher[0] : undefined,
    language: resolvedLang,
    source: 'openlibrary',
    editions: mappedEditions,
    subjects: Array.isArray(doc.subject) ? doc.subject.slice(0, 6) : [],
  };
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

export async function searchOpenLibrary(
  params: OpenLibrarySearchParams,
): Promise<OpenLibrarySearchResult[]> {
  const trimmedQuery = params.query.trim();
  const yearStart = params.yearStart?.trim();
  const yearEnd = params.yearEnd?.trim();
  const limit = params.limit ?? 24;
  const language: SearchLanguage = params.language ?? 'eng';

  if (!trimmedQuery && !yearStart && !yearEnd) {
    return [];
  }

  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set(
    'fields',
    'key,title,author_name,first_publish_year,cover_i,cover_edition_key,isbn,number_of_pages_median,publisher,subject,editions,editions.key,editions.title,editions.cover_i,editions.isbn,editions.language,editions.publisher,editions.publish_year,editions.number_of_pages_median',
  );

  const yearClause =
    yearStart || yearEnd
      ? `first_publish_year:[${yearStart || '1000'} TO ${yearEnd || new Date().getFullYear()}]`
      : '';

  const useLanguageFilter = params.mode !== 'isbn' && language !== 'any';
  const langClause = useLanguageFilter ? `language:${language}` : '';
  if (useLanguageFilter) {
    url.searchParams.set('lang', SHORT_LANG_PARAM[language]);
  }

  const qParts: string[] = [];

  if (params.mode === 'isbn' && trimmedQuery) {
    const cleanIsbn = trimmedQuery.replace(/[^0-9Xx]/g, '');
    url.searchParams.set('isbn', cleanIsbn || trimmedQuery);
  } else if (params.mode === 'title' && trimmedQuery) {
    url.searchParams.set('title', trimmedQuery);
  } else if (params.mode === 'author' && trimmedQuery) {
    url.searchParams.set('author', trimmedQuery);
  } else if (trimmedQuery) {
    qParts.push(trimmedQuery);
  }

  if (yearClause) qParts.push(yearClause);
  if (langClause) qParts.push(langClause);

  if (qParts.length > 0) {
    url.searchParams.set('q', qParts.join(' '));
  }

  const response = await fetch(url.toString(), { signal: params.signal });
  if (!response.ok) {
    throw new Error(`Open Library returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as { docs?: RawOpenLibraryDoc[] };
  let results = (data.docs || []).map((doc) => mapDocToResult(doc, language));

  const startNum = yearStart ? Number(yearStart) : null;
  const endNum = yearEnd ? Number(yearEnd) : null;
  if (startNum !== null || endNum !== null) {
    results = results.filter((r) => {
      if (!r.publishYear) return true;
      if (startNum !== null && !Number.isNaN(startNum) && r.publishYear < startNum) return false;
      if (endNum !== null && !Number.isNaN(endNum) && r.publishYear > endNum) return false;
      return true;
    });
  }

  const titleRe = compileOptionalRegex(params.titleRegex);
  if (titleRe) {
    results = results.filter((r) => titleRe.test(r.title));
  }

  const authorRe = compileOptionalRegex(params.authorRegex);
  if (authorRe) {
    results = results.filter((r) => r.authors.some((a) => authorRe.test(a)));
  }

  return results;
}

export async function fetchWorkEditions(
  workKey: string,
  signal?: AbortSignal,
): Promise<BookEditionOption[]> {
  if (!workKey.startsWith('/works/')) {
    return [];
  }

  try {
    const res = await fetch(`https://openlibrary.org${workKey}/editions.json?limit=20`, {
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: RawWorkEditionEntry[] };
    const entries = Array.isArray(data.entries) ? data.entries : [];

    return entries.map((entry, idx) => {
      const isbn = pickBestIsbn([...(entry.isbn_13 || []), ...(entry.isbn_10 || [])]);
      const coverUrl =
        Array.isArray(entry.covers) && entry.covers[0] > 0
          ? sanitizeCoverUrl(buildOpenLibraryCoverById(entry.covers[0], 'L'))
          : isbn
            ? sanitizeCoverUrl(buildOpenLibraryCoverByIsbn(isbn, 'L'))
            : undefined;
      const yearMatch = entry.publish_date ? /\b(1\d{3}|20\d{2})\b/.exec(entry.publish_date) : null;
      const langKey = entry.languages?.[0]?.key;

      return {
        key: entry.key || `${workKey}-edition-${idx}`,
        title: entry.title?.trim() || 'Untitled Edition',
        language: langKey ? searchLangToBookLanguage(langKey) : undefined,
        publisher: entry.publishers?.[0],
        publishYear: yearMatch ? Number(yearMatch[1]) : undefined,
        isbn,
        pageCount:
          typeof entry.number_of_pages === 'number' && entry.number_of_pages > 0
            ? entry.number_of_pages
            : undefined,
        format: inferFormatFromPhysical(entry.physical_format),
        coverUrl,
      };
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    return [];
  }
}

function mergeTwoResults(
  primary: OpenLibrarySearchResult,
  secondary: OpenLibrarySearchResult,
): OpenLibrarySearchResult {
  const combinedCovers: string[] = [];
  for (const url of [
    ...(primary.alternateCoverUrls || []),
    primary.coverUrl,
    secondary.coverUrl,
    ...(secondary.alternateCoverUrls || []),
  ]) {
    if (url && !combinedCovers.includes(url)) {
      combinedCovers.push(url);
    }
  }

  return {
    ...primary,
    coverUrl: primary.coverUrl || secondary.coverUrl,
    alternateCoverUrls: combinedCovers.slice(0, 6),
    isbn: primary.isbn || secondary.isbn,
    pageCount: primary.pageCount || secondary.pageCount,
    publisher: primary.publisher || secondary.publisher,
    publishYear: primary.publishYear || secondary.publishYear,
    language: primary.language || secondary.language,
    synopsis: primary.synopsis || secondary.synopsis,
    source: 'merged',
    subjects:
      primary.subjects.length > 0 ? primary.subjects : secondary.subjects,
  };
}

export async function searchBooksCombined(
  params: OpenLibrarySearchParams,
): Promise<OpenLibrarySearchResult[]> {
  const [olSettled, gbSettled] = await Promise.allSettled([
    searchOpenLibrary(params),
    searchGoogleBooks(params),
  ]);

  if (params.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const olResults = olSettled.status === 'fulfilled' ? olSettled.value : [];
  const gbResults = gbSettled.status === 'fulfilled' ? gbSettled.value : [];

  if (olSettled.status === 'rejected' && gbResults.length === 0) {
    throw olSettled.reason;
  }

  const merged: OpenLibrarySearchResult[] = olResults.map((item) => ({ ...item }));
  const isbnIndex = new Map<string, number>();
  const taIndex = new Map<string, number>();

  merged.forEach((item, idx) => {
    const cleanIsbn = cleanGoodreadsIsbn(item.isbn);
    if (cleanIsbn) isbnIndex.set(cleanIsbn, idx);
    taIndex.set(`${item.title.trim().toLowerCase()}::${item.author.trim().toLowerCase()}`, idx);
  });

  for (const gb of gbResults) {
    const cleanIsbn = cleanGoodreadsIsbn(gb.isbn);
    const taKey = `${gb.title.trim().toLowerCase()}::${gb.author.trim().toLowerCase()}`;
    const existingIdx =
      (cleanIsbn ? isbnIndex.get(cleanIsbn) : undefined) ?? taIndex.get(taKey);

    if (existingIdx !== undefined) {
      merged[existingIdx] = mergeTwoResults(merged[existingIdx], gb);
    } else {
      const nextIdx = merged.length;
      merged.push(gb);
      if (cleanIsbn) isbnIndex.set(cleanIsbn, nextIdx);
      taIndex.set(taKey, nextIdx);
    }
  }

  return merged;
}

export async function lookupBookByIsbn(
  rawIsbn: string,
  signal?: AbortSignal,
): Promise<OpenLibrarySearchResult | null> {
  const cleanIsbn = rawIsbn.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (!cleanIsbn) return null;

  let olMatch: OpenLibrarySearchResult | null = null;

  try {
    const bibKey = `ISBN:${cleanIsbn}`;
    const apiUrl = `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(bibKey)}&format=json&jscmd=data`;
    const res = await fetch(apiUrl, { signal });
    if (res.ok) {
      const payload = (await res.json()) as Record<string, RawBooksApiEntry>;
      const entry = payload[bibKey];
      if (entry && entry.title) {
        const authors =
          entry.authors?.map((a) => a.name).filter((n): n is string => Boolean(n)) || [];
        const yearMatch = entry.publish_date ? /\b(1\d{3}|20\d{2})\b/.exec(entry.publish_date) : null;
        const rawCover = entry.cover?.large || entry.cover?.medium || entry.cover?.small;
        const coverUrl =
          sanitizeCoverUrl(rawCover) || buildOpenLibraryCoverByIsbn(cleanIsbn, 'L');

        olMatch = {
          key: entry.url || `isbn:${cleanIsbn}`,
          title: entry.title.trim(),
          author: authors[0] || 'Unknown Author',
          authors: authors.length > 0 ? authors : ['Unknown Author'],
          publishYear: yearMatch ? Number(yearMatch[1]) : undefined,
          coverUrl,
          alternateCoverUrls: coverUrl ? [coverUrl] : [],
          isbn: cleanIsbn,
          pageCount:
            typeof entry.number_of_pages === 'number' && entry.number_of_pages > 0
              ? entry.number_of_pages
              : undefined,
          publisher: entry.publishers?.[0]?.name,
          language: 'English',
          source: 'openlibrary',
          subjects: entry.subjects?.map((s) => s.name).filter((n): n is string => Boolean(n)).slice(0, 6) || [],
        };
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
  }

  if (!olMatch) {
    const searchMatches = await searchOpenLibrary({
      query: cleanIsbn,
      mode: 'isbn',
      language: 'any',
      limit: 1,
      signal,
    }).catch(() => [] as OpenLibrarySearchResult[]);
    olMatch = searchMatches[0] ?? null;
  }

  const gbFallback = await searchGoogleBooks({
    query: cleanIsbn,
    mode: 'isbn',
    language: 'any',
    limit: 1,
    signal,
  }).catch(() => [] as OpenLibrarySearchResult[]);

  if (olMatch && gbFallback[0]) {
    return mergeTwoResults(olMatch, gbFallback[0]);
  }
  return olMatch ?? gbFallback[0] ?? null;
}
