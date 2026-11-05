import { test, expect, Page } from '@playwright/test';

// ETAM Prime — ELMS > eLMS Configuration > Mark Reporting Officer (RO)
// One login, one employee (random unless an ID is passed), Save, finish.

const FIXED_EMPLOYEE_ID = process.env.ETAM_RO_EMPLOYEE ?? ''; // empty = random employee

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function login(page: Page) {
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');
}

async function navigateToMarkReportingOfficer(page: Page) {
  await page.getByText('ELMS').click();
  await page.getByRole('combobox').selectOption('eLMS Configuration');
  await page
    .locator('app-elms-configuration')
    .getByRole('combobox')
    .selectOption('Mark Reporting Officer (RO)');
}

/**
 * Selects an employee in the autocomplete.
 *  - with employeeId -> types it and picks the match
 *  - without         -> opens the list and picks a random item
 */
async function selectEmployee(page: Page, employeeId?: string): Promise<string> {
  const employeeInput = page.locator('input[name="emp"]');
  await expect(employeeInput).toBeVisible();
  await employeeInput.click();

  const panel = page.locator('.p-autocomplete-panel');
  const items = panel.locator('.p-autocomplete-item');

  if (employeeId) {
    await employeeInput.pressSequentially(employeeId, { delay: 100 });
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const option = panel.getByText(employeeId, { exact: false }).first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    const label = (await option.innerText()).trim();
    await option.click();
    console.log('Employee selected:', label);
    return label;
  }

  // Random: open the list via the dropdown button (retry, it sometimes only focuses the field)
  const dropdownButton = page.locator('p-autocomplete').getByRole('button');
  for (let i = 1; i <= 3; i++) {
    if (await dropdownButton.count()) await dropdownButton.first().click();
    if (await items.first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) break;
    console.log(`Employee list did not open (try ${i}), retrying`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await expect(items.first(), 'employee list should be open').toBeVisible({ timeout: 5_000 });

  const item = items.nth(randomInt(0, (await items.count()) - 1));
  const label = (await item.innerText()).trim();
  await item.click();
  console.log('Employee selected:', label);
  return label;
}

/** Dismisses the popup/toast shown after Save and returns its text. */
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

async function markReportingOfficer(page: Page, employeeId?: string) {
  await navigateToMarkReportingOfficer(page);
  await selectEmployee(page, employeeId);

  const panel = page.locator('.p-autocomplete-panel');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' }).catch(() => {});

  const roCheckbox = page.locator('#RO > .p-checkbox > .p-checkbox-box');
  await expect(roCheckbox).toBeVisible();
  await expect(roCheckbox).toBeEnabled();

  const isChecked = await roCheckbox.evaluate((el) => el.classList.contains('p-highlight'));
  console.log(isChecked ? 'RO already marked, saving as is' : 'Marking RO');
  if (!isChecked) await roCheckbox.click();
  await expect(roCheckbox).toHaveClass(/p-highlight/);

  await page.getByRole('button', { name: 'Save' }).click();
}

test('eLMS Configuration - Mark Reporting Officer (RO)', async ({ page }) => {
  await login(page);

  await markReportingOfficer(page, FIXED_EMPLOYEE_ID || undefined);

  // ---- Finish ----
  const resultText = await closeResultPopup(page);
  expect(resultText, 'save result should not be an error').not.toMatch(/error|fail|invalid|not allowed/i);
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

  console.log('Test finished: RO marked and saved.');
});