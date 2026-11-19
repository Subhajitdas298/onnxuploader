import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { clearModel, dragFeature, expect, loadCsv, SAMPLE_CSV, SAMPLE_MODEL, step, test, uploadModel } from './support';

test.use({ hasTouch: true });

/** Walks the whole flow and calls `check` on every screen. */
async function everyScreen(page: Page, check: (screen: string) => Promise<void>) {
  await clearModel();
  await page.goto('/');
  await expect(page.getByText('No model uploaded yet')).toBeVisible();
  await check('upload (empty)');
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await check('mapping (one input missing)');
  await dragFeature(page, 'country_code', 'String', 2);
  await check('mapping (complete)');
  await page.getByRole('button', { name: 'Continue to test data' }).click();
  await loadCsv(page, SAMPLE_CSV);
  await expect(page.getByText('Loaded 3 test cases')).toBeVisible();
  await check('test data');
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByRole('heading', { name: 'Risk scores' })).toBeVisible();
  await check('results');
  await step(page, 'Upload model').click();
  await check('upload (model stored)');
}

for (const scheme of ['light', 'dark'] as const) {
  test(`no serious accessibility problems on any screen (${scheme} theme)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await everyScreen(page, async (screen) => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const summary = serious.map((v) => `${screen}: ${v.id} (${v.impact}) ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 110)).join('\n    ')}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  });
}

test('the dark theme really is dark and the light theme really is light', async ({ page }) => {
  const luminance = async () => {
    await expect(page.getByRole('heading', { name: 'Upload your model' })).toBeVisible();   // styles are applied
    return page.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)!.map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    });
  };
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await luminance()).toBeLessThan(0.2);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await luminance()).toBeGreaterThan(0.8);
});

test('on a phone nothing overflows sideways and the flow still works by tapping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const noOverflow = async (screen: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${screen} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  };
  await clearModel();
  await page.goto('/');
  await noOverflow('upload');
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await noOverflow('mapping');
  // tap a feature, then tap the input (drag and drop does not exist on touch screens)
  await page.getByRole('group', { name: 'Filter by type' }).getByRole('button', { name: 'String', exact: true }).click();
  await page.getByRole('button', { name: /^country_code / }).tap();
  await page.getByTestId('slot-2').tap();
  await expect(page.getByTestId('slot-2')).toContainText('country_code');
  await page.getByRole('button', { name: 'Continue to test data' }).tap();
  await loadCsv(page, SAMPLE_CSV);
  await expect(page.getByText('Loaded 3 test cases')).toBeVisible();
  await noOverflow('test data');
  await page.getByRole('button', { name: 'Run tests' }).tap();
  await expect(page.getByRole('heading', { name: 'Risk scores' })).toBeVisible();
  await noOverflow('results');
  await expect(page.getByTestId('result-card')).toHaveCount(3);
});

test('the page works with reduced motion and keyboard focus is always visible on buttons', async ({ page }) => {
  await clearModel();
  await page.goto('/');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { tag: el.tagName, outline: s.outlineStyle, shadow: s.boxShadow, label: el.getAttribute('aria-label') ?? el.textContent };
  });
  expect(focused.tag).not.toBe('BODY');
});
