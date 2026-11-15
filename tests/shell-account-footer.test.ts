import { expect, test, type Page } from "@playwright/test";

const api = "http://localhost:3000/excel-convert";

const profile = {
  id: "shared-user-id",
  gid: "gid-001",
  username: "aiko",
  fullName: "Aiko Tanaka",
  email: "aiko@example.test",
  isAdmin: false,
};

async function openWorkspace(page: Page, gid = profile.gid) {
  await page.addInitScript(() => {
    localStorage.setItem("excel-translator-token", "isolated-account-footer-test");
  });
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/excel-convert",
      "",
    );
    const body =
      path === "/profile"
        ? { ...profile, gid }
        : path === "/system/info"
          ? { year: 2026 }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : [];
    await route.fulfill({ json: body });
  });
  await page.goto("/excel-convert/workspace");
}

test("account footer shows identity and a deterministic GID identicon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);

  const account = page.getByRole("button", { name: "Account", exact: true });
  await expect(account).toContainText("Aiko Tanaka");
  await expect(account).toContainText("aiko@example.test");
  const identicon = account.locator(".shell-gid-identicon");
  await expect(identicon).toBeVisible();
  const firstRender = await identicon.locator("svg").evaluate((svg) => svg.outerHTML);

  await page.reload();
  await expect(account).toContainText("Aiko Tanaka");
  await expect(account.locator(".shell-gid-identicon svg")).toHaveCount(1);
  const afterRefresh = await account
    .locator(".shell-gid-identicon svg")
    .evaluate((svg) => svg.outerHTML);
  expect(afterRefresh).toBe(firstRender);

  const otherAccountPage = await page.context().newPage();
  await otherAccountPage.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(otherAccountPage, "gid-002");
  const otherRender = await otherAccountPage
    .getByRole("button", { name: "Account", exact: true })
    .locator(".shell-gid-identicon svg")
    .evaluate((svg) => svg.outerHTML);
  expect(otherRender).not.toBe(firstRender);
  await otherAccountPage.close();
});

test("account footer exposes theme and language controls on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);

  const footer = page.locator(".shell-profile-controls");
  const theme = footer.locator(".shell-profile-actions .mantine-ActionIcon-root");
  const language = footer.locator(".shell-language-button");
  await expect(theme).toBeVisible();
  await expect(language).toContainText("English");
  await theme.click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "dark",
  );
  await language.click();
  await page.getByRole("menuitem", { name: "日本語" }).click();
  await expect(language).toContainText("日本語");

  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator(".mantine-Burger-root").click();
  await expect(footer).toBeVisible();
  await expect(theme).toBeVisible();
  await language.click();
  await page.getByRole("menuitem", { name: "中文" }).click();
  await expect(language).toContainText("中文");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
