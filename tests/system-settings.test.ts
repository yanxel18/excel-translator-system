import { expect, test, type Page } from "@playwright/test";
import type { UserDetail } from "../project/apps/web/src/features/system-settings/api";

const userId = "11111111-1111-4111-8111-111111111111";
const baseId = "22222222-2222-4222-8222-222222222222";
const base = { id: baseId, code: "TKY", name: "Tokyo" };
const user = {
  id: userId,
  gid: "staff-001",
  username: "alice",
  email: "alice@example.com",
  baseId,
  base,
  enabled: true,
};

async function setup(page: Page, rejectUpdate = false) {
  let enabled = true;
  let applicationSettings = {
    maxUploadSizeMb: 50,
    maxConcurrentTranslations: 5,
  };
  await page.addInitScript(() => {
    localStorage.setItem("excel-translator-token", "settings-test-session");
    localStorage.setItem("excel-translator-locale", "en");
  });
  await page.route(/\/(?:api|excel-convert)\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/(?:api|excel-convert)/, "");
    if (!["fetch", "xhr"].includes(request.resourceType())) return route.continue();
    if (path === "/admin/application-settings") {
      if (request.method() === "PATCH")
        applicationSettings = request.postDataJSON();
      await route.fulfill({ json: applicationSettings });
      return;
    }
    if (path === `/v2/admin/users/${userId}` && request.method() === "PATCH") {
      expect(request.postDataJSON()).toEqual({ enabled: !enabled });
      if (rejectUpdate) {
        await route.fulfill({
          status: 400,
          json: { message: "Cannot disable the last administrator." },
        });
      } else {
        enabled = request.postDataJSON().enabled;
        await route.fulfill({ json: { ...user, enabled } });
      }
      return;
    }
    const body =
      path === "/profile"
        ? { id: "admin", username: "admin", isAdmin: true }
        : path === "/admin/users"
          ? { data: [{ ...user, enabled }], total: 1, page: 1, pageSize: 10 }
          : path === `/admin/users/${userId}`
            ? { ...user, enabled, hasLocalPassword: true, identityProviders: ["LOCAL"], sessionVersion: 0 }
            : path === "/admin/bases"
              ? { data: [base], total: 1, page: 1, pageSize: 10 }
              : path === "/system/info"
                ? { year: 2026, maxUploadSizeMb: applicationSettings.maxUploadSizeMb }
              : path === "/auth/oidc/settings"
                ? { mode: "LOCAL", enabled: false, keycloakUrl: "", realm: "", clientId: "", issuerUrl: "", requiredGroup: "" }
                : path === "/notifications/unread-count"
                  ? { count: 0 }
                  : [];
    await route.fulfill({ json: body });
  });
}

test("settings navigation aligns icon and label to the left", async ({ page }) => {
  await setup(page);
  await page.goto("/excel-convert/settings/users");
  const nav = page.locator(".system-settings-nav");
  await expect(nav.getByRole("button")).toHaveCount(5);
  for (const button of await nav.getByRole("button").all()) {
    const bounds = await button.boundingBox();
    const icon = await button.locator("svg").first().boundingBox();
    const label = await button.locator(".mantine-Button-label").boundingBox();
    expect(bounds && icon && label).toBeTruthy();
    expect(icon!.x - bounds!.x).toBeLessThanOrEqual(20);
    expect(label!.x - icon!.x).toBeLessThanOrEqual(40);
    const textStart = await button.locator(".mantine-Button-label").evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().x - element.getBoundingClientRect().x;
    });
    expect(textStart).toBeLessThanOrEqual(1);
  }
});

test("user search ignores removed filters and can be cleared with the keyboard", async ({ page }) => {
  await setup(page);
  const requests: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/excel-convert/admin/users") requests.push(url);
  });
  await page.goto(`/excel-convert/settings/users?baseId=${baseId}&enabled=false&page=2`);
  const filters = page.locator(".settings-filters");
  await expect(filters.getByLabel("Base", { exact: true })).toHaveCount(0);
  await expect(filters.getByLabel("Enabled", { exact: true })).toHaveCount(0);
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests[0].searchParams.has("baseId")).toBe(false);
  expect(requests[0].searchParams.has("enabled")).toBe(false);
  const search = filters.getByRole("textbox");
  await search.fill("alice");
  await filters.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=alice/);
  const clear = filters.getByRole("button", { name: "Clear search" });
  await clear.focus();
  await page.keyboard.press("Enter");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(clear).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.has("q")).toBe(false);
  await expect.poll(() => requests.at(-1)?.searchParams.has("q")).toBe(false);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  expect(new URL(page.url()).searchParams.has("baseId")).toBe(false);
  expect(new URL(page.url()).searchParams.has("enabled")).toBe(false);
});

