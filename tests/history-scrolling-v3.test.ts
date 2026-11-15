import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("history scrolls its table independently of the search controls", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "history-test-session"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    const body =
      path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/history"
          ? {
              data: Array.from({ length: 50 }, (_, index) => ({
                id: `job-${index}`,
                fileName: `report-${index}.xlsx`,
                fileSize: 1024,
                status: "COMPLETED",
                progress: 100,
                createdAt: "2026-11-12T00:00:00.000Z",
                sourceLanguage: "JAPANESE",
                targetLanguage: "ENGLISH",
                selectedSheets: [],
                availableSheets: [],
                vocabularyGroupId: null,
              })),
              total: 51,
              page: 1,
              pageSize: 50,
              nextCursor: null,
            }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${web}history?pageSize=50`);
  const search = page.getByRole("searchbox", { name: "Search workbooks" });
  await expect(search).toBeVisible();
  await expect(search.locator("..").locator("..")).not.toHaveCSS("position", "sticky");
  const viewport = page.getByRole("region", { name: "Translation history" });
  await expect(viewport).toBeVisible();
  for (const { width, height } of [
    { width: 1440, height: 768 },
    { width: 1024, height: 600 },
    { width: 320, height: 600 },
    { width: 320, height: 768 },
  ]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() =>
      page.locator(".main-content").evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    ).toBeLessThanOrEqual(1);
    await expect.poll(() =>
      viewport.evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    await expect(page.getByRole("textbox", { name: "Rows per page" })).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`history-${width}x${height}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() =>
    viewport.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  const firstHeader = page.locator(".history-table-scroll thead th").first();
  const initialHeaderOffset = await viewport.evaluate((element) => {
    const header = element.querySelector("thead th");
    return header
      ? header.getBoundingClientRect().top - element.getBoundingClientRect().top
      : Number.NaN;
  });
  await expect(firstHeader).toHaveCSS("position", "sticky");
  await viewport.focus();
  await expect(viewport).toBeFocused();
  await page.keyboard.press("End");
  await expect.poll(() =>
    viewport.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  await viewport.evaluate((element) => {
    element.scrollTop = 180;
  });
  const scrolledHeaderOffset = await viewport.evaluate((element) => {
    const header = element.querySelector("thead th");
    return header
      ? header.getBoundingClientRect().top - element.getBoundingClientRect().top
      : Number.NaN;
  });
  expect(
    Math.abs(scrolledHeaderOffset - initialHeaderOffset),
  ).toBeLessThan(1);
  const lastFile = page.getByRole("button", {
    name: "report-49.xlsx",
    exact: true,
  });
  await lastFile.scrollIntoViewIfNeeded();
  await expect(lastFile).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Rows per page" })).toBeVisible();
  await expect(page.getByLabel("History pages")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 768 });
  await expect.poll(() =>
    viewport.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await lastFile.scrollIntoViewIfNeeded();
  await expect(lastFile).toBeVisible();
  await expect(page.getByLabel("History pages")).toBeVisible();

  await page.setViewportSize({ width: 320, height: 400 });
  await expect.poll(() =>
    page.locator(".main-content").evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await expect.poll(() =>
    viewport.evaluate((element) => element.scrollHeight - element.clientHeight),
  ).toBeLessThanOrEqual(1);
  const content = page.locator(".main-content");
  await content.evaluate((element) => {
    const header = element.querySelector(".history-table-scroll thead th")!;
    element.scrollTop +=
      header.getBoundingClientRect().top - element.getBoundingClientRect().top + 180;
  });
  const shortHeader = await firstHeader.boundingBox();
  await content.evaluate((element) => { element.scrollTop += 120; });
  await expect.poll(async () => {
    const header = await firstHeader.boundingBox();
    return header && shortHeader
      ? Math.abs(header.y - shortHeader.y)
      : Number.POSITIVE_INFINITY;
  }).toBeLessThan(2);
  await lastFile.scrollIntoViewIfNeeded();
  await expect(lastFile).toBeInViewport();
  const lastAction = page.getByRole("button", {
    name: "Preview source report-49.xlsx",
  });
  await lastAction.scrollIntoViewIfNeeded();
  await lastAction.focus();
  await expect(lastAction).toBeFocused();
  const actionBounds = await lastAction.boundingBox();
  const scrollBounds = await content.boundingBox();
  expect(actionBounds).not.toBeNull();
  expect(scrollBounds).not.toBeNull();
  expect(actionBounds!.x).toBeGreaterThanOrEqual(scrollBounds!.x);
  expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(
    scrollBounds!.x + scrollBounds!.width,
  );
  await page.getByLabel("History pages").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("History pages")).toBeInViewport();
  await expect(page.getByRole("contentinfo")).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("history-320x400.png"),
    animations: "disabled",
  });
});
