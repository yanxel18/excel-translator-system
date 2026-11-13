import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("workbooks use decorative Excel-style SVG icons across pages", async ({ page }) => {
  const job = {
    id: "job-1",
    fileName: "report.xlsx",
    fileSize: 1024,
    status: "COMPLETED",
    progress: 100,
    createdAt: "2026-11-12T00:00:00.000Z",
    sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH",
    selectedSheets: [],
    availableSheets: [],
    vocabularyGroupId: null,
  };
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "workbook-test-session"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    const body =
      path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/jobs"
          ? [job]
          : path === "/history"
            ? { data: [job], total: 1, page: 1, pageSize: 10, nextCursor: null }
            : path === "/notifications/unread-count"
              ? { count: 0 }
              : [];
    await route.fulfill({ json: body });
  });
  for (const route of ["", "history", "profile"]) {
    await page.goto(`${web}${route}`);
    await expect(page.getByText("report.xlsx").first()).toBeVisible();
    const icons = page.locator("main svg.workbook-icon");
    await expect(icons.first()).toBeVisible();
    await expect(icons.first()).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("svg.lucide-file-spreadsheet")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 320, height: 768 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.locator("main svg.workbook-icon").first()).toBeVisible();
  await expect(page.locator("main svg.workbook-icon").first()).toHaveAttribute("aria-hidden", "true");
});