test("admins can update upload size and translation concurrency", async ({ page }) => {
  await setup(page);
  await page.goto("/excel-convert/settings/files");

  const uploadLimit = page.getByRole("textbox", {
    name: "Maximum workbook size (MB)",
  });
  const concurrency = page.getByRole("textbox", {
    name: "Concurrent translations",
  });
  await expect(uploadLimit).toHaveValue("50");
  await expect(concurrency).toHaveValue("5");
  await uploadLimit.fill("200");
  await concurrency.fill("2");
  await page.getByRole("button", { name: "Save file settings" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "File settings saved." }),
  ).toBeVisible();
  await expect(uploadLimit).toHaveValue("200");
  await expect(concurrency).toHaveValue("2");
});

test("user access switch persists and survives reload", async ({ page }) => {
  await setup(page);
  await page.goto("/excel-convert/settings/users");
  await expect(page.getByRole("cell", { name: "TKY", exact: true })).toBeVisible();
  await expect(page.getByText("Tokyo", { exact: true })).toHaveCount(0);
  const toggle = page.getByRole("switch", { name: "Enabled: alice" });
  await expect(toggle).toBeChecked();
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole("alert").filter({ hasText: "User access updated." })).toBeVisible();
  await page.reload();
  await expect(toggle).not.toBeChecked();
});

