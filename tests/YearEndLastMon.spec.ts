import { test, expect, Page, Locator } from '@playwright/test';
import * as XLSX from 'xlsx';
import fs from 'fs';

// ==========================
// CONFIG
// ==========================
const BASE_URL = 'https://uatpresence.tajhotels.com/etam_prime';
const USERNAME = 'ADMIN/etam480';
const PASSWORD = process.env.ETAM_PASSWORD || '$WysE123';

const LEAVE_TYPE = 'CL';
const DEPARTMENT_PLACEHOLDER = '--Select a Department--';

const TEST_TIMEOUT = 180_000;
const STEP_TIMEOUT = 10_000;
const DOWNLOAD_TIMEOUT = 30_000;
const TOAST_TIMEOUT = 30_000;

const DOWNLOAD_API = 'YearEndLeaveProcessUploadLastMonthFormat';
const DOWNLOAD_DIR = './downloads';

// ==========================
// HELPERS
// ==========================
async function waitForOverlayGone(page: Page, timeout = 15_000) {
  await page
    .locator('.ngx-overlay, ngx-ui-loader, .p-component-overlay-mask, .p-sidebar-mask')
    .first()
    .waitFor({ state: 'hidden', timeout })
    .catch(() => {});
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for either the ELMS menu (success) or the red login alert (failure).
  const elmsMenu = page.getByText('ELMS').first();
  const loginAlert = page.locator('app-login alert');
  await expect(elmsMenu.or(loginAlert).first()).toBeVisible({ timeout: 30_000 });

  if (await loginAlert.isVisible()) {
    const message = (await loginAlert.innerText()).trim();
    throw new Error(`Login failed for "${USERNAME}": ${message}`);
  }

  await waitForOverlayGone(page);
  console.log(`Login Successful (${USERNAME})`);
}

async function navigateToYearEndLastMonth(page: Page) {
  await page.getByText('ELMS').click({ timeout: STEP_TIMEOUT });
  await page.getByRole('combobox').selectOption('eLMS Uploads', { timeout: STEP_TIMEOUT });
  await page
    .locator('app-elms-uploads')
    .getByRole('combobox')
    .selectOption('Year End Leave Process Upload For Last Month', { timeout: STEP_TIMEOUT });
  await waitForOverlayGone(page);
  await expect(page.locator('select[name="leavetype"]')).toBeVisible({ timeout: STEP_TIMEOUT });
  console.log('Year End Leave Process Upload For Last Month Opened');
}

/** Closes the open PrimeNG multiselect panel so its header can't block later clicks. */
async function closeOpenMultiselect(page: Page) {
  const panel = page.locator('.p-multiselect-panel').first();
  await page.keyboard.press('Escape');
  const closed = await panel.waitFor({ state: 'hidden', timeout: 2000 }).then(() => true).catch(() => false);
  if (!closed) {
    // Fallback: click a neutral label outside the panel
    await page.getByText('Upload File').first().click().catch(() => {});
    await panel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

/** Opens a multiselect and selects every option; returns how many options were selected. */
async function selectAllFromMultiselect(page: Page, multiselect: Locator, placeholder: string): Promise<number> {
  await multiselect.click({ timeout: STEP_TIMEOUT });

  const items = page.locator('.p-multiselect-panel .p-multiselect-item');
  await items.first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT });
  const total = await items.count();

  // Prefer the "select all" checkbox in the panel header; fall back to clicking each option.
  const toggleAll = page.locator('.p-multiselect-panel .p-multiselect-header .p-checkbox').first();
  if (await toggleAll.isVisible().catch(() => false)) {
    await toggleAll.click();
  } else {
    for (let i = 0; i < total; i++) {
      await items.nth(i).click();
    }
  }

  await expect(
    page.locator('.p-multiselect-panel .p-multiselect-item.p-highlight'),
    'every option should be selected'
  ).toHaveCount(total);

  await closeOpenMultiselect(page);
  await expect(multiselect, `"${placeholder}" should be replaced by the selection`).not.toContainText(placeholder);
  return total;
}

/**
 * Ticks the "select all" checkbox in the employee table header and returns the selected count.
 * The table is virtual-scrolled (only the visible rows exist in the DOM), so clicking rows one by one
 * would miss employees below the fold.
 */
