import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://uatpresence.tajhotels.com/etam_prime/login';
const USERNAME = 'ADMIN/etam480';
const PASSWORD = '$WysE123';

const PAUSE_MS = 500;

// --- Small random helpers -------------------------------------------------

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pickRandom = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Parses a date string as shown in the app's date inputs into a UTC date.
 * Supports yyyy-MM-dd, dd/MM/yyyy (default), MM/dd/yyyy (only when the
 * second number is > 12), "dd MMM yyyy" and "MMM dd, yyyy".
 */
function parseUiDate(raw: string): Date {
  const v = raw.trim();
  let y = 0, m = 0, d = 0;
  let match: RegExpMatchArray | null;
  const monthNumber = (name: string) =>
    MONTHS.findIndex((n) => n.toLowerCase().startsWith(name.toLowerCase().slice(0, 3))) + 1;

  if ((match = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    y = +match[1]; m = +match[2]; d = +match[3];
  } else if ((match = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) {
    const a = +match[1], b = +match[2];
    y = +match[3];
    if (b > 12) { m = a; d = b; } else { d = a; m = b; }
  } else if ((match = v.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})/))) {
    d = +match[1]; m = monthNumber(match[2]); y = +match[3];
  } else if ((match = v.match(/^([A-Za-z]{3,9})[\s-]+(\d{1,2}),?[\s-]+(\d{4})/))) {
    m = monthNumber(match[1]); d = +match[2]; y = +match[3];
  }

  if (!y || !m || !d) {
    throw new Error(`Could not parse date "${raw}" - add its format to parseUiDate().`);
  }
  return new Date(Date.UTC(y, m - 1, d));
}

// --- Shared helpers -------------------------------------------------------

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  // Pressing Enter already submits the form here — a follow-up click on
  // "Sign In" double-submits and collides with the loader overlay, so we
  // submit once (Enter only) and just wait for the overlay to clear.
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');
  const loader = page.locator('ngx-ui-loader, .ngx-overlay');
  if (await loader.count()) {
    await loader.first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }
}

async function closeResultDialogIfPresent(page: Page) {
  const dialogClose = page.locator('.p-dialog-header-icons');
  if (await dialogClose.count()) {
    await dialogClose.first().click().catch(() => {});
  }
  const okButton = page.getByRole('button', { name: /ok/i });
  if (await okButton.count()) {
    await okButton.first().click().catch(() => {});
  }
}

async function navigateToExtensionOfContractPeriod(page: Page) {
  await page.getByText('ELMS').click();

  // Choosing this option makes the app call POST .../Employees/All_Employees, and the
  // employee autocomplete filters that list in the browser. Typing before the
  // response arrives filters an empty list, so register the wait BEFORE the
  // action that triggers the request and await it afterwards.
  const employeesLoaded = page.waitForResponse(
    (r) => r.url().includes('/Employees/All_Employees') && r.ok(),
    { timeout: 30000 }
  );
  await page.getByRole('combobox').selectOption('Extension Of Contract Period');
  await employeesLoaded;
  await page.waitForTimeout(PAUSE_MS);
}

/**
 * Picks a random employee who actually has contract-extension records.
 *
 * Selecting an employee makes the app call elms/ExtensionOfContractPeriodDetails.
 * For employees with nothing to extend it returns errorcode -1 ("No records
 * found.") and the Leave Type dropdown never gets its options. So after each
 * pick we check that response and, if there are no records, try a different
 * employee (never the same one twice).
 *
 * The suggestion panel only opens once you type, so type "4" (most UAT
 * employee IDs start with it) and retry if the panel doesn't open. Options are
 * rendered as "<ID> - <NAME>". Returns the chosen label.
 */
async function selectRandomEmployeeWithRecords(page: Page, maxAttempts = 25): Promise<string> {
  const employeeInput = page.locator('input[name="employees"]');
  const options = page.locator('.p-autocomplete-panel .p-autocomplete-item');
  const tried = new Set<string>();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await expect(async () => {
      await employeeInput.click();
      await employeeInput.fill('');
      await employeeInput.pressSequentially('4', { delay: 60 });
      await expect(options.first()).toBeVisible({ timeout: 3000 });
    }, 'employee suggestions should appear after typing').toPass({ timeout: 20000 });

    const labels = (await options.allTextContents()).map((t) => t.trim());
    const untried = labels
      .map((label, index) => ({ label, index }))
      .filter((o) => !tried.has(o.label));
    if (untried.length === 0) break;

    const pick = pickRandom(untried);
    tried.add(pick.label);

    // Register BEFORE the click that triggers the request
    const detailsResponse = page.waitForResponse(
      (r) => r.url().includes('/elms/ExtensionOfContractPeriodDetails'),
      { timeout: 15000 }
    );
    await options.nth(pick.index).click();
    const body = await (await detailsResponse).json().catch(() => null);
    const hasRecords = body?.errorcode === 1;

    console.log(
      `Attempt ${attempt}: ${pick.label} -> ${hasRecords ? 'has records' : 'no records, trying another'}`
    );

    if (hasRecords) {
      const employeeId = pick.label.split('-')[0].trim();
      await expect(employeeInput).toHaveValue(new RegExp(employeeId));
      await page.waitForTimeout(PAUSE_MS);
      return pick.label;
    }
  }

  throw new Error(
    `No employee with contract-extension records found after ${tried.size} attempts. ` +
      `Check that UAT has at least one employee with a contract to extend.`
  );
}

