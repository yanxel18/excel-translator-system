import { test, expect, type Page } from "@playwright/test";
import {
  safeProviderUrl,
  validPublicConfig,
  validateOidcSettings,
} from "../project/apps/web/src/features/auth/oidc-config";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";
const provider = "http://127.0.0.1:8180";
const configured = {
  mode: "HYBRID",
  enabled: true,
  keycloakUrl: provider,
  realm: "translator",
  clientId: "translator-web",
  issuerUrl: `${provider}/realms/translator`,
  requiredGroup: "/translators",
};

async function mockApi(page: Page, initial = configured) {
  let settings = { ...initial };
  const writes: Record<string, unknown>[] = [];
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    if (
      path === "/auth/oidc/settings" &&
      route.request().method() === "PATCH"
    ) {
      writes.push(route.request().postDataJSON());
      settings = { ...settings, ...route.request().postDataJSON() };
    }
    const body =
      path === "/auth/oidc/config"
        ? {
            mode: settings.mode,
            enabled: settings.enabled,
            url: settings.keycloakUrl,
            realm: settings.realm,
            clientId: settings.clientId,
          }
        : path === "/auth/oidc/settings"
          ? settings
          : ["/auth/login", "/auth/oidc/exchange"].includes(path)
            ? { access_token: "ui-test-session" }
            : path === "/profile"
              ? { id: "admin", username: "admin", isAdmin: true }
              : path === "/notifications/unread-count"
                ? { count: 0 }
                : ["/history", "/jobs/history", "/notifications"].includes(path)
                  ? { data: [], total: 0 }
                  : [];
    await route.fulfill({ json: body });
  });
  return writes;
}

async function openSettings(page: Page) {
  await page.goto(web);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();
  await page.goto(`${web}settings/authentication`);
  await expect(page.getByLabel("Keycloak server URL")).toBeEnabled();
}

