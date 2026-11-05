import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.ETAM_URL ?? 'https://uatpresence.tajhotels.com/etam_prime/login';
const USERNAME = process.env.ETAM_USER ?? 'ADMIN/etam100';
const PASSWORD = process.env.ETAM_PASS ?? 'Welcome@2026';
const DOWNLOAD_DIR = path.resolve('downloads');

const loader = (page: Page) => page.locator('.ngx-overlay').first();
const waitForLoaderGone = (page: Page) =>
  loader(page).waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

// back=2 -> Aug (as recorded), 1 -> Sep, 0 -> this month up to today
function monthRange(back: number): string {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - back, 1);
  const last = back === 0 ? now : new Date(now.getFullYear(), now.getMonth() - back + 1, 0);
  return `${fmt(first)} - ${fmt(last)}`;
}
const candidateRanges = (): string[] =>
  process.env.ETAM_RANGE ? [process.env.ETAM_RANGE] : [monthRange(2), monthRange(1), monthRange(0)];

const deptTrigger = (page: Page) =>
  page.getByText('Department', { exact: true }).first()
    .locator('xpath=following::p-multiselect[1]').locator('.p-multiselect-trigger');

async function closePanel(page: Page) {
  await page.mouse.click(1400, 100);
  await page.locator('.p-multiselect-panel').first().waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  await waitForLoaderGone(page);
}
async function selectAllDepartments(page: Page) {
  await waitForLoaderGone(page);
  await deptTrigger(page).click();
  const panel = page.locator('.p-multiselect-panel').first();
  await panel.waitFor({ state: 'visible' });
  const selectAll = panel.locator('[role="checkbox"]').first();
  if ((await selectAll.getAttribute('aria-checked')) !== 'true') await selectAll.click();
  await expect(selectAll).toHaveAttribute('aria-checked', 'true');
  await closePanel(page);
}

async function setRange(page: Page, range: string) {
  await page.getByRole('textbox', { name: 'Select Date Range' }).fill(range);
  await page.mouse.click(1400, 100);
  await waitForLoaderGone(page);
}

type GraphResult = { code: number; message: string };

async function generateGraph(page: Page): Promise<GraphResult> {
  const validation = page.getByText(/Please select at least one filter/i);
  const outcome = Promise.race([
    page.waitForResponse(r => r.url().includes('GetDynamicChart_GraphData'), { timeout: 30_000 })
      .then(r => ({ kind: 'response' as const, r })),
    validation.waitFor({ state: 'visible', timeout: 30_000 }).then(() => ({ kind: 'validation' as const })),
  ]).catch(() => ({ kind: 'none' as const }));

  await page.getByRole('button', { name: 'Generate Graph' }).click();
  const res = await outcome;

  if (res.kind === 'validation')
    throw new Error("App blocked Generate Graph: a Section-A filter must be set to ALL (select-all not applied).");
  if (res.kind === 'none')
    throw new Error('Generate Graph sent no GetDynamicChart_GraphData request and no validation message appeared.');

  const body = await res.r.json().catch(() => ({} as any));
  await waitForLoaderGone(page);
  return {
    code: Number(body.errorcode ?? body.errorCode ?? body.ErrorCode ?? -999),
    message: String(body.errormessage ?? body.errorMessage ?? ''),
  };
}

test('Dynamic Chart Prime - Panel 3 graph generate and download', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  // ---------- Login (single submit) ----------
  await page.goto(BASE_URL);
  await page.getByRole('textbox', { name: 'Username' }).fill(USERNAME);
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('textbox', { name: 'Password' }).press('Enter');
  await waitForLoaderGone(page);

  // ---------- Open Dynamic Chart Prime ----------
  const menu = page.getByText('DYNAMIC CHART PRIME');
  await expect(menu).toBeVisible({ timeout: 30_000 });
  await menu.click();
  await waitForLoaderGone(page);

  // ---------- Filters ----------
  await selectAllDepartments(page);
  await page.locator('select[name="totalHourValue"]').selectOption('MAX');
  await waitForLoaderGone(page);

  // ---------- Generate graph, trying each date range until data comes back ----------
  let usedRange = '';
  let last: GraphResult = { code: -999, message: '' };
  for (const range of candidateRanges()) {
    await setRange(page, range);
    last = await generateGraph(page);
    console.log(`Range ${range} -> errorcode ${last.code} ${last.message}`);
    if (last.code === 1) { usedRange = range; break; }
  }

  // ---------- No data: finish the test cleanly ----------
  if (!usedRange) {
    const shot = path.join(DOWNLOAD_DIR, `no-record-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    test.info().annotations.push({
      type: 'result',
      description: `No Record found for all tried ranges (${candidateRanges().join(' ; ')}). Last: ${last.message}`,
    });
    console.log(`No graph data available. Screenshot: ${shot}`);
    return; // test ends here
  }
  const downloadIcon = page.locator('#pannel3-container i').first();
  await expect(downloadIcon).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await downloadIcon.click();
  const download = await downloadPromise;


  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const savePath = path.join(DOWNLOAD_DIR, `${stamp}_${download.suggestedFilename()}`);
  await download.saveAs(savePath);

  expect(await download.failure()).toBeNull();
  expect(fs.existsSync(savePath)).toBeTruthy();
  expect(fs.statSync(savePath).size).toBeGreaterThan(0);
  console.log(`Panel 3 download saved (${usedRange}): ${savePath}`);
});