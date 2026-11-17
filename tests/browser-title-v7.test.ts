import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("tab title follows page, job status, unread count, language and sign-out", async ({ page }) => {
  let status = "PROCESSING";
  let unread = 2;
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "title-test-token"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    const body = path === "/profile"
      ? { id: "owner", username: "alice", isAdmin: false }
      : path === "/jobs"
        ? [{ id: "job", fileName: "private-name.xlsx", fileSize: 1024, status,
            progress: 10, createdAt: "2026-11-17T00:00:00.000Z",
            updatedAt: "2026-11-17T00:00:00.000Z", selectedSheets: [],
            availableSheets: [], sourceLanguage: "JAPANESE",
            targetLanguage: "ENGLISH", vocabularyGroupId: null }]
        : path === "/history"
          ? { data: [], total: 0, page: 1, pageSize: 10 }
          : path === "/notifications/unread-count"
            ? { count: unread }
            : path === "/auth/oidc/config"
              ? { mode: "LOCAL", enabled: false }
              : [];
    await route.fulfill({ json: body });
  });
  await page.goto(`${web}history?q=private-query`);
  await expect(page).toHaveTitle("(2) Translation history · processing · Excel Translator");
  expect(await page.title()).not.toContain("private");

  status = "COMPLETED";
  await expect(page).toHaveTitle("(2) Translation history · Excel Translator", { timeout: 5000 });
  await page.reload();
  await expect(page).toHaveTitle("(2) Translation history · Excel Translator");
  unread = 0;
  await page.evaluate(() => window.dispatchEvent(new Event("notifications-updated")));
  await expect(page).toHaveTitle("Translation history · Excel Translator");
  await page.getByRole("button", { name: "Vocabulary", exact: true }).click();
  await expect(page).toHaveTitle("Vocabulary · Excel Translator");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page).toHaveTitle("Translation history · Excel Translator");

  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitem", { name: "日本語" }).click();
  await expect(page).toHaveTitle("翻訳履歴 · Excel Translator");
  await page.getByRole("button", { name: "アカウント", exact: true }).click();
  await page.getByRole("menuitem", { name: "サインアウト" }).click();
  await expect(page).toHaveTitle("サインイン · Excel Translator");
});

test("unknown routes do not leak paths or search terms into the title", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "title-test-token"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    await route.fulfill({ json: path === "/profile"
      ? { id: "owner", username: "alice", isAdmin: false }
      : path === "/notifications/unread-count" ? { count: 0 } : [] });
  });
  await page.goto(`${web}private-route?q=private-query`);
  await expect(page).toHaveTitle("Page not found · Excel Translator");
});

test("settings sections have distinct localized titles without user identifiers", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("excel-translator-token", "title-test-token");
    localStorage.setItem("excel-translator-locale", "zh");
  });
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    await route.fulfill({ json: path === "/profile"
      ? { id: "owner", username: "admin", isAdmin: true }
      : path === "/notifications/unread-count" ? { count: 0 } : [] });
  });
  await page.goto(`${web}settings/users/new`);
  await expect(page).toHaveTitle("创建用户 · 系统设置 · Excel Translator");
  await page.goto(`${web}settings/files`);
  await expect(page).toHaveTitle("文件与处理 · 系统设置 · Excel Translator");
  await page.goto(`${web}settings/users/11111111-1111-4111-8111-111111111111`);
  await expect(page).toHaveTitle("用户信息 · 系统设置 · Excel Translator");
});

test("idle job polling detects a translation started or failed in another tab", async ({ page }) => {
  let status = "PENDING";
  await page.clock.install();
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "title-test-token"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    const body = path === "/profile"
      ? { id: "owner", username: "alice", isAdmin: false }
      : path === "/jobs"
        ? [{ id: "job", fileName: "private.xlsx", fileSize: 1024, status,
            createdAt: "2026-11-17T00:00:00.000Z",
            updatedAt: "2026-11-17T00:00:00.000Z", selectedSheets: [],
            availableSheets: [], sourceLanguage: "JAPANESE",
            targetLanguage: "ENGLISH", vocabularyGroupId: null }]
        : path === "/notifications/unread-count" ? { count: 0 } : [];
    await route.fulfill({ json: body });
  });
  await page.goto(`${web}vocabulary`);
  await expect(page).toHaveTitle("Vocabulary · pending · Excel Translator");
  status = "FAILED";
  await page.clock.fastForward(30000);
  await expect(page).toHaveTitle("Vocabulary · failed · Excel Translator");
});

