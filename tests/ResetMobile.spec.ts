import { test, expect, Page } from '@playwright/test';

// ETAM Prime — Reset Mobile Setting workflow
// Cleaned up from a raw codegen recording. Department and Designation are
// now selected randomly. Several middle steps are ambiguous (no screenshot
// yet to confirm what they actually toggle) and are kept positionally as
// recorded, flagged below.

async function waitForLoaderHidden(page: Page) {
  const loader = page.locator('.ngx-overlay, ngx-ui-loader');
  await loader.first().waitFor({ state: 'hidden' }).catch(() => {});
}

// Opens the Department multiselect and ticks ONE random department.
// Mirrors the same panel confirmed via screenshot on the Apply Mobile
// Setting screen: index 0 is the panel's own "select all" toggle, skipped
// here so this doesn't accidentally select every department.
async function selectRandomDepartment(page: Page): Promise<string> {
  await page.getByText('--Select a Department--').click();
  const panel = page.locator('.p-multiselect-panel').first();
  await panel.waitFor({ state: 'visible' });
  await waitForLoaderHidden(page);

  const departmentCheckboxes = panel.getByRole('checkbox');
  const count = await departmentCheckboxes.count();
  const randomIndex = 1 + Math.floor(Math.random() * (count - 1));
  const chosen = departmentCheckboxes.nth(randomIndex);

  const chosenLabel = await chosen
    .evaluate((el) => (el.closest('div, li') as HTMLElement | null)?.textContent?.trim() ?? '')
    .catch(() => '');

  await chosen.click();
  console.log(`Selected department: ${chosenLabel || '(label unresolved)'}`);

  return chosenLabel;
}

test('Reset Mobile Setting - random department and designation', async ({ page }) => {
  // ---- Login ----
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // ---- Navigate to Reset Mobile Setting ----
  await page.getByText('ADMINISTRATION').click();
  await page.getByRole('combobox').selectOption('Reset Mobile Setting');

  // ---- Department (random) ----
  const department = await selectRandomDepartment(page);
  console.log(`Department: ${department}`);

  // TODO(fragile, unconfirmed): '.col-sm-6' first() — a generic Bootstrap
  // column wrapper, not a specific control. Unclear what this is actually
  // clicking (could be expanding a section, or an unrelated layout column).
  // Needs a screenshot of this screen with the Department panel closed to
  // identify the real target.
  await page.locator('.col-sm-6').first().click();

  // TODO(fragile, unconfirmed): another `checkbox nth(1)` click here — with
  // the Department panel already closed by this point, it's unclear what
  // checkbox this is now hitting (possibly a different multiselect opened
  // by the '.col-sm-6' click above, possibly something else entirely).
  await page.getByRole('checkbox').nth(1).click();

  // TODO(fragile, unconfirmed): unnamed button — likely closing whatever
  // panel the checkbox above belongs to, similar to the close-button
  // ambiguity resolved elsewhere in this suite (Assign Weekly Off, Apply
  // Mobile Setting) by switching to Escape. Left as recorded since it's not
  // yet confirmed this is the same kind of control.
  await page.getByRole('button').filter({ hasText: /^$/ }).click();

  // TODO(fragile, unconfirmed): a third `checkbox nth(1)` click — same
  // caveat as above, target unconfirmed.
  await page.getByRole('checkbox').nth(1).click();

  // ---- Designation (random) ----
  const designationDropdown = page.locator('select[name="designname"]');
  const designationValues = await designationDropdown.locator('option').evaluateAll((opts) =>
    (opts as HTMLOptionElement[])
      .filter((o) => !(o.textContent ?? '').trim().startsWith('--'))
      .map((o) => o.value)
  );
  const randomDesignation = designationValues[Math.floor(Math.random() * designationValues.length)];
  await designationDropdown.selectOption(randomDesignation);
  console.log(`Selected designation: ${randomDesignation}`);

  await page.getByRole('button', { name: 'Reset Mobile Settings' }).click();
});