import { test, expect, Page, Locator } from '@playwright/test';
import * as XLSX from 'xlsx';
import fs from 'fs';

test.setTimeout(180000);

const USERNAME = 'ADMIN/etam480';
const PASSWORD = process.env.ETAM_PASSWORD || '$WysE123';

const STEP_TIMEOUT = 10000;
const LEAVE_TYPE = 'CL';
const EMPLOYEE_COUNT = 4; // how many random employees to select

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Returns `count` distinct random indexes from 0..total-1. */
function pickDistinct(total: number, count: number): number[] {
  const idx = Array.from({ length: total }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(count, total));
}

async function waitForOverlayGone(page: Page, timeout = 15000) {
  await page
    .locator('.ngx-overlay, ngx-ui-loader, .p-component-overlay-mask, .p-sidebar-mask')
    .first()
    .waitFor({ state: 'hidden', timeout })
    .catch(() => {});
}

async function login(page: Page) {
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for either the ELMS menu (success) or the red login alert (failure).
  const elmsMenu = page.getByText('ELMS').first();
  const loginAlert = page.locator('app-login alert');
  await expect(elmsMenu.or(loginAlert).first()).toBeVisible({ timeout: 30000 });

  if (await loginAlert.isVisible()) {
    const message = (await loginAlert.innerText()).trim();
    throw new Error(`Login failed for "${USERNAME}": ${message}`);
  }

  await waitForOverlayGone(page);
  console.log(`Login Successful (${USERNAME})`);
}

async function navigateToYearEndLeaveProcessUpload(page: Page) {
  await page.getByText('ELMS').click({ timeout: STEP_TIMEOUT });
  await page.getByRole('combobox').selectOption('eLMS Uploads', { timeout: STEP_TIMEOUT });
  await page
    .locator('app-elms-uploads')
    .getByRole('combobox')
    .selectOption('Year End Leave Process Upload', { timeout: STEP_TIMEOUT });
  await waitForOverlayGone(page);
  await expect(page.locator('select[name="leavetype"]')).toBeVisible({ timeout: STEP_TIMEOUT });
  console.log('Year End Leave Process Upload Opened');
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

/** Opens a multiselect, picks one random option, closes it and verifies the placeholder is gone. */
async function selectRandomFromMultiselect(page: Page, multiselect: Locator, placeholder: string): Promise<string> {
  await multiselect.click({ timeout: STEP_TIMEOUT });

  const items = page.locator('.p-multiselect-panel .p-multiselect-item');
  await items.first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT });

  const item = items.nth(randomInt(0, (await items.count()) - 1));
  const label = (await item.innerText()).trim();
  await item.click();

  await closeOpenMultiselect(page);
  await expect(multiselect, `"${placeholder}" should be replaced by the selection`).not.toContainText(placeholder);
  return label;
}

/** Picks a random designation if the list has any real options; returns null otherwise. */
async function selectRandomDesignation(page: Page): Promise<string | null> {
  const select = page.locator('select[name="designname"]');

  const getLabels = async () =>
    select.locator('option').evaluateAll((opts) =>
      (opts as HTMLOptionElement[])
        .filter((o) => {
          const label = (o.textContent ?? '').trim();
          return o.value && o.value.trim() !== '' && o.value !== '-1' && !label.startsWith('--') && !o.disabled;
        })
        .map((o) => (o.textContent ?? '').trim())
    );

  await expect.poll(async () => (await getLabels()).length, { timeout: 5000 }).toBeGreaterThan(0).catch(() => {});

  const labels = await getLabels();
  if (!labels.length) return null;

  const label = labels[randomInt(0, labels.length - 1)];
  await select.selectOption({ label }, { timeout: STEP_TIMEOUT });
  return label;
}

