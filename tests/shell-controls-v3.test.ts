import { expect, test } from "@playwright/test";

const apiBaseUrl =
  process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const webBasePath = process.env.WEB_BASE_PATH || "/excel-convert/";

async function openWorkspace(
  page: import("@playwright/test").Page,
  profile = {
    id: "owner",
    username: "alice",
    fullName: null,
    email: null,
    isAdmin: true,
  },
  profileDelay = 0,
  profileFailure = false,
  locale = "en",
) {
  await page.addInitScript((initialLocale: string | null) => {
    localStorage.setItem("excel-translator-token", "shell-controls-token");
    if (initialLocale) {
      localStorage.setItem("excel-translator-locale", initialLocale);
    }
  }, locale === "en" ? null : locale);
  await page.route(`${apiBaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(apiBaseUrl).pathname, "");
    if (path === "/profile" && profileDelay)
      await new Promise((resolve) => setTimeout(resolve, profileDelay));
    if (path === "/profile" && profileFailure) {
      await route.fulfill({
        status: 503,
        json: { message: "Profile service unavailable." },
      });
      return;
    }
    const body =
      path === "/auth/oidc/config"
        ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
        : path === "/profile"
        ? profile
        : path === "/system/info"
          ? { year: 2026 }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({ json: body });
  });
  await page.goto(`${webBasePath}workspace`);
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole("button", { name: "Toggle navigation" }).click();
  }
  await expect(page.locator(".shell-account-trigger")).toBeVisible();
}

test("failed profile load exposes an accessible error and keeps account actions usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, undefined, 0, true);

  const account = page.locator(".shell-account-trigger");
  await account.click();
  await expect(page.getByRole("menu")).toContainText("Profile unavailable");
  await expect(page.getByRole("menu")).not.toContainText("Email not provided");
  await expect(page.getByRole("alert")).toContainText("Could not load profile.");
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await account.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

for (const [locale, unavailable, error] of [
  ["ja", "プロフィールを利用できません", "プロフィールを読み込めませんでした。"],
  ["zh", "个人资料不可用", "无法加载个人资料。"],
] as const) {
  test(`profile failure is localized for ${locale}`, async ({ page }) => {
    await openWorkspace(page, undefined, 0, true, locale);
    await page.locator(".shell-account-trigger").click();
    await expect(page.getByRole("menu")).toContainText(
      unavailable,
    );
    await expect(page.getByRole("alert")).toContainText(error);
  });
}

test("profile controls stay available while account details are loading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorkspace(
    page,
    {
      id: "owner",
      username: "loading-user",
      fullName: null,
      email: null,
      isAdmin: false,
    },
    400,
  );
  const account = page.getByRole("button", { name: "Account", exact: true });
  await account.click();
  await expect(page.getByRole("menu")).toContainText("Loading profile…");
  await expect(page.getByRole("menu")).not.toContainText("Email not provided");
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("menu")).toContainText("loading-user");
  await page.keyboard.press("Escape");
});

test("bottom-left account menu preserves profile, admin, sign-out, and theme controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openWorkspace(page);

  const account = page.getByRole("button", { name: "Account", exact: true });
  await expect(page.getByText("AL", { exact: true })).toBeVisible();

  const themeToggle = page.getByRole("button", {
    name: "Toggle color theme",
  });
  await themeToggle.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "dark",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "dark",
  );

  await account.click();
  await expect(page.getByRole("menu")).toContainText("alice");
  await expect(page.getByRole("menu")).toContainText("Email not provided");
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "System Settings" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.getByRole("menuitem", { name: "System Settings" }).click();
  await expect(page).toHaveURL(/\/settings\/users$/);
  await page.goto(`${webBasePath}workspace`);

  await account.click();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText("@alice")).toBeVisible();

  await account.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("bottom-right language menu opens upward, persists each locale, and dismisses by keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, {
    id: "owner",
    username: "hana",
    fullName: "Hana Yamada",
    email: "hana@example.com",
    isAdmin: false,
  });

  const languageButton = page.locator(".shell-language-button");
  const account = page.getByRole("button", { name: "Account", exact: true });
  await expect(page.getByText("HY", { exact: true })).toBeVisible();
  await account.click();
  const accountMenu = page.getByRole("menu");
  await expect(accountMenu).toBeVisible();
  await expect(accountMenu).toContainText("Hana Yamada");
  await expect(accountMenu).toContainText("hana@example.com");
  await page.keyboard.press("Escape");
  await expect(accountMenu).toBeHidden();

  await languageButton.focus();
  await page.keyboard.press("Enter");
  const languageMenu = page.getByRole("menu");
  await expect(languageMenu).toBeVisible();
  const triggerBox = await languageButton.boundingBox();
  const menuBox = await languageMenu.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(triggerBox!.y + 1);
  await page.keyboard.press("Escape");
  await expect(languageMenu).toBeHidden();

  for (const [label, locale, localizedFooter] of [
    ["日本語", "ja", "翻訳システム Taiyo Yuden Co. Ltd © 2026"],
    ["中文", "zh", "翻译系统 Taiyo Yuden Co. Ltd © 2026"],
    ["English", "en", "Translation System Taiyo Yuden Co. Ltd © 2026"],
  ] as const) {
    await languageButton.click();
    await page.getByRole("menuitem", { name: label }).click();
    await expect(languageMenu).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("excel-translator-locale")),
      )
      .toBe(locale);
    await expect(page.getByRole("contentinfo")).toContainText(localizedFooter);
  }
  await expect(page.getByRole("contentinfo")).toContainText(
    "Translation System Taiyo Yuden Co. Ltd © 2026",
  );
  await languageButton.click();
  await page.getByRole("menuitem", { name: "中文" }).click();
  await page.reload();
  await expect(page.getByRole("contentinfo")).toContainText(
    "翻译系统 Taiyo Yuden Co. Ltd © 2026",
  );

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const languageBox = await languageButton.boundingBox();
    expect(languageBox).not.toBeNull();
    expect(languageBox!.x).toBeGreaterThanOrEqual(0);
    expect(languageBox!.x + languageBox!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
