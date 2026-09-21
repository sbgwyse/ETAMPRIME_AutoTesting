import { test, expect, Page } from '@playwright/test';
async function login(page: Page) {
  await page.goto('https://presence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam100');
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();
}
async function navigateToMarkReportingOfficer(page: Page) {
  await page.getByText('ELMS').click();
  await page.getByRole('combobox').selectOption('eLMS Configuration');
  await page
    .locator('app-elms-configuration')
    .getByRole('combobox')
    .selectOption('Mark Reporting Officer (RO)');
}
async function markReportingOfficer(
  page: Page,
  employeeId: string
) {
  await navigateToMarkReportingOfficer(page);

  const employeeInput = page.locator('input[name="emp"]');
  await expect(employeeInput).toBeVisible();
  await employeeInput.click();
  await employeeInput.pressSequentially(employeeId, { delay: 100 });
  const panel = page.locator('.p-autocomplete-panel');
  await expect(panel).toBeVisible({ timeout: 15000 });
  const option = panel.getByText(employeeId, { exact: false }).first();
  await expect(option).toBeVisible({ timeout: 15000 });
  await option.click();
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' }).catch(() => {});
  const roCheckbox = page.locator('#RO > .p-checkbox > .p-checkbox-box');
  await expect(roCheckbox).toBeVisible();
  await expect(roCheckbox).toBeEnabled();
  const isChecked = await roCheckbox.evaluate((el) =>
    el.classList.contains('p-highlight')
  );

  if (!isChecked) {
    await roCheckbox.click();
  }
  await expect(roCheckbox).toHaveClass(/p-highlight/);

  await page.getByRole('button', { name: 'Save' }).click();
}
test('eLMS Configuration - Mark Reporting Officer (RO)', async ({ page }) => {
  await login(page);

  await markReportingOfficer(page, '500100127');

  
});