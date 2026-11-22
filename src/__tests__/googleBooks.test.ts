import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchGoogleBooks } from '../services/googleBooks';
import { fetchWorkEditions, searchBooksCombined } from '../services/openLibrary';

describe('Google Books service & Open Library combined discovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries Google Books with langRestrict=en on title search, upgrades HTTP thumbnails, strips HTML, and filters years/regex', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'gb1',
            volumeInfo: {
              title: 'Project Hail Mary',
              authors: ['Andy Weir'],
              publisher: 'Ballantine Books',
              publishedDate: '2021-05-04',
              description: '<p>A lone <b>astronaut</b> wakes up in deep space.</p>',
              pageCount: 496,
              language: 'en',
              categories: ['Fiction', 'Science Fiction'],
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '978-0593135204' }],
              imageLinks: {
                thumbnail: 'http://books.google.com/books/content?id=gb1&printsec=frontcover&img=1&edge=curl',
              },
            },
          },
          {
            id: 'gb2',
            volumeInfo: {
              title: 'Companion Study Guide',
              authors: ['Someone'],
              publishedDate: '1999',
              language: 'en',
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const results = await searchGoogleBooks({
      query: 'Project Hail Mary',
      mode: 'title',
      language: 'eng',
      yearStart: '2015',
      titleRegex: '^Project',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('q')).toBe('intitle:Project Hail Mary');
    expect(requestedUrl.searchParams.get('langRestrict')).toBe('en');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      key: 'gb:gb1',
      title: 'Project Hail Mary',
      author: 'Andy Weir',
      isbn: '9780593135204',
      pageCount: 496,
      publishYear: 2021,
      language: 'English',
      source: 'googlebooks',
      synopsis: 'A lone astronaut wakes up in deep space.',
      coverUrl: 'https://books.google.com/books/content?id=gb1&printsec=frontcover&img=1',
    });
  });

  it('omits langRestrict and formats isbn: query in Google Books ISBN mode', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await searchGoogleBooks({
      query: '978-0-593-13520-4',
      mode: 'isbn',
      language: 'fre',
    });

    const requestedUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('q')).toBe('isbn:9780593135204');
    expect(requestedUrl.searchParams.get('langRestrict')).toBeNull();
  });

  it('merges Open Library & Google Books results by ISBN and falls back to Google Books when OL is empty', async () => {
    const mockFetch = vi.fn(async (input: string | URL) => {
      const urlStr = String(input);
      if (urlStr.includes('openlibrary.org/search.json')) {
        return {
          ok: true,
          json: async () => ({
            docs: [
              {
                key: '/works/OL1W',
                title: 'Dune',
                author_name: ['Frank Herbert'],
                first_publish_year: 1965,
                cover_i: 11111,
                isbn: ['9780441172719'],
              },
            ],
          }),
        };
      }
      if (urlStr.includes('googleapis.com/books/v1/volumes')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'gb-dune',
                volumeInfo: {
                  title: 'Dune',
                  authors: ['Frank Herbert'],
                  publishedDate: '1965',
                  pageCount: 688,
                  description: 'Set on the desert planet Arrakis.',
                  language: 'en',
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441172719' }],
                },
              },
              {
                id: 'gb-only',
                volumeInfo: {
                  title: 'Dune Messiah',
                  authors: ['Frank Herbert'],
                  publishedDate: '1969',
                  pageCount: 336,
                  language: 'en',
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780593098233' }],
                },
              },
            ],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    vi.stubGlobal('fetch', mockFetch);

    const combined = await searchBooksCombined({
      query: 'Dune',
      mode: 'title',
    });

    expect(combined).toHaveLength(2);
    expect(combined[0]).toMatchObject({
      title: 'Dune',
      source: 'merged',
      pageCount: 688,
      synopsis: 'Set on the desert planet Arrakis.',
    });
    expect(combined[1]).toMatchObject({
      title: 'Dune Messiah',
      source: 'googlebooks',
      isbn: '9780593098233',
    });
  });

  it('fetches and normalizes work editions with format inference', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          {
            key: '/books/OL100M',
            title: 'The Hobbit (Unabridged Audio)',
            covers: [55555],
            isbn_13: ['9780000000001'],
            languages: [{ key: '/languages/eng' }],
            publishers: ['Recorded Books'],
            publish_date: 'October 2012',
            physical_format: 'Audio CD',
          },
          {
            key: '/books/OL101M',
            title: 'Le Hobbit',
            isbn_10: ['2266111566'],
            languages: [{ key: '/languages/fre' }],
            publishers: ['Pocket'],
            publish_date: '2002',
            number_of_pages: 384,
            physical_format: 'Paperback',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const editions = await fetchWorkEditions('/works/OL262758W');
    expect(editions).toHaveLength(2);
    expect(editions[0]).toMatchObject({
      key: '/books/OL100M',
      language: 'English',
      format: 'audiobook',
      publishYear: 2012,
      isbn: '9780000000001',
      coverUrl: 'https://covers.openlibrary.org/b/id/55555-L.jpg?default=false',
    });
    expect(editions[1]).toMatchObject({
      key: '/books/OL101M',
      language: 'French',
      format: 'physical',
      publishYear: 2002,
      pageCount: 384,
      isbn: '2266111566',
    });

    expect(await fetchWorkEditions('gb:123')).toEqual([]);
  });
});
