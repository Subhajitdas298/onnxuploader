import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTestCsv } from './csv';
import { DEMO_CSV, DEMO_CSV_NAME } from './demoData';

const sampleColumns = [
  { feature: 'amount_cents', kind: 'INTEGER' as const },
  { feature: 'is_international', kind: 'BOOLEAN' as const },
  { feature: 'country_code', kind: 'STRING' as const },
];

describe('demo CSV', () => {
  it('is the repository sample file, not a copy', () => {
    const file = readFileSync(new URL('../../../../samples/test-data.csv', import.meta.url), 'utf8');
    expect(DEMO_CSV).toBe(file);
    expect(DEMO_CSV_NAME).toBe('demo-test-data.csv');
  });

  it('loads as three test cases with expected scores for the sample model', () => {
    const { rows, errors } = parseTestCsv(DEMO_CSV, sampleColumns);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.expected)).toEqual(['0.05', '0.90', '0.55']);
    expect(rows[1].values).toEqual({ amount_cents: '89900', is_international: true, country_code: 'NG' });
  });
});
