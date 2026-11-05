import { test, expect, Page } from '@playwright/test';

test.setTimeout(120000);

const USERNAME = 'ADMIN/etam480';
const PASSWORD = process.env.ETAM_PASSWORD || '$WysE123';

const STEP_TIMEOUT = 10000;

// Form data (only employee and leave type are random)
const CONTRACT_FROM = '01/01/2026';
const CONTRACT_TO = '31/12/2026';
const OPENING_BAL = '24';
const CLOSING_BAL = '0';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function waitForOverlayGone(page: Page, timeout = 15000) {
  await page
    .locator('.ngx-overlay, ngx-ui-loader, .p-component-overlay-mask, .p-sidebar-mask')
    .first()
    .waitFor({ state: 'hidden', timeout })
    .catch(() => {});
}

async function login(page: Page) {
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait for either the ELMS menu (success) or the red login alert (failure),
  // so a bad login fails here with the real message instead of timing out on ELMS.
  const elmsMenu = page.getByText('ELMS').first();
  const loginAlert = page.locator('app-login alert');
  await expect(elmsMenu.or(loginAlert).first()).toBeVisible({ timeout: 30000 });

  if (await loginAlert.isVisible()) {
    const message = (await loginAlert.innerText()).trim();
    throw new Error(`Login failed for "${USERNAME}": ${message}`);
  }

  await waitForOverlayGone(page);
  console.log(`Login Successful (${USERNAME})`);
}

async function navigateToLeaveBalanceUpdate(page: Page) {
  await page.getByText('ELMS').click({ timeout: STEP_TIMEOUT });
  await page.getByRole('combobox').selectOption('eLMS Uploads', { timeout: STEP_TIMEOUT });
  await page
    .locator('app-elms-uploads')
    .getByRole('combobox')
    .selectOption('Leave Balance Update', { timeout: STEP_TIMEOUT });
  await waitForOverlayGone(page);
  console.log('Leave Balance Update Opened');
}

/**
 * Picks a random employee from the autocomplete list.
 * Tries the dropdown button first; if the list doesn't open, types "5"
 * (employee IDs start with 5) to trigger suggestions.
 */
async function selectRandomEmployee(page: Page): Promise<string> {
  const input = page.locator('input[name="employees"]');
  const items = page.locator('.p-autocomplete-panel .p-autocomplete-item');

  await input.click({ timeout: STEP_TIMEOUT });

  const dropdownButton = page.locator('p-autocomplete').getByRole('button');
  if (await dropdownButton.count()) {
    await dropdownButton.first().click().catch(() => {});
  }

  const opened = await items.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (!opened) {
    await input.pressSequentially('5', { delay: 100 });
    await expect(items.first(), 'employee list should be open').toBeVisible({ timeout: STEP_TIMEOUT });
  }

  const item = items.nth(randomInt(0, (await items.count()) - 1));
  const label = (await item.innerText()).trim();
  await item.click();
  return label;
}

/** Picks a random leave type, skipping the "--Select Leave Type--" placeholder (value "-1"). */
async function selectRandomLeave(page: Page): Promise<string> {
  const leaveSelect = page.locator('select[name="selectedLeave"]');

  const getOptions = async () =>
    leaveSelect.locator('option').evaluateAll((opts) =>
      (opts as HTMLOptionElement[])
        .filter((o) => {
          const value = o.value?.trim();
          const label = o.textContent?.trim() ?? '';
          return value && value !== '-1' && value !== '0' && !label.startsWith('--') && !o.disabled;
        })
        .map((o) => ({ value: o.value, label: (o.textContent ?? '').trim() }))
    );

  // leave list can load after the employee is chosen
  await expect.poll(async () => (await getOptions()).length, { timeout: 15000 }).toBeGreaterThan(0);

  const options = await getOptions();
  const pick = options[randomInt(0, options.length - 1)];
  await leaveSelect.selectOption(pick.value, { timeout: STEP_TIMEOUT });
  await expect(leaveSelect, 'leave type should be selected').not.toHaveValue('-1');
  return pick.label;
}

test('Leave Balance Update', async ({ page }) => {
  await login(page);
  await navigateToLeaveBalanceUpdate(page);

  // ---- Employee (random) ----
  const employee = await selectRandomEmployee(page);
  console.log('Employee Selected:', employee);
  await waitForOverlayGone(page);

  // ---- Leave type (random) ----
  const leaveName = await selectRandomLeave(page);
  console.log('Leave Selected:', leaveName);

  // ---- Contract date range ----
  await page.locator('input[name="contractfromdate"]').fill(CONTRACT_FROM, { timeout: STEP_TIMEOUT });
  await page.locator('input[name="contracttodate"]').fill(CONTRACT_TO, { timeout: STEP_TIMEOUT });

  // ---- Opening / closing balance ----
  await page.locator('#contract_opening_bal').fill(OPENING_BAL, { timeout: STEP_TIMEOUT });
  await page.locator('#contract_closing_bal').fill(CLOSING_BAL, { timeout: STEP_TIMEOUT });
  await page.locator('#same_as_above').check({ timeout: STEP_TIMEOUT });

  // ---- Submit ----
  // Start listening before the click: on UAT the save can take a while, and the
  // loader is not covered by waitForOverlayGone, so wait for the API response itself.
  const saveResponse = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().includes('/elms/LeaveBalanceUpdate') &&
      !r.url().includes('LeaveBalanceUpdateList'),
    { timeout: 60000 }
  );
  await page.getByRole('button', { name: 'Submit' }).click({ timeout: STEP_TIMEOUT });
  console.log('Submit Clicked');

  const response = await saveResponse;
  const responseBody = (await response.text().catch(() => '')).slice(0, 300);
  console.log(`Save response: ${response.status()} ${responseBody}`);
  expect(response.ok(), 'LeaveBalanceUpdate API should return 2xx').toBeTruthy();
  await waitForOverlayGone(page, 30000);

  // ---- Close confirmation dialog if one appears (icon-only button, no accessible name) ----
  try {
    await page.getByRole('button').filter({ hasText: /^$/ }).first().click({ timeout: STEP_TIMEOUT });
    console.log('Confirmation Dialog Closed');
  } catch {
    console.log('No confirmation dialog appeared — continuing.');
  }

  await page.screenshot({ path: 'leave_balance_update_result.png', fullPage: true });
  console.log('Process Completed');
});