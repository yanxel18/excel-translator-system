import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("status chart remains readable at mobile and desktop sizes in both themes", async ({ page }, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "appearance-session"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    const body = path === "/profile"
      ? { id: "owner", username: "alice", isAdmin: false }
      : path === "/jobs"
        ? [{ id: "job", fileName: "report.xlsx", fileSize: 1024, status: "COMPLETED", progress: 100, createdAt: "2026-11-12T00:00:00.000Z", sourceLanguage: "JAPANESE", targetLanguage: "ENGLISH", selectedSheets: [], availableSheets: [], vocabularyGroupId: null }]
        : path === "/notifications/unread-count" ? { count: 0 } : [];
    await route.fulfill({ json: body });
  });

  await page.goto(`${web}profile`);
  const ring = page.locator(".mantine-RingProgress-root");
  const legend = page.locator(".profile-status-legend");
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.setAttribute("data-mantine-color-scheme", value);
      }, theme);
      await expect(ring).toBeVisible();
      const bounds = await ring.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(180);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await expect(legend).toContainText("completed");
      await expect(legend).toContainText("1");
      await expect(legend).toContainText("failed");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await ring.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`status-${width}-${theme}.png`),
        animations: "disabled",
      });
    }
  }
});

test("native and application scrollbars use theme colors without breaking scrolling", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "appearance-session"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    const body = path === "/profile"
      ? { id: "owner", username: "alice", isAdmin: false }
      : path === "/history"
        ? { data: Array.from({ length: 30 }, (_, i) => ({
            id: `job-${i}`, fileName: `report-${i}.xlsx`, fileSize: 1024,
            status: "COMPLETED", progress: 100, createdAt: "2026-11-12T00:00:00.000Z",
            sourceLanguage: "JAPANESE", targetLanguage: "ENGLISH",
            selectedSheets: [], availableSheets: [], vocabularyGroupId: null,
          })), total: 30, page: 1, pageSize: 50, nextCursor: null }
        : path === "/notifications/unread-count" ? { count: 0 } : [];
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${web}history?pageSize=50`);
  const viewport = page.getByRole("region", { name: "Translation history" });
  await expect(viewport).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-mantine-color-scheme", value), theme);
    const expectedThumb = theme === "light" ? "rgb(24, 100, 171)" : "rgb(116, 192, 252)";
    const expectedTrack = theme === "light" ? "rgb(247, 249, 251)" : "rgb(22, 35, 52)";
    await expect.poll(() => viewport.evaluate((element) => getComputedStyle(element).scrollbarColor))
      .toBe(`${expectedThumb} ${expectedTrack}`);
    const thumb = page.locator(".history-table-scroll .mantine-ScrollArea-thumb").first();
    await expect(thumb).toHaveCSS("background-color", expectedThumb);
    await viewport.focus();
    await page.keyboard.press("End");
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await viewport.evaluate((element) => { element.scrollTop = 0; });
    await viewport.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await viewport.evaluate((element) => { element.scrollTop = 0; });
  }
  await page.emulateMedia({ forcedColors: "active" });
  await expect.poll(() => viewport.evaluate((element) => getComputedStyle(element).scrollbarColor)).toBe("auto");
});
