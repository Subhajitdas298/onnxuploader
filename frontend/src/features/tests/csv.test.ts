import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTestCsv, type CsvColumn } from './csv';

const columns: CsvColumn[] = [
  { feature: 'amount_cents', kind: 'INTEGER' },
  { feature: 'is_international', kind: 'BOOLEAN' },
  { feature: 'country_code', kind: 'STRING' },
];

import { isNumber } from './csv';

describe('isNumber', () => {
  it('accepts plain decimals and rejects everything else', () => {
    for (const ok of ['0', '0.5', '.5', '5.', '-2', '+1', '1e-3', ' 0.9 ']) expect(isNumber(ok), ok).toBe(true);
    for (const bad of ['', 'abc', '1,5', '0x10', 'NaN', 'Infinity', '1e', '--1', '1 2']) expect(isNumber(bad), bad).toBe(false);
  });
});

describe('parseTestCsv', () => {
  it('loads the sample file that ships in the repository', () => {
    const text = readFileSync(new URL('../../../../samples/test-data.csv', import.meta.url), 'utf8');
    const { rows, errors } = parseTestCsv(text, columns);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ values: { amount_cents: '89900', is_international: true, country_code: 'NG' }, expected: '0.90' });
  });

  it('matches columns by header name, in any order, ignoring case and extra columns', () => {
    const { rows, errors } = parseTestCsv('Country_Code,note,AMOUNT_CENTS,is_international,Expected_Score\nUS,hi,100,0,0.2\n', columns);
    expect(errors).toEqual([]);
    expect(rows[0]).toEqual({ values: { amount_cents: '100', is_international: false, country_code: 'US' }, expected: '0.2' });
  });

  it('names a missing column and loads nothing', () => {
    const { rows, errors } = parseTestCsv('amount_cents,is_international,expected_score\n1,true,0.5\n', columns);
    expect(rows).toEqual([]);
    expect(errors).toEqual(['Missing column “country_code”.']);
  });

  it('needs the expected score column', () => {
    expect(parseTestCsv('amount_cents,is_international,country_code\n1,true,US\n', columns).errors).toEqual(['Missing column “expected_score”.']);
    // "expected" is accepted as the column name too
    expect(parseTestCsv('amount_cents,is_international,country_code,expected\n1,true,US,0.5\n', columns).errors).toEqual([]);
  });

  it('reports bad values with their line number', () => {
    const { rows, errors } = parseTestCsv('amount_cents,is_international,country_code,expected_score\n10,maybe,US,0.5\n1.5,true,,high\n', columns);
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      'Line 2: “maybe” is not true or false for is_international.',
      'Line 3: “1.5” is not a whole number for amount_cents.',
      'Line 3: country_code is empty.',
      'Line 3: “high” is not a number for expected_score.',
    ]);
  });

  it('rejects whole numbers too large to be exact', () => {
    const big = 'amount_cents,is_international,country_code,expected_score\n9007199254740993,true,US,0.5\n';
    expect(parseTestCsv(big, columns).errors).toEqual(['Line 2: “9007199254740993” is not a whole number for amount_cents.']);
    const edge = 'amount_cents,is_international,country_code,expected_score\n9007199254740991,true,US,0.5\n-9007199254740991,false,US,0.5\n';
    expect(parseTestCsv(edge, columns).errors).toEqual([]);
  });

  it('handles quoted values, a byte order mark, Windows line endings and blank lines', () => {
    const text = '\uFEFFamount_cents,is_international,country_code,expected_score\r\n1000,true,US,0.5\r\n\r\n';
    expect(parseTestCsv(text, columns).rows).toEqual([{ values: { amount_cents: '1000', is_international: true, country_code: 'US' }, expected: '0.5' }]);
    const quoted = parseTestCsv('amount_cents,is_international,country_code,expected_score\n5,true,"U,S",0.5\n', columns);
    expect(quoted.rows[0].values.country_code).toBe('U,S');
  });

  it('enforces the 50 case limit', () => {
    const rows = Array.from({ length: 51 }, () => '1,true,US,0.5').join('\n');
    expect(parseTestCsv('amount_cents,is_international,country_code,expected_score\n' + rows, columns).errors[0]).toContain('limit is 50');
  });

  it('rejects a file without test cases', () => {
    expect(parseTestCsv('amount_cents,is_international,country_code,expected_score\n', columns).errors).toEqual(['The file has a header but no test cases.']);
    expect(parseTestCsv('', columns).errors).toEqual(['The file is empty.']);
  });
});
