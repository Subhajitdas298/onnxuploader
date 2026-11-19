import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTestCsv, type CsvColumn } from './csv';

const columns: CsvColumn[] = [
  { feature: 'amount_cents', kind: 'INTEGER' },
  { feature: 'is_international', kind: 'BOOLEAN' },
  { feature: 'country_code', kind: 'STRING' },
];

describe('parseTestCsv', () => {
  it('loads the sample file that ships in the repository', () => {
    const text = readFileSync(new URL('../../../../samples/test-data.csv', import.meta.url), 'utf8');
    const { rows, errors } = parseTestCsv(text, columns);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ amount_cents: '89900', is_international: true, country_code: 'NG' });
  });

  it('matches columns by header name, in any order, ignoring case and extra columns', () => {
    const { rows, errors } = parseTestCsv('Country_Code,note,AMOUNT_CENTS,is_international\nUS,hi,100,0\n', columns);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ amount_cents: '100', is_international: false, country_code: 'US' });
  });

  it('names a missing column and loads nothing', () => {
    const { rows, errors } = parseTestCsv('amount_cents,is_international\n1,true\n', columns);
    expect(rows).toEqual([]);
    expect(errors).toEqual(['Missing column “country_code”.']);
  });

  it('reports bad values with their line number', () => {
    const { rows, errors } = parseTestCsv('amount_cents,is_international,country_code\n10,maybe,US\n1.5,true,\n', columns);
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      'Line 2: “maybe” is not true or false for is_international.',
      'Line 3: “1.5” is not a whole number for amount_cents.',
      'Line 3: country_code is empty.',
    ]);
  });

  it('rejects a file without test cases', () => {
    expect(parseTestCsv('amount_cents,is_international,country_code\n', columns).errors).toEqual(['The file has a header but no test cases.']);
    expect(parseTestCsv('', columns).errors).toEqual(['The file is empty.']);
  });
});
