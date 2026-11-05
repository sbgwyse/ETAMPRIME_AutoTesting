import { test, expect } from '@playwright/test';

test('Apply Leave Encashment - ETAM Prime', async ({ page }) => {
  await test.step('Login to ETAM Prime', async () => {
    await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
    await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.ETAM_PASSWORD || '$WysE123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).not.toHaveURL(/login/);
  });

  await test.step('Navigate to ELMS', async () => {
    await page.getByText('ELMS').click();
  });

  await test.step('Select "Apply Encashment" from the action dropdown', async () => {
    // Scoped to the `appheading` attribute, since the leave-type dropdown
    // is also a <select> and getByRole('combobox') matches both once
    // this page has loaded, causing a strict-mode violation.
    const actionDropdown = page.locator('select[appheading]');

    // Selecting this option makes the app call POST .../Employees/All_Employees.
    // The employee autocomplete filters that list in the browser, so typing before the
    // response arrives filters an empty list and no suggestions ever appear.
    // Register the wait BEFORE the action that triggers the request.
    const employeesLoaded = page.waitForResponse(
      (r) => r.url().includes('/Employees/All_Employees') && r.ok(),
      { timeout: 30000 },
    );
    await actionDropdown.selectOption('Apply Encashment');
    await expect(actionDropdown).toHaveValue('Apply Encashment');
    await employeesLoaded;
  });

  await test.step('Select a random employee', async () => {
    const employeeInput = page.locator('p-autocomplete input[type="text"]');
    await employeeInput.waitFor({ state: 'visible', timeout: 15000 });

    // The blue chevron only focuses the input in this app; it does NOT open the list.
    // The suggestion panel appears only once you type, so type "4" (most UAT employee
    // IDs start with it). If the panel doesn't open, clear and retype rather than
    // waiting on a keystroke that has already happened.
    const options = page
      .locator('.p-autocomplete-panel .p-autocomplete-item')
      .or(page.locator('.p-autocomplete-panel').getByRole('option'));

    await expect(async () => {
      await employeeInput.click();
      await employeeInput.fill('');
      await employeeInput.pressSequentially('4', { delay: 60 });
      await expect(options.first()).toBeVisible({ timeout: 3000 });
    }, 'employee suggestions should appear after typing').toPass({ timeout: 20000 });

    const count = await options.count();
    const chosenOption = options.nth(Math.floor(Math.random() * count));

    const optionText = ((await chosenOption.textContent()) ?? '').trim();
    // Options are rendered as "<ID> - <NAME>"; adjust the split if that changes.
    const employeeId = optionText.split('-')[0].trim();
    console.log(`Selected employee: ${optionText} (ID: ${employeeId})`);

    await chosenOption.click();
    await expect(employeeInput).toHaveValue(new RegExp(employeeId));
  });

  await test.step('Select leave type', async () => {
    const leaveDropdown = page.locator('select[name="selectedLeave"]');
    await leaveDropdown.selectOption('4');
    await expect(leaveDropdown).toHaveValue('4');
  });

  await test.step('Submit', async () => {
    await page.getByRole('button', { name: 'Submit' }).click();
    // TODO: assert on whatever confirms success in the live UI —
    // a toast/success message, a modal closing, or a new row appearing
    // in an encashment history table.
  });
});