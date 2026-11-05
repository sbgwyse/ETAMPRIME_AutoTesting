import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { spawnSync } from 'child_process';
import { chromium } from '@playwright/test';

import {
  getTicket,
  getAccessToken,
  replyToTicket
} 
from './fetch-ticket';

import { getTask } from './fetch-task';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});


function ask(question: string): Promise<string> {

  return new Promise(resolve => {

    rl.question(question, answer => {

      resolve((answer || '').trim());

    });

  });

}

function parseEmailList(input: string): string[] {

  return input
    .split(',')
    .map(e => e.trim())
    .filter(e => e.length > 0);

}

function displayEmailDirectory(): void {

  const dataDir = path.join(__dirname, 'data');

  if (!fs.existsSync(dataDir)) {
    console.warn(`\n⚠️ Data folder not found: ${dataDir}\n`);
    return;
  }

  const csvFiles = fs
    .readdirSync(dataDir)
    .filter(file => file.toLowerCase().endsWith('.csv'));

  if (csvFiles.length === 0) {
    console.warn(`\n⚠️ No CSV file found in: ${dataDir}\n`);
    return;
  }
  const preferredFile =
    csvFiles.find(file => file.toLowerCase() === 'zohoContacts.csv') ||
    csvFiles[0];

  const csvPath = path.join(dataDir, preferredFile);

  try {
    const csvContent = fs.readFileSync(csvPath, 'utf-8').trim();

    if (!csvContent) {
      console.warn(`\n⚠️ CSV file is empty: ${csvPath}\n`);
      return;
    }

    const lines = csvContent
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0);

    const headers = lines[0]
      .split(',')
      .map(header => header.trim());

    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(value => value.trim());

      const row: Record<string, string> = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      return row;
    });

    console.log('\n================================================');
    console.log('             EMAIL DIRECTORY');
    console.log('================================================');
    console.log(`CSV File: ${preferredFile}\n`);

    console.table(rows);

    console.log('================================================\n');

  } catch (error) {
    console.error(`\n❌ Failed to read CSV file: ${csvPath}`);
    console.error(error);
    console.log('');
  }
}

const LOGIN_ERROR_SNIPPETS = [
  'login not created',
  'invalid credentials',
  'kindly contact hr',
];


async function checkCredentials(
  url: string,
  username: string,
  password: string
): Promise<boolean> {

  const browser = await chromium.launch();

  try {

    const page = await browser.newPage();

    await page.goto(url);

    await page
      .getByRole('textbox', { name: 'Username' })
      .fill(username);

    await page
      .getByRole('textbox', { name: 'Password' })
      .fill(password);

    await page
      .getByRole('button', { name: 'Sign In' })
      .click();

    await page
      .waitForLoadState('networkidle')
      .catch(() => { });

    const bodyText =
      await page
        .locator('body')
        .innerText()
        .catch(() => '');

    const lower =
      bodyText.toLowerCase();

    const hasError =
      LOGIN_ERROR_SNIPPETS.some(
        snippet => lower.includes(snippet)
      );

    return !hasError;

  }

  finally {

    await browser.close();

  }

}
function findProjectRoot(
  startPath: string
): string {

  let currentPath =
    path.resolve(
      path.dirname(startPath)
    );

  while (true) {

    const playwrightConfigTs =
      path.join(
        currentPath,
        'playwright.config.ts'
      );

    const playwrightConfigJs =
      path.join(
        currentPath,
        'playwright.config.js'
      );

    const packageJson =
      path.join(
        currentPath,
        'package.json'
      );

    if (
      fs.existsSync(playwrightConfigTs) ||
      fs.existsSync(playwrightConfigJs)
    ) {

      return currentPath;

    }

    if (
      fs.existsSync(packageJson)
    ) {

      return currentPath;

    }


    const parentPath =
      path.dirname(currentPath);


    if (
      parentPath === currentPath
    ) {

      break;

    }


    currentPath =
      parentPath;

  }


  return path.resolve(
    path.dirname(startPath)
  );

}


// ============================================================
// RUN EXISTING PLAYWRIGHT TEST(S)
// ============================================================
// Returns both whether the run passed AND the resolved project
// root, since the caller needs projectRoot to correctly locate
// the report files this run just generated (they're written
// relative to projectRoot, not to this script's own cwd).
// Accepts an array of test file paths (files OR directories) so
// multiple specs, or an entire folder, can be run together in a
// single Playwright invocation.