/** Clicks EMPLOYEE_COUNT random rows in the employee list and verifies the "Selected Employees" counter. */
async function selectRandomEmployees(page: Page, count: number): Promise<string[]> {
  // data rows = rows that have an ID cell (non-space text containing a digit); this skips the header row
  const rows = page.getByRole('row').filter({ has: page.getByRole('cell', { name: /^\S*\d\S*$/ }) });
  await rows.first().waitFor({ state: 'visible', timeout: 15000 });

  const picked: string[] = [];
  for (const i of pickDistinct(await rows.count(), count)) {
    const cells = rows.nth(i).getByRole('cell');
    const id = (await cells.first().innerText()).trim();
    const name = (await cells.nth(1).innerText().catch(() => '')).trim();
    await cells.first().click();
    picked.push(`${id} - ${name}`);
  }

  await expect(
    page.getByText(/Selected Employees\s*:/).first(),
    'selected employee counter should match the rows clicked'
  ).toHaveText(new RegExp(`Selected Employees\\s*:\\s*${picked.length}\\b`));

  return picked;
}

test('Year End Leave Process Upload', async ({ page }) => {
  await login(page);
  await navigateToYearEndLeaveProcessUpload(page);

  // ==========================
  // FILTERS: Leave Type / Department / Peoplegroup / Designation
  // ==========================
  await page.locator('select[name="leavetype"]').selectOption(LEAVE_TYPE, { timeout: STEP_TIMEOUT });

  const department = await selectRandomFromMultiselect(page, page.locator('p-multiselect').first(), '--Select a Department--');
  console.log('Department Selected:', department);

  const peopleGroup = await selectRandomFromMultiselect(page, page.locator('p-multiselect').nth(1), '--Select Peoplegroup--');
  console.log('People Group Selected:', peopleGroup);

  const designation = await selectRandomDesignation(page);
  console.log('Designation Selected:', designation ?? '(none available, skipped)');

  // First click opens the employee selection panel
  await page.getByRole('button', { name: 'Download Format With Data' }).click();

  await page.getByText('Contractor').click();
  await page.locator('#getcontractor').check();

  // ==========================
  // SELECT RANDOM EMPLOYEES FROM THE LIST
  // ==========================
  const employees = await selectRandomEmployees(page, EMPLOYEE_COUNT);
  console.log('Employees Selected:', employees.join(', '));

  // ==========================
  // DOWNLOAD FILE (second click on same button triggers actual download)
  // ==========================
  fs.mkdirSync('./downloads', { recursive: true });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Format With Data' }).click();
  const download = await downloadPromise;

  const downloadedFile = `./downloads/YearEndLeaveProcess_${Date.now()}.xlsx`;
  await download.saveAs(downloadedFile);
  console.log('File Downloaded Successfully');

  // ==========================
  // RE-UPLOAD THE DOWNLOADED FILE AS-IS
  // ==========================
  // The "Download Format With Data" file comes fully populated by the system,
  // so this smoke-tests that the exact file the system produced can be
  // re-uploaded. Adjust the cell refs once the real column layout is confirmed.
  const verifyWorkbook = XLSX.readFile(downloadedFile);
  const verifySheet = verifyWorkbook.Sheets[verifyWorkbook.SheetNames[0]];
  console.log('A2 =', verifySheet['A2']?.v);
  console.log('B2 =', verifySheet['B2']?.v);

  // Already on the Year End Leave Process Upload screen — don't re-select the
  // dropdown option, that resets the section and wipes the file input.
  // Scoped to name="file" (singular): the page has another input, name="files".
  await page.setInputFiles('input[name="file"]', downloadedFile);
  console.log('File Selected');

  // Angular's change detection can lag behind the native input event
  // (caused a "File Not Selected" toast before) — dispatch change + blur and let it settle.
  await page.locator('input[name="file"]').dispatchEvent('change');
  await page.locator('input[name="file"]').blur();
  await page.waitForTimeout(2000);

  // ==========================
  // CLICK UPLOAD
  // ==========================
  await page.getByRole('button', { name: /upload/i }).click();
  console.log('Upload Button Clicked');

  // Wait for the result toast (instead of a fixed 10s sleep) so the screenshot captures it
  const toast = page.locator('#toast-container .ngx-toastr').first();
  if (await toast.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false)) {
    console.log('Upload result toast:', (await toast.innerText()).trim().replace(/\s+/g, ' '));
  } else {
    console.log('No result toast appeared within 30s');
  }
  await waitForOverlayGone(page, 30000);

  // ==========================
  // SCREENSHOT
  // ==========================
  console.log('Process Completed');
});