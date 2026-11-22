import { describe, expect, it } from 'vitest';
import { cleanGoodreadsIsbn, parseCsv, serializeCsv } from '../utils/csv';

describe('RFC 4180 CSV parser & serializer', () => {
  it('parses embedded commas, escaped quotes, multi-line fields, and BOM', () => {
    const input =
      '\uFEFFTitle,Author,Notes\r\n' +
      '"Dune, Part 1","Frank ""The Spice"" Herbert","Line one\nLine ""two"", really"';

    const rows = parseCsv(input);
    expect(rows).toEqual([
      ['Title', 'Author', 'Notes'],
      ['Dune, Part 1', 'Frank "The Spice" Herbert', 'Line one\nLine "two", really'],
    ]);
  });

  it('round-trips serialized CSV cleanly', () => {
    const headers = ['Title', 'Notes'];
    const rows = [['A, B & "C"', 'Multi\nLine']];
    const serialized = serializeCsv(headers, rows);
    const parsed = parseCsv(serialized);
    expect(parsed).toEqual([headers, ['A, B & "C"', 'Multi\nLine']]);
  });

  it('cleans Goodreads Excel ISBN wrappers and hyphens', () => {
    expect(cleanGoodreadsIsbn('="9780143127741"')).toBe('9780143127741');
    expect(cleanGoodreadsIsbn('978-0-593-13520-4')).toBe('9780593135204');
    expect(cleanGoodreadsIsbn('0-14-312774-x')).toBe('014312774X');
    expect(cleanGoodreadsIsbn('=""')).toBe('');
  });
});
