import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://uatpresence.tajhotels.com/etam_prime/login';
const USERNAME = 'ADMIN/etam480';
const PASSWORD = '$WysE123';
const PAUSE_MS = 500;
const MIN_EMPLOYEES = 2; // random number of employees to tick: MIN..MAX
const MAX_EMPLOYEES = 3;

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pickDistinct = <T,>(items: T[], n: number): T[] =>
  [...items].sort(() => Math.random() - 0.5).slice(0, n);

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  // Enter alone submits; also clicking "Sign In" double-submits and hits the loader overlay
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');
  await page.locator('ngx-ui-loader, .ngx-overlay').first()
    .waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

/** Picks a random start/end day in the month shown by the range picker. */
async function pickRandomDateRange(page: Page) {
  const rangeInput = page.getByRole('textbox', { name: 'Select Date Range' });
  await rangeInput.click();

  // Two calendars are shown; the left one can be cut off by the window edge,
  // so use the right-most one that is fully inside the viewport.
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

/** Opens the department dropdown and selects every department. */
async function selectAllDepartments(page: Page) {
  await page.getByText('--Select a Department--').click();

  const selectAll = page.getByRole('checkbox', { name: /select all/i })
    .or(page.getByText(/^\s*select all\s*$/i)).first();

  if (await selectAll.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
    await selectAll.click();
  } else {
    // No "Select All": tick every checkbox in the open dropdown panel
    const items = page
      .locator('.dropdown-list, .p-multiselect-panel, .ng-dropdown-panel')
      .filter({ has: page.getByRole('checkbox') }).first().getByRole('checkbox');
    const count = await items.count();
    if (!count) throw new Error('Department dropdown: no "Select All" option or checkboxes found.');
    for (let i = 0; i < count; i++) {
      if (!(await items.nth(i).isChecked().catch(() => false))) await items.nth(i).click();
    }
  }

  await page.locator('.col-sm-6').first().click(); // click outside to close the dropdown
  await page.waitForTimeout(PAUSE_MS);
}

/** Clicks the ID cell (e.g. 480000023) of a random few employees in the table. */
async function selectRandomEmployees(page: Page) {
  const idCells = page.getByRole('cell', { name: /^\d{8,9}$/ });
  await expect(idCells.first(), 'employee table should list employees').toBeVisible({ timeout: 20000 });

  const ids: string[] = (await idCells.allTextContents()).map((t: string) => t.trim());
  const chosen = pickDistinct(ids, Math.min(ids.length, randomInt(MIN_EMPLOYEES, MAX_EMPLOYEES)));
  for (const id of chosen) await page.getByRole('cell', { name: id, exact: true }).click();
  console.log(`Selected ${chosen.length} of ${ids.length} employees: ${chosen.join(', ')}`);
}

/** Waits for the result popup, logs its text, screenshots it and closes it. */
async function closeResultPopup(page: Page) {
  const popup = page
    .locator('p-dialog, .p-dialog, .swal2-popup, mat-dialog-container, .modal.show, [role="dialog"], [role="alertdialog"]')
    .first();
  const shot = () => page.screenshot({ path: 'test-results/set-leave-encashment-after-click.png' });

  if (!(await popup.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false))) {
    console.log('No popup appeared after clicking Set Leave Encashment.');
    return shot();
  }
  console.log(`Popup message: ${(await popup.innerText()).replace(/\s+/g, ' ').trim()}`);
  await shot();

  await popup.getByRole('button', { name: /^(ok|close|done|yes|got it)$/i })
    .or(popup.locator('.swal2-confirm, .p-dialog-header-close, .p-dialog-header-icons button, button.close, [aria-label="Close"]'))
    .first().click();
  await expect(popup).toBeHidden({ timeout: 10000 });
}

test('Set Leave Encashment Within Year - random date range, all departments, random employees', async ({ page }) => {
  await test.step('Login', () => login(page));

  await test.step('Open Set Leave Encashment Within Year', async () => {
    await page.getByText('ELMS').click();
    await page.getByRole('combobox').selectOption('Set Leave Encashment Within Year');
    await page.waitForTimeout(PAUSE_MS);
  });

  await test.step('Include resigned employees', () =>
    page.getByRole('checkbox', { name: 'Resigned Employees' }).check());
  await test.step('Pick a random date range', () => pickRandomDateRange(page));
  await test.step('Select all departments', () => selectAllDepartments(page));
  await test.step('Select random employees', () => selectRandomEmployees(page));

  await test.step('Click Set Leave Encashment and close the popup', async () => {
    await page.getByRole('button', { name: 'Set Leave Encashment' }).click();
    await closeResultPopup(page);
  });

  // TODO: assert on the confirmation text once it is known, e.g.
  // await expect(page.getByText('...successfully...')).toBeVisible();
});