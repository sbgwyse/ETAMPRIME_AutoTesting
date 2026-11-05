import { test, expect, Page } from '@playwright/test';

/**
 * ETAM PRIME - Shift Rounding flow (Registration module)
 *
 * Login always uses ADMIN/etam480. The shared ETAM_USERNAME / ETAM_PASSWORD
 * env vars are intentionally NOT read here, so they can't override this account.
 * To use a different account for this spec only, set ETAM480_USERNAME /
 * ETAM480_PASSWORD / ETAM480_SECOND_PASSWORD.
 */

const PAUSE_MS = 300;

const USERNAME = process.env.ETAM480_USERNAME || 'ADMIN/etam480';
const PASSWORD = process.env.ETAM480_PASSWORD || '$WsE123';
// TODO: confirm whether this second password is meant to be the same value
// as PASSWORD above ('$WysE123' in the recording looks like a possible typo
// of '$WsE123' vs. a genuinely different secondary password/PIN).
const SECOND_PASSWORD = process.env.ETAM480_SECOND_PASSWORD || '$WysE123';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

async function login(page: Page) {
  console.log('Logging in as:', USERNAME);

  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');

  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Second-step confirmation: click reveal icon, re-enter password, sign in again.
  await page.locator('i').click();
  await page.getByRole('textbox', { name: 'Password' }).fill(SECOND_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

async function navigateToShiftRounding(page: Page) {
  await page.getByText('REGISTRATION').click();
  await page.getByRole('combobox').selectOption('Shift Rounding');
}

/**
 * Picks a random real shift from the Shift dropdown (skips the empty /
 * "Select" placeholder option) and returns its label.
 */
async function selectRandomShift(page: Page): Promise<string> {
  const shiftSelect = page.locator('select[name="selectedShift"]');

  // Wait until the dropdown has been populated with at least one real option.
  const getLabels = async () =>
    shiftSelect.locator('option').evaluateAll((opts) =>
      opts
        .map((o) => ({
          value: (o as HTMLOptionElement).value,
          label: (o.textContent ?? '').trim(),
        }))
        .filter((o) => o.label !== '' && o.value !== '' && !/^(-+\s*)?select/i.test(o.label))
        .map((o) => o.label)
    );

  await expect.poll(async () => (await getLabels()).length, { timeout: 10000 }).toBeGreaterThan(0);

  const labels = await getLabels();
  const randomLabel = labels[Math.floor(Math.random() * labels.length)];
  console.log(`Random shift selected (${labels.length} available):`, randomLabel);

  await shiftSelect.selectOption({ label: randomLabel });
  return randomLabel;
}

/**
 * Waits for the post-Save result dialog/toast to appear and dismisses it.
 */
async function closeResultDialogIfPresent(page: Page) {
  const dialog = page.locator('.p-dialog, .p-toast-message').first();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    const closeButton = dialog.getByRole('button', { name: /ok|close/i }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    }
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  } catch {
    // No dialog appeared — nothing to close.
  }
}

test.describe('Shift Rounding', () => {
  // Start from a clean browser context so no saved session (storageState)
  // from an earlier login is reused.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('rounds a random shift for selected weekdays with grace period', async ({ page }) => {
    await login(page);
    await navigateToShiftRounding(page);

    // Select a random shift from the dropdown
    await selectRandomShift(page);

    // "Select all" / header checkbox
    await page.locator('.p-checkbox-box').first().click();

    // Select each applicable weekday individually
    for (const day of WEEKDAYS) {
      await page.locator(`#${day} > .p-checkbox > .p-checkbox-box`).click();
    }

    // Rounding time
    const timeField = page.getByRole('textbox', { name: 'HH:mm' });
    await timeField.click();
    await timeField.fill('00:00');

    // Shift grace period (minutes)
    const graceField = page.getByRole('textbox', { name: 'Shift Grace' });
    await graceField.click();
    await graceField.fill('59');

    await page.waitForTimeout(PAUSE_MS);
    await page.getByRole('button', { name: 'Save' }).click();

    // Dismiss the save confirmation, then confirm the form is usable again.
    await closeResultDialogIfPresent(page);
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });
});