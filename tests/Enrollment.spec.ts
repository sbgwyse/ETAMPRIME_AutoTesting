import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * ETAM Prime — Enrollment / Face Enrollment / Download Setup
 *
 * Credentials are read from environment variables instead of being
 * hardcoded, so this file is safe to commit. Set them before running:
 *
 *   Windows (PowerShell):
 *     $env:ETAM_USERNAME="ADMIN/etam100"
 *     $env:ETAM_PASSWORD="your-password"
 *     npx playwright test enrollment.spec.ts
 *
 *   Or add a .env file + dotenv, or a playwright.config.ts "use" block.
 */

const BASE_URL = 'https://presence.tajhotels.com/etam_prime';
const USERNAME = process.env.ETAM_USERNAME ?? '';
const PASSWORD = process.env.ETAM_PASSWORD ?? '';
const ENROLL_USER = process.env.ETAM_ENROLL_USER ?? 'Shiv Kumar';

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Centralized timeouts (ms) — tune these in one place instead of hunting
// through every test if the app turns out slower/faster than expected.
const TEST_TIMEOUT = 90_000;        // overall budget per test
const LOGIN_TIMEOUT = 15_000;       // waiting for the ENROLLMENT page after sign-in
const DOWNLOAD_TIMEOUT = 30_000;    // waiting for a download to start after a click

test.beforeAll(() => {
  if (!USERNAME || !PASSWORD) {
    throw new Error(
      'ETAM_USERNAME / ETAM_PASSWORD env vars are not set. See file header for how to set them.'
    );
  }
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
});

/** Logs in and lands on the Registration page, ready for enrollment work. */
async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Confirm login actually succeeded before moving on.
  await expect(page.getByText('ENROLLMENT')).toBeVisible({ timeout: LOGIN_TIMEOUT });
}

/** Opens Enrollment and selects the given employee via the autocomplete. */
async function openEnrollmentForUser(page: Page, name: string) {
  await page.getByText('ENROLLMENT').click();
  await page.locator('p-autocomplete').getByRole('button').click();
  await page.getByText(`- ${name}`).click();
}

/** Waits for a click-triggered download and saves it under DOWNLOAD_DIR. */
async function expectDownload(
  page: Page,
  trigger: () => Promise<void>,
  label: string
) {
  const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT });
  await trigger();
  const download = await downloadPromise;

  expect(download.suggestedFilename(), `${label} filename`).toBeTruthy();

  const savePath = path.join(DOWNLOAD_DIR, download.suggestedFilename());
  await download.saveAs(savePath);
  expect(fs.existsSync(savePath), `${label} saved to disk`).toBeTruthy();

  return download;
}

test.describe('ETAM Prime — Enrollment', () => {
  test.describe.configure({ timeout: TEST_TIMEOUT });

  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnrollmentForUser(page, ENROLL_USER);
  });

  test('Fingerprint enrollment: user lists download correctly', async ({ page }) => {
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

    // Navigating into the "To Enroll Fingerprint" detail view.
    const detailLink = page.getByText('To Enroll Fingerprint To');
    await expect(detailLink).toBeVisible();
    await detailLink.click();
  });

  test('Face enrollment: user lists, image viewer, and PDF/Excel exports', async ({ page }) => {
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
    // Confirm with the app owner whether this is a second, distinct export
    // (e.g. a different report/tab) or an accidental duplicate click before
    // keeping both assertions.
    await expectDownload(
      page,
      () => page.getByRole('button', { name: 'Download Excel' }).click(),
      'Face enrollment Excel export (2nd)'
    );

    // Close the image data view.
    await page.getByRole('button', { name: 'Show All Image Data' }).click();
  });

  test('Download Setup: drivers, services, and setup files are downloadable', async ({ page }) => {
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

    // This link was clicked in the recording but no download/navigation was
    // captured — verify manually whether it should trigger something.
    // NOTE: its accessible name is "Enrollment Setup " + an icon glyph, not
    // a plain trailing space, and "Face Enrollment Setup" also contains
    // "Enrollment Setup" as a substring — so match must anchor to the start.
    await page.getByRole('link', { name: /^Enrollment Setup/ }).click();

    await expectDownload(
      page,
      () => page.getByRole('link', { name: 'Web Enroll Document ' }).click(),
      'Web Enroll Document'
    );

    // "Face Enrollment Setup" and "Enroll32 Setup" trigger downloads only —
    // no popup. (The earlier "Web Enroll Document" PDF click is what opens a
    // new tab, in Chrome's built-in PDF viewer; confirmed via trace network
    // logs, which showed WebEnrollDocument.pdf loading in a second page ID
    // right after that click, well before this step runs.)
    await page.getByRole('link', { name: 'Face Enrollment Setup ' }).click();

    await expectDownload(
      page,
      () => page.getByRole('link', { name: 'Enroll32 Setup ' }).click(),
      'Enroll32 Setup'
    );
  });
});