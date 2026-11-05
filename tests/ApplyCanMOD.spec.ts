import { test, expect, Page } from '@playwright/test';

// ETAM Prime — REGISTRATION > Apply/Cancel MOD (random employee + random date range)

const MAX_EMPLOYEE_TRIES = 10;
const KNOWN_RO_EMPLOYEE = '88021213 - Atul khatpe'; // from the original recording

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Picks a random employee from the autocomplete list (or a specific one by text). */
async function selectEmployee(page: Page, text?: string) {
  const button = page.locator('p-autocomplete').getByRole('button');
  const items = page.locator('.p-autocomplete-panel .p-autocomplete-item');

  // The list sometimes does not open on the first click (the field just gets focus), so retry
  for (let i = 1; i <= 3; i++) {
    await button.click();
    if (await items.first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) break;
    console.log(`Employee list did not open (click ${i}), retrying`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await expect(items.first(), 'employee list should be open').toBeVisible({ timeout: 5_000 });

  const item = text ? items.filter({ hasText: text }).first() : items.nth(randomInt(0, (await items.count()) - 1));
  console.log('Employee selected:', (await item.innerText()).trim());
  await item.click();
}

/**
 * Opens the date picker, goes back to April and picks a random range inside it
 * (random start day 1-24, end 1-5 days later).
 * The picker is an ngx-bootstrap bs-daterangepicker (two calendars shown; the first one is used):
 * header buttons "previous" / month / year / "next",
 * day cells are `td[role=gridcell] span` (days from neighbouring months have `.is-other-month`).
 */
async function selectRandomAprilDateRange(page: Page) {
  const input = page.getByRole('textbox', { name: 'Select Date Range' });
  await input.click();

  // The range picker renders two month calendars side by side (each with its own
  // previous/next buttons), so work only in the first (left) one.
  const picker = page.locator('bs-daterangepicker-container');
  await picker.waitFor({ state: 'visible' });
  const calendar = picker.locator('bs-days-calendar-view').first();
  const monthButton = calendar.locator('button.current').first();

  for (let i = 0; i < 24 && (await monthButton.innerText()).trim() !== 'April'; i++) {
    await calendar.locator('button.previous').click();
  }
  await expect(monthButton).toHaveText('April');

  const start = randomInt(1, 24);
  const end = start + randomInt(1, 5);
  const day = (d: number) =>
    calendar.locator('td[role="gridcell"] span:not(.is-other-month)').getByText(String(d), { exact: true });
  await day(start).click();
  await day(end).click();

  await expect(input).toHaveValue(/\/04\/\d{4} - \d{2}\/04\/\d{4}/);
  console.log(`Date range: April ${start} to April ${end} ->`, await input.inputValue());
}

/**
 * Picks a random employee, sets the date range, clicks Show, then waits for
 * whichever result comes first:
 *  - toast "Select Employee is Not RO"  -> employee not RO, try the next one
 *  - "Show MOD Status" button           -> RO is assigned, stop here
 */
async function showRandomEmployeeMod(page: Page) {
  const modStatus = page.getByRole('button', { name: 'Show MOD Status' });
  const notRoToast = page.getByText('Select Employee is Not RO');
  const dateInput = page.getByRole('textbox', { name: 'Select Date Range' });

  for (let attempt = 1; attempt <= MAX_EMPLOYEE_TRIES + 1; attempt++) {
    // make sure a toast from the previous attempt is gone, so it is not misread
    await notRoToast.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});

    // 1) select employee, 2) select date range, 3) Show
    await selectEmployee(page, attempt > MAX_EMPLOYEE_TRIES ? KNOWN_RO_EMPLOYEE : undefined);
    if (!(await dateInput.inputValue())) await selectRandomAprilDateRange(page);
    await page.getByRole('button', { name: 'Show', exact: true }).click();

    const outcome = await Promise.race([
      modStatus.waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'RO' as const),
      notRoToast.waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'NOT_RO' as const),
    ]).catch(() => 'TIMEOUT' as const);

    if (outcome === 'RO') {
      console.log(`Attempt ${attempt}: RO assigned, continuing`);
      return;
    }
    console.log(`Attempt ${attempt}: ${outcome === 'NOT_RO' ? 'employee is Not RO' : 'no result'}, trying next employee`);
  }
  throw new Error('No employee with RO assigned found');
}

/** Dismisses the result popup shown after Save so the test ends cleanly. */
async function closeResultPopup(page: Page): Promise<string> {
  const popup = page.locator('.p-dialog, .p-toast-message, [role="alertdialog"]').first();
  let text = '';
  if (await popup.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)) {
    text = (await popup.innerText()).trim().replace(/\s+/g, ' ');
    console.log('Result popup:', text);
    await popup.getByRole('button', { name: /ok|close/i }).first().click().catch(() => {});
    await popup.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  } else {
    console.log('No result popup appeared after Save');
  }
  return text;
}

test('Apply/Cancel MOD - random employee and date range', async ({ page }) => {
  // ---- Login ----
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');

  // ---- Open Apply/Cancel MOD ----
  await page.getByText('REGISTRATION').click();
  await page.getByRole('combobox').selectOption('Apply/Cancel MOD');

  // ---- Employee -> date range -> Show; retry with the next employee if Not RO ----
  await showRandomEmployeeMod(page);

  // ---- Check MOD status, save ----
  await page.getByRole('button', { name: 'Show MOD Status' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  // ---- Finish ----
  const resultText = await closeResultPopup(page);

  // Save must not end in an error / Not RO message
  expect(resultText, 'save result should not be an error').not.toMatch(/not ro|error|fail|invalid/i);
  await expect(page.getByText('Select Employee is Not RO')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

  console.log('Test finished: one RO employee found, MOD saved.');
});