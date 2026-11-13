import { expect, test } from "@playwright/test";

const apiBaseUrl =
  process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const webBasePath = process.env.WEB_BASE_PATH || "/excel-convert/";

test("history page size stays with pagination and preserves URL state", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "history-token"),
  );
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    const body =
      path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/history"
          ? {
              data: url.searchParams.get("q") === "empty" ? [] : [
                {
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
                },
              ],
              total: url.searchParams.get("q") === "empty" ? 0 : 81,
              page: Number(url.searchParams.get("page") || 1),
              pageSize: Number(url.searchParams.get("pageSize") || 10),
              nextCursor: null,
            }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({ json: body });
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${webBasePath}history?q=report&page=2&pageSize=20`);
  const rows = page.getByRole("textbox", { name: "Rows per page" });
  const pagination = page.locator('[aria-label="History pages"]');
  const table = page.getByRole("table");
  await expect(rows).toHaveValue("20");
  await expect(pagination).toBeVisible();
  const [rowsBox, paginationBox, tableBox] = await Promise.all([
    rows.boundingBox(),
    pagination.boundingBox(),
    table.boundingBox(),
  ]);
  expect(rowsBox!.y).toBeGreaterThan(tableBox!.y + tableBox!.height);
  expect(Math.abs(rowsBox!.y - paginationBox!.y)).toBeLessThan(40);

  await rows.click();
  await page.getByRole("option", { name: "30", exact: true }).click();
  await expect(page).toHaveURL(/q=report/);
  await expect(page).toHaveURL(/pageSize=30/);
  await expect(page).not.toHaveURL(/page=2/);
  await pagination.getByRole("button", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  await expect(rows).toHaveValue("30");
  await expect(page).toHaveURL(/page=2/);
  await page.goBack();
  await expect(page).not.toHaveURL(/page=2/);

  await page.setViewportSize({ width: 320, height: 768 });
  await rows.click();
  await page.getByRole("option", { name: "10", exact: true }).click();
  await expect(page).not.toHaveURL(/pageSize=/);
  await expect(rows).toBeVisible();
  await expect(pagination).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await pagination.getByRole("button", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);

  await page.goto(`${webBasePath}history?q=empty`);
  await expect(page.getByText("No matching workbooks.")).toBeVisible();
  await expect(rows).toBeVisible();
  await expect(pagination).toHaveCount(0);
});
