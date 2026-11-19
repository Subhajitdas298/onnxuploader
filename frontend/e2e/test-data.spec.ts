import type { Page } from '@playwright/test';
import {
  autoMappedModelReadyForTests, clearModel, csvOf, expect, fixture, loadCsv, SAMPLE_CSV, sampleReadyForTests, test,
} from './support';

const HEADER = ['amount_cents', 'is_international', 'country_code'];
const amount = (page: Page, row: number) => page.getByLabel(`amount_cents, row ${row}`);
const country = (page: Page, row: number) => page.getByLabel(`country_code, row ${row}`);
const international = (page: Page, row: number) => page.getByRole('switch', { name: `is_international, row ${row}` });
const rowCount = (page: Page) => page.locator('tbody tr').filter({ has: page.getByLabel(/^amount_cents, row/) }).count();
const status = (page: Page) => page.getByRole('status');

test.beforeEach(async ({ page }) => {
  await clearModel();
  await sampleReadyForTests(page);
});

test('the grid has one column per model input, in order, with the right control for each type', async ({ page }) => {
  const headers = await page.locator('thead th').allInnerTexts();
  expect(headers.join(' ')).toMatch(/amount_cents[\s\S]*Integer[\s\S]*input #1[\s\S]*is_international[\s\S]*Boolean[\s\S]*input #2[\s\S]*country_code[\s\S]*String[\s\S]*input #3/);
  await expect(amount(page, 1)).toHaveAttribute('inputmode', 'numeric');
  await expect(international(page, 1)).not.toBeChecked();
  await expect(country(page, 1)).toBeVisible();
  await expect(status(page)).toHaveText('1 test case');
});

test('one blank row exists to start with, and running it shows what is missing', async ({ page }) => {
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(status(page)).toHaveText('2 cells need a value');
  await expect(amount(page, 1)).toHaveAttribute('aria-invalid', 'true');
  await expect(country(page, 1)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('heading', { name: 'Test data' })).toBeVisible();   // did not leave the screen
  await amount(page, 1).fill('1000');
  await country(page, 1).fill('US');
  await expect(amount(page, 1)).not.toHaveAttribute('aria-invalid', 'true');
  await expect(status(page)).toHaveText('1 test case');
});

test('integer cells accept only whole numbers a browser can hold exactly', async ({ page }) => {
  for (const [value, ok] of [['abc', false], ['12.5', false], ['1e3', false], ['', true], ['-5', true], ['0', true], ['9007199254740991', true], ['9007199254740993', false], ['1 000', false]] as const) {
    await amount(page, 1).fill(value);
    if (value === '') continue; // an untouched empty cell is only flagged after a run is attempted
    await expect(amount(page, 1), `value ${value}`).toHaveAttribute('aria-invalid', ok ? 'false' : 'true');
  }
});

test('text cells must not be blank', async ({ page }) => {
  await amount(page, 1).fill('10');
  await country(page, 1).fill('   ');
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(country(page, 1)).toHaveAttribute('aria-invalid', 'true');
  await expect(status(page)).toHaveText('1 cell needs a value');
});

test('boolean cells are switches that read Yes or No', async ({ page }) => {
  const sw = international(page, 1);
  await expect(page.locator('tbody tr').first()).toContainText('No');
  await sw.check();
  await expect(page.locator('tbody tr').first()).toContainText('Yes');
  await sw.uncheck();
  await expect(page.locator('tbody tr').first()).toContainText('No');
});

test('rows can be added and deleted, and at least one is needed to run', async ({ page }) => {
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.getByRole('button', { name: 'Add row' }).click();
  expect(await rowCount(page)).toBe(3);
  await expect(status(page)).toHaveText('3 test cases');
  await amount(page, 2).fill('777');
  await page.getByRole('button', { name: 'Delete row 1' }).click();
  expect(await rowCount(page)).toBe(2);
  await expect(amount(page, 1)).toHaveValue('777');          // row 2 became row 1

  await page.getByRole('button', { name: 'Delete row 1' }).click();
  await page.getByRole('button', { name: 'Delete row 1' }).click();
  await expect(page.getByText('No test cases yet. Add a row or load a CSV file.')).toBeVisible();
  await expect(status(page)).toHaveText('Add at least one test case');
  await expect(page.getByRole('button', { name: 'Run tests' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add row' }).click();
  await expect(page.getByRole('button', { name: 'Run tests' })).toBeEnabled();
});

test.describe('CSV import', () => {
  test('the sample file from the repository loads three test cases', async ({ page }) => {
    await loadCsv(page, SAMPLE_CSV);
    await expect(page.getByText('Loaded 3 test cases from test-data.csv')).toBeVisible();
    expect(await rowCount(page)).toBe(3);
    await expect(amount(page, 2)).toHaveValue('89900');
    await expect(international(page, 2)).toBeChecked();
    await expect(international(page, 1)).not.toBeChecked();
    await expect(country(page, 3)).toHaveValue('GB');
    await expect(status(page)).toHaveText('3 test cases');
  });

  test('loaded rows can still be edited, and a new file replaces them', async ({ page }) => {
    await loadCsv(page, SAMPLE_CSV);
    await amount(page, 1).fill('5');
    await expect(amount(page, 1)).toHaveValue('5');
    await loadCsv(page, csvOf(HEADER, [[7, true, 'DE']]));
    expect(await rowCount(page)).toBe(1);
    await expect(amount(page, 1)).toHaveValue('7');
    await expect(page.getByText('Loaded 1 test case from tests.csv')).toBeVisible();
  });

  test('the same file can be picked again', async ({ page }) => {
    await loadCsv(page, SAMPLE_CSV);
    await page.getByRole('button', { name: 'Delete row 1' }).click();
    expect(await rowCount(page)).toBe(2);
    await loadCsv(page, SAMPLE_CSV);
    await expect.poll(() => rowCount(page)).toBe(3);
  });

  test('column order, case, spaces, extra columns, Windows line endings and a byte order mark are all fine', async ({ page }) => {
    const text = '﻿ Country_Code ,note,AMOUNT_CENTS,Is_International\r\nFR,first,100,YES\r\n\r\nDE,second,200,0\r\n';
    await loadCsv(page, Buffer.from(text, 'utf8'));
    await expect(page.getByText('Loaded 2 test cases from tests.csv')).toBeVisible();
    await expect(country(page, 1)).toHaveValue('FR');
    await expect(amount(page, 2)).toHaveValue('200');
    await expect(international(page, 1)).toBeChecked();
    await expect(international(page, 2)).not.toBeChecked();
  });

  test('a missing column is named and nothing is loaded', async ({ page }) => {
    await amount(page, 1).fill('42');
    await loadCsv(page, csvOf(['amount_cents', 'is_international'], [[1, true]]));
    await expect(page.getByText('Could not load tests.csv')).toBeVisible();
    await expect(page.getByText('Missing column “country_code”.')).toBeVisible();
    await expect(amount(page, 1)).toHaveValue('42');    // the existing row is untouched
  });

  test('bad values are listed with their line numbers', async ({ page }) => {
    await loadCsv(page, csvOf(HEADER, [[10, 'maybe', 'US'], [1.5, true, ''], [3, false, 'US']]));
    for (const line of [
      'Line 2: “maybe” is not true or false for is_international.',
      'Line 3: “1.5” is not a whole number for amount_cents.',
      'Line 3: country_code is empty.',
    ]) await expect(page.getByText(line)).toBeVisible();
    await expect(page.getByText('Loaded')).toHaveCount(0);
  });

  test('more than five errors are summarized', async ({ page }) => {
    await loadCsv(page, csvOf(HEADER, Array.from({ length: 4 }, () => ['x', 'maybe', '']))); // 3 errors per line
    await expect(page.getByText(/and \d+ more/)).toBeVisible();
  });

  test('empty files, header-only files and unrelated files are explained', async ({ page }) => {
    await loadCsv(page, Buffer.from('x'));
    await expect(page.getByText('Missing column “amount_cents”.')).toBeVisible();
    await loadCsv(page, Buffer.from(HEADER.join(',') + '\n'));
    await expect(page.getByText('The file has a header but no test cases.')).toBeVisible();
    await loadCsv(page, Buffer.from(''));
    await expect(page.getByText('The file is empty.')).toBeVisible();
  });

  test('fifty test cases are accepted and fifty-one are not', async ({ page }) => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => [i + 1, i % 2 === 0, 'US']);
    await loadCsv(page, csvOf(HEADER, rows(51)));
    await expect(page.getByText('The file has 51 test cases. The limit is 50.')).toBeVisible();
    await loadCsv(page, csvOf(HEADER, rows(50)));
    await expect(page.getByText('Loaded 50 test cases from tests.csv')).toBeVisible();
    expect(await rowCount(page)).toBe(50);
  });
});

test('a model that only accepts 32-bit integers has its range enforced by the service', async ({ page }) => {
  await clearModel();
  await autoMappedModelReadyForTests(page, fixture('int32_input'));
  await page.getByLabel('txn_count_24h, row 1').fill('3000000000');
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('alert')).toContainText('outside the range this model accepts');
  await expect(page.getByRole('heading', { name: 'Test data' })).toBeVisible();
  await page.getByLabel('txn_count_24h, row 1').fill('2147483647');
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('heading', { name: 'Risk scores' })).toBeVisible();
});

test('a service error while running is shown without losing the test data', async ({ page }) => {
  await amount(page, 1).fill('1000');
  await country(page, 1).fill('US');
  await page.route('**/api/model/test-run', (route) =>
    route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Something went wrong on the server.' }) }),
  );
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('alert')).toContainText('Something went wrong on the server.');
  await expect(amount(page, 1)).toHaveValue('1000');
  await page.unroute('**/api/model/test-run');
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('heading', { name: 'Risk scores' })).toBeVisible();
});

test('running shows a busy state and goes to the results', async ({ page }) => {
  await loadCsv(page, SAMPLE_CSV);
  await page.route('**/api/model/test-run', async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('button', { name: 'Run tests' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Risk scores' })).toBeVisible();
});
