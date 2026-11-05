import { test, expect, Page } from '@playwright/test';

// ETAM Prime — ELMS > eLMS Configuration > Update e-Mail Id
// One login, one random employee (unless an ID is given), Update, finish.

const FIXED_EMPLOYEE_ID = process.env.ETAM_EMAIL_EMPLOYEE ?? ''; // empty = random employee
const NEW_EMAIL = process.env.ETAM_NEW_EMAIL ?? 'pri@email.com';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function login(page: Page) {
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');
}

async function navigateToUpdateEmailId(page: Page) {
  await page.getByText('ELMS').click();
  await page.getByRole('combobox').selectOption('eLMS Configuration');
  await page
    .locator('app-elms-configuration')
    .getByRole('combobox')
    .selectOption('Update e-Mail Id');
}

/**
 * Selects an employee in the PrimeNG autocomplete.
 *  - with employeeId -> types it and picks the first match
 *  - without         -> opens the list and picks a random item
 * Uses the panel/item classes instead of the auto-generated `#pr_id_5_list`,
 * which changes between sessions.
 */
async function selectEmployee(page: Page, employeeId?: string): Promise<string> {
  const employeeInput = page.locator('input[name="emp"]');
  await expect(employeeInput).toBeVisible();
  await employeeInput.click();

  const items = page.locator('.p-autocomplete-panel .p-autocomplete-item');

  if (employeeId) {
    await employeeInput.pressSequentially(employeeId, { delay: 100 });
    await expect(items.first()).toBeVisible({ timeout: 15_000 });
    const item = items.filter({ hasText: employeeId }).first();
    const label = (await item.innerText()).trim();
    await item.click();
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

/** Waits for the success toast after Update. Fails the test if it doesn't appear. */
async function expectUpdateSuccess(page: Page): Promise<string> {
  // The app currently shows "Emaild Id Updated Successfully" (typo); the regex also
  // matches the corrected "Email Id Updated Successfully".
  // Matched by text only: the app's toast is not a PrimeNG .p-toast-message.
  const toast = page.getByText(/Emaild?\s+Id\s+Updated\s+Successfully/i).first();

  await expect(toast, 'success toast should appear after Update').toBeVisible({ timeout: 15_000 });

  const text = (await toast.innerText()).trim().replace(/\s+/g, ' ');
  console.log('Success toast:', text);
  return text;
}

async function updateEmailId(page: Page, newEmail: string, employeeId?: string) {
  await navigateToUpdateEmailId(page);
  await selectEmployee(page, employeeId);

  const emailInput = page.getByRole('textbox').last();
  await emailInput.click();
  await emailInput.fill(newEmail);

  await page.getByRole('button', { name: 'Update' }).click();
}

test('eLMS Configuration - Update e-Mail Id', async ({ page }) => {
  await login(page);

  await updateEmailId(page, NEW_EMAIL, FIXED_EMPLOYEE_ID || undefined);

  // ---- Finish: test ends as soon as the success popup is seen ----
  await expectUpdateSuccess(page);

  console.log('Test finished: e-Mail Id updated successfully.');
});