function runPlaywrightTest(
  testFilePaths: string[],
  url: string,
  username: string,
  password: string,
  sourceType: 'ticket' | 'task',
  sourceId: string,
  reportTitle: string,
  subject: string,
  description: string,
  requesterEmail: string
): { passed: boolean; projectRoot: string } {

  console.log('\n==========================================');
  console.log('       PLAYWRIGHT TEST CASE RUNNER');
  console.log('==========================================\n');


  // ----------------------------------------------------------
  // Find project root (based on the first test file)
  // ----------------------------------------------------------

  const projectRoot =
    findProjectRoot(testFilePaths[0]);


  // ----------------------------------------------------------
  // Relative test paths
  // ----------------------------------------------------------

  const relativeTestPaths =
    testFilePaths.map(testFilePath =>
      path
        .relative(
          projectRoot,
          testFilePath
        )
        .replace(/\\/g, '/')
    );


  console.log('PLAYWRIGHT PROJECT');
  console.log('------------------------------------------');

  console.log(
    `Root : ${projectRoot}`
  );

  relativeTestPaths.forEach(relativeTestPath => {

    console.log(
      `File : ${relativeTestPath}`
    );

  });

  console.log('------------------------------------------\n');
  const playwrightCommand =
    process.platform === 'win32'
      ? path.join(
          projectRoot,
          'node_modules',
          '.bin',
          'playwright.cmd'
        )
      : path.join(
          projectRoot,
          'node_modules',
          '.bin',
          'playwright'
        );


  console.log(
    `Playwright executable: ${playwrightCommand}`
  );


  if (
    !fs.existsSync(playwrightCommand)
  ) {

    console.error(
      '\n❌ Playwright executable not found!'
    );

    console.error(
      `Expected: ${playwrightCommand}`
    );

    console.error(
      '\nRun npm install inside the Playwright project.'
    );

    return { passed: false, projectRoot };

  }

  const playwrightCli =
    path.join(
      projectRoot,
      'node_modules',
      'playwright',
      'cli.js'
    );


  console.log(
    `Playwright CLI: ${playwrightCli}`
  );


  if (
    !fs.existsSync(playwrightCli)
  ) {

    console.error(
      '\n❌ Playwright CLI not found!'
    );

    console.error(
      `Expected: ${playwrightCli}`
    );

    console.error(
      '\nRun npm install inside the Playwright project.'
    );

    return { passed: false, projectRoot };

  }

  console.log('\n==========================================');
  console.log('RUNNING EXISTING PLAYWRIGHT TEST(S)');
  console.log('==========================================');

  console.log(
    `Report Title : ${reportTitle}`
  );

  console.log(
    `Source       : ${sourceType}`
  );

  console.log(
    `Source ID    : ${sourceId}`
  );

  console.log(
    `URL          : ${url}`
  );

  console.log(
    `Test Files   : ${relativeTestPaths.join(', ')}`
  );

  console.log(
    `Mode         : HEADed`
  );

  console.log('==========================================\n');

  const result =
    spawnSync(
      process.execPath,
      [
        playwrightCli,
        'test',
        ...relativeTestPaths,
        '--headed',
      ],
      {
        cwd: projectRoot,

        stdio: 'inherit',

        shell: false,

        env: {
          ...process.env,

          GENERATE_REPORT: 'true',

          TEST_URL: url,

          TEST_USERNAME: username,

          TEST_PASSWORD: password,

          REPORT_TITLE: reportTitle,

          SOURCE_TYPE: sourceType,

          SOURCE_ID: sourceId,

          TICKET_SUBJECT: subject,

          TICKET_DESCRIPTION: description,

          REQUESTER_EMAIL: requesterEmail,
        },
      }
    );

  if (
    result.error
  ) {

    console.error(
      '\n❌ Failed to start Playwright:'
    );

    console.error(
      result.error
    );

    return { passed: false, projectRoot };

  }


  console.log(
    `\nPlaywright exit status: ${result.status}`
  );

  console.log(
    `Playwright signal: ${result.signal}`
  );


  if (
    result.status === 0
  ) {

    console.log(
      '\n=========================================='
    );

    console.log(
      '✅ TEST EXECUTION COMPLETED'
    );

    console.log(
      '==========================================\n'
    );

    return { passed: true, projectRoot };

  }


  console.log(
    '\n=========================================='
  );

  console.log(
    '❌ TEST EXECUTION FAILED'
  );

  console.log(
    '=========================================='
  );

  console.log(
    '\nReport will still be generated.\n'
  );


  return { passed: false, projectRoot };

}

