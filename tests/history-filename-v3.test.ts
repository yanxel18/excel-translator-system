import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("history filenames open the same source preview as the view action", async ({
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
              data: [
                {
                  id: "job-1",
                  fileName: "report.xlsx",
                  fileSize: 1024,
                  status: "PROCESSING",
                  progress: 10,
                  createdAt: "2026-11-12T00:00:00.000Z",
                  sourceLanguage: "JAPANESE",
                  targetLanguage: "ENGLISH",
                  selectedSheets: [],
                  availableSheets: [],
                  vocabularyGroupId: null,
                },
              ],
              total: 1,
              page: 1,
              pageSize: 10,
              nextCursor: null,
            }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({ json: body });
  });
  await page.goto(`${web}history`);
  const filename = page.getByRole("button", { name: "report.xlsx", exact: true });
  await filename.hover();
  await expect(filename).toHaveCSS("text-decoration-line", "underline");
  await filename.focus();
  await expect(filename).toBeFocused();
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Preview version" })).toHaveValue("Original");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Preview source report.xlsx" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Preview version" })).toHaveValue("Original");
});
