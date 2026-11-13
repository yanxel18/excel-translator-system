import { expect, test, type Page } from "@playwright/test";

const api = "http://localhost:3000/excel-convert";
const notices = [
  {
    id: "notice-long",
    jobId: "job-1",
    type: "FAILED",
    title: "Quarterly production workbook — translation needs attention",
    message: "Please review the selected sheets and translation settings before retrying. " + "LongWorkbookName".repeat(12),
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "notice-read",
    jobId: "job-2",
    type: "COMPLETED",
    title: "Monthly report is ready",
    message: "Your translated workbook is ready to download.",
    isRead: true,
    createdAt: new Date().toISOString(),
  },
];

async function openWorkspace(page: Page, mode: "list" | "empty" | "error" | "loading" = "list", locale = "en", populated = false) {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  let failed = mode === "error";
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entries = mode === "empty" ? [] : notices.map((item) => ({ ...item }));
  await page.addInitScript((language) => {
    localStorage.setItem("excel-translator-token", "isolated-visual-test");
    localStorage.setItem("excel-translator-locale", language);
  }, locale);
  // No live API or third-party resources are used in these browser checks.
  await page.route("https://**/*", (route) => route.fulfill({ contentType: "text/css", body: "" }));
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/excel-convert", "");
    if (path === "/notifications" && mode === "loading") await gate;
    if (path === "/notifications" && failed) {
      await route.fulfill({ status: 503, json: { message: "Temporary feed failure" } });
      return;
    }
    if (path.endsWith("/read")) {
      const entry = entries.find((item) => path.includes(item.id));
      if (entry) entry.isRead = true;
    }
    const body = path === "/profile"
      ? { id: "visual-user", username: "Demo user", fullName: null, email: null, isAdmin: false }
      : path === "/system/info" ? { year: 2026 }
      : path === "/notifications/unread-count" ? { count: entries.filter((item) => !item.isRead).length }
      : path === "/notifications" ? { data: entries, nextCursor: null }
      : path === "/jobs" && populated ? ["PROCESSING", "PENDING", "COMPLETED", "FAILED"].map((status, index) => ({
        id: `job-${index}`, fileName: ["Production planning.xlsx", "Supplier terminology.xlsx", "Monthly report.xlsx", "Quality workbook.xlsx"][index],
        fileSize: 1024 * 120, status, progress: status === "PROCESSING" ? 64 : 0,
        sourceLanguage: "JAPANESE", targetLanguage: "ENGLISH", selectedSheets: ["Summary"], availableSheets: ["Summary"],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }))
      : path === "/auth/oidc/config" ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
      : [];
    await route.fulfill({ json: body });
  });
  await page.goto("/excel-convert/workspace");
  await expect(page.locator(".upload-dropzone")).toBeVisible();
  return { recover: () => { failed = false; }, release, runtimeErrors };
}

for (const width of [320, 768, 1024, 1440]) {
  test(`restrained surfaces and compact preview fit ${width}px in both themes`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { runtimeErrors } = await openWorkspace(page);
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") {
        if (width < 768) await page.getByRole("button", { name: "Toggle navigation" }).click();
        await page.getByRole("button", { name: "Toggle color theme" }).click();
        if (width < 768) await page.getByRole("button", { name: "Toggle navigation" }).click();
      }
      await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", theme);
      const footerGap = await page.locator(".app-footer").evaluate((footer) => {
        const content = document.querySelector(".main-content")!;
        return footer.getBoundingClientRect().top - content.getBoundingClientRect().bottom;
      });
      expect(footerGap).toBeGreaterThanOrEqual(32);
      const trigger = page.getByRole("button", { name: "Open notifications" });
      await trigger.click();
      const preview = page.locator(".notification-popover");
      await expect(preview).toBeVisible();
      await expect(preview.locator(".notification-card")).toHaveCount(2);
      await expect(preview).toHaveCSS("opacity", "1");
      const bounds = await preview.boundingBox();
      expect(bounds!.width).toBeLessThanOrEqual(360);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
      expect(await preview.locator(".notification-card").first().evaluate((el) => parseFloat(getComputedStyle(el).minHeight))).toBeLessThanOrEqual(72);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`v4-${width}-${theme}.png`) });
      await page.keyboard.press("Escape");
      await expect(preview).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
    expect(runtimeErrors).toEqual([]);
  });
}

