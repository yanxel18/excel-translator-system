import { expect, test, type Page } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";
const jobId = "33333333-3333-3333-3333-333333333333";
const job = {
  id: jobId,
  fileName: "workbook.xlsx",
  fileSize: 1024,
  status: "COMPLETED",
  progress: 100,
  createdAt: "2026-11-12T00:00:00.000Z",
  completedAt: "2026-11-12T00:01:00.000Z",
  sourceLanguage: "ja",
  targetLanguage: "en",
  selectedSheets: ["Sheet1"],
  availableSheets: ["Sheet1"],
  vocabularyGroupId: null,
};

async function installApi(
  page: Page,
  expirePath?: string,
  status = 401,
  expireAfter = 0,
  jobsStatus = "COMPLETED",
) {
  const counts = new Map<string, number>();
  await page.route(`${api}/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(new URL(api).pathname, "");
    const authorization = route.request().headers().authorization;
    const requestCount = authorization ? (counts.get(path) ?? 0) + 1 : 0;
    if (authorization) counts.set(path, requestCount);
    if (
      path === expirePath &&
      authorization === "Bearer expired-app-session" &&
      requestCount > expireAfter
    ) {
      await route.fulfill({
        status,
        json: {
          message:
            status === 403 ? "Permission denied." : "Invalid session token.",
        },
      });
      return;
    }

    const body =
      path === "/auth/oidc/config"
        ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
        : path === "/auth/login" || path === "/auth/oidc/exchange"
          ? { access_token: "fresh-app-session" }
          : path === "/profile"
            ? { id: "test-user", username: "test-user", isAdmin: false }
            : path === "/jobs"
              ? [
                  {
                    ...job,
                    status: jobsStatus,
                    progress: jobsStatus === "PROCESSING" ? 20 : 100,
                  },
                ]
              : path === `/jobs/${jobId}`
                ? { ...job, status: jobsStatus }
                : path === "/history"
                  ? { data: [], total: 0, page: 1, pageSize: 5 }
                  : path === "/notifications/unread-count"
                    ? { count: 0 }
                    : path === "/vocabulary"
                      ? []
                      : { ok: true };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return counts;
}

async function startWithSession(page: Page, path = web) {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "expired-app-session"),
  );
  await page.goto(path);
}

async function expectExpiredLogin(page: Page) {
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "Your session has expired. Please sign in again.",
  );
  await expect(page.getByText("Invalid session token.")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("excel-translator-token")),
    )
    .toBeNull();
}

test("expired session during a list load returns to Login and restores a validated internal route", async ({
  page,
}) => {
  const restoredHistoryRequests: URLSearchParams[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === `${new URL(api).pathname}/history` &&
      request.headers().authorization === "Bearer fresh-app-session"
    ) {
      restoredHistoryRequests.push(url.searchParams);
    }
  });
  await installApi(page, "/history");
  await startWithSession(
    page,
    `${web}history?page=2&q=monthly&sourceLanguage=JAPANESE&targetLanguage=CHINESE&sort=fileName&direction=asc&pageSize=20&returnTo=https%3A%2F%2Fexample.com`,
  );

  await expectExpiredLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(
    /\/history\?page=2&q=monthly&sourceLanguage=JAPANESE&targetLanguage=CHINESE&sort=fileName&direction=asc&pageSize=20$/,
  );
  await expect(
    page.getByRole("heading", { name: "Translation history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search workbooks" }),
  ).toHaveValue("monthly");
  await expect.poll(() =>
    restoredHistoryRequests.some(
      (params) =>
        params.get("sourceLanguage") === "JAPANESE" &&
        params.get("targetLanguage") === "CHINESE" &&
        params.get("q") === "monthly",
    ),
  ).toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Rows per page" }),
  ).toHaveValue("20");
});

test("session expiry from a legacy Dashboard link restores the Profile query after sign-in", async ({
  page,
}) => {
  await installApi(page, "/jobs");
  await startWithSession(page, `${web}dashboard?tab=overview&q=monthly`);

  await expectExpiredLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\?tab=overview&q=monthly$/);
  await expect(
    page.getByRole("button", { name: "New translation" }),
  ).toBeVisible();
});

test("revoked session during job polling logs out and stops further polls", async ({
  page,
}) => {
  const counts = await installApi(page, "/jobs", 401, 1, "PROCESSING");
  await startWithSession(page);

  await expectExpiredLogin(page);
  await page.waitForTimeout(1400);
  expect(counts.get("/jobs")).toBe(2);
});

test("expired session while saving workbook settings returns to Login", async ({
  page,
}) => {
  await installApi(page, `/jobs/${jobId}/settings`, 401, 0, "PENDING");
  await startWithSession(page);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save settings" })
    .click();

  await expectExpiredLogin(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("expired session while loading the preview workbook returns to Login", async ({
  page,
}) => {
  await installApi(page, `/jobs/${jobId}/preview-file`);
  await page.route("http://localhost:8081/bridge.html**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<script>setTimeout(() => parent.postMessage({source:'excel-translator-preview',type:'ready'}, '*'), 100)</script>`,
    }),
  );
  await startWithSession(page);
  await page.getByRole("button", { name: `View ${job.fileName}` }).click();

  await expectExpiredLogin(page);
});

