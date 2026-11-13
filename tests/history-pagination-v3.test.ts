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
  const rowsLabel = page.locator("label").filter({ hasText: "Rows per page" });
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
  const next = pagination.locator("button").last();
  const nextBox = await next.boundingBox();
  expect(rowsBox!.x).toBeGreaterThanOrEqual(nextBox!.x + nextBox!.width);
  expect(rowsBox!.x - (nextBox!.x + nextBox!.width)).toBeLessThanOrEqual(16);
  expect(rowsBox!.width).toBeLessThanOrEqual(80);
  const labelBox = await rowsLabel.boundingBox();
  expect(labelBox!.width).toBeGreaterThan(20);
  expect(labelBox!.height).toBeGreaterThan(10);
  expect(labelBox!.y).toBeGreaterThanOrEqual(tableBox!.y + tableBox!.height);
  expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(rowsBox!.y);
  expect(labelBox!.y + labelBox!.height).toBeLessThanOrEqual(nextBox!.y);
  await page.screenshot({ path: test.info().outputPath("history-desktop.png") });

  await rows.click();
  for (const size of ["10", "20", "30", "40", "50"]) {
    await expect(page.getByRole("option", { name: size, exact: true })).toBeVisible();
  }
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
  await rows.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await expect.poll(() => rows.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.right - 8, bounds.top + bounds.height / 2);
    return hit === element || element.parentElement?.contains(hit);
  })).toBe(true);
  await expect(page).not.toHaveURL(/pageSize=/);
  await expect(rows).toBeVisible();
  await expect(pagination).toBeVisible();
  const mobileRows = await rows.boundingBox();
  const mobileNext = await next.boundingBox();
  expect(mobileRows!.x).toBeGreaterThanOrEqual(mobileNext!.x + mobileNext!.width);
  expect(Math.abs(
    mobileRows!.y + mobileRows!.height / 2 - mobileNext!.y - mobileNext!.height / 2,
  )).toBeLessThan(3);
  expect(mobileRows!.x + mobileRows!.width).toBeLessThanOrEqual(320);
  const mobileLabel = await rowsLabel.boundingBox();
  const mobileTable = await table.boundingBox();
  expect(mobileLabel!.width).toBeGreaterThan(20);
  expect(mobileLabel!.x).toBeGreaterThanOrEqual(0);
  expect(mobileLabel!.x + mobileLabel!.width).toBeLessThanOrEqual(320);
  expect(mobileLabel!.y).toBeGreaterThanOrEqual(mobileTable!.y + mobileTable!.height);
  expect(mobileLabel!.y + mobileLabel!.height).toBeLessThanOrEqual(mobileRows!.y);
  expect(mobileLabel!.y + mobileLabel!.height).toBeLessThanOrEqual(mobileNext!.y);
  await page.screenshot({ path: test.info().outputPath("history-mobile.png") });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await pagination.getByRole("button", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);

  await page.goto(`${webBasePath}history?q=report&page=5`);
  await expect(rows).toHaveValue("10");
  await expect(pagination.getByRole("button", { name: "5", exact: true })).toBeVisible();
  const [middleRows, middleNext] = await Promise.all([rows.boundingBox(), next.boundingBox()]);
  expect(middleRows!.x).toBeGreaterThanOrEqual(middleNext!.x + middleNext!.width);
  expect(middleRows!.x + middleRows!.width).toBeLessThanOrEqual(320);
  await rows.focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: "50", exact: true }).click();
  await expect(rows).toHaveValue("50");
  await expect(page).toHaveURL(/pageSize=50/);
  await expect(page).not.toHaveURL(/page=5/);

  await page.goto(`${webBasePath}history?q=empty`);
  await expect(page.getByText("No matching workbooks.")).toBeVisible();
  await expect(rows).toBeVisible();
  await expect(pagination).toHaveCount(0);
});

for (const [locale, label] of [
  ["ja", "1ページの表示件数"],
  ["zh", "每页行数"],
] as const) {
  test(`compact page size remains accessible in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 768 });
    await page.addInitScript((language) => {
      localStorage.setItem("excel-translator-token", "history-token");
      localStorage.setItem("excel-translator-locale", language);
    }, locale);
    await page.route(`${apiBaseUrl}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname.replace(new URL(apiBaseUrl).pathname, "");
      await route.fulfill({ json: path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/history"
          ? { data: [], total: 81, page: 1, pageSize: 20, nextCursor: null }
          : path === "/notifications/unread-count" ? { count: 0 } : [] });
    });
    await page.goto(`${webBasePath}history?pageSize=20`);
    const rows = page.getByRole("textbox", { name: label });
    await expect(rows).toHaveValue("20");
    const labelBounds = await page.locator("label").filter({ hasText: label }).boundingBox();
    const inputBounds = await rows.boundingBox();
    const nextBounds = await page.locator('[aria-label="History pages"] button').last().boundingBox();
    expect(labelBounds!.width).toBeGreaterThan(20);
    expect(labelBounds!.height).toBeGreaterThan(10);
    expect(labelBounds!.x).toBeGreaterThanOrEqual(0);
    expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(320);
    expect(labelBounds!.y + labelBounds!.height).toBeLessThanOrEqual(inputBounds!.y);
    expect(labelBounds!.y + labelBounds!.height).toBeLessThanOrEqual(nextBounds!.y);
    expect(inputBounds!.x).toBeGreaterThanOrEqual(nextBounds!.x + nextBounds!.width);
    expect(inputBounds!.width).toBeLessThanOrEqual(80);
    expect(inputBounds!.x + inputBounds!.width).toBeLessThanOrEqual(320);
    await rows.click();
    await page.getByRole("option", { name: "40", exact: true }).click();
    await expect(page).toHaveURL(/pageSize=40/);
  });
}
