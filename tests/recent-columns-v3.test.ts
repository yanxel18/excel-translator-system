import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("recent translations keep filename, status and available actions in aligned columns", async ({
  page,
}) => {
  const jobs = [
    {
      id: "one",
      fileName:
        "a-very-long-workbook-filename-that-must-not-push-other-columns.xlsx",
      status: "COMPLETED",
    },
    { id: "two", fileName: "short.xlsx", status: "FAILED" },
    { id: "three", fileName: "cancelled.xlsx", status: "CANCELLED" },
  ].map((job) => ({
    ...job,
    fileSize: 1024,
    progress: 0,
    createdAt: "2026-11-12T00:00:00.000Z",
    sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH",
    selectedSheets: [],
    availableSheets: [],
    vocabularyGroupId: null,
  }));
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "recent-test-session"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    await route.fulfill({
      json:
        path === "/profile"
          ? { id: "owner", username: "alice", isAdmin: false }
          : path === "/jobs"
            ? jobs
            : path === "/notifications/unread-count"
              ? { count: 0 }
              : [],
    });
  });
  await page.goto(web);
  const table = page.getByRole("table", { name: "Recent translations" });
  await expect(table).toBeVisible();
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const positions = await rows.evaluateAll((elements) =>
      elements.map((row) =>
        Array.from(row.children, (cell) => {
          const rect = cell.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        }),
      ),
    );
    expect(positions.map((row) => row.length)).toEqual([3, 3, 3]);
    for (const row of positions.slice(1)) {
      expect(row.map((cell) => Math.round(cell.left))).toEqual(
        positions[0].map((cell) => Math.round(cell.left)),
      );
    }
    expect(
      await table.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await expect(
      rows.nth(0).getByRole("button", { name: /^View / }),
    ).toBeVisible();
    await expect(
      rows.nth(0).getByRole("button", { name: /^Download / }),
    ).toBeVisible();
    await expect(rows.nth(1).getByRole("button")).toHaveCount(0);
    await expect(rows.nth(2).getByRole("button")).toHaveCount(0);
  }
});
