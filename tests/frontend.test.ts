import { test, expect } from "@playwright/test";
import {
  normalizeApiBaseUrl,
  normalizeWebBasePath,
  resolvePreviewUrl,
} from "../project/apps/web/src/config/paths";

const apiBaseUrl =
  process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const webBasePath = process.env.WEB_BASE_PATH || "/excel-convert/";

test("frontend base-path settings normalize URLs for local and nested deployments", () => {
  expect(normalizeWebBasePath("/excel-convert")).toBe("/excel-convert/");
  expect(normalizeWebBasePath("/")).toBe("/");
  expect(normalizeApiBaseUrl("https://api.example.com/excel-convert/")).toBe(
    "https://api.example.com/excel-convert",
  );
});

test("preview URLs support same-origin paths and absolute HTTP origins", () => {
  const origin = "https://app.example.test";
  expect(resolvePreviewUrl("/preview/", origin)?.href).toBe(
    "https://app.example.test/preview/bridge.html?v=2",
  );
  expect(resolvePreviewUrl("/preview", origin)?.origin).toBe(origin);
  expect(resolvePreviewUrl("https://preview.example.test/editor/", origin)?.href).toBe(
    "https://preview.example.test/editor/bridge.html?v=2",
  );
  expect(resolvePreviewUrl("javascript:alert(1)", origin)).toBeNull();
  expect(resolvePreviewUrl("http://[", origin)).toBeNull();
});

