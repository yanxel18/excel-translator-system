import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "shell-controls-v3.test.ts",
    "frontend.test.ts",
    "branding-footer-v2.test.ts",
  ],
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5187",
  },
  webServer: {
    command:
      "npm --prefix project/apps/web run dev -- --host 127.0.0.1 --port 5187 --strictPort",
    url: "http://127.0.0.1:5187/excel-convert/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