async function selectMode(page: Page, mode: string) {
  await page
    .getByRole("textbox", { name: "Authentication mode", exact: true })
    .click();
  await page.getByRole("option", { name: new RegExp(`^${mode}`) }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
}

// Real keycloak-js adapter; only the external provider HTTP boundary is simulated.
async function mockProvider(
  page: Page,
  outcome:
    "success" | "denied" | "token-failure" | "nonce-mismatch" = "success",
) {
  let nonce = "";
  let tokenRequests = 0;
  await page.route(`${provider}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth")) {
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toBeTruthy();
      nonce = url.searchParams.get("nonce")!;
      const callback = new URL(url.searchParams.get("redirect_uri")!);
      callback.hash = new URLSearchParams({
        state: url.searchParams.get("state")!,
        ...(outcome === "denied"
          ? { error: "access_denied" }
          : { code: "test-authorization-code" }),
      }).toString();
      await route.fulfill({
        status: 302,
        headers: { location: callback.href },
      });
    } else if (url.pathname.endsWith("/token")) {
      tokenRequests++;
      const params = new URLSearchParams(route.request().postData()!);
      expect(params.get("code")).toBe("test-authorization-code");
      expect(params.get("code_verifier")).toBeTruthy();
      const jwt = (claims: object) =>
        `${Buffer.from('{"alg":"RS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test`;
      await route.fulfill({
        status: outcome === "token-failure" ? 400 : 200,
        json:
          outcome === "token-failure"
            ? { error: "invalid_grant" }
            : {
                access_token: jwt({
                  sub: "provider-user",
                  exp: Math.floor(Date.now() / 1000) + 300,
                }),
                id_token: jwt({
                  sub: "provider-user",
                  nonce: outcome === "nonce-mismatch" ? "wrong-nonce" : nonce,
                }),
                token_type: "Bearer",
              },
      });
    } else {
      await route.fulfill({ json: {} });
    }
  });
  return () => tokenRequests;
}

for (const mode of ["LOCAL", "OIDC", "HYBRID"]) {
  test(`V2-15 saves ${mode} and applies it to the next Login`, async ({
    page,
  }) => {
    const writes = await mockApi(page, {
      ...configured,
      mode: "LOCAL",
      enabled: false,
    });
    await mockProvider(page);
    await openSettings(page);
    await expect(
      page.getByRole("heading", { name: "Authentication", exact: true }),
    ).toBeVisible();
    await selectMode(page, mode);
    await page
      .getByRole("button", { name: "Save authentication settings" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Authentication settings saved.",
    );
    expect(writes).toEqual([
      { ...configured, mode, enabled: mode !== "LOCAL" },
    ]);
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Authentication mode", exact: true }),
    ).toHaveValue(new RegExp(`^${mode}`));
    await signOut(page);
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCount(mode === "OIDC" ? 0 : 1);
    await expect(
      page.getByRole("textbox", { name: "Username", exact: true }),
    ).toHaveCount(mode === "OIDC" ? 0 : 1);
    await expect(
      page.getByText("Local development account: user / password"),
    ).toHaveCount(mode === "OIDC" ? 0 : 1);
    await expect(
      page.getByRole("button", { name: "Continue with Keycloak" }),
    ).toHaveCount(mode === "LOCAL" ? 0 : 1);
  });
}

test("V2-15 prevents incomplete or unsafe provider activation and issuer mismatch", async ({
  page,
}) => {
  const writes = await mockApi(page, {
    ...configured,
    mode: "LOCAL",
    enabled: false,
    keycloakUrl: "",
    realm: "",
    clientId: "",
    issuerUrl: "",
  });
  await openSettings(page);
  await selectMode(page, "OIDC");
  await page
    .getByRole("button", { name: "Save authentication settings" })
    .click();
  for (const label of [
    "Keycloak server URL",
    "Realm",
    "Client ID",
    "Issuer URL",
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  }
  await page
    .getByLabel("Keycloak server URL")
    .fill("http://provider.example.com");
  await page.getByLabel("Realm", { exact: true }).fill("translator");
  await page.getByLabel("Client ID", { exact: true }).fill("translator-web");
  await page
    .getByLabel("Issuer URL")
    .fill("https://different.example.com/realms/translator");
  await page
    .getByRole("button", { name: "Save authentication settings" })
    .click();
  await expect(page.getByLabel("Keycloak server URL")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page
    .getByLabel("Keycloak server URL")
    .fill("https://provider.example.com");
  await page
    .getByRole("button", { name: "Save authentication settings" })
    .click();
  await expect(page.getByLabel("Issuer URL")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(writes).toEqual([]);
  await selectMode(page, "LOCAL");
  await page.getByLabel("Keycloak server URL").fill("");
  await page.getByLabel("Issuer URL").fill("");
  await page
    .getByRole("button", { name: "Save authentication settings" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Authentication settings saved.",
  );
});

for (const malformed of [false, true]) {
  test(`V2-15 settings ${malformed ? "malformed response" : "load failure"} cannot overwrite configuration and can retry`, async ({
    page,
  }) => {
    const writes = await mockApi(page, {
      ...configured,
      mode: "LOCAL",
      enabled: false,
    });
    await page.route(`${api}/auth/oidc/settings`, (route) =>
      route.fulfill({
        status: malformed ? 200 : 503,
        json: malformed ? {} : { message: "Settings unavailable." },
      }),
    );
    await page.goto(web);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Translate a workbook" }),
    ).toBeVisible();
    await page.goto(`${web}settings/authentication`);
    await expect(page.getByRole("alert")).toHaveText(
      malformed ? "Could not load Keycloak settings." : "Settings unavailable.",
    );
    await expect(
      page.getByRole("button", { name: "Save authentication settings" }),
    ).toBeDisabled();
    await page.unroute(`${api}/auth/oidc/settings`);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByLabel("Keycloak server URL")).toHaveValue(provider);
    expect(writes).toEqual([]);
  });
}

test("V2-15 server validation failure preserves edited settings", async ({
  page,
}) => {
  await mockApi(page, { ...configured, mode: "LOCAL", enabled: false });
  await openSettings(page);
  await selectMode(page, "HYBRID");
  await page.getByLabel("Required group (optional)").fill("/new-group");
  await page.route(`${api}/auth/oidc/settings`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 400,
          json: { message: "Configuration rejected." },
        })
      : route.fallback(),
  );
  await page
    .getByRole("button", { name: "Save authentication settings" })
    .click();
  await expect(page.getByRole("alert")).toHaveText("Configuration rejected.");
  await expect(page.getByLabel("Required group (optional)")).toHaveValue(
    "/new-group",
  );
  await expect(
    page.getByText("Authentication settings saved.", { exact: false }),
  ).toHaveCount(0);
});

for (const [name, config] of [
  ["unavailable", null],
  ["unknown mode", { mode: "UNKNOWN", enabled: true }],
  [
    "incomplete provider",
    { mode: "OIDC", enabled: true, url: "", realm: "", clientId: "" },
  ],
  [
    "inconsistent mode",
    {
      mode: "LOCAL",
      enabled: true,
      url: provider,
      realm: "translator",
      clientId: "translator-web",
    },
  ],
  ["missing fields", { mode: "LOCAL", enabled: false }],
] as const) {
  test(`V2-15 fails closed for ${name} public config and retries`, async ({
    page,
  }) => {
    await mockApi(page, { ...configured, mode: "LOCAL", enabled: false });
    await page.route(`${api}/auth/oidc/config`, (route) =>
      route.fulfill({
        status: config === null ? 503 : 200,
        json: config ?? { message: "Configuration unavailable." },
      }),
    );
    await page.goto(web);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continue with Keycloak" }),
    ).toHaveCount(0);
    await page.unroute(`${api}/auth/oidc/config`);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
  });
}

