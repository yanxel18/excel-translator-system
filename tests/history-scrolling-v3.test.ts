import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("history scrolls its table independently of the search controls", async ({
  page,
}) => {
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
  await expect.poll(() =>
    viewport.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await viewport.focus();
  await expect(viewport).toBeFocused();
  await page.keyboard.press("End");
  await expect.poll(() =>
    viewport.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
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
});
