
import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { spawnSync } from 'child_process';
import { chromium } from '@playwright/test';

import {
  getTicket,
  getAccessToken,
  replyToTicket,
} from './fetch-ticket';

import { getTask } from './fetch-task';

// ============================================================
// READLINE
// ============================================================

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
    .map(email => email.trim())
    .filter(Boolean);
}

// ============================================================
// EMAIL DIRECTORY
// ============================================================

function displayEmailDirectory(): void {
  const dataDir = path.join(__dirname, 'data');

  if (!fs.existsSync(dataDir)) {
    console.warn(`Data folder not found: ${dataDir}`);
    return;
  }

  const csvFiles = fs.readdirSync(dataDir)
    .filter(file => file.toLowerCase().endsWith('.csv'));

  if (!csvFiles.length) {
    console.warn(`No CSV files found in ${dataDir}`);
    return;
  }

  const preferredFile =
    csvFiles.find(file => file.toLowerCase() === 'zohocontacts.csv')
    || csvFiles[0];

  const csvPath = path.join(dataDir, preferredFile);

  try {
    const content = fs.readFileSync(csvPath, 'utf8').trim();

    if (!content) {
      console.warn(`CSV file is empty: ${csvPath}`);
      return;
    }

    const lines = content.split(/\r?\n/)
      .filter(line => line.trim());

    const headers = lines[0].split(',').map(value => value.trim());

    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(value => value.trim());
      const row: Record<string, string> = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      return row;
    });

    console.log(`\nEMAIL DIRECTORY (${preferredFile})`);
    console.table(rows);
  } catch (error) {
    console.error('Failed to read email directory:', error);
  }
}

// ============================================================
// CREDENTIAL VALIDATION
// ============================================================

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

    await page.getByRole('textbox', { name: 'Username' })
      .fill(username);

    await page.getByRole('textbox', { name: 'Password' })
      .fill(password);

    await page.getByRole('button', { name: 'Sign In' })
      .click();

    await page.waitForLoadState('networkidle').catch(() => {});

    const bodyText = await page.locator('body')
      .innerText()
      .catch(() => '');

    const lower = bodyText.toLowerCase();

    return !LOGIN_ERROR_SNIPPETS.some(
      snippet => lower.includes(snippet)
    );
  } finally {
    await browser.close();
  }
}

// ============================================================
// FIND PLAYWRIGHT PROJECT ROOT
// ============================================================

function findProjectRoot(startPath: string): string {
  let currentPath = path.resolve(
    fs.statSync(startPath).isDirectory()
      ? startPath
      : path.dirname(startPath)
  );

  while (true) {
    const hasConfig =
      fs.existsSync(path.join(currentPath, 'playwright.config.ts'))
      || fs.existsSync(path.join(currentPath, 'playwright.config.js'))
      || fs.existsSync(path.join(currentPath, 'playwright.config.mts'))
      || fs.existsSync(path.join(currentPath, 'playwright.config.mjs'));

    if (hasConfig) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);

    if (parentPath === currentPath) {
      break;
    }

    currentPath = parentPath;
  }

  throw new Error(
    `Could not find playwright.config.ts or .js for: ${startPath}`
  );
}

// ============================================================
// RUN PLAYWRIGHT AGAINST A FILE OR FOLDER
// ============================================================

function runPlaywrightTest(
  testTargetPath: string,
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

  const projectRoot = findProjectRoot(testTargetPath);

  const relativeTarget = path.relative(
    projectRoot,
    testTargetPath
  ).replace(/\\/g, '/');

  const stats = fs.statSync(testTargetPath);

  if (!stats.isFile() && !stats.isDirectory()) {
    throw new Error('Target must be a test file or folder.');
  }

  if (stats.isFile()) {
    const extension = path.extname(testTargetPath).toLowerCase();

    if (!['.ts', '.js', '.mts', '.mjs'].includes(extension)) {
      throw new Error(`Unsupported test file extension: ${extension}`);
    }
  }

  const executable = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
  );

  const cliCandidates = [
    path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
    path.join(projectRoot, 'node_modules', 'playwright', 'cli.js'),
  ];

  const playwrightCli = cliCandidates.find(
    candidate => fs.existsSync(candidate)
  );

  if (!fs.existsSync(executable) || !playwrightCli) {
    throw new Error(
      `Playwright installation not found in ${projectRoot}. Run npm install.`
    );
  }

  // Use one output directory for the entire run.
  const resultsDir = path.join(projectRoot, 'TestResults');

  fs.mkdirSync(resultsDir, { recursive: true });

  const oldReports = [
  'Automation_Report.pdf',
  'Automation_Report.xlsx',
  'playwright-results.json',
];