test("a delayed older job response cannot restore an obsolete title", async ({ page }) => {
  let holdNext = false;
  let completed = false;
  let releaseOldResponse: (() => void) | undefined;
  await page.clock.install();
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "title-test-token"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    if (path === "/jobs") {
      const delay = holdNext && !releaseOldResponse;
      const responseStatus = completed ? "COMPLETED" : "PROCESSING";
      if (delay) await new Promise<void>((resolve) => { releaseOldResponse = resolve; });
      await route.fulfill({ json: [{
        id: "job", fileName: "private.xlsx", fileSize: 1024,
        status: responseStatus,
        createdAt: "2026-11-17T00:00:00.000Z", updatedAt: "2026-11-17T00:00:00.000Z",
        selectedSheets: [], availableSheets: [], sourceLanguage: "JAPANESE",
        targetLanguage: "ENGLISH", vocabularyGroupId: null,
      }] });
      return;
    }
    await route.fulfill({ json: path === "/profile"
      ? { id: "owner", username: "alice", isAdmin: false }
      : path === "/notifications/unread-count" ? { count: 0 } : [] });
  });
  await page.goto(`${web}`);
  await expect(page).toHaveTitle("Translate File · processing · Excel Translator");
  holdNext = true;
  await page.clock.fastForward(1200);
  await expect.poll(() => Boolean(releaseOldResponse)).toBe(true);
  completed = true;
  await page.clock.fastForward(1200);
  await expect(page).toHaveTitle("Translate File · Excel Translator");
  await page.evaluate(() => {
    const observed = window as Window & { observedTitles: string[] };
    observed.observedTitles = [];
    new MutationObserver(() => observed.observedTitles.push(document.title))
      .observe(document.querySelector("title")!, { childList: true });
  });
  const delayedResponse = page.waitForResponse((response) =>
    response.url().endsWith("/jobs") && response.status() === 200,
  );
  releaseOldResponse!();
  await (await delayedResponse).body();
  await page.clock.runFor(500);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() =>
    (window as Window & { observedTitles: string[] }).observedTitles,
  )).not.toContain("Translate File · processing · Excel Translator");
  await expect(page).toHaveTitle("Translate File · Excel Translator");
});

for (const reducedMotion of [false, true]) {
  test(`background completion attention is bounded and respects reduced motion: ${reducedMotion}`, async ({ page }) => {
    let status = "PROCESSING";
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await page.clock.install();
    await page.addInitScript(() =>
      localStorage.setItem("excel-translator-token", "title-test-token"),
    );
    await page.route(`${api}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
      const body = path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/jobs"
          ? [{ id: "job", fileName: "private.xlsx", fileSize: 1024, status,
              createdAt: "2026-11-17T00:00:00.000Z",
              updatedAt: "2026-11-17T00:00:00.000Z", selectedSheets: [],
              availableSheets: [], sourceLanguage: "JAPANESE",
              targetLanguage: "ENGLISH", vocabularyGroupId: null }]
          : path === "/notifications/unread-count" ? { count: 0 } : [];
      await route.fulfill({ json: body });
    });
    await page.goto(`${web}`);
    await expect(page).toHaveTitle("Translate File · processing · Excel Translator");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    status = "COMPLETED";
    await page.clock.fastForward(1200);
    const alertTitle = "! completed · Translate File · Excel Translator";
    await expect(page).toHaveTitle(alertTitle);
    await page.clock.fastForward(1000);
    await expect(page).toHaveTitle(reducedMotion
      ? alertTitle
      : "Translate File · Excel Translator");
    await page.clock.fastForward(10000);
    await expect(page).toHaveTitle("Translate File · Excel Translator");
  });
}

test("failure attention stops when the user returns or acknowledges it", async ({ page }) => {
  let status = "PROCESSING";
  await page.clock.install();
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "title-test-token"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    const body = path === "/profile"
      ? { id: "owner", username: "alice", isAdmin: false }
      : path === "/jobs"
        ? [{ id: "job", fileName: "private.xlsx", fileSize: 1024, status,
            createdAt: "2026-11-17T00:00:00.000Z",
            updatedAt: "2026-11-17T00:00:00.000Z", selectedSheets: [],
            availableSheets: [], sourceLanguage: "JAPANESE",
            targetLanguage: "ENGLISH", vocabularyGroupId: null }]
        : path === "/notifications/unread-count" ? { count: 0 } : [];
    await route.fulfill({ json: body });
  });
  await page.goto(`${web}`);
  await expect(page).toHaveTitle("Translate File · processing · Excel Translator");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  status = "FAILED";
  await page.clock.fastForward(1200);
  await expect(page).toHaveTitle("! failed · Translate File · failed · Excel Translator");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveTitle("Translate File · failed · Excel Translator");
  await page.clock.fastForward(2000);
  await expect(page).toHaveTitle("Translate File · failed · Excel Translator");

  status = "PROCESSING";
  await page.clock.fastForward(30000);
  await expect(page).toHaveTitle("Translate File · processing · Excel Translator");
  status = "COMPLETED";
  await page.clock.fastForward(1200);
  await expect(page).toHaveTitle("! completed · Translate File · Excel Translator");
  await page.evaluate(() => window.dispatchEvent(new Event("notifications-updated")));
  await expect(page).toHaveTitle("Translate File · Excel Translator");

  status = "PROCESSING";
  await page.clock.fastForward(30000);
  await expect(page).toHaveTitle("Translate File · processing · Excel Translator");
  status = "FAILED";
  await page.clock.fastForward(1200);
  await expect(page).toHaveTitle("! failed · Translate File · failed · Excel Translator");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page).toHaveTitle("Translate File · failed · Excel Translator");
});
