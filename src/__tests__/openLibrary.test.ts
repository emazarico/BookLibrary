import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchOpenLibrary } from '../services/openLibrary';

describe('Open Library language-matched search & edition cover selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends lang=en and language:eng by default and prefers English edition cover over foreign work cover', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        docs: [
          {
            key: '/works/OL1W',
            title: 'Dune',
            author_name: ['Frank Herbert'],
            first_publish_year: 1965,
            cover_i: 99999, // foreign/default work cover
            isbn: ['9783453186835'],
            number_of_pages_median: 688,
            editions: {
              docs: [
                {
                  key: '/books/OL_DE',
                  title: 'Der Wüstenplanet',
                  cover_i: 99999,
                  isbn: ['9783453186835'],
                  language: ['ger'],
                },
                {
                  key: '/books/OL_EN',
                  title: 'Dune',
                  cover_i: 11111,
                  isbn: ['9780441172719'],
                  language: ['/languages/eng'],
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const results = await searchOpenLibrary({
      query: 'Dune',
      mode: 'title',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('lang')).toBe('en');
    expect(requestedUrl.searchParams.get('q')).toContain('language:eng');
    expect(requestedUrl.searchParams.get('title')).toBe('Dune');

    expect(results).toHaveLength(1);
    expect(results[0].coverUrl).toBe('https://covers.openlibrary.org/b/id/11111-L.jpg?default=false');
    expect(results[0].isbn).toBe('9780441172719');
    expect(results[0].alternateCoverUrls).toEqual([
      'https://covers.openlibrary.org/b/id/11111-L.jpg?default=false',
      'https://covers.openlibrary.org/b/id/99999-L.jpg?default=false',
      'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg?default=false',
    ]);
  });

  it('omits language restriction on exact ISBN searches', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await searchOpenLibrary({
      query: '978-0-441-17271-9',
      mode: 'isbn',
      language: 'eng',
    });

    const requestedUrl = new URL(mockFetch.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('isbn')).toBe('9780441172719');
    expect(requestedUrl.searchParams.get('lang')).toBeNull();
    expect(requestedUrl.searchParams.get('q')).toBeNull();
  });
});
