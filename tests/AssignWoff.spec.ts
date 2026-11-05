import { test, expect, Page, Locator } from '@playwright/test';

// ETAM Prime — Assign Weekly Off workflow
// Department / Advance Filter / Contractor / Department selection is taken
// from the Shift Registration spec (select-all in each multiselect).

/* ----------------------------- Multiselects ----------------------------- */

// Department / Contractor dropdowns (main page and Advance Filter flyout) are all
// PrimeNG p-multiselect: the open list is an overlay panel with a header row
// (select-all checkbox, search box, close button) followed by the items.
const multiselectPanel = (page: Page) => page.locator('.p-multiselect-panel').last();

/**
 * Opens the multiselect showing `placeholder`, ticks the header "select all"
 * checkbox, verifies it is ticked, and closes the panel.
 *
 * NOTE: the real <input type="checkbox"> inside the header is a hidden,
 * read-only accessibility input whose checked state never changes, so its
 * isChecked()/setChecked() cannot be trusted (setChecked even toggled the
 * box back off). The visible `.p-checkbox-box` and its aria-checked
 * attribute are what actually reflect the state.
 */
async function selectAllInMultiselect(page: Page, placeholder: string, scope: Page | Locator = page) {
  await scope.getByText(placeholder).last().click();

  const panel = multiselectPanel(page);
  await panel.waitFor({ state: 'visible', timeout: 15_000 });

  const box = panel.locator('.p-multiselect-header .p-checkbox-box').first();
  const isOn = async () =>
    (await box.getAttribute('aria-checked').catch(() => null)) === 'true' ||
    (await box.evaluate(el => el.classList.contains('p-highlight')).catch(() => false));

  if (!(await isOn())) {
    await box.click();
  }
  await expect
    .poll(isOn, { timeout: 5_000, message: `"${placeholder}" select-all did not tick` })
    .toBe(true);

  console.log(`Selected all options for "${placeholder}"`);
  await page.waitForTimeout(200);

  // Close with the panel's own X button (Escape as a fallback)
  await panel.locator('.p-multiselect-close').click().catch(() => {});
  if (!(await panel.waitFor({ state: 'hidden', timeout: 3_000 }).then(() => true).catch(() => false))) {
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
}

/* ------------------------------ Employees ------------------------------- */

/** Reads N from the "Selected Employees : N" button (0 if not shown). */
async function selectedCount(page: Page): Promise<number> {
  const pill = page.locator('.p-button-label').filter({ hasText: /Selected Employees\s*:/i }).first();
  if (!(await pill.isVisible().catch(() => false))) return 0;
  const m = ((await pill.innerText().catch(() => '')) || '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Ticks the "select all" checkbox in the employee table header (next to "ID").
 * Skips if employees are already selected, so it is safe to call before every case.
 * Tries several strategies and verifies each one via the "Selected Employees : N" count.
 */
async function selectAllEmployees(page: Page) {
  if ((await selectedCount(page)) > 0) {
    console.log(`Employees already selected (${await selectedCount(page)}), skipping select-all`);
    return;
  }

  const attempts: Array<[string, () => Promise<void>]> = [
    // The select-all checkbox sits in the first (unnamed) column header, next to the "ID" header
    ['first column header checkbox', async () => {
      const header = page.getByRole('columnheader').first();
      const box = header.locator('.p-checkbox-box').first();
      if (await box.count()) {
        await box.click({ timeout: 5_000 });
      } else {
        await header.getByRole('checkbox').last().click({ force: true, timeout: 5_000 });
      }
    }],
    // Click where the checkbox is drawn: just left of the "ID" header text
    ['position left of "ID" header', async () => {
      const idHeader = page.getByText('ID', { exact: true }).first();
      await idHeader.waitFor({ state: 'visible', timeout: 5_000 });
      const box = await idHeader.boundingBox();
      if (!box) throw new Error('ID header has no bounding box');
      await page.mouse.click(box.x - 22, box.y + box.height / 2);
    }],
    ['first visible checkbox box', async () => {
      await page.locator('.p-checkbox-box:visible').first().click({ timeout: 5_000 });
    }],
  ];

  for (const [name, run] of attempts) {
    try {
      await run();
      await page.waitForTimeout(500);
      const n = await selectedCount(page);
      if (n > 0) {
        console.log(`Employees select-all worked via ${name} (selected: ${n})`);
        return;
      }
      console.log(`Employees select-all via ${name} clicked, but no employees selected`);
    } catch (e) {
      console.log(`Employees select-all via ${name} failed: ${String(e).split('\n')[0]}`);
    }
  }

  await page.screenshot({ path: 'test-results/select-all-employees-failed.png', fullPage: true }).catch(() => {});
  throw new Error('Could not select all employees');
}

/** True if the Off Type dropdown offers `label`; logs what is available when it does not. */
async function offTypeAvailable(page: Page, label: string): Promise<boolean> {
  const options = (await page.getByLabel('Remark').locator('option').allTextContents()).map(t => t.trim());
  const ok = options.includes(label);
  if (!ok) console.log(`Skipping "${label}": not in Off Type options [${options.join(' | ')}]`);
  return ok;
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
  const advanceFilterPanel = page.getByRole('complementary');
  await selectAllInMultiselect(page, '--Select a Contractor--', advanceFilterPanel);
  await selectAllInMultiselect(page, '--Select a Department--', advanceFilterPanel);

  const done = page.getByRole('button', { name: 'Done' });
  await done.waitFor({ state: 'visible', timeout: 15_000 });
  await done.click();
  await page.waitForLoadState('networkidle');

  // ---- Case 1: Variable Weekly Off — Wednesday May 6 ----
  await selectAllEmployees(page);
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
  await selectAllEmployees(page);
  await page.getByLabel('Remark').selectOption('Additional Off');
  await page.getByLabel('Monday May 11').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button').filter({ hasText: /^$/ }).click();

  // ---- Case 3: Pending Off — Tuesday May 12 ----
  if (await offTypeAvailable(page, 'Pending Off')) {
    await page.locator('select[name="month"]').selectOption('May');
    await page.getByLabel('Remark').selectOption('Pending Off');
    await selectAllEmployees(page);
    await page.getByLabel('Remark').selectOption('Pending Off');
    await page.getByLabel('Tuesday May 12').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button').filter({ hasText: /^$/ }).click();
  }

  // ---- Case 4: Vallet Off — Tuesday May 5 ----
  if (await offTypeAvailable(page, 'Vallet Off')) {
    await page.locator('select[name="month"]').selectOption('May');
    await selectAllEmployees(page);
    await page.getByLabel('Remark').selectOption('Vallet Off');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByLabel('Tuesday May 5').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button').filter({ hasText: /^$/ }).click();
  }

  // ---- Cleanup: reset selections ----
  await page.locator('select[name="month"]').selectOption('May');
  await page.getByRole('button', { name: 'Deselect All' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
});