/**
 * Strict RFC 4180 CSV parser supporting quoted fields, escaped quotes (""),
 * embedded commas, and multi-line field values.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (input[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export function escapeCsvCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeCsv(
  headers: string[],
  rows: (string | number | undefined | null)[][],
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Cleans Goodreads Excel-formula ISBN wrappers like ="9780143127741" and strips hyphens/spaces.
 */
export function cleanGoodreadsIsbn(raw?: string | null): string {
  if (!raw) return '';
  let cleaned = raw.trim();
  if (cleaned.startsWith('="') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(2, -1);
  } else if (cleaned.startsWith('=')) {
    cleaned = cleaned.slice(1);
  }
  cleaned = cleaned.replace(/^["']+|["']+$/g, '');
  return cleaned.replace(/[^0-9Xx]/g, '').toUpperCase();
}
