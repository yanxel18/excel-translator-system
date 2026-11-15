import { expect, test, type Page } from "@playwright/test";

type Schedule = {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

type Notice =
  | { active: false }
  | { active: true; startsAt: string; endsAt: string };

const initialSchedule: Schedule = {
  enabled: false,
  startsAt: null,
  endsAt: null,
};

async function setup(
  page: Page,
  options: {
    isAdmin?: boolean;
    locale?: "en" | "ja" | "zh";
    schedule?: Schedule;
    notice?: Notice | (() => Notice);
    scheduleFailure?: boolean;
    noticeFailure?: boolean;
    scheduleDelayMs?: number;
  } = {},
) {
  const state = {
    schedule: options.schedule ?? { ...initialSchedule },
    notice: options.notice ?? ({ active: false } as Notice),
    scheduleFailure: options.scheduleFailure ?? false,
    noticeFailure: options.noticeFailure ?? false,
    scheduleDelayMs: options.scheduleDelayMs ?? 0,
    saved: null as Schedule | null,
  };
  await page.addInitScript(
    ({ locale }) => {
      localStorage.setItem("excel-translator-token", "maintenance-test-session");
      localStorage.setItem("excel-translator-locale", locale);
    },
    { locale: options.locale ?? "en" },
  );
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!["fetch", "xhr"].includes(request.resourceType()))
      return route.continue();
    const path = new URL(request.url()).pathname.replace(
      /^\/(?:excel-convert|api)(?=\/|$)/,
      "",
    );

    if (path === "/admin/maintenance-schedule") {
      if (request.method() === "PUT") {
        state.saved = request.postDataJSON() as Schedule;
        state.schedule = state.saved;
        await route.fulfill({ json: state.schedule });
        return;
      }
      if (state.scheduleDelayMs)
        await new Promise((resolve) =>
          setTimeout(resolve, state.scheduleDelayMs),
        );
      if (state.scheduleFailure) {
        await route.fulfill({
          status: 503,
          json: { message: "Unavailable" },
        });
        return;
      }
      await route.fulfill({ json: state.schedule });
      return;
    }

    if (path === "/maintenance-notice") {
      if (state.noticeFailure) {
        await route.fulfill({
          status: 503,
          json: { message: "Unavailable" },
        });
        return;
      }
      await route.fulfill({
        json: typeof state.notice === "function" ? state.notice() : state.notice,
      });
      return;
    }

    const body =
      path === "/profile"
        ? {
            id: options.isAdmin === false ? "user" : "admin",
            username: options.isAdmin === false ? "user" : "admin",
            isAdmin: options.isAdmin !== false,
          }
        : path === "/system/info"
          ? { year: 2026, maxUploadSizeMb: 50 }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : path === "/admin/application-settings"
              ? { maxUploadSizeMb: 50, maxConcurrentTranslations: 5 }
              : path === "/auth/oidc/settings"
                ? {
                    mode: "LOCAL",
                    enabled: false,
                    keycloakUrl: "",
                    realm: "",
                    clientId: "",
                    issuerUrl: "",
                    requiredGroup: "",
                  }
                : [];
    await route.fulfill({ json: body });
  });
  return state;
}