async function main() {

  console.log('\n=================================');
  console.log('ZOHO DESK TEST AUTOMATION');
  console.log('=================================\n');
  const ticketArg =
    process.argv.find(
      a => a.startsWith('--ticket=')
    );


  const taskArg =
    process.argv.find(
      a => a.startsWith('--task=')
    );


  let sourceType:
    'ticket' | 'task';


  let sourceId:
    string;


  if (ticketArg) {

    sourceType =
      'ticket';

    sourceId =
      ticketArg.split('=')[1];

  }

  else if (taskArg) {

    sourceType =
      'task';

    sourceId =
      taskArg.split('=')[1];

  }

  else {

    const type =
      await ask(
        'Ticket or Task? '
      );


    sourceType =
      type
        .toLowerCase()
        .startsWith('task')
        ? 'task'
        : 'ticket';


    sourceId =
      await ask(
        'Enter ID: '
      );

  }


  displayEmailDirectory();

  const toInput =
    await ask(
      '\nEnter TO email address: '
    );

  const ccInput =
    await ask(
      'Enter CC email address: '
    );

  const emailToList =
    parseEmailList(toInput);
  console.log(emailToList);
  const emailCcList =
    parseEmailList(ccInput);
  console.log(emailCcList);


  let subject = '';

  let description = '';

  let requesterEmail = '';
  
  let ticketId = '';

  console.log('\nFetching...');


  if (
    sourceType === 'ticket'
  ) {

    const ticket =
      await getTicket(
        sourceId
      );
    ticketId = ticket.id;

    subject =
      ticket.subject;


    description =
      ticket.description;


    requesterEmail =
      ticket.requesterEmail || '';

  }

  else {

    const task =
      await getTask(
        sourceId
      );


    subject =
      task.subject;


    description =
      task.description;


    requesterEmail =
      (task as any).requesterEmail || '';

  }

  console.log(
    '\n============== REQUIREMENTS =============='
  );

  console.log(
    subject
  );

  console.log(
    '------------------------------------------'
  );

  console.log(
    description
  );

  console.log(
    '==========================================\n'
  );

  const urlMatch =
    description.match(
      /https?:\/\/\S+/
    );


  const detectedUrl =
    urlMatch
      ? urlMatch[0]
          .replace(/[.,]+$/, '')
      : '';


  const url =
    await ask(
      `URL ${
        detectedUrl
          ? `[Enter=${detectedUrl}]`
          : ''
      }: `
    )
    || detectedUrl;


  if (!url) {

    console.error(
      'URL missing'
    );

    rl.close();

    process.exit(1);

  }

  let username = '';

  let password = '';

  let credentialsValid = false;


  while (
    !credentialsValid
  ) {

    username =
      await ask(
        'Username: '
      );


    password =
      await ask(
        'Password: '
      );


    console.log(
      '\nChecking Credentials...'
    );


    credentialsValid =
      await checkCredentials(
        url,
        username,
        password
      );


    if (
      !credentialsValid
    ) {

      console.log(
        '❌ Wrong. Please try again.\n'
      );

    }

    else {

      console.log(
        '✅ Success\n'
      );

    }

  }

  const reportTitle =
    await ask(
      `Report title [Enter=${subject}]: `
    )
    || subject;

  console.log('\n==========================================');

  console.log(
    '       EXISTING PLAYWRIGHT TEST(S)'
  );

  console.log(
    '==========================================\n'
  );


  // ------------------------------------------------------------
  // Accept one or more test file paths, comma-separated.
  // A path may also be a FOLDER (e.g. "tests" or "tests/"),
  // in which case Playwright will run every spec file inside it.
  // ------------------------------------------------------------

  const inputPath =
    await ask(
      'Enter the full path(s) of the Playwright test file(s) or folder(s) (comma-separated):\n> '
    );


  if (
    !inputPath.trim()
  ) {

    console.error(
      '\n❌ No test file path entered.'
    );

    rl.close();

    process.exit(1);

  }

  const testFilePaths =
    inputPath
      .split(',')
      .map(p =>
        p
          .trim()
          .replace(
            /^["']|["']$/g,
            ''
          )
      )
      .filter(p => p.length > 0)
      .map(p => path.resolve(p));

  if (testFilePaths.length === 0) {

    console.error(
      '\n❌ No valid test file paths entered.'
    );

    rl.close();

    process.exit(1);

  }

  for (const testFilePath of testFilePaths) {

    console.log(
      `\nTest file: ${testFilePath}`
    );

    if (
      !fs.existsSync(testFilePath)
    ) {

      console.error(
        '\n❌ Test file/folder not found!'
      );

      console.error(
        `Path: ${testFilePath}`
      );

      rl.close();

      process.exit(1);

    }

    const isDirectory =
      fs
        .statSync(testFilePath)
        .isDirectory();

    if (isDirectory) {

      // Directories are fine — Playwright will discover and run
      // every matching spec file inside it, so skip the
      // extension check below for this entry.
      console.log(
        '   (folder — Playwright will run every spec inside)'
      );

      continue;

    }

    const extension =
      path
        .extname(testFilePath)
        .toLowerCase();


    if (
      extension !== '.ts' &&
      extension !== '.js' &&
      extension !== '.mts' &&
      extension !== '.mjs'
    ) {

      console.error(
        '\n❌ Invalid test file type.'
      );

      console.error(
        `File: ${testFilePath}`
      );

      console.error(
        'Please select a Playwright test file such as .spec.ts or .spec.js, or a folder containing tests.'
      );

      rl.close();

      process.exit(1);

    }

  }

  const { passed: testPassed, projectRoot } =
    runPlaywrightTest(
      testFilePaths,
      url,
      username,
      password,
      sourceType,
      sourceId,
      reportTitle,
      subject,
      description,
      requesterEmail
    );


  const outDir =
    path.join(
      projectRoot,
      'TestResults'
    );


  const pdfPath =
    path.join(
      outDir,
      'Automation_Report.pdf'
    );


  const excelPath =
    path.join(
      outDir,
      'Automation_Report.xlsx'
    );


  const reportAttachments =
    [
      pdfPath,
      excelPath
    ]
    .filter(
      p => fs.existsSync(p)
    );

  if (
    reportAttachments.length < 2
  ) {

    console.warn(
      '\n⚠️ Could not find both report files at the expected paths:\n' +
      `   ${pdfPath}\n` +
      `   ${excelPath}\n` +
      'Adjust the paths above if generatePDF/generateExcel write elsewhere.\n'
    );

  }

  // Ran at least one folder → treat this as a full-suite run for
  // the purposes of the summary email (module names don't make
  // sense for "the whole tests/ folder").
  const ranAllTests =
    testFilePaths.some(p =>
      fs.statSync(p).isDirectory()
    );

  const testFileModules =
    testFilePaths
      .map(testFilePath =>
        path
          .basename(testFilePath)
          .replace(/\.spec\.(ts|js|mts|mjs)$/i, '')
      )
      .join(', ');

  const who = 'Sanika Gore';

  const summary =
    `Dear Team,\n` +
    (
      ranAllTests
        ? `We have checked and observed that all test cases are working as expected.\n`
        : `We have checked and observed that the ${testFileModules} Form(s) are working as expected.\n`
    ) +
    `Please see the Attachments.\n\n` +
    `Regards,\n` +
    `${who}`;

  if (
    sourceType === 'ticket'
  ) {

    console.log(
      '\nReplying to ticket...'
    );

    console.log(
      `Attaching ${reportAttachments.length} report file(s): ${reportAttachments.map(p => path.basename(p)).join(', ') || '(none found)'}`
    );


    try {

      const accessToken =
        await getAccessToken();


      await replyToTicket(
        sourceId,

        accessToken,

        summary.replace(
          /\n/g,
          '<br>'
        ),

        emailToList.join(',') || requesterEmail,

        reportAttachments.map(
          p => ({
            path: p,
            name: path.basename(p)
          })
        ),

        emailCcList.length ? emailCcList.join(',') : undefined
      );


      console.log(
        'Ticket reply sent.'
      );

    }

    catch (err) {

      console.error(
        'Failed to reply to ticket:',
        err
      );

    }

  }

  else {

    console.log(
      '\nSkipping ticket reply (source is a task, not a ticket).'
    );

  }
  console.log(
    '\nCheck TestResults folder.'
  );


  rl.close();

}

main()
  .catch(err => {

    console.error(
      err
    );

    rl.close();

    process.exit(1);

  });