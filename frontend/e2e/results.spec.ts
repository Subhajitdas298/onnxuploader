import type { Page } from '@playwright/test';
import {
  autoMappedModelReadyForTests, fillRow, clearModel, csvOf, expect, fixture, loadCsv, readResults, SAMPLE_CSV, sampleReadyForTests,
  sampleScore, step, test, uploadModel, SAMPLE_MODEL,
} from './support';

const run = async (page: Page) => {
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('heading', { name: 'Risk scores' })).toBeVisible();
};

test.beforeEach(async () => {
  await clearModel();
});

test('the sample files give the documented scores, and every score matches the reference formula', async ({ page }) => {
  await sampleReadyForTests(page);
  await loadCsv(page, SAMPLE_CSV);
  await run(page);
  const results = await readResults(page);
  expect(results).toHaveLength(3);
  const expected = [sampleScore(1250, false, 'US'), sampleScore(89900, true, 'NG'), sampleScore(45000, true, 'GB')];
  results.forEach((r, i) => expect(r.score).toBeCloseTo(expected[i], 4));
  expect(results.map((r) => r.score.toFixed(2))).toEqual(['0.05', '0.90', '0.55']);
  expect(results.map((r) => r.passed)).toEqual([true, true, true]);
  expect(results.map((r) => r.expected)).toEqual([0.05, 0.9, 0.55]);
  await expect(page.getByRole('img', { name: /Risk score/ })).toHaveCount(0);
  await expect(page.getByLabel('Risk score 0.90')).toBeVisible();
  await expect(page.getByText('All 3 tests passed')).toBeVisible();
});

test.describe('expected scores and tolerance', () => {
  test.beforeEach(async ({ page }) => {
    await sampleReadyForTests(page);
    await loadCsv(page, SAMPLE_CSV);
  });

  const delta = (page: Page, card: number) => page.getByTestId('result-card').nth(card).getByTestId('delta');

  test('when every score is within the tolerance the run passes', async ({ page }) => {
    await run(page);
    await expect(page.getByText('All 3 tests passed')).toBeVisible();
    await expect(page.getByText('Every score is within ±0.05 of the expected score.')).toBeVisible();
    for (let i = 0; i < 3; i++) await expect(page.getByTestId('result-card').nth(i)).toContainText('Pass');
    await expect(page.getByTestId('result-card').nth(1)).toContainText('Expected');
    await expect(page.getByTestId('result-card').nth(1)).toContainText('0.90 ± 0.05');
    await expect(delta(page, 1)).toHaveText('0.00');
  });

  test('a score outside the tolerance fails, with how far off it is, and still explains itself', async ({ page }) => {
    await page.getByLabel('Expected risk score, row 3').fill('0.35');   // the model gives 0.55
    await run(page);
    await expect(page.getByText('1 of 3 tests failed')).toBeVisible();
    await expect(page.getByText('The score was more than ±0.05 from the expected score.')).toBeVisible();
    const results = await readResults(page);
    expect(results.map((r) => r.passed)).toEqual([true, true, false]);
    expect(results[2].delta).toBeCloseTo(results[2].score - 0.35, 6);
    const card = page.getByTestId('result-card').nth(2);
    await expect(card).toContainText('Fail');
    await expect(card).toContainText('0.35 ± 0.05');
    await expect(delta(page, 2)).toHaveText('+0.20');
    await expect(card).toContainText('What drove this score');      // the factors are still there for a failing test
    expect(results[2].contributions).toHaveLength(3);
    await expect(page.getByTestId('result-card').nth(0)).toContainText('Pass');
  });

  test('a score that is too low is reported with a minus sign', async ({ page }) => {
    await page.getByLabel('Expected risk score, row 1').fill('0.30');   // the model gives 0.05
    await run(page);
    await expect(page.getByText('1 of 3 tests failed')).toBeVisible();
    await expect(delta(page, 0)).toHaveText('−0.25');
  });

  test('changing the tolerance changes which tests pass', async ({ page }) => {
    await page.getByLabel('Expected risk score, row 3').fill('0.35');
    await page.getByLabel('Tolerance').fill('0.3');
    await run(page);
    await expect(page.getByText('All 3 tests passed')).toBeVisible();
    await expect(page.getByText('Every score is within ±0.3 of the expected score.')).toBeVisible();

    await page.getByRole('button', { name: 'Edit test data' }).click();
    await expect(page.getByLabel('Tolerance')).toHaveValue('0.3');
    await page.getByLabel('Tolerance').fill('0');                    // only an exact match passes
    await run(page);
    await expect(page.getByText('3 of 3 tests failed')).toBeVisible();
    expect((await readResults(page)).every((r) => !r.passed)).toBe(true);
  });

  test('a single test says so', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete row 3' }).click();
    await page.getByRole('button', { name: 'Delete row 2' }).click();
    await run(page);
    await expect(page.getByText('The test passed')).toBeVisible();
  });

  test('typed expected scores work for a freshly typed case', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete row 3' }).click();
    await page.getByRole('button', { name: 'Delete row 2' }).click();
    await fillRow(page, 1, { amount: 45000, international: true, country: 'GB', expected: 0.55 });
    await run(page);
    expect((await readResults(page))[0]).toMatchObject({ passed: true, expected: 0.55 });
  });
});

