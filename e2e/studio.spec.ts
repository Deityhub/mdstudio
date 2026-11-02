import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.locator(".cm-content");

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/editor");
  await expect(editor(page)).toBeVisible();
  return errors;
}

async function replaceText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

test("home page renders and links to the editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const github = page.getByRole("link", { name: /mdstudio on github/i });
  await expect(github).toHaveAttribute("href", "https://github.com/Deityhub/mdstudio");
  await expect(github).toHaveAttribute("target", "_blank");
  await page
    .getByRole("link", { name: /start writing/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/editor/);
  await expect(editor(page)).toBeVisible();
});

test("typing updates the preview, with no console errors under the CSP", async ({ page }) => {
  const errors = await open(page);
  await replaceText(page, "# Hello e2e\n\nSome **bold** text.");
  const preview = page.locator(".md-preview");
  await expect(preview.getByRole("heading", { name: "Hello e2e" })).toBeVisible();
  await expect(preview.locator("strong")).toHaveText("bold");
  expect(errors).toEqual([]);
});

test("a draft survives a reload (real IndexedDB)", async ({ page }) => {
  await open(page);
  await replaceText(page, "# Persisted heading\n\nbody");
  await expect(page.getByRole("status")).toHaveText("Saved in this browser");
  await page.reload();
  await expect(editor(page)).toContainText("Persisted heading");
  await expect(
    page.locator(".md-preview").getByRole("heading", { name: "Persisted heading" }),
  ).toBeVisible();
});

test("unsafe HTML never reaches the preview", async ({ page }) => {
  await open(page);
  await replaceText(
    page,
    '<script>window.__pwned = 1</script>\n\n<img src=x onerror="window.__pwned = 1">',
  );
  await expect(page.locator(".md-preview")).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  await expect(page.locator(".md-preview script")).toHaveCount(0);
  await expect(page.locator(".md-preview [onerror]")).toHaveCount(0);
});

test("renders math and Mermaid", async ({ page }) => {
  await open(page);
  await replaceText(page, "$$\nx^2 + y^2\n$$\n\n```mermaid\ngraph TD\n  A --> B\n```\n");
  await expect(page.locator(".md-preview .katex").first()).toBeVisible();
  const displayMath = page.locator(".md-preview .katex-display").first();
  const topPadding = await displayMath.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).paddingTop),
  );
  expect(topPadding).toBeGreaterThan(0);
  await expect(page.locator(".md-preview .md-mermaid svg")).toBeVisible({ timeout: 20_000 });
});