test("workspace navigation, preferences, and Japanese localization work on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    const body =
      path === "/auth/oidc/config"
        ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
        : path === "/auth/login"
          ? { access_token: "ui-test-token" }
          : path === "/profile"
            ? {
                id: "user-1",
                username: "ui-test",
                email: null,
                fullName: null,
                createdAt: "2026-01-01T00:00:00.000Z",
              }
            : [
                  "/jobs/history",
                  "/history",
                  "/notifications",
                  "/changelog",
                ].includes(path)
              ? { data: [], nextCursor: null }
              : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto(webBasePath);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();

  const navigate = async (name: string) => {
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await page.getByText(name, { exact: true }).click();
  };
  await navigate("History");
  await expect(
    page.getByRole("heading", { name: "Translation history" }),
  ).toBeVisible();
  await navigate("Vocabulary");
  await expect(page.getByRole("heading", { name: "Vocabulary" })).toBeVisible();
  await page.getByRole("button", { name: "Open notifications" }).click();
  await expect(page.getByText("No notifications yet.")).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await expect(page.getByText("@ui-test")).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.locator(".navigation-rail").getByRole("button", { name: "Changelog" }).click();
  await expect(page.getByRole("heading", { name: "Changelog" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitem", { name: "日本語" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "ホーム" })).toBeVisible();
});
test("administrator settings preserve list state and support management actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "ui-test-token"),
  );
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    code: "JTY",
    name: "Legacy factory name",
  };
  const user = {
    id: "22222222-2222-2222-2222-222222222222",
    gid: "G123",
    username: "alice",
    fullName: "Alice Example",
    email: "alice@example.com",
    baseId: null,
    base: null,
    enabled: true,
  };
  const writes: string[] = [];
  let createdUser: Record<string, string> | undefined;
  let savedBase: Record<string, string> | undefined;
  let editedBase: Record<string, string> | undefined;
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    const method = route.request().method();
    if (method !== "GET") writes.push(`${method} ${path}`);
    if (method === "POST" && path === "/admin/users")
      createdUser = route.request().postDataJSON();
    if (method === "POST" && path === "/admin/bases")
      savedBase = route.request().postDataJSON();
    if (method === "PATCH" && path === `/admin/bases/${base.id}`)
      editedBase = route.request().postDataJSON();
    const body =
      path === "/profile"
        ? { id: "admin", username: "admin", isAdmin: true }
        : path === "/admin/bases" && method === "GET"
          ? { data: [base], total: 1, page: 1, pageSize: 50 }
          : path === "/admin/users" && method === "GET"
            ? { data: [user], total: 1, page: 1, pageSize: 10 }
            : path.startsWith("/admin/")
              ? base
              : path === "/notifications/unread-count"
                ? { count: 0 }
                : [
                      "/jobs/history",
                      "/history",
                      "/notifications",
                      "/changelog",
                    ].includes(path)
                  ? { data: [], total: 0 }
                  : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${webBasePath}settings/users?pageSize=20`);
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search" }).fill("alice");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=alice/);
  await page.getByRole("textbox", { name: "Enabled" }).click();
  await page.getByRole("option", { name: "Yes" }).click();
  await expect(page).toHaveURL(/enabled=true/);
  await page.getByRole("button", { name: /Username/ }).click();
  await expect(page).toHaveURL(/sort=username/);
  await page.goBack();
  await expect(page).not.toHaveURL(/sort=username/);
  await page.goForward();
  await expect(page).toHaveURL(/sort=username/);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Search" })).toHaveValue(
    "alice",
  );
  await expect(page.getByText("Results: 1")).toBeVisible();
  await page.getByRole("button", { name: "Assign base" }).click();
  const assignDialog = page.getByRole("dialog");
  await assignDialog.getByLabel("Base").click();
  await page.getByRole("option", { name: "JTY", exact: true }).click();
  await assignDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Base reassigned.")).toBeVisible();
  expect(writes).toContain(`PATCH /admin/users/${user.id}/base`);
  await page.getByRole("button", { name: "Create user" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("GID")).toHaveCount(0);
  await dialog.getByLabel("Full name").fill(" 山田 太郎 ");
  await dialog.getByLabel("Username").fill("　 ");
  await dialog.getByLabel("Email").fill("alice@example.com");
  await dialog.getByLabel("Base").click();
  await page.getByRole("option", { name: /JTY/ }).click();
  const exactPassword = "  twelvecharacters　";
  await dialog.getByLabel("Password").fill(exactPassword);
  await expect(dialog.getByLabel("Password")).toHaveAttribute(
    "minlength",
    "12",
  );
  await expect(dialog.getByLabel("Password")).toHaveAttribute(
    "maxlength",
    "128",
  );
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByLabel("Username")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(writes).not.toContain("POST /admin/users");
  await expect(dialog.getByLabel("Password")).toHaveValue(exactPassword);
  await dialog.getByLabel("Username").fill(" 山田・张伟 ");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("User created.")).toBeVisible();
  expect(createdUser).toMatchObject({
    username: "山田・张伟",
    fullName: "山田 太郎",
    password: exactPassword,
  });
  expect(writes).toContain("POST /admin/users");
  await page.getByRole("button", { name: "Bases", exact: true }).click();
  await expect(page).toHaveURL(/settings\/bases/);
  await page.getByRole("button", { name: "Create base" }).click();
  await expect(dialog.getByLabel("Code")).toHaveCount(0);
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Base name (acronym)").fill("NOT VALID");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByLabel("Base name (acronym)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(writes).not.toContain("POST /admin/bases");
  await dialog.getByLabel("Base name (acronym)").fill(" NEW ");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Base saved.")).toBeVisible();
  expect(savedBase).toEqual({ code: "NEW", name: "NEW" });
  expect(writes).toContain("POST /admin/bases");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Base name (acronym)").fill("EDITED");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => writes.some((entry) => entry.startsWith("PATCH /admin/bases/")))
    .toBe(true);
  expect(editedBase).toEqual({ code: "EDITED" });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Base deleted.")).toBeVisible();
  expect(writes.some((entry) => entry.startsWith("DELETE /admin/bases/"))).toBe(
    true,
  );
});

test("unknown routes offer a real Workspace path and settings deny normal users", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "ui-test-token"),
  );
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(apiBaseUrl).pathname,
      "",
    );
    const body =
      path === "/profile"
        ? { id: "user", username: "user", isAdmin: false }
        : path === "/notifications/unread-count"
          ? { count: 0 }
          : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(`${webBasePath}unknown-destination`);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to Workspace" }).click();
  await expect(page).toHaveURL(new RegExp(`${webBasePath}workspace$`));
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();
  await page.goto(`${webBasePath}settings/users`);
  await expect(
    page.getByText("Administrator access is required."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "System Settings" }),
  ).toHaveCount(0);
});

test("administrator user list supports keyboard sorting and preserves combined filters while paging", async ({
  page,
}) => {
  const baseId = "11111111-1111-1111-1111-111111111111";
  const user = {
    id: "22222222-2222-2222-2222-222222222222",
    gid: "G123",
    username: "alice",
    fullName: "Alice Example",
    email: "alice@example.com",
    baseId,
    base: { id: baseId, code: "JTY", name: "Tokyo" },
    enabled: true,
  };
  const requests: URLSearchParams[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "ui-test-token"),
  );
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    let body: unknown = [];
    if (path === "/profile")
      body = { id: "admin", username: "admin", isAdmin: true };
    if (path === "/admin/bases")
      body = {
        data: [{ id: baseId, code: "JTY", name: "Tokyo" }],
        total: 1,
        page: 1,
        pageSize: 50,
      };
    if (path === "/admin/users") {
      requests.push(new URLSearchParams(url.searchParams));
      body = {
        data: [user],
        total: 41,
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 10),
      };
    }
    if (path === "/notifications/unread-count") body = { count: 0 };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto(
    `${webBasePath}settings/users?q=alice&baseId=${baseId}&enabled=true&page=2&pageSize=10&sort=username&direction=asc`,
  );
  await expect(page.getByText("alice", { exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(Object.fromEntries(requests[0])).toMatchObject({
    q: "alice",
    baseId,
    enabled: "true",
    page: "2",
    pageSize: "10",
    sort: "username",
    direction: "asc",
  });

  const nameSort = page.getByRole("button", { name: /Full name/ });
  await nameSort.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/sort=fullName/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByRole("columnheader", { name: /Full name/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/direction=desc/);
  await expect(page.getByRole("columnheader", { name: /Full name/ })).toHaveAttribute(
    "aria-sort",
    "descending",
  );

  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect.poll(() => requests.at(-1)?.get("page")).toBe("2");
  expect(Object.fromEntries(requests.at(-1)!)).toMatchObject({
    q: "alice",
    baseId,
    enabled: "true",
    page: "2",
    pageSize: "10",
    sort: "fullName",
    direction: "desc",
  });

  const basesNavigation = page
    .getByRole("navigation", { name: "System Settings" })
    .getByRole("button", { name: "Bases" });
  await basesNavigation.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/settings\/bases/);
  await expect(basesNavigation).toHaveAttribute("aria-current", "page");
});

test("administrator can edit user details and a rejected disable toggle rolls back", async ({
  page,
}) => {
  const userId = "22222222-2222-2222-2222-222222222222";
  const baseId = "11111111-1111-1111-1111-111111111111";
  const user = {
    id: userId,
    gid: "G123",
    username: "alice",
    fullName: "Alice Example",
    email: "alice@example.com",
    baseId,
    base: { id: baseId, code: "JTY", name: "Tokyo" },
    enabled: true,
    sessionVersion: 0,
    identityProviders: ["LOCAL"],
    hasLocalPassword: true,
  };
  let updateBody: Record<string, unknown> | undefined;
  let resetBody: Record<string, string> | undefined;
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "ui-test-token"),
  );
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    if (
      path === `/admin/users/${userId}/password` &&
      route.request().method() === "PATCH"
    ) {
      resetBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: userId, enabled: true, sessionVersion: 1 }),
      });
      return;
    }
    if (
      path === `/admin/users/${userId}` &&
      route.request().method() === "PATCH"
    ) {
      updateBody = route.request().postDataJSON();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message:
            "Cannot disable the last administrator with a usable configured login.",
        }),
      });
      return;
    }
    const body =
      path === "/profile"
        ? { id: "admin", username: "admin", isAdmin: true }
        : path === "/admin/users"
          ? { data: [user], total: 1, page: 1, pageSize: 10 }
          : path === `/admin/users/${userId}`
            ? user
            : path === "/admin/bases"
              ? { data: [user.base], total: 1, page: 1, pageSize: 50 }
              : path === "/notifications/unread-count"
                ? { count: 0 }
                : [
                      "/jobs/history",
                      "/history",
                      "/notifications",
                      "/changelog",
                    ].includes(path)
                  ? { data: [], total: 0 }
                  : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${webBasePath}settings/users/${userId}`);
  await expect(page.getByRole("heading", { name: "Edit user" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Alice Example");
  await page.getByRole("button", { name: "Reset local password" }).click();
  const resetPassword = "temporary reset password";
  await page.getByLabel(/^New password/).fill(resetPassword);
  await page.getByLabel(/^Confirm new password/).fill(resetPassword);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText(/Local password reset/)).toBeVisible();
  expect(resetBody).toEqual({ password: resetPassword });
  await page.getByLabel("Username").fill("alice-edited");
  await page.getByText("Enabled", { exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => updateBody).toBeDefined();
  await expect(
    page.getByText(/Cannot disable the last administrator/),
  ).toBeVisible();
  await expect(page.getByRole("switch", { name: "Enabled" })).toBeChecked();
  expect(updateBody).toMatchObject({
    username: "alice-edited",
    enabled: false,
  });
});

test("local user can change their password from Profile account details", async ({
  page,
}) => {
  const password = "new password securely";
  let submitted: Record<string, string> | undefined;
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "ui-test-token"),
  );
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    if (path === "/auth/password/change") {
      submitted = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    const body =
      path === "/profile"
        ? {
            id: "user-1",
            username: "alice",
            email: "alice@example.com",
            fullName: "Alice",
            createdAt: "2026-01-01T00:00:00.000Z",
            isAdmin: false,
            identityProviders: ["LOCAL"],
            hasLocalPassword: true,
          }
        : path === "/notifications/unread-count"
          ? { count: 0 }
          : [
                "/jobs/history",
                "/history",
                "/notifications",
                "/changelog",
              ].includes(path)
            ? { data: [], total: 0 }
            : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${webBasePath}profile`);
  await page.getByRole("tab", { name: "Account details" }).click();
  await page.getByLabel("Current password").fill("current password exactly");
  await page.getByLabel(/^New password/).fill(password);
  await page.getByLabel(/^Confirm new password/).fill(password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
  expect(submitted).toEqual({
    currentPassword: "current password exactly",
    newPassword: password,
  });
});

test("V2-17 redirects legacy Dashboard URLs to Profile and preserves query and browser history", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "profile-owner-token"),
  );
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    const body =
      path === "/profile"
        ? {
            id: "owner-1",
            username: "alice",
            email: "alice@example.com",
            fullName: "Alice",
            createdAt: "2026-01-01T00:00:00.000Z",
          }
        : path === "/jobs"
          ? []
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${webBasePath}workspace`);
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();
  await page.goto(`${webBasePath}dashboard?tab=account&q=preserved`);
  await expect(page).toHaveURL(
    new RegExp(`${webBasePath}profile\\?tab=account&q=preserved$`),
  );
  await expect(
    page.getByRole("button", { name: "Dashboard", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "Alice", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Profile", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Account details" }),
  ).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(page).toHaveURL(
    new RegExp(`${webBasePath}profile\\?tab=account&q=preserved$`),
  );
  await expect(
    page.getByRole("tab", { name: "Account details" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${webBasePath}profile\\?tab=overview&q=preserved$`),
  );
  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`${webBasePath}profile\\?tab=account&q=preserved$`),
  );
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${webBasePath}workspace$`));
  await page.goForward();
  await expect(page).toHaveURL(
    new RegExp(`${webBasePath}profile\\?tab=account&q=preserved$`),
  );

  await page.getByRole("button", { name: "New translation" }).click();
  await expect(page).toHaveURL(new RegExp(`${webBasePath}workspace$`));
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();
});

