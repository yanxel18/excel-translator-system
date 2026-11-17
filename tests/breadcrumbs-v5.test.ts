import { expect, test, type Page } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

async function openVocabulary(
  page: Page,
  locale: "en" | "ja" = "en",
): Promise<void> {
  await page.addInitScript(
    ({ selectedLocale }) => {
      localStorage.setItem("excel-translator-token", "breadcrumbs-test-token");
      localStorage.setItem("excel-translator-locale", selectedLocale);
    },
    { selectedLocale: locale },
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    const body =
      path === "/auth/oidc/config"
        ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
        : path === "/profile"
          ? {
              id: "breadcrumbs-user",
              username: "breadcrumbs-test",
              fullName: "Breadcrumb Test",
              email: "breadcrumbs@example.test",
              isAdmin: false,
            }
          : path === "/system/info"
            ? { year: 2026 }
            : path === "/history"
              ? { data: [], total: 0, page: 1, pageSize: 5 }
              : path === "/notifications/unread-count"
                ? { count: 0 }
                : [];
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto(`${web}vocabulary`);
  await expect(
    page.getByRole("heading", {
      name: locale === "ja" ? "用語集" : "Vocabulary",
    }),
  ).toBeVisible();
}

test("Workspace ancestor breadcrumb navigates by mouse and browser Back restores Vocabulary", async ({
  page,
}) => {
  await openVocabulary(page);
  const breadcrumbs = page.locator(".mantine-Breadcrumbs-root");
  const workspaceLink = breadcrumbs.getByRole("link", { name: "Workspace" });
  await expect(workspaceLink).toBeVisible();
  await expect(workspaceLink).toHaveAttribute("href", web);
  await expect(breadcrumbs.getByRole("link", { name: "Vocabulary" })).toHaveCount(0);

  await workspaceLink.click();
  await expect(
    page,
  ).toHaveURL(new RegExp(`${web.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".mantine-Breadcrumbs-root")
      .getByRole("link", { name: "Workspace" }),
  ).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp("/vocabulary$"));
  await expect(page.getByRole("heading", { name: "Vocabulary" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Translate a workbook" })).toBeVisible();
});

test("localized Workspace breadcrumb is keyboard navigable and current location is not a link", async ({
  page,
}) => {
  await openVocabulary(page, "ja");
  const breadcrumbs = page.locator(".mantine-Breadcrumbs-root");
  const workspaceLink = breadcrumbs.getByRole("link", { name: "ワークスペース" });
  await expect(workspaceLink).toBeVisible();
  await expect(breadcrumbs.getByRole("link", { name: "用語集" })).toHaveCount(0);

  await workspaceLink.focus();
  await expect(workspaceLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page,
  ).toHaveURL(new RegExp(`${web.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await expect(
    page.getByRole("heading", { name: "ワークブックを翻訳" }),
  ).toBeVisible();
});

test("History shows an accessible breadcrumb back to Translate File", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "breadcrumbs-test-token"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    const body =
      path === "/auth/oidc/config"
        ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
        : path === "/profile"
          ? {
              id: "breadcrumbs-user",
              username: "breadcrumbs-test",
              isAdmin: false,
            }
          : path === "/history"
            ? { data: [], total: 0, page: 1, pageSize: 5 }
            : path === "/notifications/unread-count"
              ? { count: 0 }
              : [];
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto(`${web}history`);
  await expect(
    page.getByRole("heading", { name: "Translation history" }),
  ).toBeVisible();
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.getByText("Translation history")).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => localStorage.setItem("excel-translator-locale", "ja"));
  await page.reload();
  await expect(page.getByRole("navigation", { name: "パンくずリスト" }))
    .toContainText("翻訳履歴");
  await page.evaluate(() => localStorage.setItem("excel-translator-locale", "en"));
  await page.reload();
  await breadcrumb.getByRole("link", { name: "Translate File" }).click();
  await expect(page.getByRole("heading", { name: "Translate a workbook" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }))
    .toContainText("Translate File");
});

test("settings breadcrumbs show sections and link user details to Users", async ({ page }) => {
  const userId = "11111111-1111-4111-8111-111111111111";
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "breadcrumbs-test-token"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(new URL(api).pathname, "");
    const body = path === "/profile" ? { id: "admin", username: "admin", isAdmin: true }
      : path === `/v2/admin/users/${userId}` ? { id: userId, username: "alice", enabled: true, hasLocalPassword: true, base: null }
      : path === "/admin/users" || path === "/admin/bases" || path === "/v2/bases"
        ? { data: [], total: 0, page: 1, pageSize: 10 }
        : path === "/notifications/unread-count" ? { count: 0 }
          : path === "/system/info" ? { year: 2026 } : [];
    await route.fulfill({ json: body });
  });
  await page.goto(`${web}settings/users/${userId}`);
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.getByText("User details")).toHaveAttribute("aria-current", "page");
  const users = breadcrumb.getByRole("link", { name: "Users" });
  await users.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp("/settings/users$"));
  await expect(breadcrumb.getByText("Users")).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => localStorage.setItem("excel-translator-locale", "zh"));
  await page.reload();
  const localized = page.getByRole("navigation", { name: "面包屑导航" });
  await expect(localized).toContainText("翻译文件");
  await expect(localized).toContainText("系统设置");
  await expect(localized).toContainText("用户");
  await page.goto(`${web}settings/users/new`);
  const createBreadcrumb = page.getByRole("navigation", { name: "面包屑导航" });
  await expect(createBreadcrumb.getByText("创建用户")).toHaveAttribute("aria-current", "page");
  await expect(createBreadcrumb.getByRole("link", { name: "用户" })).toBeVisible();
});
