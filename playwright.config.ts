import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you have test failures */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use */
  reporter: "html",
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: "http://localhost:5173",
    launchOptions: process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {},

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm --prefix project/apps/web run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173/excel-convert/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