test.describe("maintenance settings in the New York time zone", () => {
  test.use({ timezoneId: "America/New_York" });

  test("admins see the initial disabled schedule and save explicit UTC instants", async ({
    page,
  }) => {
    const state = await setup(page);
    await page.goto("/excel-convert/settings/maintenance");

    await expect(
      page.getByRole("heading", { name: "Maintenance notices", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByText("No maintenance notice is configured yet."),
    ).toBeVisible();
    await expect(page.getByText("America/New_York", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save maintenance schedule" }),
    ).toBeDisabled();

    await page.getByLabel("Start time").fill("2026-06-15T10:00");
    await page.getByLabel("End time").fill("2026-06-15T11:00");
    const enabled = page.getByRole("switch", {
      name: "Enable maintenance notice",
    });
    await enabled.focus();
    await page.keyboard.press("Space");
    await expect(enabled).toBeChecked();
    await expect(
      page.getByText("UTC instant: 2026-06-15T14:00:00.000Z", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save maintenance schedule" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Maintenance schedule saved." }),
    ).toBeVisible();
    expect(state.saved).toEqual({
      enabled: true,
      startsAt: "2026-06-15T14:00:00.000Z",
      endsAt: "2026-06-15T15:00:00.000Z",
    });
  });

  test("rejects ambiguous, nonexistent, and reversed local times before saving", async ({
    page,
  }) => {
    const state = await setup(page);
    await page.goto("/excel-convert/settings/maintenance");

    const save = page.getByRole("button", { name: "Save maintenance schedule" });
    const start = page.getByLabel("Start time");
    const end = page.getByLabel("End time");
    await start.fill("2026-11-01T01:30");
    await end.fill("2026-11-01T03:30");
    await expect(page.getByRole("alert")).toContainText(
      "occurs twice in this time zone",
    );
    await expect(save).toBeDisabled();

    await start.fill("2026-03-08T02:30");
    await end.fill("2026-03-08T04:30");
    await expect(page.getByRole("alert")).toContainText(
      "does not exist in this time zone",
    );
    await expect(save).toBeDisabled();

    await start.fill("2026-06-15T12:00");
    await end.fill("2026-06-15T11:00");
    await expect(page.getByRole("alert")).toContainText(
      "End time must be later than start time.",
    );
    await expect(save).toBeDisabled();
    expect(state.saved).toBeNull();
  });

  test("shows disabled, scheduled, active, expired, and invalid saved states", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-06-15T14:00:00.000Z") });
    const state = await setup(page);
    await page.goto("/excel-convert/settings/maintenance");

    const status = page.getByRole("status", { name: "Maintenance schedule status" });
    await expect(status).toContainText("No maintenance notice is configured yet.");

    const cases: Array<[Schedule, string]> = [
      [
        {
          enabled: false,
          startsAt: "2026-06-15T13:00:00.000Z",
          endsAt: "2026-06-15T15:00:00.000Z",
        },
        "Maintenance notice is disabled.",
      ],
      [
        {
          enabled: true,
          startsAt: "2026-06-15T15:00:00.000Z",
          endsAt: "2026-06-15T16:00:00.000Z",
        },
        "Maintenance notice is scheduled.",
      ],
      [
        {
          enabled: true,
          startsAt: "2026-06-15T13:00:00.000Z",
          endsAt: "2026-06-15T15:00:00.000Z",
        },
        "Maintenance is active now.",
      ],
      [
        {
          enabled: true,
          startsAt: "2026-06-15T12:00:00.000Z",
          endsAt: "2026-06-15T13:00:00.000Z",
        },
        "The maintenance window has expired.",
      ],
      [
        {
          enabled: true,
          startsAt: "2026-06-15T16:00:00.000Z",
          endsAt: "2026-06-15T15:00:00.000Z",
        },
        "Saved maintenance schedule has invalid dates.",
      ],
    ];

    for (const [schedule, message] of cases) {
      state.schedule = schedule;
      await page.reload();
      await expect(
        page.getByRole("status", { name: "Maintenance schedule status" }),
      ).toContainText(message);
    }
  });

  test("non-admins keep access and receive the localized informational notice", async ({
    page,
  }) => {
    await setup(page, {
      isAdmin: false,
      locale: "ja",
      notice: {
        active: true,
        startsAt: "2026-06-15T13:00:00.000Z",
        endsAt: "2026-06-15T15:00:00.000Z",
      },
    });
    await page.goto("/excel-convert/");

    await expect(page.getByRole("status").filter({ hasText: "メンテナンスのお知らせ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "システム設定" })).toHaveCount(0);
    await expect(page.getByText("America/New_York", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "ワークブックを翻訳" }),
    ).toBeVisible();
  });

  test("active notices use Chinese copy and change after another admin updates the schedule", async ({
    page,
  }) => {
    let active = false;
    await setup(page, {
      locale: "zh",
      notice: () =>
        active
          ? {
              active: true,
              startsAt: "2026-06-15T13:00:00.000Z",
              endsAt: "2026-06-15T15:00:00.000Z",
            }
          : { active: false },
    });
    await page.clock.install({ time: new Date("2026-06-15T14:00:00.000Z") });
    await page.goto("/excel-convert/");
    await expect(page.getByRole("status").filter({ hasText: "维护通知" })).toHaveCount(0);

    active = true;
    await page.clock.runFor(15_000);
    await expect(page.getByRole("status").filter({ hasText: "维护通知" })).toBeVisible();

    active = false;
    await page.clock.runFor(15_000);
    await expect(page.getByRole("status").filter({ hasText: "维护通知" })).toHaveCount(0);
  });

  test("scheduled notice becomes active and expires at its boundaries while open", async ({
    page,
  }) => {
    let serverNow = Date.parse("2026-06-15T13:59:50.000Z");
    await page.clock.install({ time: new Date(serverNow) });
    await setup(page, {
      notice: () => {
        const startsAt = Date.parse("2026-06-15T14:00:00.000Z");
        const endsAt = Date.parse("2026-06-15T14:01:00.000Z");
        return serverNow >= startsAt && serverNow < endsAt
          ? {
              active: true,
              startsAt: "2026-06-15T14:00:00.000Z",
              endsAt: "2026-06-15T14:01:00.000Z",
            }
          : { active: false };
      },
    });
    await page.goto("/excel-convert/");
    const notice = page.getByRole("status").filter({ hasText: "Scheduled maintenance" });
    await expect(notice).toHaveCount(0);

    serverNow += 15_000;
    await page.clock.runFor(15_000);
    await expect(notice).toBeVisible();
    serverNow += 55_000;
    await page.clock.runFor(55_000);
    await expect(notice).toHaveCount(0);
  });

  test("shows loading and actionable errors when schedule or notice requests fail", async ({
    page,
  }) => {
    const state = await setup(page, { scheduleDelayMs: 250 });
    const navigation = page.goto("/excel-convert/settings/maintenance");
    await expect(
      page.getByRole("status", { name: "Loading maintenance schedule…" }),
    ).toBeVisible();
    await navigation;

    state.scheduleFailure = true;
    await page.reload();
    await expect(page.getByRole("alert")).toContainText(
      "Could not load the maintenance schedule.",
    );
    await expect(
      page.getByRole("button", { name: "Retry loading maintenance schedule" }),
    ).toBeVisible();

    state.noticeFailure = true;
    await page.goto("/excel-convert/");
    await expect(page.getByRole("alert")).toContainText(
      "Could not check the maintenance notice.",
    );
    await expect(
      page.getByRole("button", { name: "Retry checking maintenance notice" }),
    ).toBeVisible();
  });

  test("keeps the form available and reports a failed schedule save", async ({
    page,
  }) => {
    await setup(page, {
      schedule: {
        enabled: false,
        startsAt: "2027-01-15T14:00:00.000Z",
        endsAt: "2027-01-15T15:00:00.000Z",
      },
    });
    await page.route("**/admin/maintenance-schedule", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 503,
          json: { message: "Unavailable" },
        });
        return;
      }
      await route.fallback();
    });
    await page.goto("/excel-convert/settings/maintenance");
    const enabled = page.getByRole("switch", {
      name: "Enable maintenance notice",
    });
    await enabled.focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Save maintenance schedule" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Could not save the maintenance schedule.",
    );
    await expect(
      page.getByRole("button", { name: "Save maintenance schedule" }),
    ).toBeVisible();
  });

  test("maintenance controls and notice fit a narrow viewport", async ({
    page,
  }, testInfo) => {
    await setup(page, {
      notice: {
        active: true,
        startsAt: "2026-06-15T13:00:00.000Z",
        endsAt: "2026-06-15T15:00:00.000Z",
      },
    });
    await page.setViewportSize({ width: 320, height: 812 });
    await page.goto("/excel-convert/settings/maintenance");
    await expect(
      page.getByRole("button", { name: "Save maintenance schedule" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Scheduled maintenance" }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("button", { name: "Save maintenance schedule" }).scrollIntoViewIfNeeded();
    const screenshotPath = testInfo.outputPath("maintenance-settings-mobile.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("maintenance-settings-mobile.png", {
      path: screenshotPath,
      contentType: "image/png",
    });
  });
});
