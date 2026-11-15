import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

const locales = [
  {
    code: "en",
    searchLabel: "Search workbooks",
    fileName: "File name",
    fileSize: "File size",
    status: "Status",
    source: "Source language",
    target: "Target language",
    created: "Created",
    actions: "Actions",
    placeholder: "Search by Excel filename",
  },
  {
    code: "ja",
    searchLabel: "ワークブックを検索",
    fileName: "ファイル名",
    fileSize: "ファイルサイズ",
    status: "状態",
    source: "原文の言語",
    target: "翻訳先の言語",
    created: "作成日",
    actions: "操作",
    placeholder: "Excelファイル名で検索",
  },
  {
    code: "zh",
    searchLabel: "搜索工作簿",
    fileName: "文件名",
    fileSize: "文件大小",
    status: "状态",
    source: "源语言",
    target: "目标语言",
    created: "创建时间",
    actions: "操作",
    placeholder: "按 Excel 文件名搜索",
  },
] as const;

for (const locale of locales) {
  test(`history headings stay readable and sticky in ${locale.code}`, async ({
    page,
  }) => {
    await page.addInitScript((language) => {
      localStorage.setItem("excel-translator-token", "history-test-session");
      localStorage.setItem("excel-translator-locale", language);
    }, locale.code);
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
                  fileName: `quarterly-report-${index}.xlsx`,
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

    const search = page.getByRole("searchbox", { name: locale.searchLabel });
    await expect(page.getByText(locale.searchLabel, { exact: true })).toBeVisible();
    await expect(search).toHaveAttribute("placeholder", locale.placeholder);
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.locator('[aria-label*="breadcrumb" i]'),
    ).toHaveCount(0);
    await expect(page.getByText("51", { exact: true })).toHaveCount(0);

    const viewport = page.locator(
      ".history-table-scroll [role='region']",
    );
    const headers = page.locator(".history-table-scroll thead th");
    await expect(headers).toHaveCount(7);
    const headerLabels = await headers.allTextContents();
    for (const label of [
      locale.fileName,
      locale.fileSize,
      locale.status,
      locale.source,
      locale.target,
      locale.created,
      locale.actions,
    ]) {
      expect(headerLabels.join(" ")).toContain(label);
    }

    const firstHeader = headers.first();
    await expect.poll(() =>
      firstHeader.evaluate(
        (element) => getComputedStyle(element).position,
      ),
    ).toBe("sticky");
    await expect.poll(() =>
      firstHeader.evaluate(
        (element) => getComputedStyle(element).whiteSpace,
      ),
    ).toBe("nowrap");
    await expect.poll(() =>
      firstHeader.evaluate(
        (element) => getComputedStyle(element).writingMode,
      ),
    ).toBe("horizontal-tb");
    for (const header of await headers.all()) {
      await expect.poll(() =>
        header.evaluate(
          (element) => getComputedStyle(element).whiteSpace,
        ),
      ).toBe("nowrap");
    }
    await expect.poll(() =>
      viewport.evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);

    const before = await firstHeader.boundingBox();
    await viewport.evaluate((element) => {
      element.scrollTop = 180;
    });
    await expect.poll(async () => {
      const after = await firstHeader.boundingBox();
      return before && after ? Math.abs(after.y - before.y) : Number.POSITIVE_INFINITY;
    }).toBeLessThan(1);
    const sortButton = firstHeader.getByRole("button");
    await sortButton.focus();
    await expect(sortButton).toBeFocused();
    expect(await viewport.evaluate((element) => {
      const viewportBounds = element.getBoundingClientRect();
      const button = element.querySelector("thead th button");
      if (!button) return false;
      const buttonBounds = button.getBoundingClientRect();
      const hit = document.elementFromPoint(
        buttonBounds.left + buttonBounds.width / 2,
        buttonBounds.top + buttonBounds.height / 2,
      );
      return buttonBounds.top >= viewportBounds.top - 1 &&
        buttonBounds.bottom <= viewportBounds.bottom + 1 &&
        (hit === button || button.contains(hit));
    })).toBe(true);
    const firstRowAction = page.getByRole("button", {
      name: "quarterly-report-0.xlsx",
      exact: true,
    });
    await firstRowAction.focus();
    await expect(firstRowAction).toBeFocused();
    expect(await viewport.evaluate((element) => {
      const viewportBounds = element.getBoundingClientRect();
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      const bounds = active.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return bounds.top >= viewportBounds.top - 1 &&
        bounds.bottom <= viewportBounds.bottom + 1 &&
        (hit === active || active.contains(hit));
    })).toBe(true);

    await page.setViewportSize({ width: 320, height: 768 });
    await expect.poll(() =>
      page.locator(".main-content").evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    ).toBeLessThanOrEqual(1);
    await expect.poll(() =>
      viewport.evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true);
    await expect.poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  });
}
