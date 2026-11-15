import { expect, test } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";

test("workspace scroll track spans the app while its content stays centered", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "workspace-scroll-test"),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    const body =
      path === "/profile"
        ? { id: "owner", username: "alice", isAdmin: false }
        : path === "/notifications/unread-count"
          ? { count: 0 }
          : [];
    await route.fulfill({ json: body });
  });

  await page.goto(`${web}workspace`);

  const content = page.locator(".main-content");
  const workspace = content.locator("> *").first();
  await expect(
    page.getByRole("heading", { name: "Translate a workbook" }),
  ).toBeVisible();

  for (const { width, height } of [
    { width: 1920, height: 480 },
    { width: 375, height: 640 },
  ]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() =>
      content.evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    await expect.poll(() =>
      content.evaluate((element) =>
        [...element.querySelectorAll("*")].filter((child) => {
          const style = getComputedStyle(child);
          return (
            ["auto", "scroll"].includes(style.overflowY) &&
            child.scrollHeight > child.clientHeight
          );
        }).length,
      ),
    ).toBe(0);

    const scrollBounds = await content.evaluate((element) => {
      const contentBounds = element.getBoundingClientRect();
      const shellElement = element.parentElement!;
      const shellBounds = shellElement.getBoundingClientRect();
      const workspaceBounds = element.firstElementChild!.getBoundingClientRect();
      const paddingRight = Number.parseFloat(
        getComputedStyle(shellElement).paddingRight,
      );
      return {
        contentRight: contentBounds.right,
        shellRight: shellBounds.right,
        paddingRight,
        contentCenter: (contentBounds.left + contentBounds.right) / 2,
        workspaceCenter: (workspaceBounds.left + workspaceBounds.right) / 2,
      };
    });
    expect(
      Math.abs(
        scrollBounds.contentRight -
          (scrollBounds.shellRight - scrollBounds.paddingRight),
      ),
    ).toBeLessThan(2);
    expect(
      Math.abs(scrollBounds.contentCenter - scrollBounds.workspaceCenter),
    ).toBeLessThan(2);
    await expect.poll(() =>
      workspace.evaluate((element) => element.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1380);

    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole("contentinfo")).toBeInViewport();
  }
});
