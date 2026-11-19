import type { Page } from '@playwright/test';
import {
  autoMappedModelReadyForTests, clearModel, csvOf, expect, fixture, loadCsv, readResults, SAMPLE_CSV, sampleReadyForTests,
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
  await expect(page.getByRole('img', { name: /Risk score/ })).toHaveCount(0);
  await expect(page.getByLabel('Risk score 0.90')).toBeVisible();
  await expect(page.getByText('3 test cases scored')).toBeVisible();
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
  await expect(page.getByRole('columnheader')).toHaveCount(12);   // #, ten features, delete
  const header = ['channel', 'currency', 'country_code', 'txn_count_24h', 'merchant_category_code', 'account_age_days', 'amount_cents', 'is_card_present', 'is_new_device', 'is_international'];
  await loadCsv(page, csvOf([...header].reverse(), [['true', 'true', 'false', 100000, 10, 6011, 5, 'NG', 'BTC', 'ATM']]));
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
  await loadCsv(page, csvOf(['amount_cents', 'is_international', 'country_code'], Array.from({ length: 50 }, (_, i) => [1000 * (i + 1), i % 2 === 0, i % 3 === 0 ? 'NG' : 'US'])));
  await run(page);
  const results = await readResults(page);
  expect(results).toHaveLength(50);
  results.forEach((r, i) => expect(r.score).toBeCloseTo(sampleScore(1000 * (i + 1), i % 2 === 0, i % 3 === 0 ? 'NG' : 'US'), 4));
});

test('unusual but valid values work: zero, negative, very large amounts and non-ASCII text', async ({ page }) => {
  await sampleReadyForTests(page);
  await loadCsv(page, csvOf(['amount_cents', 'is_international', 'country_code'], [[0, false, 'US'], [-100, true, 'ZZ'], [9007199254740991, true, 'NG'], [5, false, '日本']]));
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
