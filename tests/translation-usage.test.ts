import { expect, test, type Route } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("history explains token estimates in the selected language", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("excel-translator-token", "usage-test"));
  const respond = async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith("/profile")
      ? { id: "owner", username: "alice", isAdmin: false }
      : path.endsWith("/history")
        ? { data: [], total: 0, page: 1, pageSize: 10 }
        : path.endsWith("/notifications/unread-count") ? { count: 0 } : [] });
  };
  await page.route(`${api}/**`, respond);
  await page.goto(`${web}history`);
  const link = page.getByRole("button", { name: "Read more about tokens" });
  await link.focus();
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog", { name: "Understanding tokens" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Hello");
  await expect(dialog).toContainText("こんにちは");
  await expect(dialog).toContainText("5 UTF-8 bytes ÷ 4, rounded up = 2");
  await expect(dialog).toContainText("15 UTF-8 bytes ÷ 4, rounded up = 4");
  await expect(dialog).toContainText("not actual model usage");
  await expect(dialog.locator(".token-piece")).toHaveCount(6);
  await dialog.screenshot({ path: testInfo.outputPath("token-examples-light.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(link).toBeFocused();
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitem", { name: "日本語" }).click();
  await page.getByRole("button", { name: "トークンについて詳しく" }).click();
  dialog = page.getByRole("dialog", { name: "トークンについて" });
  await expect(dialog).toContainText("モデルの実際の使用量ではありません");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "表示言語を変更" }).click();
  await page.getByRole("menuitem", { name: "中文" }).click();
  await page.setViewportSize({ width: 320, height: 600 });
  await page.getByRole("button", { name: "了解更多令牌信息" }).click();
  dialog = page.getByRole("dialog", { name: "了解令牌" });
  await expect(dialog).toContainText("并非模型实际用量");
  await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.evaluate(() => document.documentElement.setAttribute("data-mantine-color-scheme", "dark"));
  await dialog.screenshot({ path: testInfo.outputPath("token-examples-mobile-dark.png") });
});

