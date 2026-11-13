import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";
const jobId = "33333333-3333-3333-3333-333333333333";
const groupId = "44444444-4444-4444-4444-444444444444";

for (const action of ["Save settings", "Save and start", "Start"]) {
  test(`translation settings ${action} sends only editable fields`, async ({
    page,
  }) => {
    const settings = {
      selectedSheets: ["見積書"],
      sourceLanguage: "JAPANESE",
      targetLanguage: "ENGLISH",
      vocabularyGroupId: action === "Save settings" ? groupId : null,
    };
    let job = {
      ...settings,
      id: jobId,
      fileName: "見積書.xlsx",
      fileSize: 1024,
      status: "PENDING",
      progress: 0,
      createdAt: "2026-11-13T00:00:00.000Z",
      updatedAt: "2026-11-13T00:00:00.000Z",
      availableSheets: ["見積書", "Summary"],
    };
    const writes: string[] = [];
    await page.route(`${api}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        new URL(api).pathname,
        "",
      );
      if (path === `/jobs/${jobId}/settings`) {
        writes.push("settings");
        const body = route.request().postDataJSON();
        if (Object.keys(body).some((key) => !Object.keys(settings).includes(key))) {
          await route.fulfill({
            status: 400,
            json: { message: "Unexpected field." },
          });
          return;
        }
        job = { ...job, ...body };
        await route.fulfill({ json: job });
        return;
      }
      if (path === `/jobs/${jobId}/start`) {
        writes.push("start");
        job = { ...job, status: "PROCESSING" };
        await route.fulfill({ json: job });
        return;
      }
      const body =
        path === "/auth/oidc/config"
          ? { mode: "LOCAL", enabled: false, url: "", realm: "", clientId: "" }
          : path === "/profile"
            ? { id: "test-user", username: "test-user", isAdmin: false }
            : path === "/jobs"
              ? [job]
              : path === `/jobs/${jobId}`
                ? job
                : path === "/vocabulary"
                  ? [
                    {
                      id: groupId,
                      name: "Protected terms",
                      sourceLanguage: "JAPANESE",
                      targetLanguage: "ENGLISH",
                      entries: [],
                    },
                  ]
                  : path === "/notifications/unread-count"
                    ? { count: 0 }
                    : { data: [], nextCursor: null };
      await route.fulfill({ json: body });
    });
    await page.addInitScript(() =>
      localStorage.setItem("excel-translator-token", "settings-test-session"),
    );
    await page.goto(web);
    await page.getByRole("button", {
      name: action === "Start" ? "Start" : "Settings",
      exact: true,
    }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${api}/jobs/${jobId}/settings` &&
        response.request().method() === "PATCH",
    );
    await dialog.getByRole("button", {
      name: action === "Save settings" ? action : "Save and start",
      exact: true,
    }).click();
    const response = await responsePromise;
    expect(response.status(), JSON.stringify(await response.json())).toBe(200);
    expect(response.request().postDataJSON()).toEqual(settings);
    expect(response.request().headers().authorization).toBe(
      "Bearer settings-test-session",
    );
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual(
      action === "Save settings" ? ["settings"] : ["settings", "start"],
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
