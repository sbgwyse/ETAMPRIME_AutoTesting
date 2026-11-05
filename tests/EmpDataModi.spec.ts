import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const DOWNLOAD_DIR = path.resolve('./downloads');

test('Employee Data Modification - PDF and Excel Report', async ({ page }) => {
  test.setTimeout(120_000);

  let selectedEmployee = '';

  await test.step('Login to ETAM Prime', async () => {
    await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
    await page.getByRole('textbox', { name: 'Username' }).fill(process.env.ETAM_USER ?? 'ADMIN/etam480');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.ETAM_PASS ?? '$WysE123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForLoadState('networkidle');
  });

  await test.step('Navigate to Employee Data Modification', async () => {
    await page.getByText('REGISTRATION').click();
    await page.locator('select').first().selectOption('Employee Data Modification');
  });

  await test.step('Select a random employee', async () => {
    const auto = page.locator('p-autocomplete');
    await auto.waitFor({ state: 'visible', timeout: 15_000 });

    // Item selectors across PrimeNG versions (new p-*, old ui-*)
    const options = page.locator(
      [
        'li.p-autocomplete-item',
        'li.ui-autocomplete-list-item',
        '.p-autocomplete-panel li',
        '.ui-autocomplete-panel li',
        'ul[role="listbox"] li',
      ].join(', ')
    );

    // 1) Try the dropdown button
    await auto.getByRole('button').click();
    let opened = await options.first()
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    // 2) Fallback: type a letter into the input to trigger the search
    if (!opened) {
      const input = auto.locator('input');
      await input.click();
      await input.pressSequentially('a', { delay: 100 });
      opened = await options.first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
    }

    if (!opened) {
      // Debug help: shows what the page actually rendered
      console.log('AUTOCOMPLETE HTML:', await auto.evaluate(el => el.outerHTML));
      console.log('BODY OVERLAYS:', await page.locator('body > div').evaluateAll(
        els => els.map(e => e.className).filter(Boolean)
      ));
      throw new Error('Employee dropdown options never appeared');
    }

    const count = await options.count();
    const randomIndex = Math.floor(Math.random() * count);
    const option = options.nth(randomIndex);
    selectedEmployee = ((await option.textContent()) ?? '').trim();
    console.log(`Randomly selected employee [${randomIndex + 1}/${count}]: ${selectedEmployee}`);

    await option.scrollIntoViewIfNeeded();
    await option.click();

    // Confirm the selection actually landed in the input
    await expect(auto.locator('input')).not.toHaveValue('', { timeout: 10_000 });
  });

  await test.step('Open Modify', async () => {
    await page.getByRole('button', { name: 'Modify' }).click();
    await expect(page.getByRole('button', { name: 'PDF Report' })).toBeVisible();
  });

  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  await test.step('Download PDF Report', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: 'PDF Report' }).click(),
    ]);
    const filePath = path.join(DOWNLOAD_DIR, 'EmployeeDataModification.pdf');
    await download.saveAs(filePath);
    expect(fs.statSync(filePath).size).toBeGreaterThan(0);
    console.log('Downloaded:', filePath);
  });

  await test.step('Download Excel Report', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: 'Excel Report' }).click(),
    ]);
    const filePath = path.join(DOWNLOAD_DIR, 'EmployeeDataModification.xlsx');
    await download.saveAs(filePath);
    expect(fs.statSync(filePath).size).toBeGreaterThan(0);
    console.log('Downloaded:', filePath);
  });

  console.log(`Test Completed for employee: ${selectedEmployee}`);
});