test("renames a draft without touching its text, and blank goes back to the heading", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, "# From the heading\n\nbody");
  const row = page.locator("nav").getByText("From the heading");
  await expect(row).toBeVisible();
  await page.locator("nav").getByText("From the heading").hover();
  await page
    .getByRole("button", { name: /^Options for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Draft name").fill("My renamed draft");
  await page.keyboard.press("Enter");
  await expect(page.locator("nav").getByText("My renamed draft")).toBeVisible();
  await expect(editor(page)).toContainText("# From the heading");
  await expect(page.getByRole("status")).toHaveText("Saved in this browser");
  await page.reload();
  await page.locator("nav").getByText("My renamed draft").hover();
  await page
    .getByRole("button", { name: /^Options for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Draft name").fill("");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.locator("nav").getByText("From the heading")).toBeVisible();
});

test("front matter form sets a canonical URL and a draft flag", async ({ page }) => {
  await open(page);
  await replaceText(page, "# Post\n\nbody");
  await page.getByRole("button", { name: "Front matter" }).first().click();
  await page.getByRole("button", { name: "Add front matter" }).click();
  await page.getByLabel("Canonical URL").fill("not a url");
  await expect(page.getByText("Use a full http(s) address.")).toBeVisible();
  await page.getByLabel("Canonical URL").fill("https://example.com/post");
  await page.getByRole("switch", { name: "Draft" }).click();
  await expect(editor(page)).toContainText("canonical_url: https://example.com/post");
  await expect(editor(page)).toContainText("draft: true");
  await page.getByRole("switch", { name: "Draft" }).click();
  await expect(editor(page)).not.toContainText("draft: true");
});

test("the drafts pane resizes by drag and keyboard, within limits, and remembers its width", async ({
  page,
}) => {
  await open(page);
  const handle = page.getByRole("separator", { name: "Resize drafts pane" });
  const width = async () =>
    (await handle.evaluate((el) => el.parentElement!.clientWidth)) as number;
  expect(await width()).toBe(288);
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 100, { steps: 5 });
  await page.mouse.up();
  expect(await width()).toBeGreaterThan(380);
  await page.mouse.move(box.x + 120, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 900, box.y + 100, { steps: 5 });
  await page.mouse.up();
  expect(await width()).toBe(480);
  await handle.focus();
  await page.keyboard.press("Home");
  expect(await width()).toBe(240);
  await page.keyboard.press("ArrowRight");
  expect(await width()).toBe(256);
  await page.reload();
  await expect(handle).toBeVisible();
  // the saved width is applied just after hydration
  await expect.poll(width).toBe(256);
  await handle.dblclick();
  await expect.poll(width).toBe(288);
});

test("the Checks panel starts open only on wide screens, and opens on click below that", async ({
  page,
}) => {
  const panel = page.getByText("Portable", { exact: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  await open(page);
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(editor(page)).toBeVisible();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Checks" }).click();
  await expect(panel).toBeVisible();
});

test("draft options live in a menu, and the rename field stays put while hovering", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, "# Menu draft\n\nbody");
  const nav = page.locator("nav");
  await nav.getByText("Menu draft").hover();
  await page
    .getByRole("button", { name: /^Options for/ })
    .first()
    .click();
  for (const name of ["Rename", "Duplicate", "Delete"])
    await expect(page.getByRole("menuitem", { name })).toBeVisible();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByLabel("Draft name");
  await expect(input).toBeFocused();
  const before = (await input.boundingBox())!.width;
  await page.mouse.move(0, 0);
  await input.hover();
  expect((await input.boundingBox())!.width).toBe(before);
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
  await expect(nav.getByText("Menu draft")).toBeVisible();
  await nav.getByText("Menu draft").hover();
  await page
    .getByRole("button", { name: /^Options for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await input.fill("Discarded");
  await page.getByRole("button", { name: "Cancel rename" }).click();
  await expect(nav.getByText("Menu draft")).toBeVisible();
  await expect(nav.getByText("Discarded")).toHaveCount(0);
});

/** The first autosave keeps whatever the draft starts with; wait for it so typing can't race it. */
async function openHistory(page: Page) {
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("button", { name: /words/ }).first()).toBeVisible();
}

test("history: save a version, compare it with the draft and restore it", async ({ page }) => {
  await open(page);
  await openHistory(page);
  await replaceText(page, "# History draft\n\nfirst line");
  await page.getByRole("button", { name: "Save a version now" }).click();
  // same count as the editor's footer, which skips front matter, code and bare symbols
  await expect(page.getByRole("button", { name: "4 words · Saved by you" })).toBeVisible();
  await expect(page.getByText("4 words", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save a version now" }).click();
  await expect(page.getByText("Nothing new to save since the last version")).toBeVisible();

  await replaceText(page, "# History draft\n\nsecond line");
  await page.getByRole("button", { name: "Save a version now" }).click();
  await replaceText(page, "# History draft\n\nthird line");
  await page
    .getByRole("button", { name: /Saved by you/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Compare with the current draft" });
  await expect(dialog.getByText("1 line removed, 1 added since")).toBeVisible();
  await expect(dialog.getByLabel("Line differences")).toContainText("second line");
  await expect(dialog.getByLabel("Line differences")).toContainText("third line");

  await dialog.getByRole("button", { name: "Restore this version" }).click();
  await expect(dialog).toBeHidden();
  await expect(editor(page)).toContainText("second line");
  await expect(editor(page)).not.toContainText("third line");
  // what the restore replaced is kept, and can be brought back
  await page.getByRole("button", { name: /Before a restore/ }).click();
  await expect(dialog.getByLabel("Line differences")).toContainText("third line");
  await dialog.getByRole("button", { name: "Restore this version" }).click();
  await expect(editor(page)).toContainText("third line");
});

test("history: the list survives a reload, and an unchanged version has nothing to restore", async ({
  page,
}) => {
  await open(page);
  await openHistory(page);
  await replaceText(page, "# Kept\n\nbody two");
  await page.getByRole("button", { name: "Save a version now" }).click();
  await expect(page.getByText("Saved by you")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Saved in this browser");
  await page.reload();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: /Saved by you/ }).click();
  const dialog = page.getByRole("dialog", { name: "Compare with the current draft" });
  await expect(dialog.getByText("Same as the current text")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Restore this version" })).toBeDisabled();
});
