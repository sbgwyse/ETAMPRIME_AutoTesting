import { test, expect, Page } from '@playwright/test';

// Picks a random employee on the Monthly Employee Wise Present Days screen.
// The raw recording just .fill()'d the full "<ID> - <Name>" string directly
// into the field with no suggestion click — which only works if you already
// know a valid, exact "ID - Name" pair. To pick randomly, this instead types
// a broad partial digit to surface the autocomplete's suggestions and clicks
// one, the same type-to-filter pattern used in the Transaction Edit spec.
// TODO: unconfirmed whether this field's suggestion panel renders "<ID> -
// <Name>" (like the Assign Menu chevron lists) or just "- <Name>" (like
// Transaction Edit) — the selector below matches either shape.
async function selectRandomEmployee(page: Page): Promise<string> {
  const employeeField = page.locator('input[name="emp"]');
  await employeeField.click();
  await employeeField.fill('1');

  const suggestions = page
    .locator('.p-autocomplete-panel li, .mat-autocomplete-panel mat-option, li, div')
    .filter({ hasText: /(^-\s*\S)|(^\d+\s*-\s*.+)/ });

  const found = await suggestions
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!found) {
    // Fallback: '1' surfaced no suggestions on this run — keep the
    // originally confirmed employee rather than submitting a blank/invalid
    // value.
    await employeeField.fill('100000001 - Shiv Kumar');
    return '100000001 - Shiv Kumar (fallback — "1" surfaced no suggestions)';
  }

  const count = await suggestions.count();
  const randomIndex = Math.floor(Math.random() * count);
  const chosen = suggestions.nth(randomIndex);
  const chosenText = ((await chosen.textContent()) ?? '').trim();
  await chosen.click();
  return chosenText;
}

test('Monthly Employee Wise Present Days - edit existing entry (random employee / July)', async ({ page }) => {
  const waitForLoaderHidden = async () => {
    const loader = page.locator('.ngx-overlay, ngx-ui-loader');
    await loader.first().waitFor({ state: 'hidden' }).catch(() => {});
  };
  const clickSaveOrModify = async () => {
    const save = page.getByRole('button', { name: 'SAVE' });
    const modify = page.getByRole('button', { name: 'Modify' });
    const button = (await save.isVisible().catch(() => false)) ? save : modify;
    await button.waitFor({ state: 'visible', timeout: 15000 });
    await button.click();
  };
  const checkForDuplicateEntryError = async () => {
    const errorToast = page.getByText('Already Exist for Specified Period');
    if (await errorToast.isVisible({ timeout: 3000 }).catch(() => false)) {
      throw new Error(
        'Save rejected: an entry for this employee/month already exists ("Already Exist for Specified Period"). ' +
        'Load the existing row from the table first if the intent is to edit it, rather than submitting as new.'
      );
    }
  };

  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.getByText('ADMINISTRATION').click();
  await page.getByRole('combobox').selectOption('Monthly Employee Wise Present Days');

  const employee = await selectRandomEmployee(page);
  console.log(`Selected employee: ${employee}`);

  await page.getByRole('spinbutton', { name: 'Present Days *' }).click();
  await page.locator('select[name="month"]').selectOption('July');
  await page.getByRole('spinbutton', { name: 'Present Days *' }).click();
  await page.getByRole('spinbutton', { name: 'Present Days *' }).fill('25');

  await waitForLoaderHidden();
  await clickSaveOrModify();
  await checkForDuplicateEntryError();
});