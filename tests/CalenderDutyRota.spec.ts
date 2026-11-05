import { test, expect } from '@playwright/test';

test('Duty Roster - Shift, Weekly Off, Off Policy assignment', async ({ page }) => {
  await test.step('Login to ETAM Prime', async () => {
    await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
    await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
    await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.getByText('REGISTRATION').click();
  });

  await test.step('Navigate to Duty Roster - Shift', async () => {
    await page.getByRole('combobox').selectOption('Duty Roster');
    await page.locator('select[name="month"]').selectOption('July');
    await page.locator('select[name="selectedType"]').selectOption('Shift');
  });

  await test.step('Apply department + advance filter (contractor)', async () => {
    await page.getByText('--Select a Department--').click();
    await page.getByRole('checkbox').nth(1).click();
    await page.locator('cdk-virtual-scroll-viewport').click();

    await page.getByText('Advance Filter').click();
    await page.getByText('Contractor').click();
    await page.getByText('--Select a Contractor--').click();
    await page.getByRole('checkbox').nth(1).click();
    await page.getByRole('listitem', { name: 'Don Bosco' }).click();
    await page.getByRole('checkbox').nth(1).click();

    // NOTE: unnamed button (blank accessible name) — verify this is the
    // "apply/close filter panel" control before relying on it long-term.
    await page.getByRole('button').filter({ hasText: /^$/ }).nth(1).click();

    await page.getByText('--Select a Department--').click();
    await page.getByRole('checkbox').nth(1).click();

    // NOTE: same unnamed-button caveat as above.
    await page.getByRole('button').filter({ hasText: /^$/ }).nth(1).click();
    await page.getByRole('checkbox').nth(1).click();
    await page.getByRole('button', { name: 'Done' }).click();
  });

  await test.step('Assign Shift and save', async () => {
    await page.getByRole('cell', { name: '500100124' }).click();
    await page.getByLabel('Remark').selectOption('ShiftB');
    await page.getByText('1 A', { exact: true }).click();
    await page.getByRole('button', { name: 'Save Shift' }).click();

    // NOTE: unnamed button — likely a post-save confirmation dialog.
    await page.getByRole('button').filter({ hasText: /^$/ }).click();

    // TODO: replace with a real assertion once you confirm what indicates
    // success, e.g.:
    // await expect(page.getByText('Shift saved successfully')).toBeVisible();
  });

  await test.step('Navigate to Duty Roster - Weekly Off', async () => {
    await page.locator('select[name="month"]').selectOption('July');
    await page.locator('select[name="selectedType"]').selectOption('WeeklyOff');
  });

  await test.step('Assign Weekly Off and save', async () => {
    await page.getByRole('cell', { name: '100000001' }).click();
    await page.getByRole('cell', { name: '500100126' }).click();
    await page.getByLabel('Remark').selectOption('Variable Weekly Off');
    await page.getByText('8').nth(4).click();
    await page.getByRole('button', { name: 'Save Weeklyoff' }).click();

    await page.getByRole('button').filter({ hasText: /^$/ }).click();

    // TODO: replace with a real assertion once you confirm what indicates
    // success for this workflow.
  });

  await test.step('Navigate to Duty Roster - Off Policy', async () => {
    await page.locator('select[name="month"]').selectOption('July');
    await page.locator('select[name="selectedType"]').selectOption('Off Policy');
  });

  await test.step('Assign Off Policy and save', async () => {
    // NOTE: this clicks a whole column header with no accessible name —
    // verify which day/column it actually targets before trusting it.
    await page.getByRole('columnheader').filter({ hasText: /^$/ }).click();
    await page.getByLabel('Remark').selectOption('7-FRI');
    await page.getByRole('button', { name: 'Save Off Policy' }).click();

    await page.getByRole('button').filter({ hasText: /^$/ }).click();

    // TODO: replace with a real assertion once you confirm what indicates
    // success for this workflow.
  });
});