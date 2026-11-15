import { expect, test, type Page } from "@playwright/test";

const api = "http://localhost:3000/excel-convert";

async function openWorkspace(page: Page, locale: "en" | "ja" | "zh" = "en") {
  await page.addInitScript((selectedLocale) => {
    localStorage.setItem("excel-translator-token", "isolated-shell-test");
    localStorage.setItem("excel-translator-locale", selectedLocale);
  }, locale);
  await page.route("https://**/*", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/excel-convert",
      "",
    );
    const body =
      path === "/profile"
        ? {
            id: "shell-user",
            username: "shell-user",
            fullName: "Shell Test User",
            email: "shell@example.test",
            isAdmin: false,
          }
        : path === "/system/info"
          ? { year: 2026 }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : path === "/history"
              ? {
                  data: [],
                  total: 0,
                  page: 1,
                  pageSize: 10,
                  nextCursor: null,
                }
            : [];
    await route.fulfill({ json: body });
  });
  await page.goto("/excel-convert/workspace");
  await expect(page.locator(".main-content h1")).toBeVisible();
}

test("footer stays viewport-anchored while language stays in the navigation rail", async ({
  page,
}) => {
  const viewports = [
    { width: 320, height: 320 },
    { width: 375, height: 667 },
    { width: 768, height: 520 },
    { width: 1440, height: 420 },
    { width: 1440, height: 900 },
  ];

  await openWorkspace(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const footer = page.getByRole("contentinfo");
    const languageButton = page.locator(".shell-language-button");
    const navigationToggle = page.locator(".mantine-Burger-root");
    if (
      viewport.width < 768 &&
      (await navigationToggle.getAttribute("aria-expanded")) === "false"
    ) {
      await navigationToggle.click();
    }
    await expect(languageButton).toHaveAccessibleName(/\S+/);
    await expect(footer).toBeVisible();
    await expect(languageButton).toBeVisible();
    await expect(languageButton).toBeInViewport();

    const initialLayout = await page.evaluate(() => {
      const footer = document.querySelector(".app-footer")!;
      const language = document.querySelector(".shell-language-button")!;
      const navigation = document.querySelector(".navigation-rail")!;
      const footerRect = footer.getBoundingClientRect();
      const languageRect = language.getBoundingClientRect();
      const navigationRect = navigation.getBoundingClientRect();
      return {
        footerBottom: footerRect.bottom,
        viewportHeight: window.innerHeight,
        languageInNavigation:
          languageRect.left >= navigationRect.left &&
          languageRect.right <= navigationRect.right &&
          languageRect.top >= navigationRect.top &&
          languageRect.bottom <= navigationRect.bottom,
      };
    });

    expect(initialLayout.footerBottom).toBeCloseTo(viewport.height, 0);
    expect(initialLayout.languageInNavigation).toBe(true);

    await page.evaluate(() => {
      if (document.getElementById("shell-footer-test-spacer")) return;
      const main = document.querySelector(".main-content")!;
      const spacer = document.createElement("div");
      spacer.id = "shell-footer-test-spacer";
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.height = "1200px";
      main.append(spacer);
    });
    const content = page.locator(".main-content");
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(async () =>
      content.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);

    const afterScroll = await page.evaluate(() => {
      const footerRect = document
        .querySelector(".app-footer")!
        .getBoundingClientRect();
      const contentRect = document
        .querySelector(".main-content")!
        .getBoundingClientRect();
      return {
        footerBottom: footerRect.bottom,
        footerTop: footerRect.top,
        contentScrollTop: document.querySelector(".main-content")!.scrollTop,
        documentScrollTop: document.scrollingElement!.scrollTop,
        contentBounds: {
          top: contentRect.top,
          bottom: contentRect.bottom,
        },
      };
    });
    expect(afterScroll.footerBottom).toBeCloseTo(viewport.height, 0);
    expect(afterScroll.contentScrollTop).toBeGreaterThan(0);
    expect(afterScroll.documentScrollTop).toBe(0);
    expect(afterScroll.contentBounds.bottom).toBeCloseTo(
      afterScroll.footerTop,
      0,
    );
  }

  const keyboardPage = await page.context().newPage();
  await keyboardPage.setViewportSize({ width: 320, height: 320 });
  await openWorkspace(keyboardPage);
  await keyboardPage
    .getByRole("button", { name: "Toggle navigation" })
    .click();
  await keyboardPage.evaluate(() => {
    const main = document.querySelector(".main-content")!;
    const spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.height = "1200px";
    const focusSource = document.createElement("button");
    focusSource.type = "button";
    focusSource.textContent = "Focus source";
    const focusTarget = document.createElement("button");
    focusTarget.id = "shell-footer-focus-target";
    focusTarget.type = "button";
    focusTarget.textContent = "Last content action";
    main.append(spacer, focusSource, focusTarget);
  });
  const keyboardContent = keyboardPage.locator(".main-content");
  await keyboardContent.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(async () =>
    keyboardContent.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  const focusTarget = keyboardPage.locator("#shell-footer-focus-target");
  await keyboardPage.getByRole("button", { name: "Focus source" }).focus();
  await keyboardPage.keyboard.press("Tab");
  await expect(focusTarget).toBeFocused();
  const focusedBounds = await focusTarget.boundingBox();
  const contentBounds = await keyboardContent.boundingBox();
  expect(focusedBounds).not.toBeNull();
  expect(contentBounds).not.toBeNull();
  expect(focusedBounds!.y).toBeGreaterThanOrEqual(contentBounds!.y);
  expect(focusedBounds!.y + focusedBounds!.height).toBeLessThanOrEqual(
    contentBounds!.y + contentBounds!.height,
  );
  await expect(focusTarget).toHaveCSS("outline-style", "solid");

  const languageButton = keyboardPage.locator(".shell-language-button");
  await languageButton.focus();
  await keyboardPage.keyboard.press("Enter");
  await expect(keyboardPage.getByRole("menu")).toBeVisible();
  await keyboardPage.keyboard.press("Escape");
  await expect(languageButton).toBeFocused();
  await keyboardPage.close();
});

test("labeled navigation and shell controls share consistent surfaces", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await openWorkspace(page);

  const inactiveNavigation = page
    .locator(".navigation-rail .mantine-NavLink-root")
    .filter({ hasText: "History" });
  const activeNavigation = page
    .locator(".navigation-rail .mantine-NavLink-root")
    .filter({ hasText: "Workspace" });
  expect(await inactiveNavigation.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(180);
  await expect(inactiveNavigation).toHaveCSS("border-radius", "8px");
  await expect(inactiveNavigation.locator(".mantine-NavLink-label")).toBeVisible();
  const controls = [
    page.getByRole("button", { name: "Account", exact: true }),
    page.getByRole("button", { name: "Change language" }),
    page.getByRole("button", { name: "Open notifications" }),
  ];
  const avatar = page.locator(
    ".shell-account-trigger .mantine-Avatar-root",
  );
  let lightAvatarColors:
    | { background: string; color: string; border: string }
    | undefined;

  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") {
      await page
        .getByRole("button", { name: "Toggle color theme" })
        .click();
    }
    await page.mouse.move(500, 400);
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    await page.screenshot({
      path: testInfo.outputPath(`desktop-${theme}.png`),
      animations: "disabled",
    });

    const styles = await Promise.all(
      controls.map((control) =>
        control.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            border: style.borderColor,
            color: style.color,
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
          };
        }),
      ),
    );
    for (const style of styles.slice(1)) {
      expect(style.background).toBe(styles[0].background);
      expect(style.border).toBe(styles[0].border);
      expect(style.fontFamily).toBe(styles[0].fontFamily);
    }

    const avatarStyle = await avatar.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        color: style.color,
      };
    });
    if (theme === "light") {
      lightAvatarColors = avatarStyle;
    } else {
      expect(avatarStyle).not.toEqual(lightAvatarColors);
    }

    const disabledNotification = controls[2];
    await disabledNotification.evaluate((element) =>
      element.setAttribute("aria-disabled", "true"),
    );
    await disabledNotification.hover();
    await expect(disabledNotification).toHaveCSS(
      "background-color",
      styles[2].background,
    );
    await expect(disabledNotification).toHaveCSS("opacity", "0.55");
    await expect(disabledNotification).toHaveCSS("cursor", "not-allowed");
    await disabledNotification.evaluate((element) =>
      element.removeAttribute("aria-disabled"),
    );

    await expect(activeNavigation).toHaveAttribute("aria-current", "page");
    const [activeStyle, inactiveStyle] = await Promise.all(
      [activeNavigation, inactiveNavigation].map((control) =>
        control.evaluate((element) => getComputedStyle(element).backgroundColor),
      ),
    );
    expect(activeStyle).not.toBe(inactiveStyle);

    await page.getByRole("button", { name: "Account", exact: true }).click();
    const signOut = page.getByRole("menuitem", { name: "Sign out" });
    await expect(signOut).toBeVisible();
    await expect(signOut).toHaveCSS("color", "rgb(250, 82, 82)");
    await page.keyboard.press("Escape");
  }
});

