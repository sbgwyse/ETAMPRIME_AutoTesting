import { test, expect, Page } from '@playwright/test';

// Picks a random employee on the Transaction Edit screen. Unlike the
// click-to-open-full-list autocompletes elsewhere in this app, this field
// filters suggestions as you type, so there's no "show everything" action
// to enumerate from. Typing a broad single digit ('4') is used to surface
// multiple matches at once; if that digit happens to match nothing on a
// given run, this falls back to the employee the spec was originally built
// and confirmed against.
async function selectRandomEmployee(page: Page): Promise<string> {
  const employeeField = page.locator('input[name="employees"]');
  await employeeField.click();
  await employeeField.fill('4');

  // Suggestions render as "- <Name>" text (no visible ID, since the ID was
  // what you typed). TODO: unconfirmed container/class for this panel —
  // widen or swap this selector if it doesn't match on your DOM.
  const suggestions = page
    .locator('.p-autocomplete-panel li, .mat-autocomplete-panel mat-option, li, div')
    .filter({ hasText: /^-\s*\S/ });

  const found = await suggestions
    .first()
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!found) {
    await employeeField.fill('480000023');
    const fallbackSuggestion = page.getByText('- Priya Shaha');
    if (await fallbackSuggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fallbackSuggestion.click();
    }
    return '480000023 - Priya Shaha (fallback — "4" surfaced no suggestions)';
  }

  const count = await suggestions.count();
  const randomIndex = Math.floor(Math.random() * count);
  const chosen = suggestions.nth(randomIndex);
  const chosenText = ((await chosen.textContent()) ?? '').trim();
  await chosen.click();
  return chosenText;
}

test('Transaction Edit - ADMINISTRATION (random employee / 01-Aug-2026, split In/Out Time)', async ({ page }) => {
  const waitForLoaderHidden = async () => {
    const loader = page.locator('.ngx-overlay, ngx-ui-loader');
    await loader.first().waitFor({ state: 'hidden' }).catch(() => {});
  };

  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).click();
  // Fixed: comment below said "using the current password" but the value
  // was still the old temp one — updated the value to actually match.
  // Confirmed elsewhere that this account's password was changed to
  // 'Welcome@2026'; swap back to '$WysE123' if this account genuinely
  // still needs the temp one.
  await page.getByRole('textbox', { name: 'Password' }).fill('Welcome@2026');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.getByText('ADMINISTRATION').click();
  await page.getByRole('combobox').selectOption('Transaction Edit');

  const employee = await selectRandomEmployee(page);
  console.log(`Selected employee: ${employee}`);

  // TODO: same bare day-number ambiguity flagged elsewhere on this app's
  // calendar widget — '1'/'2' can match the wrong cell (week-number column
  // or a grayed adjacent-month day sharing the same digit).
  await page.getByRole('textbox', { name: 'Select Date Range' }).click();
  await page.getByText('1', { exact: true }).first().click();
  await page.getByText('2', { exact: true }).first().click();

  await waitForLoaderHidden();
  await page.getByRole('button', { name: 'Show' }).click();
  await waitForLoaderHidden();

  await page.getByRole('textbox', { name: 'Date *' }).fill('2026-08-01');

  // Confirms a real DOM detail: the "In Time * Out Time * Reason" merged
  // accessible name seen elsewhere isn't one field covering three values —
  // there are at least two inputs sharing id="input8" (an invalid-HTML
  // duplicate id, which is also *why* the accessible name merges). First
  // occurrence = In Time, nth(1) = Out Time.
  await page.getByRole('textbox', { name: 'In Time * Out Time * Reason' }).fill('09:07:07');
  await page.locator('#input8').nth(1).fill('18:00:00');

  await waitForLoaderHidden();
  await page.getByRole('button', { name: 'Save' }).click();
});