import { test, expect } from "@playwright/test";
const api = "http://localhost:3000/excel-convert";
const entries = Array.from({ length: 15 }, (_, index) => ({
  id: `notice-${index}`,
  jobId: "job-1",
  type: index % 2 ? "COMPLETED" : "FAILED",
  title: `Workbook update ${index}`,
  message: "Your workbook translation has an update.",
  isRead: false,
  createdAt: new Date(Date.UTC(2026, 10, 11, 10, 0, index)).toISOString(),
}));

test("notification scrolling loads older entries and selection opens the highlighted full-page item", async ({
  page,
}) => {
  let olderRequests = 0;
  await page.route(`${api}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/excel-convert", "");
    let body: unknown = [];
    if (path === "/auth/oidc/config")
      body = {
        mode: "LOCAL",
        enabled: false,
        url: "",
        realm: "",
        clientId: "",
      };
    else if (path === "/auth/login")
      body = { access_token: "notification-test" };
    else if (path === "/notifications/unread-count") body = { count: 15 };
    else if (path === "/notifications") {
      if (url.searchParams.has("cursor")) {
        olderRequests++;
        body = { data: entries.slice(10), nextCursor: null };
      } else body = { data: entries.slice(0, 10), nextCursor: "older" };
    } else if (path.endsWith("/read")) body = { ok: true };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/excel-convert/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Open notifications" }).click();
  await expect(
    page.getByText("Workbook update 0", { exact: true }),
  ).toBeVisible();
  const viewport = page.locator(
    ".notification-popover .mantine-ScrollArea-viewport",
  );
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => olderRequests).toBeGreaterThan(0);
  await page.getByText("Workbook update 12", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".notification-selected")).toContainText(
    "Workbook update 12",
  );
  await expect(page.locator(".notification-selected")).toBeFocused();
});

test("notification preview retries a failed initial request", async ({
  page,
}) => {
  let fail = true;
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/excel-convert",
      "",
    );
    if (path === "/notifications" && fail)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary feed failure" }),
      });
    const body =
      path === "/auth/oidc/config"
        ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
        : path === "/auth/login"
          ? { access_token: "notification-test" }
          : path === "/notifications/unread-count"
            ? { count: 1 }
            : path === "/notifications"
              ? { data: entries.slice(0, 1), nextCursor: null }
              : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/excel-convert/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Open notifications" }).click();
  await expect(page.getByRole("alert")).toContainText("Temporary feed failure");
  fail = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Workbook update 0", { exact: true }),
  ).toBeVisible();
});
