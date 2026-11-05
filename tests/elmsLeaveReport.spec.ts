import { test, expect, Page, Locator, TestInfo } from '@playwright/test';

const BASE_URL = 'https://uatpresence.tajhotels.com/etam_prime/login';
const USERNAME = 'ADMIN/etam480';
const PASSWORD = '$WysE123';
const SUBMIT_TIMEOUT = 45000;

// Every entry of the "Select Report Type" dropdown (the first and last are skipped in the loop below)
const REPORTS = [
  'Employee Leave Report',
  'Executive Leave Report',
  'Leave Balance Report',
  'Employee Wise Leave Encashment',
  'Used Compensatory Off Report',
  'Leave Card Report',
  'Pending Leave Status Report',
];

// Toast / dialog the app shows when it can't produce the report (validation, no data, ...)
const MESSAGE = '.p-toast-message, .swal2-popup, mat-snack-bar-container, simple-snack-bar, .toast-message, .modal.show';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// --- Helpers --------------------------------------------------------------

/** True if the locator becomes visible within `ms` (used for fields that differ per report). */
const appears = (locator: Locator, ms = 3000) =>
  locator.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

/**
 * Picks a random start day and a random later end day in the month shown by the range picker.
 * Two calendars are shown and the left one can be cut off by the window edge, so
 * the right-most calendar that is fully inside the viewport is used.
 */
async function pickRandomDateRange(page: Page) {
  const rangeInput = page.getByRole('textbox', { name: 'Select Date Range' });
  await rangeInput.click();

  const calendars = page.locator('bs-days-calendar-view');
  await expect(calendars.first()).toBeVisible({ timeout: 10000 });
  const width = page.viewportSize()?.width ?? Infinity;
  let calendar = calendars.last();
  for (let i = (await calendars.count()) - 1; i >= 0; i--) {
    const box = await calendars.nth(i).boundingBox();
    if (box && box.x >= 0 && box.x + box.width <= width) { calendar = calendars.nth(i); break; }
  }

  const days = calendar.locator('[bsdatepickerdaydecorator]:not(.is-other-month):not(.disabled)');
  await expect(days.first()).toBeVisible({ timeout: 10000 });
  const total = await days.count();
  const start = randomInt(0, total - 2);
  const end = randomInt(start + 1, total - 1);
  await days.nth(start).click();
  await days.nth(end).click();
  await expect(rangeInput).not.toHaveValue('');
  console.log(`Date range: "${await rangeInput.inputValue()}"`);
}

/** Opens a PrimeNG multiselect via its placeholder and ticks its first option. */
async function pickFirstFromMultiselect(page: Page, trigger: Locator) {
  await trigger.click();
  const panel = page.locator('.p-multiselect-panel').last();
  await expect(panel).toBeVisible();
  await panel.locator('li.p-multiselect-item').first().click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}

/** Fills whichever filters the selected report shows; fields a report doesn't have are skipped. */
async function fillFilters(page: Page) {
  if (await appears(page.getByRole('textbox', { name: 'Select Date Range' }))) {
    await pickRandomDateRange(page);
  }
  const leaveType = page.getByText('--Select a Leave Type--').first();
  if (await appears(leaveType, 1500)) await pickFirstFromMultiselect(page, leaveType);

  const department = page.getByText('--Select a Department--').first();
  if (await appears(department, 1500)) await pickFirstFromMultiselect(page, department);

  // Select all employees once the table has loaded (its header checkbox is disabled until then)
  const selectAll = page.locator('p-tableheadercheckbox .p-checkbox-box');
  if (await selectAll.count()) {
    const loaded = await expect(selectAll).not.toHaveClass(/p-disabled/, { timeout: 20000 }).then(() => true, () => false);
    if (loaded) await selectAll.click();
  }
}

/** Clicks Submit and waits for the report: a popup tab, a download, or an error message. */
async function submitAndCapture(page: Page, name: string, testInfo: TestInfo) {
  const file = `test-results/reports/${name.replace(/\W+/g, '_')}`;
  const popup = page.waitForEvent('popup', { timeout: SUBMIT_TIMEOUT }).then((p) => ({ kind: 'popup' as const, p }), () => null);
  const download = page.waitForEvent('download', { timeout: SUBMIT_TIMEOUT }).then((d) => ({ kind: 'download' as const, d }), () => null);
  const message = page.locator(MESSAGE).first().waitFor({ state: 'visible', timeout: SUBMIT_TIMEOUT }).then(() => ({ kind: 'message' as const }), () => null);

  await page.getByRole('button', { name: 'Submit' }).click();
  const result = await Promise.race([popup, download, message]);

  if (result?.kind === 'popup') {
    await result.p.waitForLoadState('load').catch(() => {});
    console.log(`${name}: report opened at ${result.p.url()}`);
    await result.p.screenshot({ path: `${file}.png` }).catch(() => {});
    await testInfo.attach(name, { path: `${file}.png`, contentType: 'image/png' }).catch(() => {});
    await result.p.close();
  } else if (result?.kind === 'download') {
    const saved = `${file}_${result.d.suggestedFilename()}`;
    await result.d.saveAs(saved);
    console.log(`${name}: downloaded ${saved}`);
    await testInfo.attach(name, { path: saved });
  } else {
    // Either an error message appeared, or nothing happened at all - show what the page looks like
    const text = result ? (await page.locator(MESSAGE).first().innerText()).replace(/\s+/g, ' ').trim() : '';
    await page.screenshot({ path: `${file}_failed.png` });
    await testInfo.attach(`${name} - failed`, { path: `${file}_failed.png`, contentType: 'image/png' });
    throw new Error(
      result
        ? `${name}: app showed a message instead of a report: "${text}"`
        : `${name}: no popup, download or message within ${SUBMIT_TIMEOUT / 1000}s - see attached screenshot`
    );
  }
}

// --- Tests: one per report ------------------------------------------------

test.describe('ELMS reports', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByText('ELMS').click();
    await page.getByRole('combobox').selectOption('Reports');
  });

  // The first (Employee Leave Report) and the last (Pending Leave Status Report) are skipped
  for (const report of REPORTS.slice(1, -1)) {
    test(`Generate ${report}`, async ({ page }, testInfo) => {
      await test.step('Select report type', async () => {
        await page.locator('#reporttype').selectOption({ label: report });
        await page.waitForTimeout(500); // let the form re-render for this report
      });
      await test.step('Fill filters', () => fillFilters(page));
      await test.step('Submit and capture the report', () => submitAndCapture(page, report, testInfo));
    });
  }
});