test("compact localized language labels stay visible and horizontal", async ({
  page,
}) => {
  for (const locale of ["en", "ja", "zh"] as const) {
    const compactPage = await page.context().newPage();
    await compactPage.setViewportSize({ width: 320, height: 480 });
    await openWorkspace(compactPage, locale);
    await compactPage.locator(".mantine-Burger-root").click();
    const languageButton = compactPage.locator(".shell-language-button");
    await expect(languageButton).toHaveAccessibleName(/\S+/);
    await languageButton.focus();
    await compactPage.keyboard.press("Enter");
    const menuItems = compactPage.getByRole("menuitem");
    await expect(menuItems).toHaveCount(3);

    for (let index = 0; index < (await menuItems.count()); index += 1) {
      const item = menuItems.nth(index);
      await expect(item).toBeVisible();
      await expect(item).toHaveAccessibleName(/\S+/);
      const layout = await item.evaluate((element) => {
        const label = element.querySelector(".mantine-Menu-itemLabel")!;
        const style = getComputedStyle(label);
        const range = document.createRange();
        range.selectNodeContents(label);
        return {
          height: label.getBoundingClientRect().height,
          lineCount: range.getClientRects().length,
          writingMode: style.writingMode,
          wordBreak: style.wordBreak,
          text: element.textContent?.trim() ?? "",
        };
      });
      expect(layout.text.length).toBeGreaterThan(0);
      expect(layout.height).toBeLessThan(48);
      expect(layout.lineCount).toBe(1);
      expect(layout.writingMode).toBe("horizontal-tb");
      expect(layout.wordBreak).not.toBe("break-all");
    }

    await compactPage.keyboard.press("Escape");
    await expect(languageButton).toBeFocused();
    await compactPage.close();
  }
});

