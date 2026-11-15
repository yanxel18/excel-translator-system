import { defineConfig } from "@playwright/test";

// Separate ephemeral Vite server: never reuse or restart the running Compose stack.
export default defineConfig({
  testDir: "./tests",
  testMatch: ["authentication-v2.test.ts", "management-validation.test.ts", "frontend.test.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5188" },
  webServer: {
    command: "npm --prefix project/apps/web run dev -- --host 127.0.0.1 --port 5188 --strictPort",
    url: "http://127.0.0.1:5188/excel-convert/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
