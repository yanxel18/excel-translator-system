import { expect, test, type Page } from "@playwright/test";

async function openWorkspace(page: Page, profile: object | null = {
  id: "owner", username: "alice", fullName: "Alice Example",
  email: "alice@example.test", isAdmin: true,
}) {
  await page.addInitScript(() => {
    localStorage.setItem("excel-translator-token", "isolated-test-token");
  });
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route("http://localhost:3000/excel-convert/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/excel-convert", "");
    if (path === "/profile" && !profile) {
      await route.fulfill({ status: 503, json: { message: "Unavailable" } });
      return;
    }
    await route.fulfill({ json:
      path === "/auth/oidc/config" ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" } :
      path === "/profile" ? profile :
      path === "/system/info" ? { year: 2026 } :
      path === "/history" ? { data: [], total: 0, page: 1, pageSize: 5 } :
      path === "/notifications/unread-count" ? { count: 0 } : []
    });
  });
  await page.goto("/excel-convert/workspace");
}

test("rail avatar opens account details and actions without a duplicate settings entry", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorkspace(page);
  const account = page.getByRole("button", { name: "Account", exact: true });
  await expect(account).toBeVisible();
  await expect(page.locator(".navigation-rail").locator(".shell-account-trigger")).toBeVisible();
  await expect(account.locator(".shell-gid-identicon svg")).toBeVisible();
  await expect(page.locator(".navigation-rail .lucide-layout-dashboard")).toBeVisible();
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toContainText("Alice Example");
  await expect(page.getByRole("menu")).toContainText("alice@example.test");
  await expect(page.getByRole("menuitem", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "System Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
});

test("mobile rail, theme, profile failure and navigation remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openWorkspace(page, null);
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Workspace", exact: true })
    .locator(".mantine-NavLink-section")).toHaveCSS("border-radius", "0px");
  const account = page.getByRole("button", { name: "Account", exact: true });
  await expect(account).toBeVisible();
  await account.click();
  await expect(page.getByRole("menu")).toContainText("Profile unavailable");
  await expect(page.getByRole("menu")).toContainText("Could not load profile.");
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", "dark");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".navigation-rail")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("single globe changes and persists all three languages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openWorkspace(page);
  const toggle = page.locator(".mantine-Burger-root");
  await toggle.click();
  const globe = page.locator(".shell-language-button");
  await expect(globe).toHaveCount(1);
  for (const [label, locale] of [["日本語", "ja"], ["中文", "zh"], ["English", "en"]] as const) {
    await globe.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: label }).click();
    await page.reload();
    await toggle.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("excel-translator-locale"))).toBe(locale);
    await expect(globe).toBeVisible();
  }
});

test("long account details fit the viewport in both themes and compact layouts", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page, {
    id: "owner", username: "long-user", fullName: "A Very Long Account Name For Layout Verification",
    email: "averylongemailaddresswithoutbreaks@example.test", isAdmin: false,
  });
  const account = page.getByRole("button", { name: "Account", exact: true });
  await account.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "System Settings" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("desktop-light.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await account.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop-dark.png"), animations: "disabled" });
  await page.keyboard.press("Escape");

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    if (width < 768) await page.getByRole("button", { name: "Toggle navigation" }).click();
    await account.click();
    const menu = page.getByRole("menu");
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width === 320) await page.screenshot({ path: testInfo.outputPath("mobile-dark.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    if (width < 768) await page.getByRole("button", { name: "Toggle navigation" }).click();
  }
  expect(errors).toEqual([]);
});