test("history and profile show recorded usage without inventing historical values", async ({ page }, testInfo) => {
  const baseJob = {
    fileSize: 1024, progress: 100, createdAt: "2026-11-17T00:00:00.000Z",
    updatedAt: "2026-11-17T00:00:00.000Z", sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH", selectedSheets: [], availableSheets: [],
    vocabularyGroupId: null,
  };
  const jobs = [
    { ...baseJob, id: "new", fileName: "new.xlsx", status: "COMPLETED", completedAt: "2026-11-17T12:00:00.000Z",
      inputCharacters: 123, outputCharacters: 200, inputTokensEstimate: 92, outputTokensEstimate: 50 },
    { ...baseJob, id: "old", fileName: "old.xlsx", status: "COMPLETED", completedAt: "2026-11-16T12:00:00.000Z" },
    { ...baseJob, id: "prior", fileName: "prior.xlsx", status: "COMPLETED", completedAt: "2026-11-15T12:00:00.000Z",
      inputCharacters: 40, outputCharacters: 80, inputTokensEstimate: 10, outputTokensEstimate: 20 },
    { ...baseJob, id: "same-day", fileName: "same-day.xlsx", status: "COMPLETED", completedAt: "2026-11-17T13:00:00.000Z",
      inputCharacters: 10, outputCharacters: 20, inputTokensEstimate: 3, outputTokensEstimate: 5 },
    { ...baseJob, id: "earlier", fileName: "earlier.xlsx", status: "COMPLETED", completedAt: "2026-11-01T12:00:00.000Z",
      inputCharacters: 1, outputCharacters: 2, inputTokensEstimate: 1, outputTokensEstimate: 1 },
    { ...baseJob, id: "running", fileName: "running.xlsx", status: "PROCESSING",
      inputCharacters: 999, inputTokensEstimate: 750 },
  ];
  await page.addInitScript(() => localStorage.setItem("excel-translator-token", "usage-test"));
  const respond = async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(url.pathname.startsWith("/api/") ? "/api" : new URL(api).pathname, "");
    const body = path === "/profile" ? { id: "owner", username: "alice", isAdmin: false, createdAt: "2026-01-01T00:00:00.000Z" }
      : path === "/history" ? { data: jobs, total: jobs.length, page: 1, pageSize: 10, nextCursor: null }
      : path === "/jobs" ? jobs
      : path === "/notifications/unread-count" ? { count: 0 } : [];
    await route.fulfill({ json: body });
  };
  await page.route(`${api}/**`, respond);
  await page.clock.setFixedTime(new Date("2026-11-17T12:00:00.000Z"));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`${web}history`);
  const newRow = page.getByRole("row").filter({ hasText: "new.xlsx" });
  await expect(page.getByRole("columnheader", { name: "Characters", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Estimated tokens", exact: true })).toBeVisible();
  const headerStyle = async (index: number) => page.locator("thead th").nth(index).locator("p").evaluate((element) => {
    const style = getComputedStyle(element);
    return { font: style.fontFamily, size: style.fontSize, color: style.color, weight: style.fontWeight };
  });
  expect(await headerStyle(5)).toEqual(await headerStyle(0));
  expect(await headerStyle(6)).toEqual(await headerStyle(0));
  const characterCell = newRow.getByRole("cell").nth(5);
  const tokenCell = newRow.getByRole("cell").nth(6);
  await expect(characterCell).toContainText("Input: 123");
  await expect(characterCell).toContainText("Output: 200");
  await expect(tokenCell).toContainText("Input: 92");
  await expect(tokenCell).toContainText("Output: 50");
  await expect(characterCell.locator(".history-usage-fill")).toHaveCount(2);
  await expect(tokenCell.locator(".history-usage-fill")).toHaveCount(2);
  const widths = await characterCell.locator(".history-usage-fill").evaluateAll((bars) =>
    bars.map((bar) => bar.getBoundingClientRect().width),
  );
  expect(widths[0] / widths[1]).toBeCloseTo(123 / 200, 1);
  const textStyle = async (selector: string) => newRow.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { font: style.fontFamily, size: style.fontSize, color: style.color };
  });
  expect(await textStyle("td:nth-child(6) p")).toEqual(await textStyle("td:nth-child(2) p"));
  await expect(page.getByRole("row").filter({ hasText: "old.xlsx" })).toContainText("Not available");
  const runningRow = page.getByRole("row").filter({ hasText: "running.xlsx" });
  await expect(runningRow.getByRole("cell").nth(5)).toContainText("Input: 999");
  await expect(runningRow.getByRole("cell").nth(5)).toContainText("Output: Not available");
  await expect(runningRow.getByRole("cell").nth(5).locator(".history-usage-fill")).toHaveCount(1);
  await page.locator(".history-table-card").screenshot({
    path: testInfo.outputPath("history-usage.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 375, height: 700 });
  await tokenCell.scrollIntoViewIfNeeded();
  await expect(tokenCell).toContainText("Output: 50");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${web}profile`);
  const usage = page.getByRole("region", { name: "Translation usage", exact: true });
  await expect(usage).toContainText("Input characters");
  await expect(usage.locator(".translation-usage-cards")).toContainText("174");
  await expect(usage.locator(".translation-usage-cards")).toContainText("302");
  await expect(usage.locator(".translation-usage-cards")).toContainText("106");
  await expect(usage.locator(".translation-usage-cards")).toContainText("76");
  await expect(usage).not.toContainText("999");
  await expect(usage).toContainText("not model usage");
  const chart = usage.getByRole("img", { name: "Translation usage over the last 7 days" });
  await expect(chart).toBeVisible();
  const day = usage.getByRole("button", { name: "Show usage for November 17, 2026" });
  await day.hover();
  const dayDetails = usage.getByRole("region", { name: "Daily usage details" });
  await expect(dayDetails).toContainText("Input characters");
  await expect(dayDetails).toContainText("Output characters");
  await expect(dayDetails).toContainText("Estimated input tokens");
  await expect(dayDetails).toContainText("Estimated output tokens");
  await expect(dayDetails).toContainText("133");
  await expect(dayDetails).toContainText("220");
  await expect(dayDetails).toContainText("95");
  await expect(dayDetails).toContainText("55");
  await day.focus();
  await expect(dayDetails).toBeVisible();
  await page.keyboard.press("Enter");
  await page.mouse.move(0, 0);
  await expect(dayDetails).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dayDetails).toBeHidden();
  await usage.getByRole("button", { name: "Show usage for November 16, 2026" }).hover();
  await expect(dayDetails).toContainText("Not available");
  await expect(dayDetails).toContainText("Some or all completed jobs");
  await page.setViewportSize({ width: 375, height: 700 });
  await usage.getByRole("button", { name: "Show usage for November 17, 2026" }).click();
  await expect(dayDetails).toContainText("133");
  await page.evaluate(() => document.documentElement.setAttribute("data-mantine-color-scheme", "dark"));
  await dayDetails.screenshot({ path: testInfo.outputPath("usage-details-dark.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(chart.locator(".usage-bar-input")).toHaveCount(6);
  await expect(chart.locator(".usage-bar-output")).toHaveCount(6);
  await expect(chart.locator(".usage-line-input")).toHaveCount(1);
  await expect(chart.locator(".usage-line-output")).toHaveCount(1);
  await expect(usage.getByText("Characters scale", { exact: true })).toBeVisible();
  await expect(usage.getByText("Estimated tokens scale", { exact: true })).toBeVisible();
  await usage.screenshot({ path: testInfo.outputPath("usage-dashboard.png"), animations: "disabled" });
  await usage.getByText("Show daily usage data", { exact: true }).click();
  const dailyTable = usage.getByRole("table", { name: "Usage by completion date" });
  await expect(dailyTable.getByRole("row")).toHaveCount(8);
  await expect(dailyTable.getByRole("row").last()).toContainText("133");
  await expect(dailyTable.getByRole("row").last()).toContainText("220");
  await expect(dailyTable.getByRole("row").last()).toContainText("95");
  await expect(dailyTable.getByRole("row").last()).toContainText("55");
  await expect(dailyTable.getByRole("row").nth(6)).toContainText("Not available");
  await expect(dailyTable.getByRole("row").nth(5)).toContainText("40");
  await expect(dailyTable.getByRole("row").nth(5)).toContainText("80");
  jobs.splice(0, jobs.length, jobs.find((job) => job.id === "old")!);
  await page.reload();
  await expect(usage.locator(".translation-usage-cards").getByText("Not available", { exact: true })).toHaveCount(4);
});
