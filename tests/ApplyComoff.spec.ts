import { test, expect, Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.ETAM_PASSWORD || '$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText('ELMS')).toBeVisible({ timeout: 30000 });
}

test.describe('Apply/Cancel Compensatory Off', () => {

  test('Apply Compensatory Off for a random employee', async ({ page }) => {

    await test.step('Login to ETAM PRIME', async () => {
      await login(page);
    });

    await test.step('Open Apply/Cancel Compensatory Off', async () => {
      await page.getByText('ELMS').click();

      // Selecting this menu option makes the app call POST .../Employees/All_Employees.
      // The autocomplete filters that list in the browser, so typing before the response
      // arrives filters an empty list and the suggestion panel never opens.
      // Register the wait BEFORE the action that triggers the request.
      const employeesLoaded = page.waitForResponse(
        (r) => r.url().includes('/Employees/All_Employees') && r.ok(),
        { timeout: 30000 },
      );
      await page.getByRole('combobox').selectOption('Apply/Cancel Compensatory Off');
      await employeesLoaded;
    });

    await test.step('Select a random employee', async () => {
      await page.locator('p-autocomplete').waitFor({ state: 'visible', timeout: 15000 });

      const employeeInput = page.locator('p-autocomplete input[type="text"]');
      const options = page
        .locator('.p-autocomplete-panel .p-autocomplete-item')
        .or(page.locator('.p-autocomplete-panel').getByRole('option'));

      // The suggestion list only appears once you type (the chevron just focuses the box),
      // so type "4" (most UAT employee IDs start with it). If the panel doesn't show up,
      // clear the box and type again instead of waiting on a keystroke that already happened.
      await expect(async () => {
        await employeeInput.click();
        await employeeInput.fill('');
        await employeeInput.pressSequentially('4', { delay: 60 });
        await expect(options.first()).toBeVisible({ timeout: 3000 });
      }, 'employee suggestions should appear after typing').toPass({ timeout: 20000 });

      const chosenOption = options.nth(Math.floor(Math.random() * (await options.count())));

      const optionText = ((await chosenOption.textContent()) ?? '').trim();
      // Options are rendered as "<ID> - <NAME>"; adjust the split if that changes.
      const employeeId = optionText.split('-')[0].trim();
      console.log(`Selected employee: ${optionText} (ID: ${employeeId})`);

      await chosenOption.click();
      await expect(employeeInput).toHaveValue(new RegExp(employeeId));
    });

    await test.step('Compensatory Off - Select a random date range', async () => {
      // The visible label reads "OT Date Range", but the textbox's accessible name
      // is still "Select Date Range" (the placeholder text).
      const dateRange = page.getByRole('textbox', { name: 'Select Date Range' });
      await dateRange.waitFor({ state: 'visible', timeout: 15000 });
      await dateRange.click();

      // The picker is ngx-bootstrap's bs-daterangepicker. Use only the first month shown, and only
      // real, selectable days (not greyed-out days from neighbouring months, not disabled days).
      const calendar = page.locator('bs-daterangepicker-container bs-days-calendar-view').first();
      await calendar.waitFor({ state: 'visible', timeout: 15000 });

      const days = calendar.locator('td[role="gridcell"] span[bsdatepickerdaydecorator]:not(.is-other-month):not(.disabled)');
      await days.first().waitFor({ state: 'visible', timeout: 10000 });
      const dayCount = await days.count();

      // Random start day, then a random end day on or after it (range of up to 5 days).
      const startIdx = Math.floor(Math.random() * dayCount);
      const endIdx = Math.min(dayCount - 1, startIdx + Math.floor(Math.random() * 5));

      const startLabel = ((await days.nth(startIdx).textContent()) ?? '').trim();
      const endLabel = ((await days.nth(endIdx).textContent()) ?? '').trim();
      await days.nth(startIdx).click();
      await days.nth(endIdx).click();

      await expect(dateRange, 'a date range should be filled in').toHaveValue(/\d/);
      console.log(`Date range selected: day ${startLabel} to day ${endLabel} -> "${await dateRange.inputValue()}"`);

      // A random range often has no OT data; the app then shows a warning toast such as
      // "OT not available from ... You may select another OT period". That is expected, so just log it.
      const toast = page.locator('#toast-container .ngx-toastr').first();
      if (await toast.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
        console.log('App message:', (await toast.innerText()).trim().replace(/\s+/g, ' '));
      }
    });

    await test.step('Tick Pre-Approved and finish', async () => {
      // This is a PrimeNG p-checkbox: the real <input type="checkbox"> is hidden (p-hidden-accessible),
      // so click the visible box instead and check the state on the input.
      const preApproved = page.locator('p-checkbox[name="pre_approved_compoff"]');
      const box = preApproved.locator('.p-checkbox-box');
      const input = preApproved.locator('input[type="checkbox"]');

      // Let the page loader (shown while OT data is fetched) go away so it can't block the click.
      await page
        .locator('.ngx-overlay')
        .first()
        .waitFor({ state: 'hidden', timeout: 15000 })
        .catch(() => {});

      await box.click({ timeout: 10000 });
      await expect(input, 'Pre-Approved should be ticked').toBeChecked();
      console.log('Pre-Approved ticked');
      console.log('Process Completed');
    });

  });

});