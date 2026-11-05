import { test, expect } from '@playwright/test';

test('Device Set Time - random time zone and gate', async ({ page }) => {
  // Login
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/client**');

  // Navigate to Device Set Time
  await page.getByText('ADMINISTRATION').click();
  await page.getByRole('combobox').selectOption('Device Set Time');

  const loader = page.locator('.ngx-overlay, .ngx-ui-loader');
  await loader.waitFor({ state: 'hidden' }).catch(() => {});

  // --- Select a random time zone ---
  const timezoneDropdown = page.locator('#timezones');
  const timezoneValues = await timezoneDropdown.locator('option').evaluateAll((opts) =>
    (opts as HTMLOptionElement[])
      .filter((o) => !(o.textContent ?? '').trim().startsWith('--')) // drop "--Select TimeZone--"
      .map((o) => o.value)
  );
  const randomTimezone = timezoneValues[Math.floor(Math.random() * timezoneValues.length)];
  await timezoneDropdown.selectOption(randomTimezone);
  console.log(`Selected time zone: ${randomTimezone}`);

  // --- Select a random gate ---
  // NOTE: dropped the trailing '*' from 'Gate Id*' — that's almost always a
  // separate styled span next to the label (marking it required), not part
  // of the field's actual accessible name, so the exact-match label likely
  // wasn't finding the element.
  const gateDropdown = page.getByLabel('Gate Id');
  const gateValues = await gateDropdown.locator('option').evaluateAll((opts) =>
    (opts as HTMLOptionElement[])
      .filter((o) => !(o.textContent ?? '').trim().startsWith('--')) // drop "--Select Gates--"
      .map((o) => o.value)
  );
  const randomGate = gateValues[Math.floor(Math.random() * gateValues.length)];
  await gateDropdown.selectOption(randomGate);
  console.log(`Selected gate: ${randomGate}`);

  await loader.waitFor({ state: 'hidden' }).catch(() => {});
  await page.getByRole('button', { name: 'Set Time' }).click();
});