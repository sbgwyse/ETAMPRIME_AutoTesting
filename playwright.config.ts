import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Only pick up real specs, not compiled copies in dist/ or other folders
  testDir: '.',
  timeout: 180000,
  retries: 0,

  // One browser at a time: avoids several windows competing for the same
  // UAT login and reduces the chance of a window being closed by mistake.
  workers: 1,
  fullyParallel: false,

  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    ['./custom-report.ts'],
  ],

  use: {
    // Always capture a screenshot on failure (set to 'on' to capture every step)
    screenshot: 'only-on-failure',

    // Records a video of the whole run
    video: 'retain-on-failure',

    // Full step-by-step trace (DOM snapshots, network, console, actions)
    trace: 'retain-on-failure',

    // Visible browser window so you can watch it live.
    // Set to true once you no longer need to watch it manually.
    headless: false,

    // A hung page.goto now fails clearly after 60s instead of waiting forever
    navigationTimeout: 60000,
    actionTimeout: 30000,
  },
});