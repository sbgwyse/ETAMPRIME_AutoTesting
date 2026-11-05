import { test, expect, Page } from '@playwright/test';

const NO_EMPLOYEE_TOAST = /Please Select atleast one employee/i;

// Fails the test at the real cause if the app rejects an action
// because no employee is selected.
async function expectNoEmployeeToast(page: Page, action: string) {
  await page.waitForTimeout(500); // give the toast a moment to appear
  await expect(
    page.getByText(NO_EMPLOYEE_TOAST),
    `"${action}" was rejected: no employee selected`
  ).toHaveCount(0);
}

test('Off Policy Registration - filters, save, PDF, Excel, delete', async ({ page }) => {

  await test.step('Login to ETAM Prime', async () => {
    await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
    await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
    await page.getByRole('button', { name: 'Sign In' }).click();
  });

  await test.step('Navigate to Off Policy Registration', async () => {
    await page.getByText('REGISTRATION').click();
    await page.getByRole('combobox').selectOption('Off Policy Registration');
  });

  await test.step('Select date range (1st to 2nd)', async () => {
    await page.getByRole('textbox', { name: 'Select Date Range' }).click();
    await page.getByText('1', { exact: true }).first().evaluate((el) => (el as HTMLElement).click());
    await page.getByText('2', { exact: true }).first().evaluate((el) => (el as HTMLElement).click());
  });

  await test.step('Select policy', async () => {
    await page.locator('select[name="selectedPolicy"]').selectOption('2 - SAT');
  });

  await test.step('Select department (3 options)', async () => {
    await page.getByText('--Select a Department--').click();
    await page.locator('.p-ripple > .p-checkbox > .p-checkbox-box').first().click();
    await page.locator('p-multiselectitem:nth-child(2) > .p-ripple > .p-checkbox > .p-checkbox-box').click();
    await page.locator('p-multiselectitem:nth-child(3) > .p-ripple > .p-checkbox > .p-checkbox-box').click();
  });

  await test.step('Apply advance filter - contractor', async () => {

    await page.getByText('Advance Filter').click();
    await page.locator('#contractor').click();

    await page.waitForTimeout(1000);
    const sidebar = page.getByRole('complementary');

    const contractorDropdown = sidebar
      .locator('p-multiselect[name="contractorname"]');

    const contractorPanel = page.locator('.p-multiselect-panel');

    // The contractor multiselect uses placement="top", so its panel renders
    // directly over its own trigger button. The '#contractor' click above may
    // have already opened it - re-clicking the trigger while the panel is
    // open gets intercepted by the panel's own filter input and hangs.
    // Only click to open if it isn't already open.
    const contractorAlreadyOpen = await contractorPanel.isVisible().catch(() => false);
    if (!contractorAlreadyOpen) {
      await contractorDropdown.click();
    }

    await contractorPanel.waitFor({ state: 'visible' });

    await contractorPanel
      .locator('.p-multiselect-header .p-checkbox')
      .click();

    // Close by clicking a neutral point on the page instead of clicking the
    // dropdown again (same overlap problem as opening it) or Escape (doesn't
    // dismiss this panel). Same approach already used for the department panel below.
    await page.mouse.click(1400, 100);
    await expect(contractorPanel).toBeHidden();

    const departmentDropdown = sidebar
      .locator('p-multiselect[name="deptname"]')
      .filter({ hasText: '--Select a Department--' });

    await departmentDropdown.click();

    const departmentPanel = page.locator('.p-multiselect-panel');
    await departmentPanel.waitFor({ state: 'visible' });

    await departmentPanel
      .locator('.p-multiselect-header .p-checkbox')
      .click();

    await page.mouse.click(1400, 100);

    await expect(departmentPanel).toBeHidden();

  });

  await test.step('Select employee and confirm', async () => {

    const sidebar = page.getByRole('complementary');

    const employeeTable = sidebar.locator('p-table');

    await employeeTable
      .locator('tbody tr.p-selectable-row')
      .first()
      .click();

    // Strict check: exactly 1 selected (a bare '1' could match anything)
    await expect(
      sidebar.getByText(/Selected Employees:\s*1\b/)
    ).toBeVisible();

    await sidebar.getByRole('button', { name: 'Done' }).click();

  });

  // NEW: selecting the employee in the sidebar only filters the main list.
  // The employee must also be ticked in the main grid, otherwise
  // Save / PDF / Excel / Delete all show "Please select atleast one employee".
  let selectedEmployeeId = '';

  await test.step('Select employee in main grid', async () => {

    // Main grid = the p-table that is NOT inside the advance-filter sidebar.
    // If this picks the wrong table, adjust to a more specific container.
    const mainTable = page.locator('p-table:not(aside p-table)').first();
    const firstRow = mainTable.locator('tbody tr').first();

    await expect(firstRow).toBeVisible();

    // Rows in this grid have no checkbox cell, so the ID is the first td.
    selectedEmployeeId = (await firstRow.locator('td').first().innerText()).trim();

    const selectedCounter = page.getByText(/Selected Employees\s*:\s*1\b/);

    // Only the header checkbox exists - it selects every row in the filtered list.
    await mainTable.locator('thead .p-checkbox-box').first().click();

    // Fallback: if the header checkbox didn't register, click the row itself.
    await selectedCounter
      .waitFor({ state: 'visible', timeout: 2000 })
      .catch(async () => {
        await firstRow.click();
      });

    await expect(selectedCounter).toBeVisible();

    test.info().annotations.push({
      type: 'employee',
      description: selectedEmployeeId,
    });
  });

  await test.step('Save', async () => {

    const saveBtn = page.getByRole('button', { name: 'Save' });

    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();

    await saveBtn.click();

    await expectNoEmployeeToast(page, 'Save');

  });

  await test.step('Download PDF report', async () => {
    const pdfBtn = page.getByRole('button', { name: 'PDF' });

    // Try a direct download first.
    const firstAttempt = page
      .waitForEvent('download', { timeout: 5000 })
      .catch(() => null);
    await pdfBtn.click();
    let download = await firstAttempt;

    // If PDF only opened the saved-records list, pick the employee and click PDF again.
    if (!download) {
      await page.getByRole('cell', { name: selectedEmployeeId }).first().click();
      const secondAttempt = page.waitForEvent('download');
      await pdfBtn.click();
      download = await secondAttempt;
    }

    await expectNoEmployeeToast(page, 'PDF');
  });

  await test.step('Download Excel report', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Excel' }).click(),
    ]);
  });

  await test.step('Delete', async () => {
    await page.getByRole('button', { name: 'Delete' }).click();

    // TODO: matches any icon-only button. Scope to the dialog once you know its label, e.g.
    // page.getByRole('dialog').getByRole('button', { name: /yes|ok|confirm/i })
    await page.getByRole('button').filter({ hasText: /^$/ }).click();
  });

  console.log('Finished test cases:');
  console.log('  Login to ETAM Prime');
  console.log('  Navigate to Off Policy Registration');
  console.log('  Select date range (1st to 2nd)');
  console.log('  Select policy');
  console.log('  Select department (3 options)');
  console.log('  Apply advance filter - contractor');
  console.log('  Apply advance filter - department');
  console.log('  Select employee and confirm (sidebar)');
  console.log(`  Select employee in main grid (${selectedEmployeeId})`);
  console.log('  Save');
  console.log('  Download PDF report');
  console.log('  Download Excel report');
  console.log('  Delete');
  console.log('Test Completed');

});