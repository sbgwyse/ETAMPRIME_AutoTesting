import { test, expect, Page } from '@playwright/test';

test.setTimeout(120000);

const USERNAME = process.env.ETAM_USERNAME || 'ADMIN/etam480';
const PASSWORD = process.env.ETAM_PASSWORD || '$WysE123';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function waitForOverlayGone(page: Page, timeout = 15000) {
  await page
    .locator('.ngx-overlay, ngx-ui-loader, .p-component-overlay-mask, .p-sidebar-mask')
    .first()
    .waitFor({ state: 'hidden', timeout })
    .catch(() => {});
}

/**
 * Closes whichever PrimeNG multiselect panel is currently open. Confirmed
 * root cause via a real timeout: the Employee multiselect here was opened
 * (`--Select Employee--` click) and a checkbox selected inside it, but the
 * panel was never closed — its `.p-multiselect-header` sat on top of the
 * page and blocked the later Submit click for the full 120s test timeout
 * ("...subtree intercepts pointer events"). Same class of issue already
 * fixed elsewhere in this app (Compare/Lock Attendance, LOP filters):
 * scope the close click to the panel that's actually open (unscoped
 * selectors are a strict-mode violation when multiple multiselects exist
 * on the page), and fall back to a neutral outside-click if the trigger
 * icon itself isn't clickable.
 */
async function closeOpenMultiselect(page: Page) {
  const trigger = page.locator('.p-multiselect-open .p-multiselect-trigger-icon');
  if (await trigger.count()) {
    await trigger.first().click().catch(() => {});
  }
  const panel = page.locator('.p-multiselect-panel:visible, .p-multiselect-open').first();
  if (await panel.count()) {
    // Fallback: click a neutral point outside any panel to force-close it.
    await page.mouse.click(1400, 100).catch(() => {});
  }
  await panel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/**
 * Picks a random employee from the open multiselect panel.
 * Checkbox 0 in the panel is the "select all" checkbox in the header, so it is
 * skipped (same as the old fixed `nth(1)`); the random pick is from 1..count-1.
 */
async function selectRandomEmployee(page: Page): Promise<number> {
  const checkboxes = page.locator('.p-multiselect-panel').getByRole('checkbox');

  // wait until at least one employee (index 1) is in the list
  await checkboxes.nth(1).waitFor({ state: 'attached', timeout: 15000 });

  const count = await checkboxes.count();
  const index = randomInt(1, count - 1);
  await checkboxes.nth(index).click();
  return index;
}

/**
 * Picks a random Reporting Officer from the RO dropdown.
 * Skips the placeholder / disabled options (empty value).
 */
async function selectRandomRO(page: Page): Promise<string> {
  const roSelect = page.locator('select[name="ro"]');

  // wait until the RO list has real options (not just the placeholder)
  const getValues = async () =>
    roSelect.locator('option').evaluateAll((opts) =>
      (opts as HTMLOptionElement[])
        .filter((o) => o.value && o.value.trim() !== '' && !o.disabled)
        .map((o) => o.value)
    );

  await expect.poll(async () => (await getValues()).length, { timeout: 15000 }).toBeGreaterThan(0);

  const values = await getValues();
  const value = values[randomInt(0, values.length - 1)];
  await roSelect.selectOption(value);
  return value;
}

test('Edit Reporting Structure', async ({ page }) => {

  // ==========================
  // LOGIN
  // ==========================
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');

  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await waitForOverlayGone(page);

  console.log('Login Successful');

  // ==========================
  // NAVIGATE TO ELMS > eLMS Uploads > Edit Reporting Structure
  // ==========================
  await page.getByText('ELMS').click();
  await page.getByRole('combobox').selectOption('eLMS Uploads');
  await page
    .locator('app-elms-uploads')
    .getByRole('combobox')
    .selectOption('Edit Reporting Structure');
  await waitForOverlayGone(page);

  console.log('Edit Reporting Structure Opened');

  // ==========================
  // SELECT EMPLOYEE (RANDOM)
  // ==========================
  await page.getByText('--Select Employee--').click();
  const employeeIndex = await selectRandomEmployee(page);
  await waitForOverlayGone(page);

  // Close the panel before moving on — this is the step that was missing
  // and caused the Submit click to hang (see closeOpenMultiselect above).
  await closeOpenMultiselect(page);

  console.log(`Employee Selected (random checkbox index ${employeeIndex})`);

  // ==========================
  // SELECT REPORTING OFFICER (RO) (RANDOM)
  // ==========================
  const roValue = await selectRandomRO(page);
  await waitForOverlayGone(page);

  console.log(`RO Selected (random): ${roValue}`);

  // ==========================
  // SUBMIT
  // ==========================
  await page.getByRole('button', { name: 'Submit' }).click();
  await waitForOverlayGone(page);

  console.log('Submit Clicked');

  // ==========================
  // CONFIRMATION DIALOG CLOSE (best-effort)
  // ==========================
  // NOTE: icon-only button, no accessible name in the recording. Kept
  // optional with a short timeout so it doesn't block the whole test
  // if no such dialog actually appears for this flow (as happened with
  // Upload Reporting Structure).
  try {
    await page.getByRole('button').filter({ hasText: /^$/ }).click({ timeout: 5000 });
    console.log('Confirmation Dialog Closed');
  } catch {
    console.log('No confirmation dialog appeared — continuing.');
  }

  console.log('Process Completed');
});