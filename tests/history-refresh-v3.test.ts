import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("history refreshes automatically and reports failures without losing URL state", async ({
  page,
}) => {
  let requests = 0;
  let completed = false;
  let includeNew = false;
  let fail = false;
  const queries: string[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "history-test-session"),
  );
  await page.route(`${api}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(api).pathname, "");
    if (path === "/history") {
      requests += 1;
      queries.push(url.search);
      if (fail) {
        await route.fulfill({ status: 500, json: { message: "History unavailable" } });
        return;
      }
      const jobs = [
        {
          id: "job-1",
          fileName: "report.xlsx",
          fileSize: 1024,
          status: completed ? "COMPLETED" : "PROCESSING",
          progress: completed ? 100 : 20,
          createdAt: "2026-11-12T00:00:00.000Z",
          sourceLanguage: "JAPANESE",
          targetLanguage: "ENGLISH",
          selectedSheets: [],
          availableSheets: [],
          vocabularyGroupId: null,
        },
      ];
      if (includeNew)
        jobs.push({ ...jobs[0], id: "job-2", fileName: "new-report.xlsx" });
      await route.fulfill({
        json: { data: jobs, total: 45, page: 2, pageSize: 20, nextCursor: null },
      });
      return;
    }
    await route.fulfill({
      json:
        path === "/profile"
          ? { id: "owner", username: "alice", isAdmin: false }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [],
    });
  });
  await page.goto(`${web}history?q=report&page=2&pageSize=20`);
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
  await expect(page.getByText("processing", { exact: true })).toBeVisible();
  completed = true;
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible({ timeout: 5000 });
  includeNew = true;
  await expect(page.getByRole("button", { name: "new-report.xlsx", exact: true })).toBeVisible({ timeout: 5000 });
  fail = true;
  await expect(page.getByRole("alert")).toContainText("History unavailable", { timeout: 5000 });
  fail = false;
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 5000 });
  expect(queries.every((query) =>
    query.includes("q=report") && query.includes("page=2") && query.includes("pageSize=20"),
  )).toBe(true);
  await expect(page).toHaveURL(/q=report.*page=2.*pageSize=20/);
  await page.goto(web);
  await page.waitForTimeout(1500);
  const afterNavigation = requests;
  await page.waitForTimeout(1500);
  expect(requests).toBe(afterNavigation);
});

test("history polling stops when the session expires", async ({ page }) => {
  let requests = 0;
  let expired = false;
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "history-test-session"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    if (path === "/history") {
      requests += 1;
      if (expired) {
        await route.fulfill({ status: 401, json: { message: "Unauthorized" } });
        return;
      }
      await route.fulfill({
        json: { data: [], total: 0, page: 1, pageSize: 10, nextCursor: null },
      });
      return;
    }
    await route.fulfill({
      json:
        path === "/profile"
          ? { id: "owner", username: "alice", isAdmin: false }
          : path === "/auth/oidc/config"
            ? { mode: "LOCAL", enabled: false }
            : path === "/notifications/unread-count"
              ? { count: 0 }
              : [],
    });
  });
  await page.goto(`${web}history`);
  await expect(page.getByText("No workbooks in history yet.")).toBeVisible();
  expired = true;
  await expect(page.getByText("Your session has expired. Please sign in again.")).toBeVisible({ timeout: 5000 });
  const afterExpiry = requests;
  await page.waitForTimeout(1500);
  expect(requests).toBe(afterExpiry);
});