test("V2-15 waits for public config without exposing a fallback sign-in form", async ({
  page,
}) => {
  await mockApi(page, { ...configured, mode: "LOCAL", enabled: false });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${api}/auth/oidc/config`, async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto(web);
  await expect(page.getByRole("status")).toHaveText(
    "Loading sign-in settings…",
  );
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

for (const width of [320, 768, 1024, 1440]) {
  test(`V2-15 authentication settings are responsive and keyboard accessible at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mockApi(page, { ...configured, mode: "LOCAL", enabled: false });
    await openSettings(page);
    const mode = page.getByRole("textbox", { name: "Authentication mode" });
    await mode.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(mode).toHaveValue(/^OIDC/);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Keycloak server URL")).toBeFocused();
    const form = page.locator("form").filter({ has: mode });
    const bounds = await form.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const screenshot = testInfo.outputPath(`authentication-${width}.png`);
    await page.screenshot({ path: screenshot });
    await testInfo.attach(`authentication-${width}`, {
      path: screenshot,
      contentType: "image/png",
    });
    expect(errors).toEqual([]);
  });
}

for (const [locale, heading, modeLabel, save, required] of [
  [
    "ja",
    "認証",
    "認証モード",
    "認証設定を保存",
    "プロバイダーでのサインインには必須です。",
  ],
  [
    "zh",
    "身份验证",
    "身份验证模式",
    "保存身份验证设置",
    "提供商登录需要填写此字段。",
  ],
] as const) {
  test(`V2-15 localizes authentication settings and feedback in ${locale}`, async ({
    page,
  }) => {
    await page.addInitScript((language) => {
      localStorage.setItem("excel-translator-locale", language);
      localStorage.setItem("excel-translator-token", "ui-test-admin");
    }, locale);
    await mockApi(page, {
      ...configured,
      mode: "LOCAL",
      enabled: false,
      keycloakUrl: "",
      realm: "",
      clientId: "",
      issuerUrl: "",
    });
    await page.goto(`${web}settings/authentication`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    const mode = page.getByRole("textbox", { name: modeLabel, exact: true });
    await mode.click();
    await page.getByRole("option", { name: /^OIDC/ }).click();
    await page.getByRole("button", { name: save, exact: true }).click();
    await expect(page.getByText(required, { exact: true })).toHaveCount(4);
  });
}

test("V2-15 URL and settings validation match provider constraints", () => {
  for (const value of [
    "javascript:alert(1)",
    "http://remote.example",
    "https://user:pass@example.com",
    "https://example.com?x=1",
    "https://example.com#fragment",
  ]) {
    expect(safeProviderUrl(value)).toBeNull();
  }
  for (const value of [
    "http://localhost:8180",
    "http://127.0.0.1:8180",
    "http://[::1]:8180",
    "https://example.com/auth",
  ]) {
    expect(safeProviderUrl(value)).not.toBeNull();
  }
  expect(validateOidcSettings({ ...configured, mode: "HYBRID" })).toEqual({});
  expect(
    validateOidcSettings({ ...configured, mode: "HYBRID", realm: "bad/realm" }),
  ).toHaveProperty("realm");
  for (const [field, length] of [
    ["keycloakUrl", 2048],
    ["realm", 128],
    ["clientId", 256],
    ["issuerUrl", 2048],
    ["requiredGroup", 512],
  ] as const) {
    expect(
      validateOidcSettings({
        ...configured,
        mode: "HYBRID",
        [field]: "x".repeat(length + 1),
      }),
    ).toHaveProperty(field);
  }
  expect(
    validPublicConfig({
      mode: "OIDC",
      enabled: true,
      url: provider,
      realm: "translator",
      clientId: "translator-web",
    }),
  ).toBe(true);
});
for (const outcome of [
  "success",
  "denied",
  "token-failure",
  "nonce-mismatch",
  "exchange-failure",
  "invalid-exchange",
  "disabled-user",
  "overlong-full-name",
] as const) {
  test(`V2-15 provider callback handles ${outcome}`, async ({ page }) => {
    await mockApi(page, { ...configured, mode: "OIDC" });
    const adapterFailure =
      outcome === "denied" ||
      outcome === "token-failure" ||
      outcome === "nonce-mismatch";
    const tokenRequests = await mockProvider(
      page,
      adapterFailure ? outcome : "success",
    );
    let exchanges = 0;
    await page.route(`${api}/auth/oidc/exchange`, async (route) => {
      exchanges++;
      expect(route.request().postDataJSON().accessToken).toBeTruthy();
      await route.fulfill({
        status:
          outcome === "success" || outcome === "invalid-exchange" ? 200 : 401,
        json:
          outcome === "success"
            ? { access_token: "ui-provider-session" }
            : outcome === "invalid-exchange"
              ? {}
              : {
                  message:
                    outcome === "disabled-user"
                      ? "Account is disabled."
                      : outcome === "overlong-full-name"
                        ? "Your identity provider full name exceeds 50 characters. Shorten your full name in your identity provider profile to 50 characters or fewer, then sign in again."
                        : "Provider exchange failed.",
                },
      });
    });
    await page.goto(web);
    await page.getByRole("button", { name: "Continue with Keycloak" }).click();
    if (outcome === "success") {
      await expect(
        page.getByRole("heading", { name: "Translate a workbook" }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/workspace$/);
    } else {
      await expect(page.getByRole("alert")).toBeVisible();
      if (outcome === "overlong-full-name") {
        await expect(page.getByRole("alert")).toHaveText(
          "Your identity provider full name exceeds 50 characters. Shorten your full name in your identity provider profile to 50 characters or fewer, then sign in again.",
        );
      }
      await expect(
        page.getByRole("heading", { name: "Translate a workbook" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Sign in", exact: true }),
      ).toHaveCount(0);
      if (adapterFailure) {
        await expect(
          page.getByRole("button", { name: "Continue with Keycloak" }),
        ).toBeDisabled();
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        await expect(page.getByRole("alert")).toHaveCount(0);
      }
      await expect(
        page.getByRole("button", { name: "Continue with Keycloak" }),
      ).toBeEnabled();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Continue with Keycloak" }),
      ).toBeEnabled();
      await expect(
        page.getByRole("heading", { name: "Translate a workbook" }),
      ).toHaveCount(0);
    }
    expect(tokenRequests()).toBe(outcome === "denied" ? 0 : 1);
    expect(exchanges).toBe(adapterFailure ? 0 : 1);
  });
}

test("V2-15 rejects an unmatched provider callback state", async ({ page }) => {
  await mockApi(page, { ...configured, mode: "OIDC" });
  const tokenRequests = await mockProvider(page);
  await page.goto(`${web}#code=untrusted-code&state=unmatched-state`);
  await expect(page.getByRole("alert")).toContainText(
    "Keycloak sign-in failed.",
  );
  expect(tokenRequests()).toBe(0);
});

test("V2-15 disabled local user stays on Login", async ({ page }) => {
  await mockApi(page, { ...configured, mode: "LOCAL", enabled: false });
  await page.route(`${api}/auth/login`, (route) =>
    route.fulfill({ status: 401, json: { message: "Account is disabled." } }),
  );
  await page.goto(web);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Account is disabled.");
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toHaveCount(0);
});

test("V2-15 OIDC-only form cannot submit local credentials with Enter or a submit event", async ({
  page,
}) => {
  await mockApi(page, { ...configured, mode: "OIDC" });
  await mockProvider(page);
  let localRequests = 0;
  page.on("request", (request) => {
    if (request.url() === `${api}/auth/login`) localRequests++;
  });
  await page.goto(web);
  await expect(
    page.getByRole("button", { name: "Continue with Keycloak" }),
  ).toBeEnabled();
  await page.locator("form").dispatchEvent("submit");
  await expect(
    page.getByRole("button", { name: "Continue with Keycloak" }),
  ).toBeEnabled();
  expect(localRequests).toBe(0);
});