test("expired session while downloading a workbook returns to Login", async ({
  page,
}) => {
  await installApi(page, `/jobs/${jobId}/download`);
  await startWithSession(page);
  await page
    .getByRole("button", { name: `Download ${job.fileName}` })
    .last()
    .click();

  await expectExpiredLogin(page);
});

test("403 remains a permission denial and does not clear the session", async ({
  page,
}) => {
  await installApi(page, "/history", 403);
  await startWithSession(page, `${web}history`);

  await expect(page.getByRole("alert")).toHaveText("Permission denied.");
  await expect(
    page.getByRole("heading", { name: "Translation history" }),
  ).toBeVisible();
  await expect(page.getByText("Welcome back", { exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("excel-translator-token")),
    )
    .toBe("expired-app-session");
});

test("server app tokens exchanged from Keycloak use the same global expiry handling", async ({
  page,
}) => {
  const provider = "http://127.0.0.1:8180";
  let nonce = "";
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    if (path === "/auth/oidc/config") {
      await route.fulfill({
        json: {
          mode: "OIDC",
          enabled: true,
          url: provider,
          realm: "translator",
          clientId: "translator-web",
        },
      });
    } else if (path === "/auth/oidc/exchange") {
      await route.fulfill({ json: { access_token: "provider-app-session" } });
    } else if (path === "/jobs" && route.request().headers().authorization) {
      await route.fulfill({
        status: 401,
        json: { message: "Invalid session token." },
      });
    } else if (path === "/profile") {
      await route.fulfill({
        json: {
          id: "provider-user",
          username: "provider-user",
          isAdmin: false,
        },
      });
    } else {
      await route.fulfill({ json: [] });
    }
  });
  await page.route(`${provider}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth")) {
      nonce = url.searchParams.get("nonce")!;
      const callback = new URL(url.searchParams.get("redirect_uri")!);
      callback.hash = new URLSearchParams({
        state: url.searchParams.get("state")!,
        code: "test-code",
      }).toString();
      await route.fulfill({
        status: 302,
        headers: { location: callback.href },
      });
    } else if (url.pathname.endsWith("/token")) {
      const jwt = (claims: object) =>
        `${Buffer.from('{"alg":"RS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test`;
      await route.fulfill({
        json: {
          access_token: jwt({
            sub: "provider-user",
            exp: Math.floor(Date.now() / 1000) + 300,
          }),
          id_token: jwt({ sub: "provider-user", nonce }),
          token_type: "Bearer",
        },
      });
    } else {
      await route.fulfill({ json: {} });
    }
  });

  await page.goto(web);
  await page.getByRole("button", { name: "Continue with Keycloak" }).click();
  await expectExpiredLogin(page);
});
