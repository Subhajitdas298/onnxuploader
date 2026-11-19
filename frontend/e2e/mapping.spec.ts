import { clearModel, dragFeature, expect, feature, fixture, sampleReadyForTests, SAMPLE_MODEL, showAll, showFeature, slot, step, test, uploadModel } from './support';

test.beforeEach(async ({ page }) => {
  await clearModel();
  await page.goto('/');
});

const mappedCount = (n: number, total = 3) => `${n} of ${total} mapped`;

test('inputs whose names match a feature are filled in, the rest are required', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await expect(page.getByText(mappedCount(2))).toBeVisible();
  await expect(slot(page, 0)).toContainText('amount_cents');
  await expect(slot(page, 0)).toContainText('Name matches the model input');
  await expect(slot(page, 1)).toContainText('is_international');
  await expect(slot(page, 2)).toContainText('Drop a string feature here');
  await expect(slot(page, 2)).toContainText('No feature name matches “country”');
  await expect(page.getByText('1 input needs a feature')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to test data' })).toBeDisabled();
});

test('type and order of inputs are fixed and shown', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  for (const [i, text] of [['#1', 'tensor(int64)'], ['#2', 'tensor(bool)'], ['#3', 'tensor(string)']]) {
    await expect(page.getByText(i, { exact: true })).toBeVisible();
    await expect(page.getByText(text)).toBeVisible();
  }
  await expect(page.getByText('shape [1, 1]')).toHaveCount(3);
});

test('dragging a feature of the right type onto an input completes the mapping', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await dragFeature(page, 'country_code', 'String', 2);
  await expect(slot(page, 2)).toContainText('country_code');
  await expect(page.getByText('All inputs mapped')).toBeVisible();
  await expect(page.getByText(mappedCount(3))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to test data' })).toBeEnabled();
  await expect(feature(page, 'country_code')).toContainText('→ #3');
});

test('a feature of the wrong type cannot be dropped on an input', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await showFeature(page, 'Integer');
  await feature(page, 'account_age_days').dragTo(slot(page, 2));   // integer onto the string input
  await expect(slot(page, 2)).toContainText('Drop a string feature here');
  await expect(slot(page, 0)).toContainText('amount_cents');       // and the integer input is untouched
  await expect(page.getByText(mappedCount(2))).toBeVisible();
  await feature(page, 'account_age_days').dragTo(slot(page, 1));   // integer onto the boolean input
  await expect(slot(page, 1)).toContainText('is_international');
});

test('tap or keyboard placement works, and a mismatch is explained', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await showFeature(page, 'String');
  const currency = feature(page, 'currency');
  await currency.click();                                   // arm
  await expect(currency).toHaveAttribute('aria-pressed', 'true');
  await slot(page, 0).click();                              // integer input: refused with a toast
  await expect(page.getByText('“currency” is a string feature. Input “amount_cents” needs an integer one.')).toBeVisible();
  await expect(slot(page, 0)).toContainText('amount_cents');
  await slot(page, 2).click();                              // string input: accepted
  await expect(slot(page, 2)).toContainText('currency');
  await expect(currency).toHaveAttribute('aria-pressed', 'false');

  // keyboard: arm country_code with Enter, place it on input 3 with Enter (replaces currency)
  await feature(page, 'country_code').focus();
  await page.keyboard.press('Enter');
  await slot(page, 2).focus();
  await page.keyboard.press('Enter');
  await expect(slot(page, 2)).toContainText('country_code');
  await expect(feature(page, 'currency')).not.toContainText('→');
});

test('a feature moves instead of being used twice, and replaced features become free again', async ({ page }) => {
  await uploadModel(page, fixture('all_features'), { expect: 'Valid ONNX model' });
  await expect(page.getByText(mappedCount(10, 10))).toBeVisible();
  // string inputs are channel (#1), currency (#2), country_code (#3)
  await dragFeature(page, 'country_code', 'String', 0);   // country_code onto the channel input
  await expect(slot(page, 0)).toContainText('country_code');
  await expect(slot(page, 2)).toContainText('Drop a string feature here');   // it left input 3
  await expect(slot(page, 2)).toContainText('Required');
  await expect(page.getByText(mappedCount(9, 10))).toBeVisible();
  await showFeature(page, 'String');
  await expect(feature(page, 'channel')).not.toContainText('→');             // the replaced one is free
  await expect(feature(page, 'country_code')).toContainText('→ #1');
  await showAll(page);
});

test('a mapped feature can be removed and the mapping reset to the automatic one', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await dragFeature(page, 'country_code', 'String', 2);
  await page.getByRole('button', { name: 'Remove amount_cents from input 1' }).click();
  await expect(slot(page, 0)).toContainText('Drop an integer feature here');
  await expect(page.getByText(mappedCount(2))).toBeVisible();
  await page.getByRole('button', { name: 'Reset to auto-match' }).click();
  await expect(slot(page, 0)).toContainText('amount_cents');
  await expect(slot(page, 2)).toContainText('Drop a string feature here');
});

