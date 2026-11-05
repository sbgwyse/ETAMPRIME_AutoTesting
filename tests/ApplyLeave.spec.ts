import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SUPPORTING_DOC = path.join(__dirname, '..', 'fixtures', 'sample-supporting-doc.pdf');

/** Creates a small valid one-page PDF if the fixture is missing, so the test doesn't depend on a hand-made file. */
function ensureSupportingDoc(file: string) {
  if (fs.existsSync(file)) return;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 56 >>\nstream\nBT /F1 18 Tf 20 70 Td (Sample supporting document) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (pdf += `${String(o).padStart(10, '0')} 00000 n \n`));
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pdf);
}

test('Apply/Cancel Leave - submit leave for a random employee', async ({ page }) => {
  // --- Login ---
  await page.goto('https://uatpresence.tajhotels.com/etam_prime/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('ADMIN/etam480');
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.ETAM_PASSWORD || '$WysE123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // --- Navigate to ELMS > Apply/Cancel Leave ---
  await page.getByText('ELMS').click();

  // Opening this screen loads the full employee list (Employees/All_Employees).
  // Start listening before selecting the option so the response isn't missed.
  const employeesResponse = page
    .waitForResponse((r) => r.url().includes('Employees/All_Employees'), { timeout: 20000 })
    .catch(() => null);
  await page.getByRole('combobox').selectOption('Apply/Cancel Leave');

  // --- Select a random employee ---
  await page.locator('p-autocomplete').waitFor({ state: 'visible', timeout: 15000 });

  // Pick a random employee ID from the list the app itself loaded.
  let employeeId = '';
  const response = await employeesResponse;
  if (response) {
    const body = await response.json().catch(() => null);
    const ids: string[] = (body?.data ?? []).map((e: { EmployeeId: string }) => e.EmployeeId).filter(Boolean);
    if (ids.length) employeeId = ids[Math.floor(Math.random() * ids.length)];
  }

  // The chevron button only focuses the box and opens nothing in this app (the trace shows no panel
  // after the click), so type to trigger the search instead. Fall back to "4" if the list wasn't captured.
  const employeeInput = page.locator('p-autocomplete input[type="text"]');
  await employeeInput.click();
  await employeeInput.pressSequentially(employeeId || '4', { delay: 60 });

  const employeeOptions = page
    .locator('.p-autocomplete-panel .p-autocomplete-item')
    .or(page.locator('.p-autocomplete-panel').getByRole('option'));
  await employeeOptions.first().waitFor({ state: 'visible', timeout: 15000 });

  // With a known ID pick that employee; otherwise pick any option at random.
  const chosenEmployee = employeeId
    ? employeeOptions.filter({ hasText: employeeId }).first()
    : employeeOptions.nth(Math.floor(Math.random() * (await employeeOptions.count())));

  const employeeText = ((await chosenEmployee.textContent()) ?? '').trim();
  if (!employeeId) employeeId = employeeText.split('-')[0].trim();
  console.log(`Selected employee: ${employeeText} (ID: ${employeeId})`);

  await chosenEmployee.click();
  await expect(employeeInput).toHaveValue(new RegExp(employeeId));

  // --- Select a random leave type ---
  // The leave types are loaded by an API call (elms/Leave_Type) after the employee is picked, so the
  // dropdown first contains only the "--Select Leave Type--" placeholder (value "-1"). Wait for the
  // real options before choosing one — reading too early picked the placeholder and the date range never appeared.
  const leaveDropdown = page.locator('select[name="selectedLeave"]');
  const getLeaveValues = () =>
    leaveDropdown.locator('option').evaluateAll((opts) =>
      (opts as HTMLOptionElement[])
        .filter((o) => o.value.trim() !== '' && o.value !== '-1' && !o.disabled)
        .map((o) => o.value)
    );

  await expect
    .poll(async () => (await getLeaveValues()).length, { message: 'leave types should load', timeout: 15000 })
    .toBeGreaterThan(0);

  const leaveValues = await getLeaveValues();
  const randomLeaveValue = leaveValues[Math.floor(Math.random() * leaveValues.length)];
  await leaveDropdown.selectOption(randomLeaveValue);
  console.log(`Selected leave type value: ${randomLeaveValue}`);

  // --- Date range ---
  const dateRange = page.getByRole('textbox', { name: 'Select Date Range' });
  await dateRange.waitFor({ state: 'visible', timeout: 15000 });
  await dateRange.click();

  // NOTE: preserved from your recording, but this is fragile — matching
  // bare "1" and the 5th "3" on the page (nth(4)) depends on exactly which
  // digits happen to appear elsewhere on the calendar/page at click time.
  // If this becomes unreliable, scope both clicks to the calendar's month
  // panel the way the Compensatory Off spec does.
  await page.getByText('1', { exact: true }).first().click(); // start date
  await page.getByText('3').nth(4).click(); // end date

  // --- Attach supporting document ---
  // Absolute path from the fixtures folder; the file is created automatically if it doesn't exist yet.
  ensureSupportingDoc(SUPPORTING_DOC);
  await page.getByRole('button', { name: 'Choose File' }).setInputFiles(SUPPORTING_DOC);

  // --- Submit ---
  await page.getByRole('button', { name: 'Submit Leave' }).click();

  // Optional: assert a success indicator appears after submission.
  // await expect(page.getByText('Leave applied successfully')).toBeVisible();
});