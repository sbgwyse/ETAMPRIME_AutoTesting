import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ACTION_TIMEOUT = 15_000;
const BASE_URL = 'https://uatpresence.tajhotels.com/etam_prime/login';

// Prefer environment variables over hardcoded credentials.
const USERNAME = process.env.ETAM_USERNAME ?? 'ADMIN/etam480';
const PASSWORD = process.env.ETAM_PASSWORD ?? '$WysE123';

const QUERY_DATE = '2026-08-01';
const DOWNLOAD_DIR = path.resolve('./downloads');

// Directions to iterate over when toggling the query.
const DIRECTIONS = ['OUT'] as const; // add 'IN' here if that radio also needs coverage

async function waitForOverlaysGone(page: Page) {
  const loader = page.locator('.ngx-ui-loader');
  if (await loader.count()) {
    await loader.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }
}

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // If a post-login dialog/popup appears, dismiss it.
  // NOTE: replace with a named selector (e.g. { name: 'OK' }) once confirmed,
  // to avoid accidentally matching an unrelated button.
  await page.getByRole('button').click({ timeout: 5000 }).catch(() => {});

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitForOverlaysGone(page);
}

async function navigateToDailyQueryMobile(page: Page) {
  console.log('STEP: Navigating to Daily Query Mobile');
  await page.getByText('ADMINISTRATION').click({ timeout: ACTION_TIMEOUT });
  await page.getByRole('combobox').selectOption('Daily Query Mobile');
  await waitForOverlaysGone(page);
}

async function selectDirectionRadio(page: Page, id: string, maxAttempts = 5) {
  const radio = page.locator(`[id="${id}"]`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await waitForOverlaysGone(page);
    try {
      await radio.click({ timeout: ACTION_TIMEOUT });
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.log(`STEP: Retrying ${id} radio click (attempt ${attempt}/${maxAttempts})`);
      await page.waitForTimeout(300);
    }
  }
}

async function clickShowAndDownload(page: Page, label: string): Promise<string> {
  console.log(`STEP: Clicking Show (${label})`);
  await page.getByRole('button', { name: 'Show' }).click({ timeout: ACTION_TIMEOUT });

  console.log(`STEP: Downloading (${label})`);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '  Download' }).click({ timeout: ACTION_TIMEOUT });
  const download = await downloadPromise;

  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const filePath = path.join(DOWNLOAD_DIR, download.suggestedFilename());
  await download.saveAs(filePath);
  console.log('Downloaded:', filePath);

  return filePath;
}

test('Daily Query Mobile - download by direction', async ({ page }) => {
  await login(page);
  await navigateToDailyQueryMobile(page);

  console.log('STEP: Filling Date');
  await page.getByRole('textbox', { name: 'Date*' }).fill(QUERY_DATE);

  // Default direction
  const defaultFile = await clickShowAndDownload(page, 'default');
  expect(fs.existsSync(defaultFile)).toBeTruthy();

  // Remaining directions
  for (const direction of DIRECTIONS) {
    console.log(`STEP: Switching to ${direction} direction`);
    await selectDirectionRadio(page, direction);
    const file = await clickShowAndDownload(page, direction);
    expect(fs.existsSync(file)).toBeTruthy();
  }
});