test('the type filter and the categories organize the 10 features', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await expect(page.getByText('10 supported')).toBeVisible();
  // by default the first two categories are open and the others collapsed
  await expect(feature(page, 'amount_cents')).toBeVisible();
  await expect(feature(page, 'country_code')).toBeHidden();
  await page.getByRole('button', { name: /^Location/ }).click();
  await expect(feature(page, 'country_code')).toBeVisible();
  await expect(feature(page, 'is_international')).toBeVisible();

  await showFeature(page, 'Integer');
  for (const name of ['amount_cents', 'merchant_category_code', 'account_age_days', 'txn_count_24h']) await expect(feature(page, name)).toBeVisible();
  await expect(feature(page, 'channel')).toBeHidden();
  await expect(feature(page, 'is_new_device')).toBeHidden();
  await showFeature(page, 'Boolean');
  for (const name of ['is_international', 'is_new_device', 'is_card_present']) await expect(feature(page, name)).toBeVisible();
  await showFeature(page, 'String');
  for (const name of ['country_code', 'currency', 'channel']) await expect(feature(page, name)).toBeVisible();
  await showAll(page);
  await expect(page.getByRole('button', { name: /^(is_international|amount_cents|account_age_days|country_code|channel|currency) / })).not.toHaveCount(0);
});

test('every feature card shows its description and its type', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await showFeature(page, 'String');
  const card = feature(page, 'currency');
  await expect(card).toContainText('ISO 4217 currency code, for example EUR');
  await expect(card).toContainText('String');
});

test('an input the system cannot feed is marked and blocks the next step', async ({ page }) => {
  await uploadModel(page, fixture('float_input'), { expect: 'Valid ONNX model' });
  await expect(page.getByText('Not supported', { exact: true })).toBeVisible();
  await expect(page.getByText(/tensor\(float\) is not supported/)).toBeVisible();
  await expect(page.getByText('No feature can feed this input')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to test data' })).toBeDisabled();
  await dragFeature(page, 'is_international', 'Boolean', 1);   // map the bool input; the float one still blocks
  await expect(page.getByRole('button', { name: 'Continue to test data' })).toBeDisabled();
});

test('an input holding several values is refused', async ({ page }) => {
  await uploadModel(page, fixture('vector_input'), { expect: 'Valid ONNX model' });
  await expect(page.getByText(/must hold a single value/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to test data' })).toBeDisabled();
});

test('a model without a usable score output is explained', async ({ page }) => {
  await uploadModel(page, fixture('int_output'), { expect: 'Valid ONNX model' });
  await expect(page.getByText('The model needs one float output holding a single risk score.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to test data' })).toBeDisabled();
});

test('a model that is not valid ONNX shows the reason and a way back', async ({ page }) => {
  await uploadModel(page, { name: 'bad.onnx', buffer: Buffer.from('nope') }, { expect: /not a valid ONNX model/ });
  await page.getByRole('button', { name: 'Upload a different file' }).click();
  await expect(page.getByRole('heading', { name: 'Upload your model' })).toBeVisible();
});

test('the model summary shows the facts read from the file', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  for (const text of ['fraud_risk_demo', '9 · 17', 'fraud-runner-samples 1.0', 'risk_score · float · [1, 1]']) await expect(page.getByText(text)).toBeVisible();
});

test('steps unlock one at a time', async ({ page }) => {
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await expect(step(page, 'Test data')).toBeDisabled();
  await expect(step(page, 'Results')).toBeDisabled();
  await dragFeature(page, 'country_code', 'String', 2);
  await expect(step(page, 'Test data')).toBeEnabled();
  await expect(step(page, 'Results')).toBeDisabled();
});

test('changing the mapping locks the later steps again', async ({ page }) => {
  await sampleReadyForTests(page);
  await step(page, 'Map features').click();
  await page.getByRole('button', { name: 'Remove country_code from input 3' }).click();
  await expect(step(page, 'Test data')).toBeDisabled();
});

test('uploading a new model starts a fresh mapping', async ({ page }) => {
  await sampleReadyForTests(page);
  await step(page, 'Upload model').click();
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await expect(slot(page, 2)).toContainText('Drop a string feature here');
  await expect(step(page, 'Test data')).toBeDisabled();
});

test('going back and forth between steps keeps the mapping', async ({ page }) => {
  await sampleReadyForTests(page);
  await step(page, 'Upload model').click();
  await step(page, 'Map features').click();
  await expect(slot(page, 2)).toContainText('country_code');
  await expect(page.getByText('All inputs mapped')).toBeVisible();
});
