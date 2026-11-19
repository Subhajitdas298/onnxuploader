import Papa from 'papaparse';
import type { CellValue, FeatureKind } from '../../types';

export interface CsvColumn {
  feature: string;
  kind: FeatureKind;
}

export const MAX_ROWS = 50;
const INTEGER = /^-?\d+$/;

/** A whole number that every JSON client can carry exactly (up to 2^53 - 1). */
export const isWholeNumber = (raw: string) => INTEGER.test(raw) && Number.isSafeInteger(Number(raw));

export interface CsvResult {
  rows: Record<string, CellValue>[];
  errors: string[];
}

/** Reads test cases from CSV text. Columns are matched by header name, so their order does not matter. */
export function parseTestCsv(text: string, columns: CsvColumn[]): CsvResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const errors: string[] = [];
  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) return { rows: [], errors: ['The file is empty.'] };

  for (const c of columns) {
    if (!headers.includes(c.feature.toLowerCase())) errors.push(`Missing column “${c.feature}”.`);
  }
  if (errors.length) return { rows: [], errors };
  if (parsed.data.length === 0) return { rows: [], errors: ['The file has a header but no test cases.'] };
  if (parsed.data.length > MAX_ROWS) return { rows: [], errors: [`The file has ${parsed.data.length} test cases. The limit is ${MAX_ROWS}.`] };

  const rows: Record<string, CellValue>[] = [];
  parsed.data.forEach((record, i) => {
    const line = i + 2; // header is line 1
    const row: Record<string, CellValue> = {};
    for (const c of columns) {
      const raw = (record[c.feature.toLowerCase()] ?? '').trim();
      if (c.kind === 'BOOLEAN') {
        if (/^(true|1|yes)$/i.test(raw)) row[c.feature] = true;
        else if (/^(false|0|no)$/i.test(raw)) row[c.feature] = false;
        else errors.push(`Line ${line}: “${raw}” is not true or false for ${c.feature}.`);
      } else if (c.kind === 'INTEGER') {
        if (!isWholeNumber(raw)) errors.push(`Line ${line}: “${raw}” is not a whole number for ${c.feature}.`);
        row[c.feature] = raw;
      } else {
        if (!raw) errors.push(`Line ${line}: ${c.feature} is empty.`);
        row[c.feature] = raw;
      }
    }
    rows.push(row);
  });
  return errors.length ? { rows: [], errors } : { rows, errors: [] };
}
