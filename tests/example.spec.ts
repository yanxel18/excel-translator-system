import { test, expect } from "@playwright/test";

test("sign in opens the working jobs screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Excel Translator/);
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Translate your workbook" }),
  ).toBeVisible();
});