async function selectAllEmployees(page: Page): Promise<number> {
  const selectAll = page.locator('p-tableheadercheckbox .p-checkbox-box');
  await expect(selectAll, 'employee list should load and enable "select all"').not.toHaveClass(/p-disabled/, { timeout: 15_000 });
  await selectAll.click();

  const counter = page.getByText(/Selected Employees\s*:/).first();
  await expect(counter, 'at least one employee should be selected').toHaveText(/Selected Employees\s*:\s*[1-9]\d*/);
  return Number(/:\s*(\d+)/.exec(await counter.innerText())![1]);
}

/**
 * Clicks "Download Format With Data" and saves the file.
 * On failure the server replies HTTP 200 with a JSON error (e.g. "No Record found for difference")
 * and no file, so the response body is checked before waiting for the download.
 */
async function downloadFormatWithData(page: Page): Promise<string> {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT });
  downloadPromise.catch(() => {}); // avoid an unhandled rejection if we throw before awaiting it

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(DOWNLOAD_API), { timeout: DOWNLOAD_TIMEOUT }),
    page.getByRole('button', { name: 'Download Format With Data' }).click(),
  ]);

  if ((response.headers()['content-type'] ?? '').includes('json')) {
    const body = await response.json().catch(() => null);
    if (body && body.errorcode !== undefined && body.errorcode !== 0) {
      throw new Error(`Download API error: ${body.errormessage ?? body.errorstring ?? 'unknown error'}`);
    }
  }

  const download = await downloadPromise.catch(async () => {
    const toast = page.locator('#toast-container .ngx-toastr').first();
    const message = await toast.innerText().catch(() => '(no toast shown)');
    throw new Error(`Download did not start. App said: ${message.trim()}`);
  });

  const filePath = `${DOWNLOAD_DIR}/YearEndLeaveProcessLastMonth_${Date.now()}.xlsx`;
  await download.saveAs(filePath);
  console.log('File Downloaded Successfully');
  return filePath;
}

/**
 * Re-uploads the downloaded file as-is (smoke test: the file the system produced can be uploaded again).
 * Stays on the current screen — re-selecting the dropdown option would reset the section and wipe the file input.
 */
async function uploadFile(page: Page, filePath: string) {
  // Scoped to name="file" (singular): the page has another input, name="files".
  const fileInput = page.locator('input[name="file"]');
  await fileInput.setInputFiles(filePath);
  console.log('File Selected');

  // Angular's change detection can lag behind the native input event
  // (caused a "File Not Selected" toast before) — dispatch change + blur and let it settle.
  await fileInput.dispatchEvent('change');
  await fileInput.blur();
  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: /upload/i }).click();
  console.log('Upload Button Clicked');

  const toast = page.locator('#toast-container .ngx-toastr').first();
  const toastShown = await toast.waitFor({ state: 'visible', timeout: TOAST_TIMEOUT }).then(() => true).catch(() => false);
  if (toastShown) {
    console.log('Upload result toast:', (await toast.innerText()).trim().replace(/\s+/g, ' '));
  } else {
    console.log(`No result toast appeared within ${TOAST_TIMEOUT / 1000}s`);
  }
  await waitForOverlayGone(page, TOAST_TIMEOUT);
}

// ==========================
// TEST
// ==========================
test('Year End Leave Process Upload For Last Month', async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT);

  await login(page);
  await navigateToYearEndLastMonth(page);

  // Filters: Leave Type + all Departments
  await page.locator('select[name="leavetype"]').selectOption(LEAVE_TYPE, { timeout: STEP_TIMEOUT });
  const departmentCount = await selectAllFromMultiselect(page, page.locator('p-multiselect').first(), DEPARTMENT_PLACEHOLDER);
  console.log(`All Departments Selected (${departmentCount})`);

  // Employees
  const employeeCount = await selectAllEmployees(page);
  console.log(`All Employees Selected (${employeeCount})`);

  // Download, sanity-check the file, then re-upload it
  const downloadedFile = await downloadFormatWithData(page);

  const workbook = XLSX.readFile(downloadedFile);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  console.log('A2 =', sheet['A2']?.v);
  console.log('B2 =', sheet['B2']?.v);

  await uploadFile(page, downloadedFile);

  console.log('Process Completed');
});