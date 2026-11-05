import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// File to upload. Resolved from the folder you run `npx playwright test` in
// (the inner PlaywrightProject folder), so it works on any machine.
// Override with: set WFH_FILE=C:\full\path\to\file.xlsx
const FILE_PATH = process.env.WFH_FILE || path.resolve('downloads', 'WFH.xlsx');

test('Upload Work From Home Leaves - from downloads folder', async ({ page }) => {
  test.setTimeout(120000);

  // Fail immediately with a clear message if the file is missing.
  if (!fs.existsSync(FILE_PATH)) {
    const dir = path.dirname(FILE_PATH);
    const found = fs.existsSync(dir) ? fs.readdirSync(dir).join(', ') || '(empty)' : '(folder does not exist)';
    throw new Error(`Upload file not found: ${FILE_PATH}\nFiles in ${dir}: ${found}`);
  }

  // ==========================
  // LOGIN
  // ==========================
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');

  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.ETAM_PASSWORD || '$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForTimeout(5000);
  console.log('Login Successful');

  // ==========================
  // NAVIGATE TO ELMS > eLMS Uploads > Upload Work From Home Leaves
  // ==========================
  await page.getByText('ELMS').click();
  await page.getByRole('combobox').selectOption('eLMS Uploads');
  await page
    .locator('app-elms-uploads')
    .getByRole('combobox')
    .selectOption('Upload Work From Home Leaves');
  await page.waitForTimeout(3000);
  console.log('Upload Work From Home Leaves Opened');

  // ==========================
  // SELECT THE EXISTING FILE
  // ==========================
  // PrimeNG "advanced" p-fileupload widget. Try the Choose button + filechooser first
  // (bounded to 10s so it can't hang), then fall back to the file input in the DOM.
  // Only the "did the chooser open" part is wrapped in try/catch, so a real error
  // from setFiles (e.g. missing file) is no longer hidden behind the fallback.
  const chooser = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    page.getByText('Choose').click(),
  ])
    .then(([fileChooser]) => fileChooser)
    .catch(() => null);

  if (chooser) {
    await chooser.setFiles(FILE_PATH);
    console.log('File Selected via filechooser event:', FILE_PATH);
  } else {
    console.warn('filechooser event did not fire within 10s — falling back to direct input targeting.');
    const fallbackInput = page.locator('input[type="file"]').first();
    await fallbackInput.setInputFiles(FILE_PATH, { timeout: 10000 });
    await fallbackInput.dispatchEvent('change');
    console.log('File Selected via fallback input targeting:', FILE_PATH);
  }

  await page.waitForTimeout(3000);

  // ==========================
  // CLICK UPLOAD
  // ==========================
  try {
    await page.locator('p-button').filter({ hasText: 'Upload' }).click({ timeout: 8000 });
  } catch {
    console.warn('p-button locator failed — falling back to role-based match.');
    await page.getByRole('button', { name: /upload/i }).click({ timeout: 8000 });
  }
  console.log('Upload Button Clicked');

  await page.waitForTimeout(10000);

  // ==========================
  // CONFIRMATION DIALOG CLOSE (best-effort)
  // ==========================
  try {
    await page.getByRole('button').filter({ hasText: /^$/ }).click({ timeout: 5000 });
    console.log('Confirmation Dialog Closed');
  } catch {
    console.log('No confirmation dialog appeared — continuing.');
  }
  
  console.log('Process Completed');
});