import { test, expect } from '@playwright/test';

test('Generate Employee Leave Report', async ({ page }) => {
  // ---- Login ----
  await page.goto('https://presence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam100');
  await page.getByRole('textbox', { name: 'Password' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // ---- Navigate to ELMS Reports ----
  await page.getByText('ELMS').click();
  await page.getByRole('combobox').selectOption('Reports');
  await page.locator('#reporttype').selectOption('Employee Leave Report');

  // ---- Date range ----
  await page.getByRole('textbox', { name: 'Select Date Range' }).click();
  await page.getByText('1', { exact: true }).first().click();
  await page.getByText('31').nth(3).click();
  // NOTE: date-cell locators are inherently index-based (calendar grids repeat
  // day numbers across months). If this breaks, scope it to the visible
  // calendar panel, e.g.:
  // const calendar = page.locator('.calendar-panel'); // adjust selector to real DOM
  // await calendar.getByText('1', { exact: true }).click();

  // ---- Leave Type multiselect ----
  // This is a custom panel (search box + plain checkbox list), not a native
  // ARIA listbox, so getByRole('listbox') never matches and hangs. Instead,
  // select by the visible label text directly.
  await page.getByText('--Select a Leave Type--').click();
  await page.getByRole('checkbox').locator('..').filter({ hasText: 'CASUAL LEAVE' }).getByRole('checkbox').click();
  // Swap 'CASUAL LEAVE' for whichever option(s) you need
  // (PRIVILEGE LEAVE, SICK LEAVE, LEAVE WITHOUT PAY, MATERNITY LEAVE, ...).
  // To select multiple, repeat the line above with each label.
  await page.keyboard.press('Escape'); // closes the dropdown without relying on cdk-virtual-scroll-viewport

  // ---- Mode (required field, not in the original recording) ----
  // Confirm the actual control type (dropdown vs radio) and fill it in —
  // placeholder below assumes a select-style dropdown:
  // await page.locator('#mode').selectOption('<mode value>');

  // ---- Department multiselect (sidebar) ----
  await page.getByText('--Select a Department--').first().click();
  await page.getByRole('checkbox').locator('..').filter({ hasText: /./ }).first().getByRole('checkbox').click();
  // NOTE: replace with the actual department label once confirmed, e.g.
  // .filter({ hasText: 'Food & Beverage' })
  await page.keyboard.press('Escape');

  // ---- Advance Filter panel ----
  await page.getByText('Advance Filter').click();
  const advancedPanel = page.getByRole('complementary');

  // Contractor
  await page.locator('#contractor').click();
  await page.getByText('--Select a Contractor--').click();
  await advancedPanel
    .getByRole('checkbox')
    .nth(0) // first contractor option in the opened list — replace with a named
    .click(); // locator once the real contractor label is confirmed

  // Second Department selection inside the Advance Filter sidebar
  await advancedPanel.getByText('--Select a Department--').click();
  await advancedPanel
    .getByRole('checkbox')
    .nth(0) // first department option — replace with named label when confirmed
    .click();

  // "Done" / apply button for the Advance Filter panel
  await advancedPanel.getByRole('button', { name: 'Done' }).click();

  // Final checkbox before submit (purpose unclear from recording — confirm
  // what this actually toggles, e.g. "Include inactive employees")
  await page.getByRole('checkbox').first().click();

  // ---- Submit and capture the report popup ----
  const [reportPage] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Submit' }).click(),
  ]);

  await reportPage.waitForLoadState();
  expect(reportPage.url()).toContain('report'); // adjust to the real report URL pattern
  // Optionally assert the report actually rendered content, e.g.:
  // await expect(reportPage.getByText('Employee Leave Report')).toBeVisible();
});