/** Selects a random real leave type (skips the "--Select Leave Type--" placeholder, value -1). */
async function selectRandomLeaveType(page: Page): Promise<string> {
  const leaveSelect = page.locator('select[name="selectedLeave"]');
  const realOptions = leaveSelect.locator('option:not([value="-1"])');

  await expect(realOptions.first()).toBeAttached({ timeout: 15000 });

  const all = await realOptions.evaluateAll((els) =>
    els.map((e) => ({
      value: (e as HTMLOptionElement).value,
      label: (e.textContent ?? '').trim(),
    }))
  );
  const chosen = pickRandom(all);
  console.log(`Selected leave type: ${chosen.label} (value ${chosen.value})`);

  await leaveSelect.selectOption(chosen.value);
  await expect(leaveSelect).toHaveValue(chosen.value);
  return chosen.label;
}

/**
 * Moves the datepicker to the requested month/year, clicking next or previous
 * as needed. Reads the month and year currently shown from the calendar text.
 */
async function showDatepickerMonth(page: Page, year: number, monthIndex: number) {
  const calendar = page.locator('bs-days-calendar-view').first();
  const monthRegex = new RegExp(MONTHS.join('|'));

  for (let i = 0; i < 48; i++) {
    const text = await calendar.innerText();
    const shownMonth = MONTHS.findIndex((m) => m === (text.match(monthRegex)?.[0] ?? ''));
    const shownYear = Number(text.match(/\b(19|20)\d{2}\b/)?.[0]);
    if (shownMonth === monthIndex && shownYear === year) return;

    const diff = (year - shownYear) * 12 + (monthIndex - shownMonth);
    const button = page
      .locator(`bs-datepicker-navigation-view button.${diff > 0 ? 'next' : 'previous'}`)
      .first();
    await button.click();
  }
  throw new Error(`Could not navigate the datepicker to ${MONTHS[monthIndex]} ${year}`);
}

/** Picks the given date in the "New Contract End Date" datepicker. */
async function pickNewContractEndDate(page: Page, target: Date) {
  const newEndInput = page.locator('input[name="leavecreditfrom"]');
  await newEndInput.click();

  await showDatepickerMonth(page, target.getUTCFullYear(), target.getUTCMonth());

  // Exclude greyed-out days from the previous/next month that share the same number
  await page
    .locator('bs-days-calendar-view')
    .first()
    .locator(`[bsdatepickerdaydecorator]:not(.is-other-month) >> text="${target.getUTCDate()}"`)
    .first()
    .click();
}

// --- Test -------------------------------------------------------------

test('Extension Of Contract Period - random employee, leave type, date and balance', async ({ page }) => {
  await test.step('Login', async () => {
    await login(page);
  });

  await test.step('Open Extension Of Contract Period', async () => {
    await navigateToExtensionOfContractPeriod(page);
  });

  await test.step('Select a random employee', async () => {
    await selectRandomEmployeeWithRecords(page);
  });

  await test.step('Select a random leave type', async () => {
    await selectRandomLeaveType(page);
  });

  let oldEnd: Date;
  await test.step('Read the old contract end date', async () => {
    const oldEndInput = page.locator('input[name="contracttodate"]');
    // Filled by the app once the leave type is chosen (the field itself is disabled)
    await expect(oldEndInput).not.toHaveValue('', { timeout: 15000 });
    const raw = await oldEndInput.inputValue();
    oldEnd = parseUiDate(raw);
    console.log(`Old contract end date: "${raw}" -> ${oldEnd.toISOString().slice(0, 10)}`);
  });

  await test.step('Pick a new contract end date after the old one', async () => {
    // Random date 1-30 days after the old contract end date
    const newEnd = new Date(oldEnd.getTime() + randomInt(1, 30) * 24 * 60 * 60 * 1000);
    console.log(`Picking new contract end date: ${newEnd.toISOString().slice(0, 10)}`);

    await pickNewContractEndDate(page, newEnd);

    const newEndInput = page.locator('input[name="leavecreditfrom"]');
    await expect(newEndInput).not.toHaveValue('');
    const picked = parseUiDate(await newEndInput.inputValue());
    expect(picked.getTime(), 'new contract end date must be after the old one').toBeGreaterThan(
      oldEnd.getTime()
    );
  });

  await test.step('Enter a random new balance', async () => {
    const newBalance = String(randomInt(1, 30));
    console.log(`New balance: ${newBalance}`);
    const balanceInput = page.locator('#contract_opening_bal');
    await balanceInput.click();
    await balanceInput.fill(newBalance);
    await expect(balanceInput).toHaveValue(newBalance);
  });

  await test.step('Submit', async () => {
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForTimeout(PAUSE_MS);
    // Screenshot of whatever the app shows after submit (toast / dialog)
    await page.screenshot({ path: 'test-results/extension-contract-after-submit.png' });
    await closeResultDialogIfPresent(page);
  });

  // TODO: replace with a real success assertion once the confirmation
  // dialog/toast text is confirmed, e.g.:
  // await expect(page.getByText('...successfully...')).toBeVisible();
});