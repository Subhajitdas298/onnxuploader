import { describe, expect, it } from 'vitest';
import type { AnalysisInput, Feature } from '../../types';
import { autoMatch, incompatibility } from './logic';
import reducer, { assign, init, unassign } from './mappingSlice';

const features: Feature[] = [
  { name: 'amount_cents', kind: 'INTEGER', category: 'Transaction', description: '', baseline: 1 },
  { name: 'is_international', kind: 'BOOLEAN', category: 'Location', description: '', baseline: false },
  { name: 'country_code', kind: 'STRING', category: 'Location', description: '', baseline: 'US' },
  { name: 'currency', kind: 'STRING', category: 'Transaction', description: '', baseline: 'USD' },
];
const input = (index: number, name: string, kind: AnalysisInput['kind']): AnalysisInput => ({
  index, name, kind, tensorType: 'x', shape: [1, 1], supported: kind !== null, problem: null,
});
const inputs = [input(0, 'Amount-Cents', 'INTEGER'), input(1, 'is_international', 'BOOLEAN'), input(2, 'country', 'STRING')];

describe('autoMatch', () => {
  it('matches same-type features by normalized name and leaves the rest empty', () => {
    expect(autoMatch(inputs, features)).toEqual(['amount_cents', 'is_international', null]);
  });

  it('does not match a feature of another type', () => {
    expect(autoMatch([input(0, 'is_international', 'STRING')], features)).toEqual([null]);
  });
});

describe('incompatibility', () => {
  it('explains a type mismatch and allows a match', () => {
    expect(incompatibility(inputs[2], features[0])).toContain('needs a string');
    expect(incompatibility(inputs[2], features[2])).toBeNull();
  });
});

describe('mapping slice', () => {
  it('starts from the auto-match once per model version', () => {
    let s = reducer(undefined, init({ version: 'v1', inputs, features }));
    s = reducer(s, assign({ index: 2, feature: 'country_code' }));
    s = reducer(s, init({ version: 'v1', inputs, features }));
    expect(s.assignment).toEqual(['amount_cents', 'is_international', 'country_code']);
    s = reducer(s, init({ version: 'v2', inputs, features }));
    expect(s.assignment).toEqual(['amount_cents', 'is_international', null]);
  });

  it('moves a feature instead of using it twice, and can clear an input', () => {
    let s = reducer(undefined, init({ version: 'v1', inputs, features }));
    s = reducer(s, assign({ index: 2, feature: 'country_code' }));
    s = reducer(s, assign({ index: 0, feature: 'country_code' }));
    expect(s.assignment).toEqual(['country_code', 'is_international', null]);
    s = reducer(s, unassign(1));
    expect(s.assignment).toEqual(['country_code', null, null]);
  });
});