for (const report of oldReports) {
  const reportPath = path.join(resultsDir, report);

  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
    console.log(`Deleted previous report: ${report}`);
  }
}


  const jsonPath = path.join(
    resultsDir,
    'playwright-results.json'
  );

  // Prevent stale results from being mistaken for this run.
  if (fs.existsSync(jsonPath)) {
    fs.unlinkSync(jsonPath);
  }

  console.log('\n==========================================');
  console.log('PLAYWRIGHT TEST EXECUTION');
  console.log('==========================================');
  console.log(`Project root : ${projectRoot}`);
  console.log(`Target       : ${relativeTarget}`);
  console.log(`Target type  : ${stats.isDirectory() ? 'Folder' : 'File'}`);
  console.log(`Report title : ${reportTitle}`);
  console.log(`Source       : ${sourceType} ${sourceId}`);
  console.log('==========================================\n');

  const result = spawnSync(
    process.execPath,
    [
      playwrightCli,
      'test',
      relativeTarget,
      '--headed',
      // Supplying --reporter replaces the reporters from playwright.config.ts.
      // Keep the custom reporter here so one failed test still produces the
      // combined PDF/Excel report after Playwright has run every test.
      '--reporter=list,json,./custom-report.ts',
      // Be explicit: a failed test must not prevent the remaining tests in
      // the selected folder from running.
      '--max-failures=0',
      // Run the selected files in a predictable order. This is especially
      // important for UI tests that use the same application and credentials.
      '--workers=1',
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

        PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath,
        REPORT_OUTPUT_DIR: resultsDir,
      },
    }
  );

  if (result.error) {
    console.error('Failed to start Playwright:', result.error);
  }

  if (result.signal) {
    console.error(`Playwright terminated by signal: ${result.signal}`);
  }

  if (result.status !== 0) {
    console.error(`Playwright exit status: ${result.status}`);
    console.error('One or more tests may have failed.');
  } else {
    console.log('\nPlaywright execution completed successfully.');
  }

  if (fs.existsSync(jsonPath)) {
    console.log(`Combined JSON results: ${jsonPath}`);
  } else {
    console.warn(
      'JSON results were not generated. Check the Playwright reporter configuration.'
    );
  }

  return {
    passed: result.status === 0 && !result.error && !result.signal,
    projectRoot,
  };
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  console.log('\n=================================');
  console.log('ZOHO DESK TEST AUTOMATION');
  console.log('=================================\n');

  // ----------------------------------------------------------
  // Ticket or task
  // ----------------------------------------------------------

  const ticketArg = process.argv.find(arg => arg.startsWith('--ticket='));
  const taskArg = process.argv.find(arg => arg.startsWith('--task='));

  let sourceType: 'ticket' | 'task';
  let sourceId: string;

  if (ticketArg) {
    sourceType = 'ticket';
    sourceId = ticketArg.slice('--ticket='.length);
  } else if (taskArg) {
    sourceType = 'task';
    sourceId = taskArg.slice('--task='.length);
  } else {
    const type = await ask('Ticket or Task? ');

    sourceType = type.toLowerCase().startsWith('task')
      ? 'task'
      : 'ticket';

    sourceId = await ask('Enter ID: ');
  }

  if (!sourceId) {
    throw new Error('Ticket/task ID is required.');
  }

  displayEmailDirectory();

  // ----------------------------------------------------------
  // Email recipients
  // ----------------------------------------------------------

  const emailToList = parseEmailList(
    await ask('\nEnter TO email address: ')
  );

  const emailCcList = parseEmailList(
    await ask('Enter CC email address: ')
  );

  // ----------------------------------------------------------
  // Fetch ticket/task
  // ----------------------------------------------------------

  let subject = '';
  let description = '';
  let requesterEmail = '';
  let internalTicketId = '';

  console.log('\nFetching ticket/task...');

  if (sourceType === 'ticket') {
    const ticket = await getTicket(sourceId);
    internalTicketId = ticket.id;
    subject = ticket.subject;
    description = ticket.description;
    requesterEmail = ticket.requesterEmail || '';
  } else {
    const task = await getTask(sourceId);

    subject = task.subject;
    description = task.description;
    requesterEmail = (task as any).requesterEmail || '';
  }

  console.log('\n============== REQUIREMENTS ==============');
  console.log(subject);
  console.log('------------------------------------------');
  console.log(description);
  console.log('==========================================\n');

  // ----------------------------------------------------------
  // URL
  // ----------------------------------------------------------

  const urlMatch = description.match(/https?:\/\/\S+/);

  const detectedUrl = urlMatch
    ? urlMatch[0].replace(/[.,]+$/, '')
    : '';

  const enteredUrl = await ask(
    `URL ${detectedUrl ? `[Enter=${detectedUrl}]` : ''}: `
  );

  const url = enteredUrl || detectedUrl;

  if (!url) {
    throw new Error('URL is required.');
  }

  // ----------------------------------------------------------
  // Credentials
  // ----------------------------------------------------------

  let username = '';
  let password = '';
  let credentialsValid = false;

  while (!credentialsValid) {
    username = await ask('Username: ');
    password = await ask('Password: ');

    if (!username || !password) {
      console.log('Username and password are required.\n');
      continue;
    }

    console.log('\nChecking credentials...');

    credentialsValid = await checkCredentials(
      url,
      username,
      password
    );

    console.log(
      credentialsValid
        ? 'Credentials validated.\n'
        : 'Login validation failed. Please try again.\n'
    );
  }

  // ----------------------------------------------------------
  // Report title
  // ----------------------------------------------------------

  const reportTitle =
    await ask(`Report title [Enter=${subject}]: `) || subject;

  // ----------------------------------------------------------
  // Test file OR folder
  // ----------------------------------------------------------

  const inputPath = await ask(
    '\nEnter the full path of the Playwright test file or folder:\n> '
  );

  if (!inputPath) {
    throw new Error('Test file/folder path is required.');
  }

  const testTargetPath = path.resolve(
    inputPath.replace(/^["']|["']$/g, '')
  );

  if (!fs.existsSync(testTargetPath)) {
    throw new Error(`Test file/folder not found: ${testTargetPath}`);
  }

  // ----------------------------------------------------------
  // Run all matching tests in one Playwright invocation
  // ----------------------------------------------------------

  const { passed: testPassed, projectRoot } = runPlaywrightTest(
    testTargetPath,
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

  // ----------------------------------------------------------
  // Locate the combined PDF and Excel reports
  // ----------------------------------------------------------

  const outDir = path.join(projectRoot, 'TestResults');

  const pdfPath = path.join(
    outDir,
    'Automation_Report.pdf'
  );

  const excelPath = path.join(
    outDir,
    'Automation_Report.xlsx'
  );

  const jsonPath = path.join(
    outDir,
    'playwright-results.json'
  );

const pdfExists = fs.existsSync(pdfPath);
const excelExists = fs.existsSync(excelPath);

const reportAttachments: string[] = [];

if (pdfExists && excelExists) {
  reportAttachments.push(pdfPath, excelPath);

  console.log('Both reports generated successfully.');
} else {
  console.warn(
    'Reports will not be attached because the current execution ' +
    'failed or one or more reports were not generated.'
  );
}

  console.log('\n==========================================');
  console.log('REPORT SUMMARY');
  console.log('==========================================');
  console.log(`Execution status : ${testPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`JSON results     : ${fs.existsSync(jsonPath) ? jsonPath : 'Not found'}`);
  console.log(`PDF report       : ${fs.existsSync(pdfPath) ? pdfPath : 'Not found'}`);
  console.log(`Excel report     : ${fs.existsSync(excelPath) ? excelPath : 'Not found'}`);
  console.log('==========================================\n');

  if (reportAttachments.length !== 2) {
    console.warn(
      'Both combined PDF and Excel reports were not found. ' +
      'Ensure your report generator creates them in TestResults.'
    );
  }

  // ----------------------------------------------------------
  // Reply to Zoho ticket
  // ----------------------------------------------------------

const summary =
  `Automated test "${reportTitle}" ${
    testPassed ? 'PASSED' : 'FAILED'
  }.\n\n` +
  (
    reportAttachments.length === 2
      ? 'Please find the PDF and Excel reports attached.'
      : 'Reports could not be generated successfully for this execution. No reports have been attached.'
  );

  if (sourceType === 'ticket') {
    console.log('\nReplying to ticket...');
    console.log(
      `Attachments: ${reportAttachments.map(file => path.basename(file)).join(', ') || '(none found)'}`
    );

    try {
      const accessToken = await getAccessToken();
      
      await replyToTicket(
        internalTicketId,
        accessToken,
        summary.replace(/\n/g, '<br>'),
        emailToList.join(',') || requesterEmail,
        reportAttachments.map(file => ({
          path: file,
          name: path.basename(file),
        })),
        emailCcList.length
          ? emailCcList.join(',')
          : undefined
      );

      console.log('Ticket reply sent.');
    } catch (error) {
      console.error('Failed to reply to ticket:', error);
    }
  } else {
    console.log('\nSkipping ticket reply because the source is a task.');
  }

  console.log('\nCheck the TestResults folder.');

  // Preserve a failure exit code for CI or calling scripts.
  rl.close();

  if (!testPassed) {
    process.exitCode = 1;
  }
}

// ============================================================
// ERROR HANDLING
// ============================================================

main().catch(error => {
  console.error('\nAutomation failed:', error);
  rl.close();
  process.exitCode = 1;
});
