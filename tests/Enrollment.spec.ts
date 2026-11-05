import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * ETAM Prime — Enrollment / Face Enrollment / Download Setup
 *
 * ONE test, ONE login, ONE random employee — all three sections
 * (Fingerprint, Face Enrollment, Download Setup) run in a single pass.
 *
 * Username defaults to ADMIN/etam480. The password is read from an
 * environment variable so it is not committed:
 *
 *   Windows (PowerShell):
 *     $env:ETAM_PASSWORD="your-password"
 *     npx playwright test enrollment.spec.ts
 *
 * Optional overrides:
 *     $env:ETAM_USERNAME="ADMIN/etam480"
 *     $env:ETAM_ENROLL_USER="Atul khatpe"   # force a specific employee (default: random)
 */

const BASE_URL = 'https://uatpresence.tajhotels.com/etam_prime';
const USERNAME = process.env.ETAM_USERNAME ?? 'ADMIN/etam480';
const PASSWORD = process.env.ETAM_PASSWORD ?? '';
const ENROLL_USER = process.env.ETAM_ENROLL_USER ?? ''; // empty = random employee

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Centralized timeouts (ms)
const TEST_TIMEOUT = 180_000;       // whole flow in one test
const LOGIN_TIMEOUT = 15_000;       // waiting for the ENROLLMENT page after sign-in
const DOWNLOAD_TIMEOUT = 30_000;    // waiting for a download to start after a click

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

test.beforeAll(() => {
  if (!PASSWORD) {
    throw new Error('ETAM_PASSWORD env var is not set. See file header for how to set it.');
  }
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
});

/** Logs in and waits for the ENROLLMENT menu. */
async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText('ENROLLMENT')).toBeVisible({ timeout: LOGIN_TIMEOUT });
}

/**
 * Opens the Employee ID dropdown and selects an employee.
 *  - no `name`  -> a random employee from the list
 *  - with `name` -> the first employee whose text contains `name`
 */
async function selectEmployee(page: Page, name?: string): Promise<string> {
  const button = page.locator('p-autocomplete').getByRole('button');
  const items = page.locator('.p-autocomplete-panel .p-autocomplete-item');

  // The list sometimes does not open on the first click, so retry
  for (let i = 1; i <= 3; i++) {
    await button.click();
    if (await items.first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) break;
    console.log(`Employee list did not open (click ${i}), retrying`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await expect(items.first(), 'employee list should be open').toBeVisible({ timeout: 5_000 });

  const item = name
    ? items.filter({ hasText: name }).first()
    : items.nth(randomInt(0, (await items.count()) - 1));

  const label = (await item.innerText()).trim();
  console.log('Employee selected:', label);
  await item.click();
  return label;
}

/** Waits for a click-triggered download and saves it under DOWNLOAD_DIR. */
async function expectDownload(page: Page, trigger: () => Promise<void>, label: string) {
  const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT });
  await trigger();
  const download = await downloadPromise;

  expect(download.suggestedFilename(), `${label} filename`).toBeTruthy();

  const savePath = path.join(DOWNLOAD_DIR, download.suggestedFilename());
  await download.saveAs(savePath);
  expect(fs.existsSync(savePath), `${label} saved to disk`).toBeTruthy();
  return download;
}

test('ETAM Prime — Enrollment (one login, one random employee, all sections)', async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);

  // ---- Login once, pick one employee once ----
  await login(page);
  await page.getByText('ENROLLMENT').click();
  await selectEmployee(page, ENROLL_USER || undefined);

  // ---- 1) Fingerprint Enrollment ----
  await test.step('Fingerprint enrollment: user lists', async () => {
    await expectDownload(
      page,
      () => page.getByRole('button', { name: 'Enrolled User' }).click(),
      'Enrolled User (fingerprint) list'
    );

    await expectDownload(
      page,
      () => page.getByRole('button', { name: 'User To Be Enroll' }).click(),
      'User To Be Enroll (fingerprint) list'
    );

    const detailLink = page.getByText('To Enroll Fingerprint To');
    await expect(detailLink).toBeVisible();
    await detailLink.click();
  });

  // ---- 2) Face Enrollment ----
  await test.step('Face enrollment: user lists, image viewer, PDF/Excel exports', async () => {
    await page.getByRole('tab', { name: 'Face Enrollment' }).click();

    await expectDownload(
      page,
      () => page.getByRole('button', { name: 'Enrolled User' }).click(),
      'Enrolled User (face) list'
    );

    await expectDownload(
      page,
      () => page.getByRole('button', { name: 'User To Be Enroll' }).click(),
      'User To Be Enroll (face) list'
    );

    await page.getByRole('button', { name: 'Show Image' }).click();
    await page.getByRole('button', { name: 'Show All Image Data' }).click();

    await expectDownload(
      page,
      () => page.getByRole('button', { name: 'Download PDF' }).click(),
      'Face enrollment PDF export'
    );

    await expectDownload(
      page,
      () => page.getByRole('button', { name: 'Download Excel' }).click(),
      'Face enrollment Excel export (1st)'
    );

    // NOTE: original recording clicked "Download Excel" a second time here.
    // Confirm whether this is a distinct export or an accidental duplicate.
    await expectDownload(
      page,
      () => page.getByRole('button', { name: 'Download Excel' }).click(),
      'Face enrollment Excel export (2nd)'
    );

    // Close the image data view.
    await page.getByRole('button', { name: 'Show All Image Data' }).click();
  });

  // ---- 3) Download Setup ----
  await test.step('Download Setup: drivers, services, setup files', async () => {
    await page.getByRole('tab', { name: 'Download Setup' }).click();

    await expectDownload(
      page,
      () => page.getByRole('link', { name: 'Device Drivers ' }).click(),
      'Device Drivers'
    );

    await expectDownload(
      page,
      () => page.getByRole('link', { name: 'Enrollment Service ' }).click(),
      'Enrollment Service'
    );

    // Clicked in the recording but no download/navigation was captured.
    // Anchored to the start because "Face Enrollment Setup" also contains "Enrollment Setup".
    await page.getByRole('link', { name: /^Enrollment Setup/ }).click();

    await expectDownload(
      page,
      () => page.getByRole('link', { name: 'Web Enroll Document ' }).click(),
      'Web Enroll Document'
    );

    // "Face Enrollment Setup" and "Enroll32 Setup" trigger downloads only — no popup.
    // (The "Web Enroll Document" PDF click above opens a new tab in Chrome's PDF viewer.)
    await page.getByRole('link', { name: 'Face Enrollment Setup ' }).click();

    await expectDownload(
      page,
      () => page.getByRole('link', { name: 'Enroll32 Setup ' }).click(),
      'Enroll32 Setup'
    );
  });

  console.log('Test finished: all enrollment sections completed with one employee.');
});