test('contributions are sorted by impact and add up to the score', async ({ page }) => {
  await sampleReadyForTests(page);
  await loadCsv(page, SAMPLE_CSV);
  await run(page);
  for (const r of await readResults(page)) {
    expect(r.contributions).toHaveLength(3);
    const sizes = r.contributions.map((c) => Math.abs(c.value));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    const sum = r.contributions.reduce((s, c) => s + c.value, 0);
    expect(r.baseline + sum).toBeCloseTo(r.score, 4);
  }
  const third = (await readResults(page))[2];
  expect(third.contributions.map((c) => c.feature)).toEqual(['is_international', 'amount_cents', 'country_code']);
  expect(third.contributions[2].value).toBeCloseTo(0, 5);   // GB is not a high risk country
  const second = (await readResults(page))[1];
  expect(second.contributions.every((c) => c.value > 0)).toBe(true);
  const first = (await readResults(page))[0];
  expect(first.contributions.find((c) => c.feature === 'amount_cents')!.value).toBeLessThan(0);   // a small amount lowers risk
});

test('each card shows the test inputs, the sorted factors and the reconciliation line', async ({ page }) => {
  await sampleReadyForTests(page);
  await loadCsv(page, SAMPLE_CSV);
  await run(page);
  const card = page.getByTestId('result-card').nth(1);
  await expect(card).toContainText('Test 2');
  await expect(card).toContainText('89900');
  await expect(card).toContainText('NG');
  await expect(card).toContainText('What drove this score');
  await expect(card).toContainText('Raises risk');
  await expect(card).toContainText(/Typical transaction 0\.05 \+0\.30 \+0\.30 \+0\.24 = 0\.90/);
  await expect(page.getByTestId('contribution')).toHaveCount(9);
});

test('all ten features: exact contributions from a model that adds its inputs up', async ({ page }) => {
  await autoMappedModelReadyForTests(page, fixture('all_features'));
  await expect(page.getByRole('columnheader')).toHaveCount(13);   // #, ten features, expected score, delete
  const header = ['channel', 'currency', 'country_code', 'txn_count_24h', 'merchant_category_code', 'account_age_days', 'amount_cents', 'is_card_present', 'is_new_device', 'is_international'];
  await loadCsv(page, csvOf(['expected_score', ...[...header].reverse()], [[1, 'true', 'true', 'false', 100000, 10, 6011, 5, 'NG', 'BTC', 'ATM']]));
  await expect(page.getByText('Loaded 1 test case')).toBeVisible();
  await run(page);
  const [r] = await readResults(page);
  const byName = Object.fromEntries(r.contributions.map((c) => [c.feature, c.value]));
  const want: Record<string, number> = { channel: 0.1, currency: 0.3, country_code: 0.25, txn_count_24h: 0.04, merchant_category_code: 0.006, account_age_days: -0.0355, amount_cents: 0.975, is_card_present: 0.05, is_new_device: 0.1, is_international: 0.2 };
  for (const [name, value] of Object.entries(want)) expect(byName[name], name).toBeCloseTo(value, 3);
  expect(r.contributions[0].feature).toBe('amount_cents');
  expect(r.contributions.at(-1)!.feature).toBe('merchant_category_code');
  expect(r.baseline + r.contributions.reduce((s, c) => s + c.value, 0)).toBeCloseTo(r.score, 3);
  await expect(page.getByTestId('contribution')).toHaveCount(10);
});

