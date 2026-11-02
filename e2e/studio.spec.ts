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

async function newDraft(page: Page, text: string) {
  await page.getByRole("button", { name: "New draft" }).click();
  await replaceText(page, text);
  await expect(page.getByRole("status")).toHaveText("Saved in this browser");
}

test("library: search by title and text, filter by tag, and clear", async ({ page }) => {
  await open(page);
  await replaceText(page, "# Alpha post\n\nthe quick brown fox");
  await newDraft(page, "---\ntags: [rust, web]\n---\n# Beta post\n\nmemory safety notes");
  await newDraft(page, "---\ntags: [web]\n---\n# Gamma post\n\nsomething else");
  const nav = page.getByRole("navigation", { name: "Drafts" });

  await page.getByRole("searchbox", { name: "Search drafts" }).fill("brown fox");
  await expect(nav.getByText("Alpha post")).toBeVisible();
  await expect(nav.getByText("the quick brown fox")).toBeVisible();
  await expect(nav.getByText("Beta post")).toBeHidden();

  await page.getByRole("searchbox", { name: "Search drafts" }).fill("zzz-nothing");
  await expect(nav.getByText("No drafts match.")).toBeVisible();
  await nav.getByRole("button", { name: "Clear filters" }).click();
  await expect(nav.getByText("Gamma post")).toBeVisible();

  await page.getByRole("button", { name: /^web\b/ }).click();
  await expect(nav.getByText("Alpha post")).toBeHidden();
  await expect(nav.getByText("Beta post")).toBeVisible();
  await expect(nav.getByText("Gamma post")).toBeVisible();
  await page.getByRole("button", { name: /^rust\b/ }).click();
  await expect(nav.getByText("Gamma post")).toBeHidden();
  await expect(nav.getByText("Beta post")).toBeVisible();
  await page.getByRole("button", { name: /^rust\b/ }).click();
  await page.getByRole("button", { name: /^web\b/ }).click();
  await expect(nav.getByText("Alpha post")).toBeVisible();
});

test("library: create a folder, move drafts in through the menu, and keep it after a reload", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, "# One\n\nbody");
  await newDraft(page, "# Two\n\nbody");
  const nav = page.getByRole("navigation", { name: "Drafts" });

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("New folder name").fill("  Blog   posts ");
  await page.getByRole("button", { name: "Create folder" }).click();
  const folder = nav.getByRole("group", { name: "Folder Blog posts" });
  await expect(folder).toBeVisible();
  await expect(folder.getByText("Empty. Drag drafts here.")).toBeVisible();

  await nav.getByText("One", { exact: true }).hover();
  await page.getByRole("button", { name: "Options for One" }).click();
  await page.getByRole("menuitem", { name: "Move to folder…" }).click();
  await page.getByLabel("Folder name").fill("blog POSTS");
  await page.getByRole("button", { name: "Move" }).click();
  // the typed name reuses the existing folder's spelling instead of making a second one
  await expect(nav.getByRole("group")).toHaveCount(1);
  await expect(folder.getByText("One", { exact: true })).toBeVisible();
  await expect(nav.getByText("Two", { exact: true })).toBeVisible();
  // a draft in a folder sits inside its indented list; an unfiled one does not
  const indent = async (name: string) =>
    nav
      .getByText(name, { exact: true })
      .evaluate((el) => el.closest("a")!.getBoundingClientRect().left);
  expect(await indent("One")).toBeGreaterThan((await indent("Two")) + 8);

  await expect(page.getByRole("status")).toHaveText("Saved in this browser");
  await page.reload();
  await expect(nav.getByRole("group", { name: "Folder Blog posts" })).toBeVisible();
  await nav.getByRole("button", { name: /^Blog posts/ }).click();
  await expect(nav.getByText("One", { exact: true })).toBeHidden();
  await nav.getByRole("button", { name: /^Blog posts/ }).click();
  await expect(nav.getByText("One", { exact: true })).toBeVisible();

  await nav.getByText("One", { exact: true }).hover();
  await page.getByRole("button", { name: "Options for One" }).click();
  await page.getByRole("menuitem", { name: "Move to folder…" }).click();
  await page.getByLabel("Folder name").fill("");
  await page.getByRole("button", { name: "Move" }).click();
  // out of the folder, which stays as an empty one
  await expect(nav.getByRole("group", { name: "Folder Blog posts" })).toContainText("Empty");
});

