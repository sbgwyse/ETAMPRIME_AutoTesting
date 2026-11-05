import { test, expect, Page } from '@playwright/test';

// ETAM Prime — Assign Weekly Off workflow
// Department / Advance Filter / Contractor / Department selection is taken
// from the Shift Registration spec (select-all in each multiselect).

/* ----------------------------- Multiselects ----------------------------- */

const multiselectPanel = (page: Page) =>
  page.locator('.p-multiselect-panel, .p-multiselect-overlay').last();

async function closeMultiselectPanel(page: Page) {
  const panel = multiselectPanel(page);
  const closeBtn = page.locator('.p-multiselect-close:visible').last();
  if (await closeBtn.count()) {
    await closeBtn.click().catch(() => {});
  } else {
    // Same "click away" the recording used
    await page.getByRole('complementary').click().catch(() => {});
  }
  if (!(await panel.waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false))) {
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

/** Opens the multiselect showing `placeholder`, ticks the header "select all", closes it. */
async function selectAllInMultiselect(page: Page, placeholder: string) {
  await page.getByText(placeholder).last().click();

  const panel = multiselectPanel(page);
  await panel.waitFor({ state: 'visible', timeout: 15_000 });

  const headerInput = panel.locator('.p-multiselect-header input[type="checkbox"]').first();
  const headerBox = panel.locator('.p-multiselect-header .p-checkbox-box').first();

  if (!(await headerInput.isChecked().catch(() => false))) {
    if (await headerBox.count()) {
      await headerBox.click();
    } else {
      await panel.getByRole('checkbox').first().setChecked(true, { force: true });
    }
  }
  // Safety net if the visual click didn't toggle the real checkbox
  if (!(await headerInput.isChecked().catch(() => true))) {
    await headerInput.setChecked(true, { force: true });
  }

  console.log(`Selected all options for "${placeholder}"`);
  await closeMultiselectPanel(page);
}

/* --------------------------------- Test --------------------------------- */

test('Assign Weekly Off - multiple remark types', async ({ page }) => {
  // ---- Login ----
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill('$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');

  // ---- Navigate to Assign Weekly Off ----
  await page.getByText('REGISTRATION').click();
  await page.getByRole('combobox').selectOption('Assign Weekly Off');
  await page.locator('select[name="month"]').selectOption('May');
  await page.getByLabel('Remark').selectOption('Variable Weekly Off');

  // ---- Select ALL departments ----
  await selectAllInMultiselect(page, '--Select a Department--');

  // ---- Advance Filter -> Contractor radio ----
  await page.getByText('Advance Filter').click();
  try {
    await page.getByRole('radio', { name: 'Contractor' }).first().check({ force: true, timeout: 5_000 });
  } catch {
    await page.getByText('Contractor', { exact: true }).first().click();
  }

  // ---- Advance Filter -> ALL contractors, ALL departments ----
  await selectAllInMultiselect(page, '--Select a Contractor--');
  await selectAllInMultiselect(page, '--Select a Department--');

  const done = page.getByRole('button', { name: 'Done' });
  await done.waitFor({ state: 'visible', timeout: 15_000 });
  await done.click();
  await page.waitForLoadState('networkidle');

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