import { test, expect } from "@playwright/test";

// Opt in only against the isolated local v2-e2e stack; this test creates an account.
test("deployed settings preserve routes and enforce roles with a real API", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.V2_DEPLOYED_E2E !== "1",
    "Requires the disposable local V2 deployment",
  );
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const username = `e2e-${suffix}`;
  const web = "http://127.0.0.1:43101/excel-convert/";
  const api = "http://127.0.0.1:43100/excel-convert";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(web);
  await page.getByLabel("Username").fill("e2e-admin");
  await page.getByLabel("Password").fill("disposable-admin-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();

  await page.goto(`${web}settings/users/new`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("GID").fill(`E2E-${suffix}`);
  await dialog.getByLabel("Username").fill(username);
  await dialog.getByLabel("Email").fill(`${username}@example.invalid`);
  await dialog.getByLabel("Base").click();
  await page.getByRole("option", { name: /JTY/ }).first().click();
  await dialog.getByLabel("Password").fill("disposable-user-password");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("User created.")).toBeVisible();
  await page.getByRole("textbox", { name: "Search" }).fill(username);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=e2e-/);
  await expect(page.getByText(username, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Search" })).toHaveValue(
    username,
  );
  await expect(page.getByText(username, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Assign base" }).click();
  await dialog.getByLabel("Base").fill("KKTY");
  await page.getByRole("option", { name: /KKTY/ }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Base reassigned.")).toBeVisible();
  await page.getByRole("button", { name: "Bases", exact: true }).click();
  await expect(page).toHaveURL(/settings\/bases/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bases", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create base" }).click();
  const code = `T${suffix.replace(/-/g, "")}`;
  await dialog.getByLabel("Code").fill(code);
  await dialog.getByLabel("Name").fill("Temporary Base");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Base saved.")).toBeVisible();
  await page.getByRole("textbox", { name: "Search" }).fill(code);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(code, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Name").fill("Updated Base");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Updated Base")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Base deleted.")).toBeVisible();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("disposable-user-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();
  await page.goto(`${web}settings/users`);
  await expect(
    page.getByText("Administrator access is required."),
  ).toBeVisible();
  const login = await request.post(`${api}/auth/login`, {
    data: { username, password: "disposable-user-password" },
  });
  expect(login.status()).toBe(201);
  const { access_token: token } = await login.json();
  const forbidden = await request.get(`${api}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(forbidden.status()).toBe(403);
});
