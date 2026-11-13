import { expect, test, type Page } from "@playwright/test";

const api = process.env.API_BASE_URL || "http://localhost:3000/excel-convert";
const web = process.env.WEB_BASE_PATH || "/excel-convert/";
const timestamp = "2026-11-13T00:00:00.000Z";
const groups = [
  {
    id: "products",
    name: "Product names",
    description: "Names used on products",
    sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH",
    createdAt: timestamp,
    updatedAt: timestamp,
    entries: [
      {
        id: "product-term",
        groupId: "products",
        source: "part number",
        target: "product code",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  },
  {
    id: "empty",
    name: "Shipping terms",
    description: "Shipping vocabulary",
    sourceLanguage: "JAPANESE",
    targetLanguage: "ENGLISH",
    createdAt: timestamp,
    updatedAt: timestamp,
    entries: [],
  },
];

async function openVocabulary(
  page: Page,
  vocabularyGroups: typeof groups,
  options: { locale?: "ja" | "zh"; ready?: Promise<void> } = {},
) {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.addInitScript(() =>
    localStorage.setItem("excel-translator-token", "vocabulary-test-session"),
  );
  if (options.locale) {
    await page.addInitScript((locale) =>
      localStorage.setItem("excel-translator-locale", locale), options.locale);
  }
  await page.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      new URL(api).pathname,
      "",
    );
    if (path === "/vocabulary") await options.ready;
    const body =
      path === "/vocabulary"
        ? vocabularyGroups
        : path === "/profile"
          ? { id: "user-1", username: "test-user", isAdmin: false }
          : path === "/notifications/unread-count"
            ? { count: 0 }
            : path === "/system/info"
              ? { year: 2026 }
              : [];
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto(`${web}vocabulary`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("group edit, add and delete actions are compact and aligned", async ({ page }) => {
  await openVocabulary(page, groups);
  const edit = page.getByRole("button", { name: "Edit group", exact: true });
  const add = page.getByRole("button", { name: "Add term", exact: true });
  const remove = page.getByRole("button", { name: "Delete", exact: true });
  for (const action of [edit, add, remove]) {
    await expect(action).toBeVisible();
    await expect(action).toHaveText("");
  }
  const [editBox, addBox] = await Promise.all([edit.boundingBox(), add.boundingBox()]);
  expect(Math.abs(editBox!.y - addBox!.y)).toBeLessThan(3);
  const header = page.locator(".vocabulary-group-header");
  const [headerBox, removeBox] = await Promise.all([header.boundingBox(), remove.boundingBox()]);
  expect(addBox!.x).toBeGreaterThan(editBox!.x + editBox!.width);
  expect(headerBox!.x + headerBox!.width - (removeBox!.x + removeBox!.width)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: test.info().outputPath("vocabulary-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  const [desktopHeader, desktopRemove] = await Promise.all([header.boundingBox(), remove.boundingBox()]);
  expect(desktopHeader!.x + desktopHeader!.width - (desktopRemove!.x + desktopRemove!.width)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: test.info().outputPath("vocabulary-desktop.png") });
  await edit.focus();
  await expect(edit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Group name" })).toHaveValue("Product names");
  await page.keyboard.press("Escape");
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Add protected term" })).toBeVisible();
  await page.keyboard.press("Escape");
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Confirm deletion" })).toContainText("Product names");
});

test("long group names leave icon actions reachable on narrow screens", async ({ page }) => {
  await openVocabulary(page, [{ ...groups[0], name: "Long vocabulary group name ".repeat(8) }]);
  const header = page.locator(".vocabulary-group-header");
  const remove = page.getByRole("button", { name: "Delete", exact: true });
  const [headerBox, removeBox] = await Promise.all([header.boundingBox(), remove.boundingBox()]);
  expect(headerBox!.x + headerBox!.width - (removeBox!.x + removeBox!.width)).toBeLessThanOrEqual(2);
  for (const name of ["Edit group", "Add term", "Delete"]) {
    const action = page.getByRole("button", { name, exact: true });
    const bounds = await action.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  }
});

test("mobile terms scroll to fully visible actionable controls and readable content", async ({ page }) => {
  const source = "A long source term that must remain readable";
  const target = "A long translated term that must remain readable";
  await openVocabulary(page, [{
    ...groups[0],
    entries: [{ ...groups[0].entries[0], source, target }],
  }]);
  const scroller = page.locator(".vocabulary-terms");
  await page.screenshot({ path: test.info().outputPath("terms-before-scroll.png"), fullPage: true });
  const metrics = await scroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(["auto", "scroll"]).toContain(metrics.overflowX);
  const region = page.getByRole("region", { name: /Vocabulary/ });
  await expect(region).toHaveAttribute("tabindex", "0");
  await region.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const remove = region.getByRole("button", { name: "Remove", exact: true });
  await remove.focus();
  const [regionBox, removeBox] = await Promise.all([region.boundingBox(), remove.boundingBox()]);
  expect(removeBox!.x).toBeGreaterThanOrEqual(regionBox!.x);
  expect(removeBox!.x + removeBox!.width).toBeLessThanOrEqual(regionBox!.x + regionBox!.width);
  await page.screenshot({ path: test.info().outputPath("terms-scrolled-mobile.png"), fullPage: true });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Confirm deletion" })).toContainText(source);
  await page.keyboard.press("Escape");
  const edit = region.getByRole("button", { name: "Edit", exact: true });
  await edit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Source term" })).toHaveValue(source);
  await page.keyboard.press("Escape");
  for (const name of ["Edit", "Remove"]) {
    const label = region.getByRole("button", { name, exact: true }).locator(".mantine-Button-label");
    expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  for (const value of [source, target]) {
    const label = region.getByText(value, { exact: true });
    await expect(label).toBeVisible();
    expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await scroller.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(edit).toBeVisible();
  await expect(remove).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("terms-desktop.png"), fullPage: true });
});

test("search and keyboard selection show only the selected group's terms and actions", async ({
  page,
}) => {
  await openVocabulary(page, groups);
  const selector = page.getByRole("textbox", { name: "Vocabulary group", exact: true });
  await expect(selector).toBeVisible();
  await selector.click();
  await expect(page.getByRole("option", { name: /Product names/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Shipping terms/ })).toBeVisible();

  await selector.fill("product");
  await expect(page.getByRole("option", { name: /Product names/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Shipping terms/ })).toHaveCount(0);
  await selector.press("ArrowDown");
  await selector.press("Enter");
  await expect(selector).toHaveValue("Product names");
  await expect(page.getByText("part number", { exact: true })).toBeVisible();
  await expect(page.getByText("product code", { exact: true })).toBeVisible();
  await expect(page.getByText("Shipping vocabulary", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit group" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add term" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit group" }).click();
  await expect(page.getByRole("textbox", { name: "Group name" })).toHaveValue(
    "Product names",
  );
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await selector.fill("shipping");
  await expect(page.getByRole("option", { name: /Shipping terms/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Product names/ })).toHaveCount(0);
  await selector.press("ArrowDown");
  await selector.press("Enter");
  await expect(selector).toHaveValue("Shipping terms");
  await expect(page.getByText("part number", { exact: true })).toHaveCount(0);
  await expect(page.getByText("product code", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No protected terms yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add term" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit group" }).click();
  await expect(page.getByRole("textbox", { name: "Group name" })).toHaveValue(
    "Shipping terms",
  );
});

test("an unmatched group search explains that no results were found", async ({
  page,
}) => {
  await openVocabulary(page, groups);
  const selector = page.getByRole("textbox", { name: "Vocabulary group", exact: true });
  await selector.fill("no-such-group");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(
    page.getByText("No matching vocabulary groups", { exact: true }),
  ).toBeVisible();
  await selector.press("Escape");
  await expect(selector).toHaveValue("Product names");
  await expect(selector).toBeFocused();
  await expect(page.getByText("part number", { exact: true })).toBeVisible();
  await selector.fill("abandoned search");
  await selector.press("Tab");
  await expect(selector).toHaveValue("Product names");
});

test("an empty vocabulary still offers group creation", async ({ page }) => {
  await openVocabulary(page, []);
  await expect(page.getByText("No vocabulary groups", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create vocabulary group" }).click();
  await expect(page.getByRole("dialog", { name: "New vocabulary group" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Group name" })).toBeVisible();
});

test("loading groups has a clear status before selection is available", async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  try {
    await openVocabulary(page, groups, { ready });
    await expect(page.getByRole("status")).toHaveText("Loading vocabulary groups…");
    await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("textbox", { name: "Vocabulary group", exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole("textbox", { name: "Vocabulary group", exact: true })).toHaveValue("Product names");
});

test("term refresh keeps the selected group and deleting it selects a remaining group", async ({ page }) => {
  const vocabularyGroups = groups.map((group) => ({
    ...group,
    entries: [...group.entries],
  }));
  await openVocabulary(page, vocabularyGroups);
  const selector = page.getByRole("textbox", { name: "Vocabulary group", exact: true });
  await selector.fill("shipping");
  await page.getByRole("option", { name: "Shipping terms", exact: true }).click();
  await page.route(`${api}/vocabulary/empty/entries`, async (route) => {
    expect(route.request().method()).toBe("POST");
    const term = route.request().postDataJSON();
    expect(term).toEqual({ source: "配送", target: "shipping" });
    const entry = {
      id: "shipping-term",
      groupId: "empty",
      ...term,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    vocabularyGroups[1].entries.push(entry);
    await route.fulfill({ status: 201, json: entry });
  });
  await page.getByRole("button", { name: "Add term", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add protected term" });
  await dialog.getByRole("textbox", { name: "Source term" }).fill("配送");
  await dialog.getByRole("textbox", { name: "Translation" }).fill("shipping");
  await dialog.getByRole("button", { name: "Add term", exact: true }).click();
  await expect(selector).toHaveValue("Shipping terms");
  await expect(page.getByText("配送", { exact: true })).toBeVisible();
  await expect(page.getByText("part number", { exact: true })).toHaveCount(0);

  await page.route(`${api}/vocabulary/empty`, async (route) => {
    expect(route.request().method()).toBe("DELETE");
    vocabularyGroups.splice(1, 1);
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirm deletion" });
  await expect(confirmation).toContainText("Shipping terms");
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(selector).toHaveValue("Product names");
  await expect(page.getByText("part number", { exact: true })).toBeVisible();
});

test("a newly created group becomes available for adding terms", async ({ page }) => {
  const vocabularyGroups = groups.map((group) => ({ ...group, entries: [...group.entries] }));
  await openVocabulary(page, vocabularyGroups);
  await page.route(`${api}/vocabulary`, async (route) => {
    if (route.request().method() === "POST") {
      const created = {
        ...groups[1],
        ...route.request().postDataJSON(),
        id: "new-group",
        entries: [],
      };
      vocabularyGroups.push(created);
      await route.fulfill({ status: 201, json: created });
    } else {
      await route.fulfill({ status: 200, json: vocabularyGroups });
    }
  });
  await page.getByRole("button", { name: "New group", exact: true }).click();
  await page.getByRole("textbox", { name: "Group name" }).fill("New terminology");
  await page.getByRole("button", { name: "Save group", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Vocabulary group", exact: true })).toHaveValue("New terminology");
  await expect(page.getByText("No protected terms yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add term", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add protected term" })).toBeVisible();
});

for (const [locale, label, noMatches, edit, add] of [
  ["ja", "用語集グループ", "一致する用語集グループはありません", "グループを編集", "用語を追加"],
  ["zh", "词汇分组", "没有匹配的词汇分组", "编辑分组", "添加术语"],
] as const) {
  test(`group search is localized in ${locale}`, async ({ page }) => {
    await openVocabulary(page, groups, { locale });
    const selector = page.getByRole("textbox", { name: label, exact: true });
    await expect(selector).toHaveValue("Product names");
    await expect(page.getByRole("button", { name: edit, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: add, exact: true })).toBeVisible();
    await selector.fill("missing");
    await expect(page.getByText(noMatches, { exact: true })).toBeVisible();
    await selector.press("Escape");
    await expect(selector).toHaveValue("Product names");
  });
}

test("group selection fits responsive layouts without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openVocabulary(page, groups);
  const selector = page.getByRole("textbox", { name: "Vocabulary group", exact: true });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(selector).toBeVisible();
    const bounds = await selector.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await selector.click();
    await page.getByRole("option", { name: "Shipping terms", exact: true }).click();
    await expect(selector).toHaveValue("Shipping terms");
    await expect(page.getByText("No protected terms yet.")).toBeVisible();
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth,
    )).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`vocabulary-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