test('fifty test cases run together', async ({ page }) => {
  await sampleReadyForTests(page);
  await loadCsv(page, csvOf(['amount_cents', 'is_international', 'country_code', 'expected_score'], Array.from({ length: 50 }, (_, i) => [1000 * (i + 1), i % 2 === 0, i % 3 === 0 ? 'NG' : 'US', sampleScore(1000 * (i + 1), i % 2 === 0, i % 3 === 0 ? 'NG' : 'US').toFixed(2)])));
  await run(page);
  const results = await readResults(page);
  expect(results).toHaveLength(50);
  expect(results.every((r) => r.passed)).toBe(true);   // expected scores are the real ones rounded to 2 decimals
  results.forEach((r, i) => expect(r.score).toBeCloseTo(sampleScore(1000 * (i + 1), i % 2 === 0, i % 3 === 0 ? 'NG' : 'US'), 4));
});

test('unusual but valid values work: zero, negative, very large amounts and non-ASCII text', async ({ page }) => {
  await sampleReadyForTests(page);
  await loadCsv(page, csvOf(['amount_cents', 'is_international', 'country_code', 'expected_score'], [[0, false, 'US', 0.04], [-100, true, 'ZZ', 0.3], [9007199254740991, true, 'NG', 1], [5, false, '日本', 0.04]]));
  await run(page);
  const results = await readResults(page);
  expect(results).toHaveLength(4);
  for (const r of results) expect(r.score).toBeGreaterThanOrEqual(0), expect(r.score).toBeLessThanOrEqual(1);
  expect(results[2].score).toBeGreaterThan(0.99);
});

test('editing the data and running again changes the scores, and the data is kept', async ({ page }) => {
  await sampleReadyForTests(page);
  await loadCsv(page, SAMPLE_CSV);
  await run(page);
  const before = (await readResults(page))[2].score;
  await page.getByRole('button', { name: 'Edit test data' }).click();
  await expect(page.getByLabel('amount_cents, row 3')).toHaveValue('45000');
  await page.getByLabel('amount_cents, row 3').fill('4500000');
  await run(page);
  const after = (await readResults(page))[2].score;
  expect(after).toBeGreaterThan(before);
  expect(after).toBeCloseTo(sampleScore(4500000, true, 'GB'), 4);
  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(page.getByRole('heading', { name: 'Test data' })).toBeVisible();
  await expect(page.getByLabel('amount_cents, row 3')).toHaveValue('4500000');
});

test('results are discarded when the mapping changes and when a new model is uploaded', async ({ page }) => {
  await sampleReadyForTests(page);
  await loadCsv(page, SAMPLE_CSV);
  await run(page);
  await expect(step(page, 'Results')).toBeEnabled();

  await step(page, 'Map features').click();
  await page.getByRole('button', { name: 'Remove country_code from input 3' }).click();
  await expect(step(page, 'Results')).toBeDisabled();

  await step(page, 'Upload model').click();
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await expect(step(page, 'Results')).toBeDisabled();
});

test('the results page says what to do when there is nothing to show', async ({ page }) => {
  await sampleReadyForTests(page);
  await expect(step(page, 'Results')).toBeDisabled();
});