test("mobile navigation and account controls remain reachable in both themes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openWorkspace(page);
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.click();
  await expect(page.getByRole("button", { name: "Translate File", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();

  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") {
      await page.getByRole("button", { name: "Toggle color theme" }).click();
    }
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      theme,
    );
    await page.screenshot({
      path: testInfo.outputPath(`mobile-${theme}.png`),
      animations: "disabled",
    });
    const themeButton = page.getByRole("button", {
      name: "Toggle color theme",
    });
    await toggle.focus();
    for (
      let index = 0;
      index < 12 && !(await themeButton.evaluate((element) => element === document.activeElement));
      index += 1
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(themeButton).toBeFocused();
    await expect(themeButton).toHaveCSS("outline-style", "solid");

    const account = page.getByRole("button", { name: "Account", exact: true });
    await account.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(account).toBeFocused();
  }
});

test("mobile navigation label area remains clickable beyond the icon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openWorkspace(page);
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.click();

  const history = page.getByRole("button", { name: "History", exact: true });
  const label = history.locator(".mantine-NavLink-label");
  const icon = history.locator(".mantine-NavLink-section");
  await expect(label).toBeVisible();
  const [historyBounds, labelBounds, iconBounds] = await Promise.all([
    history.boundingBox(),
    label.boundingBox(),
    icon.boundingBox(),
  ]);
  expect(historyBounds).not.toBeNull();
  expect(labelBounds).not.toBeNull();
  expect(iconBounds).not.toBeNull();
  expect(labelBounds!.x).toBeGreaterThan(iconBounds!.x + iconBounds!.width);
  expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(
    historyBounds!.x + historyBounds!.width,
  );

  await page.mouse.click(
    labelBounds!.x + labelBounds!.width / 2,
    labelBounds!.y + labelBounds!.height / 2,
  );
  await expect(page).toHaveURL(/\/history$/);
  await expect(
    page.getByRole("heading", { name: "Translation history" }),
  ).toBeVisible();
  await toggle.click();
  await expect(history).toBeVisible();
  await expect(history).toHaveAccessibleName("History");
  await expect(history).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Translate File", exact: true }))
    .not.toHaveAttribute("aria-current", "page");
});