test("library: drag a draft into a folder and back out", async ({ page }) => {
  await open(page);
  await replaceText(page, "# Mover\n\nbody");
  const nav = page.getByRole("navigation", { name: "Drafts" });
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("New folder name").fill("Archive");
  await page.getByRole("button", { name: "Create folder" }).click();
  const folder = nav.getByRole("group", { name: "Folder Archive" });
  const draft = nav.getByText("Mover", { exact: true });

  await draft.dragTo(folder.getByRole("button", { name: /^Archive/ }));
  await expect(folder.getByText("Mover", { exact: true })).toBeVisible();

  // dropping on the empty part of the list takes it out again
  await folder
    .getByText("Mover", { exact: true })
    .dragTo(nav, { targetPosition: { x: 40, y: 400 } });
  await expect(folder.getByText("Mover", { exact: true })).toBeHidden();
  await expect(nav.getByText("Mover", { exact: true })).toBeVisible();
});

test("library: deleting an empty folder is immediate, one with drafts asks first", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, "# Keeper\n\nbody");
  await newDraft(page, "# Doomed\n\nbody");
  const nav = page.getByRole("navigation", { name: "Drafts" });
  for (const name of ["Empty one", "Full one"]) {
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("New folder name").fill(name);
    await page.getByRole("button", { name: "Create folder" }).click();
  }

  // empty: no dialog
  await nav.getByRole("group", { name: "Folder Empty one" }).hover();
  await page.getByRole("button", { name: "Options for folder Empty one" }).click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  await expect(nav.getByRole("group", { name: "Folder Empty one" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // with a draft: confirm, and cancel keeps everything
  await nav.getByText("Doomed", { exact: true }).hover();
  await page.getByRole("button", { name: "Options for Doomed" }).click();
  await page.getByRole("menuitem", { name: "Move to folder…" }).click();
  await page.getByLabel("Folder name").fill("Full one");
  await page.getByRole("button", { name: "Move" }).click();
  const full = nav.getByRole("group", { name: "Folder Full one" });
  await full.hover();
  await page.getByRole("button", { name: "Options for folder Full one" }).click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  const dialog = page.getByRole("dialog", { name: /Delete folder/ });
  await expect(dialog).toContainText("1 draft inside will be deleted too");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(full.getByText("Doomed", { exact: true })).toBeVisible();

  await full.hover();
  await page.getByRole("button", { name: "Options for folder Full one" }).click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  await dialog.getByRole("button", { name: "Delete folder and drafts" }).click();
  await expect(nav.getByText("Doomed", { exact: true })).toHaveCount(0);
  await expect(nav.getByRole("group", { name: "Folder Full one" })).toHaveCount(0);
  await expect(nav.getByText("Keeper", { exact: true })).toBeVisible();
});

test("library: the folder field lists existing folders on click, and only when there are some", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, "# Picker\n\nbody");
  const nav = page.getByRole("navigation", { name: "Drafts" });
  const openMove = async () => {
    await nav.getByText("Picker", { exact: true }).hover();
    await page.getByRole("button", { name: "Options for Picker" }).click();
    await page.getByRole("menuitem", { name: "Move to folder…" }).click();
  };

  // no folders yet: nothing to pick from, just type a name
  await openMove();
  await expect(page.getByLabel("Folder name")).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByLabel("Folder name").fill("Alpha");
  await page.getByRole("button", { name: "Move" }).click();
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("New folder name").fill("Beta");
  await page.getByRole("button", { name: "Create folder" }).click();

  // with folders: opens listing them all, typing narrows, clicking fills the field in
  await openMove();
  const list = page.getByRole("listbox", { name: "Existing folders" });
  await expect(list.getByRole("option")).toHaveCount(2);
  await page.getByLabel("Folder name").fill("be");
  await expect(list.getByRole("option")).toHaveCount(1);
  await page.getByLabel("Folder name").fill("");
  await list.getByRole("option", { name: "Beta" }).click();
  await expect(page.getByLabel("Folder name")).toHaveValue("Beta");
  await expect(list).toHaveCount(0);
  await page.getByLabel("Folder name").click();
  await expect(list).toBeVisible();
  // arrow keys and Enter pick too, and Escape closes the list before the dialog
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Folder name")).toHaveValue("Alpha");
  await page.getByLabel("Folder name").click();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Move to folder" })).toBeVisible();
  await page.getByRole("button", { name: "Move" }).click();
  await expect(nav.getByRole("group", { name: "Folder Alpha" })).toContainText("Picker");
});