test("V2-17 Profile keeps details read-only until edited and uses owner-scoped activity in all locales", async ({
  page,
}) => {
  const localeCopy = {
    en: {
      edit: "Edit info",
      save: "Save changes",
      newTranslation: "New translation",
      total: "Total workbooks",
      fullName: "Full name",
      email: "Email",
      nameTooLong: "Full name must be 50 characters or fewer.",
    },
    ja: {
      edit: "情報を編集",
      save: "変更を保存",
      newTranslation: "翻訳を開始",
      total: "ワークブック総数",
      fullName: "氏名",
      email: "メールアドレス",
      nameTooLong: "氏名は50文字以内で入力してください。",
    },
    zh: {
      edit: "编辑资料",
      save: "保存更改",
      newTranslation: "新建翻译",
      total: "工作簿总数",
      fullName: "姓名",
      email: "电子邮件",
      nameTooLong: "姓名不能超过50个字符。",
    },
  } as const;
  for (const locale of ["en", "ja", "zh"] as const) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((selectedLocale) => {
      localStorage.setItem(
        "excel-translator-token",
        `profile-${selectedLocale}-token`,
      );
      localStorage.setItem("excel-translator-locale", selectedLocale);
    }, locale);
    let profile = {
      id: `owner-${locale}`,
      username: "alice",
      email: "alice@example.com",
      fullName: "Alice",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    let saved: Record<string, unknown> | undefined;
    const activityOwners: string[] = [];
    await page.route(`${apiBaseUrl}/**`, async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
      if (path === "/profile" && route.request().method() === "PATCH") {
        saved = route.request().postDataJSON();
        profile = { ...profile, ...(saved as Partial<typeof profile>) };
      }
      if (path === "/jobs")
        activityOwners.push(route.request().headers().authorization ?? "");
      const body =
        path === "/profile"
          ? profile
          : path === "/jobs"
            ? [
                {
                  id: `job-${locale}`,
                  ownerId: `owner-${locale}`,
                  fileName: "private-workbook.xlsx",
                  fileSize: 1024,
                  status: "COMPLETED",
                  progress: 100,
                  createdAt: "2026-11-12T00:00:00.000Z",
                  sourceLanguage: "JAPANESE",
                  targetLanguage: "ENGLISH",
                  selectedSheets: ["Sheet1"],
                  availableSheets: ["Sheet1"],
                  vocabularyGroupId: null,
                },
              ]
            : path === "/notifications/unread-count"
              ? { count: 0 }
              : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.goto(`${webBasePath}profile?tab=account`);
    const labels = localeCopy[locale];
    await expect(page.getByRole("button", { name: labels.edit })).toBeVisible();
    await expect(
      page.getByRole("button", { name: labels.newTranslation }),
    ).toBeVisible();
    await expect(page.getByText("@alice")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Alice", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: labels.fullName }),
    ).toHaveCount(0);
    await expect(page.locator(".profile-summary-grid")).toContainText(
      labels.total,
    );
    await expect(page.locator(".profile-summary-grid")).toContainText("1");
    expect(activityOwners).toContain(`Bearer profile-${locale}-token`);

    await page.getByRole("button", { name: labels.edit }).click();
    const nameInput = page.getByRole("textbox", { name: labels.fullName });
    await nameInput.fill("𠮷".repeat(50));
    await expect(nameInput).toHaveValue("𠮷".repeat(50));
    await nameInput.fill("山".repeat(51));
    await expect(page.getByText(labels.nameTooLong)).toBeVisible();
    await page.getByRole("button", { name: labels.save }).click();
    expect(saved).toBeUndefined();
    await page
      .getByRole("textbox", { name: labels.fullName })
      .fill("Alice Example");
    await page
      .getByRole("textbox", { name: labels.email })
      .fill("alice@example.test");
    await page.getByRole("button", { name: labels.save }).click();
    await expect(
      page.getByRole("heading", { name: "Alice Example", exact: true }),
    ).toBeVisible();
    expect(saved).toEqual({
      fullName: "Alice Example",
      email: "alice@example.test",
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.unrouteAll();
  }
});

test("V2-17 root and successful local sign-in land on Workspace", async ({
  page,
}) => {
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(apiBaseUrl).pathname,
      "",
    );
    const body =
      path === "/auth/oidc/config"
        ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
        : path === "/auth/login"
          ? { access_token: "workspace-session" }
          : path === "/profile"
            ? { id: "owner-1", username: "alice", isAdmin: false }
            : path === "/notifications/unread-count"
              ? { count: 0 }
              : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto(webBasePath);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${webBasePath}workspace$`));
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();
});

test("V2-19 history controls combine URL filters, sorting, page size, and browser history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "history-token"),
  );
  const requests: URLSearchParams[] = [];
  let previewRequested = false;
  await page.route("http://localhost:8081/bridge.html**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<script>setTimeout(() => parent.postMessage({source:'excel-translator-preview',type:'ready'}, '*'), 50)</script>`,
    }),
  );
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    if (path === "/history")
      requests.push(new URLSearchParams(url.searchParams));
    if (path === "/jobs/job-1/preview-file") previewRequested = true;
    if (path === "/jobs/job-1/download") {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: "workbook",
      });
      return;
    }
    const body =
      path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/history"
          ? {
              data: [
                {
                  id: "job-1",
                  fileName: "final-page.xlsx",
                  fileSize: 1024,
                  status: "COMPLETED",
                  progress: 100,
                  createdAt: "2026-11-12T00:00:00.000Z",
                  sourceLanguage: "JAPANESE",
                  targetLanguage: "ENGLISH",
                  selectedSheets: [],
                  availableSheets: [],
                  vocabularyGroupId: null,
                },
              ],
              total: 41,
              page: Number(url.searchParams.get("page") || 1),
              pageSize: Number(url.searchParams.get("pageSize") || 10),
              nextCursor: null,
            }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto(
    `${webBasePath}history?q=contract&sourceLanguage=JAPANESE&targetLanguage=ENGLISH&sort=fileName&direction=asc&page=3&pageSize=20`,
  );
  await expect(
    page.getByRole("heading", { name: "Translation history" }),
  ).toBeVisible();
  await expect(page.getByText("final-page.xlsx")).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search workbooks" }),
  ).toHaveValue("contract");
  await expect(
    page.getByRole("combobox", { name: "Source language" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Target language" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("searchbox", { name: "Search workbooks" }),
  ).toHaveAttribute("placeholder", "Search by Excel filename");
  await expect(
    page.getByRole("textbox", { name: "Rows per page" }),
  ).toHaveValue("20");
  expect(Object.fromEntries(requests[0])).toMatchObject({
    q: "contract",
    sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH",
    sort: "fileName",
    direction: "asc",
    page: "3",
    pageSize: "20",
  });

  const search = page.getByRole("searchbox", { name: "Search workbooks" });
  await search.fill("final-page.xlsx");
  await expect(page).toHaveURL(/q=final-page\.xlsx/);
  await expect(page).not.toHaveURL(/page=3/);
  await expect.poll(() => requests.at(-1)?.get("q")).toBe("final-page.xlsx");
  await expect.poll(() => requests.at(-1)?.get("sourceLanguage")).toBe(
    "JAPANESE",
  );
  await expect.poll(() => requests.at(-1)?.get("targetLanguage")).toBe(
    "ENGLISH",
  );
  await expect.poll(() => requests.at(-1)?.get("pageSize")).toBe("20");
  await expect.poll(() => requests.at(-1)?.get("sort")).toBe("fileName");
  const historyPages = page.getByLabel("History pages");
  await historyPages.getByRole("button", { name: "2", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect.poll(() => requests.at(-1)?.get("page")).toBe("2");
  await expect.poll(() => requests.at(-1)?.get("sourceLanguage")).toBe(
    "JAPANESE",
  );
  await expect.poll(() => requests.at(-1)?.get("targetLanguage")).toBe(
    "ENGLISH",
  );
  await page.getByRole("textbox", { name: "Rows per page" }).click();
  for (const size of ["10", "20", "30", "40", "50"]) {
    await expect(
      page.getByRole("option", { name: size, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("option", { name: "50" }).click();
  await expect(page).toHaveURL(/pageSize=50/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect.poll(() => requests.at(-1)?.get("sourceLanguage")).toBe(
    "JAPANESE",
  );
  await expect.poll(() => requests.at(-1)?.get("targetLanguage")).toBe(
    "ENGLISH",
  );

  const sortByStatus = page.getByRole("button", { name: "Sort by Status" });
  await sortByStatus.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/sort=status/);
  await expect.poll(() => requests.at(-1)?.get("sort")).toBe("status");
  await expect.poll(() => requests.at(-1)?.get("direction")).toBe("asc");
  await expect.poll(() => requests.at(-1)?.get("sourceLanguage")).toBe(
    "JAPANESE",
  );
  await expect.poll(() => requests.at(-1)?.get("targetLanguage")).toBe(
    "ENGLISH",
  );
  await expect.poll(() => requests.at(-1)?.get("pageSize")).toBe("50");
  await expect(
    page.getByRole("columnheader", { name: /Status/ }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "Rows per page" }),
  ).toHaveValue("50");
  await expect(
    page.getByRole("combobox", { name: "Source language" }),
  ).toHaveCount(0);
  await expect(page).not.toHaveURL(/sort=status/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect.poll(() => requests.at(-1)?.get("sourceLanguage")).toBe(
    "JAPANESE",
  );
  await expect.poll(() => requests.at(-1)?.get("targetLanguage")).toBe(
    "ENGLISH",
  );
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "Rows per page" }),
  ).toHaveValue("20");
  await expect(
    page.getByRole("searchbox", { name: "Search workbooks" }),
  ).toHaveValue("final-page.xlsx");
  await expect(page).toHaveURL(/page=2/);
  await expect.poll(() => requests.at(-1)?.get("page")).toBe("2");
  await expect.poll(() => requests.at(-1)?.get("pageSize")).toBe("20");
  await expect.poll(() => requests.at(-1)?.get("sourceLanguage")).toBe(
    "JAPANESE",
  );
  await expect.poll(() => requests.at(-1)?.get("targetLanguage")).toBe(
    "ENGLISH",
  );
  await page.goForward();
  await expect(page).toHaveURL(/pageSize=50/);
  await expect(page).not.toHaveURL(/page=2/);
  await page
    .getByRole("button", { name: "Preview source final-page.xlsx" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => previewRequested).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download final-page.xlsx" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("final-page-translated.xlsx");
});

test("V2-19 ignores superseded history responses and renders final and empty results", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "history-token"),
  );
  let releaseSlow: (() => void) | undefined;
  let defaultRequest: URLSearchParams | undefined;
  const slowStarted = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith("/history") && url.searchParams.get("q") === "slow"
    );
  });
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    if (path === "/history" && url.searchParams.get("q") === "slow") {
      defaultRequest = new URLSearchParams(url.searchParams);
      await new Promise<void>((resolve) => {
        releaseSlow = resolve;
      });
      await route
        .fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                id: "slow",
                fileName: "slow-result.xlsx",
                fileSize: 1,
                status: "COMPLETED",
                progress: 100,
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
          }),
        })
        .catch(() => undefined);
      return;
    }
    const q = url.searchParams.get("q");
    const data =
      q === "fast"
        ? [
            {
              id: "fast",
              fileName: "fast-result.xlsx",
              fileSize: 1,
              status: "COMPLETED",
              progress: 100,
              createdAt: "2026-11-12T00:00:00.000Z",
              sourceLanguage: "JAPANESE",
              targetLanguage: "ENGLISH",
              selectedSheets: [],
              availableSheets: [],
              vocabularyGroupId: null,
            },
          ]
        : q === "last"
          ? [
              {
                id: "last",
                fileName: "last-page.xlsx",
                fileSize: 1,
                status: "COMPLETED",
                progress: 100,
                createdAt: "2026-11-12T00:00:00.000Z",
                sourceLanguage: "JAPANESE",
                targetLanguage: "ENGLISH",
                selectedSheets: [],
                availableSheets: [],
                vocabularyGroupId: null,
              },
            ]
          : [];
    const body =
      path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/history"
          ? {
              data,
              total: q === "last" ? 21 : data.length,
              page: Number(url.searchParams.get("page") || 1),
              pageSize: Number(url.searchParams.get("pageSize") || 10),
              nextCursor: null,
            }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto(`${webBasePath}history?q=slow`);
  await slowStarted;
  expect(Object.fromEntries(defaultRequest ?? [])).toMatchObject({
    page: "1",
    pageSize: "10",
    sort: "createdAt",
    direction: "desc",
  });
  await page.getByRole("searchbox", { name: "Search workbooks" }).fill("fast");
  await expect(page.getByText("fast-result.xlsx")).toBeVisible();
  releaseSlow?.();
  await expect(page.getByText("slow-result.xlsx")).toHaveCount(0);

  await page.goto(`${webBasePath}history?q=last&page=2&pageSize=20`);
  await expect(page.getByText("last-page.xlsx")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Rows per page" }),
  ).toHaveValue("20");
  await page
    .getByRole("searchbox", { name: "Search workbooks" })
    .fill("no-match");
  await expect(page.getByText("No matching workbooks.")).toBeVisible();
});

