import { test, expect, Page } from '@playwright/test';

// ETAM Prime — Apply Mobile Setting workflow
// Cleaned up from a second, simpler raw recording of this screen. Random
// selection added for Department and Location. A few positional/ambiguous
// locators from the recording are kept as-is (flagged below) since there's
// not yet enough visual confirmation to replace them safely.

async function login(page: Page) {
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  // Pressing Enter already submits the form — don't also click 'Sign In'
  // afterwards. The raw recording did both, which double-submits and
  // collides with the loader overlay (same issue flagged elsewhere in this suite).
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');
  await page.getByText('ADMINISTRATION').waitFor({ state: 'visible' });
}

async function waitForLoaderHidden(page: Page) {
  const loader = page.locator('.ngx-overlay, ngx-ui-loader');
  await loader.first().waitFor({ state: 'hidden' }).catch(() => {});
}

// Opens the Department multiselect and ticks ONE random department
// (index 0 is the panel's own "select all" toggle checkbox, confirmed via
// screenshot — skipped so this doesn't accidentally select everything).
async function selectRandomDepartment(page: Page): Promise<string> {
  await page.getByText('--Select a Department--').click();
  const panel = page.locator('.p-multiselect-panel').first();
  await panel.waitFor({ state: 'visible' });
  await waitForLoaderHidden(page);

  const departmentCheckboxes = panel.getByRole('checkbox');
  const count = await departmentCheckboxes.count();
  const randomIndex = 1 + Math.floor(Math.random() * (count - 1));
  const chosen = departmentCheckboxes.nth(randomIndex);

  // Best-effort label extraction: walk up to the nearest row-like ancestor
  // and read its text, since the checkbox itself has no visible text.
  // TODO: unconfirmed exact row markup — if this comes back empty, inspect
  // one row in DevTools and swap in a more precise ancestor selector.
  const chosenLabel = await chosen
    .evaluate((el) => (el.closest('div, li') as HTMLElement | null)?.textContent?.trim() ?? '')
    .catch(() => '');

  await chosen.click();
  console.log(`Selected department: ${chosenLabel || '(label unresolved)'}`);

  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' }).catch(() => {});

  return chosenLabel;
}

test('Apply Mobile Setting - random department and location', async ({ page }) => {
  await login(page);

  await page.getByText('ADMINISTRATION').click();
  await page.getByRole('combobox').selectOption('Apply Mobile Setting');

  const department = await selectRandomDepartment(page);
  console.log(`Department: ${department}`);

  // Select-all header checkbox in the employee grid.
  await waitForLoaderHidden(page);
  await page.locator('p-tableheadercheckbox > .p-checkbox > .p-checkbox-box').click();

  // TODO(fragile, still unresolved): unlabeled Attendance/SM Features
  // checkboxes, driven by a generic Angular state-class selector that
  // changes after each click — so each `.first()` call naturally advances
  // to the next still-untouched checkbox rather than re-clicking the same
  // one. Reproduced positionally as recorded (4 clicks). Still needs a
  // screenshot with the Department panel closed to confirm these against
  // real labels.
  for (let i = 0; i < 4; i++) {
    await page.locator('.p-element.ng-untouched.ng-pristine.ng-valid > .p-checkbox > .p-checkbox-box').first().click();
  }

  // TODO(fragile, unconfirmed): another single checkbox via a positional
  // selector, distinct from the generic ng-untouched pattern above — what
  // this actually toggles is unknown.
  await page.locator('div:nth-child(6) > .col-sm-8 > .row > div > .p-element > .p-checkbox > .p-checkbox-box').first().click();

  await page.getByRole('button', { name: 'Modify' }).click();

  // TODO(fragile, unconfirmed): 'Mobile LocationTaj Wellington' looks like a
  // merged label+value text match — the same accessible-name-merging quirk
  // seen with "In Time * Out Time * Reason" elsewhere in this suite —
  // rather than one real element with that literal concatenated text.
  // Kept as recorded since removing it might skip a step needed to reveal
  // the location dropdown below, but confirm via DevTools before trusting it.
  await page.getByText('Mobile LocationTaj Wellington').click();

  // --- Select a random location ---
  const locationDropdown = page.locator('select[name="location"]');
  const locationValues = await locationDropdown.locator('option').evaluateAll((opts) =>
    (opts as HTMLOptionElement[])
      .filter((o) => !(o.textContent ?? '').trim().startsWith('--'))
      .map((o) => o.value)
  );
  const randomLocation = locationValues[Math.floor(Math.random() * locationValues.length)];
  await locationDropdown.selectOption(randomLocation);
  console.log(`Selected location: ${randomLocation}`);

  await page.getByRole('button', { name: 'Modify' }).click();
});