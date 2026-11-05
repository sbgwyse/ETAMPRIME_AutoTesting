import { test, expect, Page } from '@playwright/test';

// ---- Shared helpers (mirrors resetMobileSetting.spec.ts / applyMobileSetting.spec.ts) ----

async function login(page: Page) {
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).not.toHaveURL(/login/);
  await page.getByText('ADMINISTRATION').waitFor({ state: 'visible' });
}

async function waitForLoaderHidden(page: Page) {
  const loader = page.locator('.ngx-overlay, ngx-ui-loader');
  await loader.first().waitFor({ state: 'hidden' }).catch(() => {});
}

// Picks a random employee from the Employee ID field on the Assign Menu
// screen. Clicking the plain input directly (confirmed by screenshot) opens
// a floating panel listing employees as "<ID> - <Name>". That panel does
// NOT appear to expose ARIA listbox/option roles — getByRole('listbox')
// found nothing and just timed out silently — so instead this matches
// directly on the visible "<digits> - <text>" pattern each row renders as,
// regardless of what tag/role the row actually uses.
async function selectRandomEmployeeId(page: Page): Promise<string> {
  const field = page.locator('#employeeid');
  await field.click();

  const employeeIdRowPattern = /^\d+\s*-\s*.+/;
  const employeeOptions = page
    .locator('li, a, button, div')
    .filter({ hasText: employeeIdRowPattern })
    .filter({ hasNot: page.locator('li, a, button, div') }); // leaf nodes only — skip wrappers that merely contain a matching child

  await employeeOptions.first().waitFor({ state: 'visible', timeout: 15000 });

  const count = await employeeOptions.count();
  const randomIndex = Math.floor(Math.random() * count);
  const chosen = employeeOptions.nth(randomIndex);

  const chosenText = ((await chosen.textContent()) ?? '').trim();
  console.log(`Selected employee: ${chosenText}`);

  await chosen.click();
  await waitForLoaderHidden(page);

  return chosenText;
}

test('Assign Menu - ADMINISTRATION', async ({ page }) => {
  await login(page);

  await page.getByText('ADMINISTRATION').click();
  await page.getByRole('combobox').selectOption('Assign Menu');

  // --- Employee 1 (random) ---
  const employee1 = await selectRandomEmployeeId(page);

  // TODO: this block relies on generic PrimeNG/mat state classes and
  // positional div:nth-child selectors, none of which are confirmed labels.
  // The screenshot for this screen shows an "All RO" checkbox and ETAM/ELMS
  // radio buttons rather than the checkbox/module-tree layout assumed below —
  // worth re-checking this section against the live screen before relying on it.
  await page.locator('.p-checkbox-box').first().click();
  await page.locator('.mat-radio-outer-circle').first().click();
  await page.locator('.p-element.ng-untouched > .p-checkbox > .p-checkbox-box').first().click();

  await page.getByText('Shift Upload').click();
  await page.locator('div:nth-child(3) > .p-element > .p-checkbox > .p-checkbox-box').click();
  await page.locator('div:nth-child(4) > .p-element > .p-checkbox > .p-checkbox-box').click();

  await waitForLoaderHidden(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await waitForLoaderHidden(page);

  // --- Employee 2 (random) ---
  const employee2 = await selectRandomEmployeeId(page);

  await page.locator('.mat-radio-outer-circle').first().click();
  // #ELMS is a confirmed stable id — leave as-is
  await page.locator('#ELMS > .mat-radio-label > .mat-radio-container > .mat-radio-outer-circle').click();
  await page.locator('.p-element.ng-untouched > .p-checkbox > .p-checkbox-box').first().click();
  await page.locator('.p-fluid > div:nth-child(2) > .p-element > .p-checkbox > .p-checkbox-box').click();

  await waitForLoaderHidden(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await waitForLoaderHidden(page);

  // --- Delete All RO Rights ---
  await page.getByRole('button', { name: 'Delete All RO Rights' }).click();
  await page.getByRole('button', { name: 'Yes, delete it!' }).click();
  await waitForLoaderHidden(page);

  console.log(`Assign Menu run complete for: ${employee1}, ${employee2}`);
});