test("populated workspace retains status actions, upload validation and legible metadata", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { runtimeErrors } = await openWorkspace(page, "list", "en", true);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download Monthly report.xlsx" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("invalid") });
  await expect(page.getByRole("alert")).toContainText("Select an .xlsx workbook.");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Toggle color theme" }).click();
    await page.getByRole("button", { name: "Open notifications" }).click();
    const preview = page.locator(".notification-popover");
    await expect(preview).toHaveCSS("opacity", "1");
    const contrasts = await preview.evaluate((element) => {
      const luminance = (color: string) => {
        const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const background = luminance(getComputedStyle(element).backgroundColor);
      return [...element.querySelectorAll(".notification-message, .notification-time, .notification-title")].map((text) => {
        const foreground = luminance(getComputedStyle(text).color);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
    });
    contrasts.forEach((ratio) => expect(ratio).toBeGreaterThanOrEqual(4.5));
    await page.screenshot({ path: testInfo.outputPath(`v4-populated-${theme}.png`) });
    await page.keyboard.press("Escape");
    await expect(preview).not.toBeVisible();
  }
  expect(runtimeErrors).toEqual([]);
});

for (const locale of ["ja", "zh"]) {
  test(`localized preview stays reachable at 320px (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openWorkspace(page, "list", locale);
    await page.locator(".app-notification-trigger").click();
    const preview = page.locator(".notification-popover");
    await expect(preview).toHaveCSS("opacity", "1");
    const bounds = await preview.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(304);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
    await expect(preview.locator(".notification-preview-footer")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
}

test("long notification page keeps footer spacing and complete messages at 320px", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openWorkspace(page);
  await page.route(`${api}/notifications`, (route) => route.fulfill({
    json: { data: Array.from({ length: 20 }, (_, index) => ({ ...notices[0], id: `long-${index}` })), nextCursor: null },
  }));
  await page.locator(".app-notification-trigger").click();
  await page.locator(".notification-preview-footer").click();
  // The full-page feed intentionally renders ten entries per page.
  await expect(page.locator(".notification-card")).toHaveCount(10);
  expect(await page.locator(".main-content").evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(900);
  const gap = await page.locator(".app-footer").evaluate((footer) =>
    footer.getBoundingClientRect().top - document.querySelector(".main-content")!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(32);
  await expect(page.locator(".notification-card").last()).toContainText(notices[0].message);
  await page.locator(".app-footer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("v4-long-page-footer.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("search, unread filtering, mark-all and keyboard selection preserve notification actions", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Open notifications" }).click();
  const preview = page.locator(".notification-popover");
  await preview.getByRole("textbox", { name: "Search notifications" }).fill("missing");
  await expect(preview).toContainText("No matching notifications.");
  await preview.getByRole("textbox", { name: "Search notifications" }).fill("");
  await preview.getByText("Unread 1", { exact: true }).click();
  await expect(preview.locator(".notification-card")).toHaveCount(1);
  await preview.getByRole("button", { name: "Mark all as read" }).click();
  await expect(preview).toContainText("No unread notifications.");
  await expect(preview.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  await preview.getByText("All", { exact: true }).click();
  const card = preview.locator(".notification-card").first();
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(preview).not.toBeVisible();
  await expect(page.locator(".notification-selected")).toBeFocused();
  await expect(page).toHaveURL(/\/notifications$/);
  // Full-page messages remain readable rather than adopting preview truncation.
  await expect(page.locator(".notification-selected .notification-message")).toHaveText(notices[0].message);
  const gap = await page.locator(".app-footer").evaluate((footer) =>
    footer.getBoundingClientRect().top - document.querySelector(".main-content")!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(32);
});

for (const mode of ["empty", "error", "loading"] as const) {
  test(`preview keeps ${mode} state and full-page navigation usable`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const controls = await openWorkspace(page, mode);
    await page.getByRole("button", { name: "Open notifications" }).click();
    const preview = page.locator(".notification-popover");
    if (mode === "empty") await expect(preview).toContainText("No notifications yet.");
    if (mode === "loading") {
      await expect(preview.getByRole("status", { name: "Loading notifications" })).toBeVisible();
      controls.release();
      await expect(preview.locator(".notification-card")).toHaveCount(2);
    }
    if (mode === "error") {
      await expect(preview.getByRole("alert")).toHaveText("Temporary feed failure");
      controls.recover();
      await preview.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(preview.locator(".notification-card")).toHaveCount(2);
    }
    await preview.getByRole("button", { name: "View all notifications" }).click();
    await expect(page).toHaveURL(/\/notifications$/);
  });
}
