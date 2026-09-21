import { test, expect } from '@playwright/test';

// ETAM Prime — Assign Weekly Off workflow
// Cleaned up from a Playwright codegen recording. Two locators are still
// fragile/ambiguous (marked with TODO below) and should be verified against
// the actual DOM before this is trusted in CI.

test('Assign Weekly Off - multiple remark types', async ({ page }) => {
  // ---- Login ----
  await page.goto('https://presence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam100');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // ---- Navigate to Assign Weekly Off ----
  await page.getByText('REGISTRATION').click();
  await page.getByRole('combobox').selectOption('Assign Weekly Off');
  await page.locator('select[name="month"]').selectOption('May');

  // ---- Department + Advance Filter (Contractor + Department) setup ----
  await page.getByLabel('Remark').selectOption('Variable Weekly Off');
  await page.getByText('--Select a Department--').click();
  await page.getByRole('checkbox').nth(1).click();
  await page.locator('cdk-virtual-scroll-viewport').click();

  await page.getByText('Advance Filter').click();
  await page.getByText('Contractor').click();
  await page.getByText('--Select a Contractor--').click();
  await page.getByRole('checkbox').nth(3).click();
  await page.getByRole('complementary').click();
  await page.getByText('--Select a Department--').click();
  await page.getByRole('checkbox').nth(3).click();

  // TODO(fragile): unnamed button — origin/purpose unclear from recording,
  // suspected to toggle/expand something in the Advance Filter panel.
  await page.getByRole('button').filter({ hasText: /^$/ }).nth(1).click();

  // TODO(fragile): nth(3) checkbox reused here for a different selection —
  // verify this isn't accidentally re-toggling the previous checkbox.
  await page.getByRole('checkbox').nth(3).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // ---- Case 1: Variable Weekly Off — Wednesday May 6 ----
  await page.getByRole('checkbox').nth(1).click();
  await page.getByLabel('Remark').selectOption('Variable Weekly Off');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Wednesday May 6').click();
  await page.getByRole('button', { name: 'Save' }).click();

  // TODO(fragile): unnamed button — suspected confirmation-dialog button
  // after Save. Verify the actual accessible name/role and replace this.
  await page.getByRole('button').filter({ hasText: /^$/ }).click();

  // ---- Case 2: Additional Off — Monday May 11 ----
  await page.locator('select[name="month"]').selectOption('May');
  await page.getByLabel('Remark').selectOption('Additional Off');
  await page.getByRole('checkbox').nth(1).click();
  await page.getByLabel('Remark').selectOption('Additional Off');
  await page.getByLabel('Monday May 11').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button').filter({ hasText: /^$/ }).click();

  // ---- Case 3: Pending Off — Tuesday May 12 ----
  await page.locator('select[name="month"]').selectOption('May');
  await page.getByLabel('Remark').selectOption('Pending Off');
  await page.getByRole('checkbox').nth(1).click();
  await page.getByLabel('Remark').selectOption('Pending Off');
  await page.getByLabel('Tuesday May 12').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button').filter({ hasText: /^$/ }).click();

  // ---- Case 4: Vallet Off — Tuesday May 5 ----
  await page.locator('select[name="month"]').selectOption('May');
  await page.getByRole('checkbox').nth(1).click();
  await page.getByLabel('Remark').selectOption('Vallet Off');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Tuesday May 5').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button').filter({ hasText: /^$/ }).click();

  // ---- Cleanup: reset selections ----
  await page.locator('select[name="month"]').selectOption('May');
  await page.getByRole('checkbox').nth(1).click();
  await page.getByLabel('Remark').selectOption('Vallet Off');
  await page.getByRole('button', { name: 'Deselect All' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
});