import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("hidden language filters remain active in history URLs and requests", async ({
  page,
}) => {
  const historyRequests: URLSearchParams[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "history-test-session"),
  );
  await page.route(`${api}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(api).pathname, "");
    if (path === "/history") {
      historyRequests.push(new URLSearchParams(url.searchParams));
    }
    const body =
      path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/history"
          ? {
              data: [
                {
                  id: "job-1",
                  fileName: "annual-budget.xlsx",
                  fileSize: 1024,
                  status: "COMPLETED",
                  progress: 100,
                  createdAt: "2026-11-12T00:00:00.000Z",
                  sourceLanguage: "JAPANESE",
                  targetLanguage: "CHINESE",
                  selectedSheets: [],
                  availableSheets: [],
                  vocabularyGroupId: null,
                },
              ],
              total: 61,
              page: Number(url.searchParams.get("page") || 1),
              pageSize: Number(url.searchParams.get("pageSize") || 20),
              nextCursor: null,
            }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({ json: body });
  });

  await page.goto(
    `${web}history?q=report&page=2&pageSize=20&sort=fileName&direction=asc&sourceLanguage=JAPANESE&targetLanguage=CHINESE`,
  );
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Source language" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Target language" }),
  ).toHaveCount(0);
  const search = page.getByRole("searchbox", { name: "Search workbooks" });
  await expect(search).toHaveAttribute(
    "placeholder",
    "Search by Excel filename",
  );
  await expect.poll(() => historyRequests.length).toBeGreaterThan(0);

  const initialRequest = historyRequests[historyRequests.length - 1];
  expect(initialRequest.get("q")).toBe("report");
  expect(initialRequest.get("page")).toBe("2");
  expect(initialRequest.get("pageSize")).toBe("20");
  expect(initialRequest.get("sort")).toBe("fileName");
  expect(initialRequest.get("direction")).toBe("asc");
  expect(initialRequest.get("sourceLanguage")).toBe("JAPANESE");
  expect(initialRequest.get("targetLanguage")).toBe("CHINESE");

  await search.fill("annual-budget.xlsx");
  await expect(page).toHaveURL(/q=annual-budget\.xlsx/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect.poll(() =>
    historyRequests.some((request) =>
      request.get("q") === "annual-budget.xlsx" &&
      request.get("sourceLanguage") === "JAPANESE" &&
      request.get("targetLanguage") === "CHINESE",
    ),
  ).toBe(true);

  const pagination = page.getByLabel("History pages");
  await pagination.getByRole("button", { name: "3", exact: true }).click();
  await expect(page).toHaveURL(/page=3/);
  await expect.poll(() =>
    historyRequests.some((request) =>
      request.get("q") === "annual-budget.xlsx" &&
      request.get("page") === "3" &&
      request.get("pageSize") === "20" &&
      request.get("sort") === "fileName" &&
      request.get("direction") === "asc" &&
      request.get("sourceLanguage") === "JAPANESE" &&
      request.get("targetLanguage") === "CHINESE",
    ),
  ).toBe(true);

  const requestsBeforeReload = historyRequests.length;
  await page.reload();
  await expect(search).toHaveValue("annual-budget.xlsx");
  await expect.poll(() => historyRequests.length).toBeGreaterThan(
    requestsBeforeReload,
  );
  await expect.poll(() =>
    historyRequests[historyRequests.length - 1]?.get("page"),
  ).toBe("3");
  const reloadedRequest = historyRequests[historyRequests.length - 1];
  expect(reloadedRequest.get("q")).toBe("annual-budget.xlsx");
  expect(reloadedRequest.get("pageSize")).toBe("20");
  expect(reloadedRequest.get("sort")).toBe("fileName");
  expect(reloadedRequest.get("direction")).toBe("asc");
  expect(reloadedRequest.get("sourceLanguage")).toBe("JAPANESE");
  expect(reloadedRequest.get("targetLanguage")).toBe("CHINESE");
});
