import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearModel, dragFeature, expect, SAMPLE_MODEL, test, uploadModel } from './support';

// Regenerates docs/screenshots from the real app:  E2E_SCREENSHOTS=1 scripts/e2e.sh e2e/screenshots.spec.ts
test.skip(!process.env.E2E_SCREENSHOTS, 'only runs when E2E_SCREENSHOTS is set');
test.use({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });

const out = (name: string) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../../docs/screenshots/${name}.png`);

test('capture every screen', async ({ page }) => {
  await clearModel();
  await page.goto('/');
  await expect(page.getByText('No model uploaded yet')).toBeVisible();
  await page.screenshot({ path: out('1-upload') });

  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await page.getByRole('button', { name: /^Location/ }).click();
  await page.screenshot({ path: out('2-map-features'), fullPage: true });
  await dragFeature(page, 'country_code', 'String', 2);
  await expect(page.getByText('All inputs mapped')).toBeVisible();

  await page.getByRole('button', { name: 'Continue to test data' }).click();
  await page.getByRole('button', { name: 'Load demo CSV' }).click();
  await expect(page.getByText('Loaded 3 test cases')).toBeVisible();
  await page.screenshot({ path: out('3-test-data'), fullPage: true });

  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('heading', { name: 'Risk scores' })).toBeVisible();
  await page.screenshot({ path: out('4-risk-scores'), fullPage: true });

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: out('4-risk-scores-dark'), fullPage: true });
});