test("V2-19 history search is localized and fits a mobile viewport", async ({
  page,
}) => {
  const labels = {
    en: {
      search: "Search workbooks",
      placeholder: "Search by Excel filename",
      source: "Source language",
      target: "Target language",
      rows: "Rows per page",
    },
    ja: {
      search: "ワークブックを検索",
      placeholder: "Excelファイル名で検索",
      source: "原文の言語",
      target: "翻訳先の言語",
      rows: "1ページの表示件数",
    },
    zh: {
      search: "搜索工作簿",
      placeholder: "按 Excel 文件名搜索",
      source: "源语言",
      target: "目标语言",
      rows: "每页行数",
    },
  } as const;
  for (const locale of ["en", "ja", "zh"] as const) {
    const localizedPage = await page.context().newPage();
    await localizedPage.setViewportSize({ width: 390, height: 844 });
    await localizedPage.addInitScript((selectedLocale) => {
      localStorage.setItem(
        "excel-translator-token",
        `history-${selectedLocale}`,
      );
      localStorage.setItem("excel-translator-locale", selectedLocale);
    }, locale);
    await localizedPage.route(`${apiBaseUrl}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        new URL(apiBaseUrl).pathname,
        "",
      );
      const body =
        path === "/profile"
          ? { id: "owner", username: "alice", isAdmin: false }
          : path === "/history"
            ? { data: [], total: 0, page: 1, pageSize: 10, nextCursor: null }
            : path === "/notifications/unread-count"
              ? { count: 0 }
              : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await localizedPage.goto(`${webBasePath}history`);
    await expect(
      localizedPage.getByRole("searchbox", { name: labels[locale].search }),
    ).toBeVisible();
    await expect(
      localizedPage.getByText(labels[locale].search, { exact: true }),
    ).toBeVisible();
    const search = localizedPage.getByRole("searchbox", {
      name: labels[locale].search,
    });
    await expect(search).toHaveAttribute(
      "placeholder",
      labels[locale].placeholder,
    );
    await expect(
      localizedPage.getByRole("combobox", { name: labels[locale].source }),
    ).toHaveCount(0);
    await expect(
      localizedPage.getByRole("combobox", { name: labels[locale].target }),
    ).toHaveCount(0);
    await expect(
      localizedPage.getByRole("textbox", { name: labels[locale].rows }),
    ).toBeVisible();
    expect(
      await localizedPage.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await localizedPage.close();
  }
});
