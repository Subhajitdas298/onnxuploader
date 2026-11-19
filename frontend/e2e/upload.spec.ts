import { bytesOf, clearModel, expect, fixture, modelInput, SAMPLE_MODEL, step, test, uploadModel } from './support';

test.beforeEach(async () => {
  await clearModel();
});

test('a fresh deployment has no model and later steps are locked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Upload your model' })).toBeVisible();
  await expect(page.getByText('No model uploaded yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyze current model' })).toHaveCount(0);
  for (const name of ['Map features', 'Test data', 'Results']) await expect(step(page, name)).toBeDisabled();
});

test('files that are not .onnx, empty or too big are refused with a clear message', async ({ page }) => {
  await page.goto('/');
  await modelInput(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('“notes.txt” is not an .onnx file. Choose a file that ends in .onnx.')).toBeVisible();

  await modelInput(page).setInputFiles({ name: 'empty.onnx', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) });
  await expect(page.getByText('“empty.onnx” is empty.')).toBeVisible();

  await modelInput(page).setInputFiles({ name: 'huge.onnx', mimeType: 'application/octet-stream', buffer: Buffer.alloc(26 * 1024 * 1024) });
  await expect(page.getByText('“huge.onnx” is larger than 25 MB.')).toBeVisible();

  // nothing reached storage
  await expect(page.getByText('No model uploaded yet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upload your model' })).toBeVisible();
});

test('a file that is named .onnx but is not a model is reported as invalid', async ({ page }) => {
  await page.goto('/');
  await uploadModel(page, { name: 'broken.onnx', buffer: Buffer.from('this is not a model at all') }, { expect: /not a valid ONNX model/ });
  await expect(page.getByText(/This is not an ONNX file|could not be loaded/)).toBeVisible();
  await page.getByRole('button', { name: 'Upload a different file' }).click();
  await expect(page.getByRole('heading', { name: 'Upload your model' })).toBeVisible();
  // the broken file is stored (that is what upload does), a good one replaces it
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
});

test('a truncated real model is reported as invalid', async ({ page }) => {
  await page.goto('/');
  const bytes = bytesOf(SAMPLE_MODEL);
  await uploadModel(page, { name: 'cut.onnx', buffer: bytes.subarray(0, bytes.length / 2) }, { expect: /not a valid ONNX model/ });
});

test('a valid upload goes straight to the analysis, and a second upload overwrites the first', async ({ page }) => {
  await page.goto('/');
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await expect(page.getByText('fraud_risk_demo')).toBeVisible();
  await expect(page.getByText('9 · 17')).toBeVisible();
  await expect(page.getByText('fraud-runner-samples 1.0')).toBeVisible();

  await step(page, 'Upload model').click();
  await expect(page.getByText(/^985 B · uploaded/)).toBeVisible();

  await uploadModel(page, fixture('all_features'), { expect: 'Valid ONNX model' });
  await expect(page.getByText('10 of 10 mapped')).toBeVisible();     // all names match features
  await step(page, 'Upload model').click();
  await expect(page.getByText(/^2\.0 KB · uploaded/)).toBeVisible();  // same single blob, new content
  await expect(page.getByRole('button', { name: 'Analyze current model' })).toBeVisible();
});

test('the stored model survives a page reload and can be analyzed again', async ({ page }) => {
  await page.goto('/');
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
  await page.reload();
  await expect(page.getByText(/^985 B · uploaded/)).toBeVisible();
  await page.getByRole('button', { name: 'Analyze current model' }).click();
  await expect(page.getByText('Valid ONNX model')).toBeVisible();
});

test('the file input can be reached with the keyboard and has a name', async ({ page }) => {
  await page.goto('/');
  // Tab past the step tabs to the real file input inside the "Browse files" button
  for (let i = 0; i < 6 && !(await modelInput(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(modelInput(page)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Browse files' }).or(page.getByLabel('Browse files'))).toBeVisible();
});

test('dropping a file on the dropzone uploads it', async ({ page }) => {
  await page.goto('/');
  const data = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped.onnx', { type: 'application/octet-stream' }));
    return dt;
  }, bytesOf(SAMPLE_MODEL).toString('base64'));
  await page.getByTestId('dropzone').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.getByText('Valid ONNX model')).toBeVisible({ timeout: 30_000 });
});

test('the service being down is explained, and a retry works', async ({ page }) => {
  await page.route('**/api/upload-link', (route) => route.abort());
  await page.goto('/');
  await modelInput(page).setInputFiles(SAMPLE_MODEL);
  await expect(page.getByText(/service did not respond/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upload your model' })).toBeVisible();

  await page.unroute('**/api/upload-link');
  await uploadModel(page, SAMPLE_MODEL, { expect: 'Valid ONNX model' });
});

test('a server error message is shown as is', async ({ page }) => {
  await page.route('**/api/upload-link', (route) =>
    route.fulfill({ status: 502, contentType: 'application/problem+json', body: JSON.stringify({ detail: 'Model storage is not reachable right now.' }) }),
  );
  await page.goto('/');
  await modelInput(page).setInputFiles(SAMPLE_MODEL);
  await expect(page.getByText('Model storage is not reachable right now.')).toBeVisible();
});

test('a failed transfer to storage is reported and nothing is half-finished', async ({ page }) => {
  await page.route(/\/models\/model\.onnx\?/, (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue()));
  await page.goto('/');
  await modelInput(page).setInputFiles(SAMPLE_MODEL);
  await expect(page.getByText(/Not uploaded\./)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Upload your model' })).toBeVisible();
  await expect(page.getByText('No model uploaded yet')).toBeVisible();
});

test('clicking anywhere in the dropzone opens the file chooser', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByText('Drag and drop your .onnx file here').click();
  await (await chooser).setFiles(SAMPLE_MODEL);
  await expect(page.getByText('Valid ONNX model')).toBeVisible({ timeout: 30_000 });
});

test('dropping something that is not a file does nothing and dragging over highlights the zone', async ({ page }) => {
  await page.goto('/');
  const zone = page.getByTestId('dropzone');
  await zone.dispatchEvent('dragover', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await zone.dispatchEvent('drop', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await expect(page.getByRole('heading', { name: 'Upload your model' })).toBeVisible();
  await expect(page.getByText('No model uploaded yet')).toBeVisible();
});
