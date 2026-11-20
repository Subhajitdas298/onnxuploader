import { BlobServiceClient } from '@azure/storage-blob';
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SAMPLE_MODEL = path.join(ROOT, 'samples/fraud-risk-demo.onnx');
export const SAMPLE_CSV = path.join(ROOT, 'samples/test-data.csv');
export const fixture = (name: string) => path.join(ROOT, `backend/src/test/resources/fixtures/${name}.onnx`);
export const bytesOf = (file: string) => readFileSync(file);

const AZURITE =
  process.env.AZURITE_CONNECTION_STRING ??
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;';

/** Starts a test with no model in storage, as on a fresh deployment. */
export async function clearModel() {
  const container = BlobServiceClient.fromConnectionString(AZURITE).getContainerClient('models');
  await container.createIfNotExists();
  await container.getBlobClient('model.onnx').deleteIfExists();
}

export const modelInput = (page: Page) => page.locator('input[type=file][accept=".onnx"]');
export const csvInput = (page: Page) => page.locator('input[type=file][accept=".csv,text/csv"]');
export const step = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

type Upload = string | { name: string; buffer: Buffer };

/** Drops a model file on the upload screen and waits for the analysis screen. */
export async function uploadModel(page: Page, file: Upload, opts: { expect?: string } = {}) {
  await modelInput(page).setInputFiles(typeof file === 'string' ? file : { name: file.name, mimeType: 'application/octet-stream', buffer: file.buffer });
  await expect(page.getByRole('heading', { name: 'Map model inputs to features' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(opts.expect ?? /Valid ONNX model|not a valid ONNX model|Failed|cannot/)).toBeVisible({ timeout: 30_000 });
}

export const feature = (page: Page, name: string): Locator => page.getByRole('button', { name: new RegExp(`^${name} `) });
export const slot = (page: Page, index: number): Locator => page.getByTestId(`slot-${index}`);

/** Opens the category holding a feature (they are collapsed to save space) by choosing its type filter. */
export async function showFeature(page: Page, kind: 'Boolean' | 'Integer' | 'String') {
  await page.getByRole('group', { name: 'Filter by type' }).getByRole('button', { name: kind, exact: true }).click();
}
export async function showAll(page: Page) {
  await page.getByRole('group', { name: 'Filter by type' }).getByRole('button', { name: 'All', exact: true }).click();
}

export async function dragFeature(page: Page, name: string, kind: 'Boolean' | 'Integer' | 'String', slotIndex: number) {
  await showFeature(page, kind);
  await feature(page, name).dragTo(slot(page, slotIndex));
  await showAll(page);
}

/** Uploads the sample model and maps its third input by dragging country_code onto it. */
export async function sampleReadyForTests(page: Page) {
  await page.goto('/');
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await dragFeature(page, 'country_code', 'String', 2);
  await expect(page.getByText('All inputs mapped')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to test data' }).click();
  await expect(page.getByRole('heading', { name: 'Test data' })).toBeVisible();
}

/** Uploads a model whose input names are all feature names, so everything is mapped automatically. */
export async function autoMappedModelReadyForTests(page: Page, file: string) {
  await page.goto('/');
  await uploadModel(page, file, { expect: 'Valid ONNX model' });
  await expect(page.getByText('All inputs mapped')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to test data' }).click();
  await expect(page.getByRole('heading', { name: 'Test data' })).toBeVisible();
}

export const csvOf = (header: string[], rows: (string | number | boolean)[][]) =>
  Buffer.from([header.join(','), ...rows.map((r) => r.join(','))].join('\n'));

/** Types one test case into a grid row (rows are numbered from 1). */
export async function fillRow(page: Page, row: number, v: { amount: number | string; international?: boolean; country: string; expected: number | string }) {
  await page.getByLabel(`amount_cents, row ${row}`).fill(String(v.amount));
  const sw = page.getByRole('switch', { name: `is_international, row ${row}` });
  if (v.international) await sw.check();
  else await sw.uncheck();
  await page.getByLabel(`country_code, row ${row}`).fill(v.country);
  await page.getByLabel(`Expected risk score, row ${row}`).fill(String(v.expected));
}

export async function loadCsv(page: Page, csv: Buffer | string, name = 'tests.csv') {
  await csvInput(page).setInputFiles(typeof csv === 'string' ? csv : { name, mimeType: 'text/csv', buffer: csv });
}

/** Reference implementation of the sample model, to compare the service's scores with. */
export function sampleScore(cents: number, international: boolean, country: string) {
  const z = -3.2 + 0.7 * Math.log(1 + cents / 100 / 50) + (international ? 1.8 : 0) + (['NG', 'RU', 'KP', 'IR'].includes(country) ? 1.5 : 0);
  return 1 / (1 + Math.exp(-z));
}

export async function readResults(page: Page) {
  const cards = page.getByTestId('result-card');
  const count = await cards.count();
  const out: { score: number; baseline: number; expected: number; delta: number; passed: boolean; contributions: { feature: string; value: number }[] }[] = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const contributions = await card.getByTestId('contribution').evaluateAll((els) =>
      els.map((e) => ({ feature: e.getAttribute('data-feature')!, value: Number(e.getAttribute('data-value')) })),
    );
    out.push({
      score: Number(await card.getAttribute('data-score')),
      baseline: Number(await card.getAttribute('data-baseline')),
      expected: Number(await card.getAttribute('data-expected')),
      delta: Number(await card.getAttribute('data-delta')),
      passed: (await card.getAttribute('data-passed')) === 'true',
      contributions,
    });
  }
  return out;
}

/** `test` with browser diagnostics: failed requests and console errors are printed when a test fails. */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const log: string[] = [];
    page.on('console', (m) => m.type() === 'error' && log.push(`console: ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => log.push(`request failed: ${r.method()} ${r.url().slice(0, 100)} ${r.failure()?.errorText}`));
    page.on('response', (r) => r.status() >= 400 && log.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 100)}`));
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && log.length) console.log(`\n[${testInfo.title}] browser log:\n  ${log.join('\n  ')}`);
  },
});
export { expect };
