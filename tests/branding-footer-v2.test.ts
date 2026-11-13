import { test, expect } from "@playwright/test";

const apiBaseUrl =
  process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const webBasePath = process.env.WEB_BASE_PATH || "/excel-convert/";

async function openWorkspace(
  page: import("@playwright/test").Page,
  systemInfo: { status: number; body: { year?: unknown; message?: string } },
) {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "ui-test-token"),
  );
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    const body =
      path === "/profile"
        ? {
            id: "user-1",
            username: "ui-test",
            email: null,
            fullName: null,
            isAdmin: false,
          }
        : path === "/system/info"
          ? systemInfo.body
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({
      status: path === "/system/info" ? systemInfo.status : 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${webBasePath}workspace`);
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();
}

test("original branding assets load from a nested route and remain labeled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openWorkspace(page, { status: 200, body: { year: 2026 } });

  const faviconHref = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(faviconHref).toBe(
    `${webBasePath}assets/excel-translator-mark.svg`,
  );
  const favicon = await page.request.get(
    new URL(faviconHref!, page.url()).toString(),
  );
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");

  const brand = page.locator("img.app-brand-mark");
  await expect(brand).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  for (let scheme = 0; scheme < 2; scheme += 1) {
    await page.getByRole("button", { name: "Toggle color theme" }).click();
    await expect(brand).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Home" })).toContainText(
    "Excel Translator",
  );
  expect(
    await brand.evaluate((image: HTMLImageElement) => [
      image.naturalWidth,
      image.naturalHeight,
    ]),
  ).toEqual([38, 38]);
});

test("backend-year footer fits short and long pages across viewport sizes", async ({
  page,
}) => {
  await openWorkspace(page, { status: 200, body: { year: 2026 } });
  const footer = page.getByRole("contentinfo");
  await expect(footer).toHaveText("Translation System Taiyo Yuden Co. Ltd © 2026");

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const box = await footer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await footer.evaluate((element) => getComputedStyle(element).position),
    ).toBe("static");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }

  const sentinel = await page.evaluate(() => {
    const element = document.createElement("div");
    element.style.height = "1200px";
    document.querySelector(".main-content")?.append(element);
    return element.getBoundingClientRect().bottom;
  });
  expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(sentinel);
});

test("footer clearly indicates when backend year metadata is unavailable", async ({
  page,
}) => {
  await openWorkspace(page, {
    status: 503,
    body: { message: "Unavailable" },
  });
  await expect(page.getByRole("contentinfo")).toHaveText(
    "Translation System Taiyo Yuden Co. Ltd © Year unavailable",
  );
});

test("footer content is localized in Japanese and Chinese", async ({ page }) => {
  await openWorkspace(page, { status: 200, body: { year: 2026 } });
  const footer = page.getByRole("contentinfo");

  await page.evaluate(() =>
    localStorage.setItem("excel-translator-locale", "ja"),
  );
  await page.reload();
  await expect(footer).toHaveText("翻訳システム Taiyo Yuden Co. Ltd © 2026");

  await page.evaluate(() =>
    localStorage.setItem("excel-translator-locale", "zh"),
  );
  await page.reload();
  await expect(footer).toHaveText("翻译系统 Taiyo Yuden Co. Ltd © 2026");
});

test("footer falls back when the system-info response has an invalid year", async ({
  page,
}) => {
  await openWorkspace(page, {
    status: 200,
    body: { year: "2026" },
  });
  await expect(page.getByRole("contentinfo")).toHaveText(
    "Translation System Taiyo Yuden Co. Ltd © Year unavailable",
  );
});
