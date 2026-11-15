import { expect, test, type Page } from "@playwright/test";

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
  await page.route("**/excel-convert/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/excel-convert", "");
    if (!["fetch", "xhr"].includes(request.resourceType())) return route.continue();
    if (path === "/admin/application-settings") {
      if (request.method() === "PATCH")
        applicationSettings = request.postDataJSON();
      await route.fulfill({ json: applicationSettings });
      return;
    }
    if (path === `/admin/users/${userId}` && request.method() === "PATCH") {
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
  await expect(nav.getByRole("button")).toHaveCount(4);
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
  await uploadLimit.fill("20");
  await concurrency.fill("2");
  await page.getByRole("button", { name: "Save file settings" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "File settings saved." }),
  ).toBeVisible();
  await expect(uploadLimit).toHaveValue("20");
  await expect(concurrency).toHaveValue("2");
});

test("user access switch persists and survives reload", async ({ page }) => {
  await setup(page);
  await page.goto("/excel-convert/settings/users");
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

test("settings stay within mobile viewport and actions remain available", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/excel-convert/settings/users");
  await expect(page.getByRole("button", { name: "Create user", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.locator(".system-settings-nav").getByRole("button", { name: "Bases", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Tokyo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create base", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".system-settings-nav").getByRole("button", { name: "Authentication", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Authentication mode", exact: true })).toBeVisible();
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