test("rejected access change preserves state and displays the server error", async ({ page }) => {
  await setup(page, true);
  await page.goto("/excel-convert/settings/users");
  const toggle = page.getByRole("switch", { name: "Enabled: alice" });
  await expect(toggle).toBeChecked();
  await page.locator(".mantine-Switch-body").filter({ has: toggle }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot disable the last administrator.");
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeEnabled();
});

test("account edits use acronyms, preserve password controls and survive reload", async ({ page }, testInfo) => {
  await setup(page);
  let detail: UserDetail = {
    ...user,
    fullName: "Alice Example",
    baseId: "33333333-3333-4333-8333-333333333333",
    base: { id: "33333333-3333-4333-8333-333333333333", code: "MSTY", name: "Legacy factory" },
    hasLocalPassword: true,
    identityProviders: ["LOCAL"],
    sessionVersion: 0,
  };
  const writes: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`**/admin/users/${userId}`, (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: detail });
  });
  await page.route(`**/v2/admin/users/${userId}`, async (route) => {
    const body = route.request().postDataJSON();
    writes.push(body);
    expect(body).not.toHaveProperty("gid");
    expect(body).not.toHaveProperty("baseId");
    expect(body).not.toHaveProperty("password");
    detail = {
      ...detail,
      username: body.username,
      fullName: body.fullName,
      email: body.email,
      enabled: body.enabled,
      baseId: body.baseAcronym === null ? null : detail.baseId,
      base: body.baseAcronym === null ? null : detail.base,
    };
    await route.fulfill({
      json: {
        id: userId,
        username: detail.username,
        fullName: detail.fullName,
        email: detail.email,
        baseAcronym: body.baseAcronym,
        enabled: detail.enabled,
      },
    });
  });
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`/excel-convert/settings/users/${userId}`);
  await expect(page.getByRole("textbox", { name: "Base", exact: true })).toHaveValue("MSTY");
  const fullName = page.getByRole("textbox", { name: "Full name", exact: true });
  await fullName.fill("𠮷".repeat(51));
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(fullName).toHaveAttribute("aria-invalid", "true");
  expect(writes).toEqual([]);
  await fullName.fill("𠮷".repeat(50));
  await page.getByRole("textbox", { name: "Username", exact: true }).fill("jt0191340");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "User saved." })).toBeVisible();
  expect(writes).toEqual([{
    username: "jt0191340",
    fullName: "𠮷".repeat(50),
    email: user.email,
    baseAcronym: "MSTY",
    enabled: true,
  }]);
  await expect(page.getByRole("button", { name: "Reset local password", exact: true })).toBeVisible();
  await page.reload();
  await expect(fullName).toHaveValue("𠮷".repeat(50));
  await expect(page.getByRole("textbox", { name: "Username", exact: true })).toHaveValue("jt0191340");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await testInfo.attach("acronym-user-detail-mobile", {
    body: await page.screenshot({ path: testInfo.outputPath("acronym-user-detail-mobile.png") }),
    contentType: "image/png",
  });
  const baseSelect = page.getByRole("textbox", { name: "Base", exact: true });
  await baseSelect.click();
  await page.getByRole("option", { name: "MSTY", exact: true }).click();
  await expect(baseSelect).toHaveValue("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].baseAcronym).toBeNull();
  await page.reload();
  await expect(baseSelect).toHaveValue("");
  await expect(page.getByRole("button", { name: "Reset local password", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("editing a legacy OIDC account preserves its login and provider-managed password", async ({ page }) => {
  await setup(page);
  const detail = {
    ...user,
    username: "provider-login",
    fullName: null,
    email: null,
    baseId: null,
    base: null,
    hasLocalPassword: false,
    identityProviders: ["KEYCLOAK"],
    sessionVersion: 0,
  };
  let saved: Record<string, unknown> | undefined;
  await page.route(`**/admin/users/${userId}`, (route) => route.fulfill({ json: detail }));
  await page.route(`**/v2/admin/users/${userId}`, async (route) => {
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { ...saved, id: userId } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/excel-convert/settings/users/${userId}`);
  await expect(page.getByRole("button", { name: "Reset local password", exact: true })).toHaveCount(0);
  await expect(page.getByText("This account password is managed by its identity provider.")).toBeVisible();
  const name = page.getByRole("textbox", { name: "Full name", exact: true });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  expect(saved).toBeUndefined();
  await name.fill("山田 太郎");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "User saved." })).toBeVisible();
  expect(saved).toEqual({
    username: "provider-login",
    fullName: "山田 太郎",
    email: null,
    baseAcronym: null,
    enabled: true,
  });
  await expect(page.getByText("This account password is managed by its identity provider.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Username", exact: true })).toHaveValue("provider-login");
});

test("settings stay within mobile viewport and actions remain available", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/excel-convert/settings/users");
  await expect(page.getByRole("button", { name: "Create user", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.locator(".system-settings-nav").getByRole("button", { name: "Bases", exact: true }).click();
  await expect(page.getByRole("cell", { name: "TKY", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create base", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".system-settings-nav").getByRole("button", { name: "Authentication", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Authentication mode", exact: true })).toBeVisible();
});

test("base conflicts and assigned-base deletion errors remain visible", async ({ page }) => {
  await setup(page);
  await page.route("**/admin/bases**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 409, json: { message: "Base acronym already exists." } });
    } else {
      await route.fallback();
    }
  });
  await page.route(`**/admin/bases/${baseId}`, async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 409, json: { message: "Base is assigned to users." } });
    } else {
      await route.fallback();
    }
  });
  await page.goto("/excel-convert/settings/bases");
  await page.getByRole("button", { name: "Create base", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Base name (acronym)").fill("TKY");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Base acronym already exists.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Base is assigned to users.");
});

test("settings navigation and forms remain usable across themes and screen sizes", async ({ page }, testInfo) => {
  await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((value) => {
      localStorage.setItem("mantine-color-scheme-value", value);
    }, theme);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/excel-convert/settings/users");
      await expect(page.getByRole("cell", { name: "alice", exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const nav = page.locator(".system-settings-nav");
      await expect(nav.getByRole("button", { name: "Users", exact: true })).toHaveAttribute("aria-current", "page");
      if (width === 1440 || width === 320) {
        await testInfo.attach(`users-${theme}-${width}`, {
          body: await page.screenshot({ path: testInfo.outputPath(`users-${theme}-${width}.png`) }),
          contentType: "image/png",
        });
      }
      await nav.getByRole("button", { name: "Authentication", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Authentication mode", exact: true })).toBeEnabled();
      const server = page.getByRole("textbox", { name: "Keycloak server URL", exact: true });
      const realm = page.getByRole("textbox", { name: "Realm", exact: true });
      await expect(server).toBeVisible();
      if (width === 320) {
        const serverBounds = await server.boundingBox();
        const realmBounds = await realm.boundingBox();
        expect(realmBounds!.y).toBeGreaterThan(serverBounds!.y + serverBounds!.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
  expect(errors).toEqual([]);
});
