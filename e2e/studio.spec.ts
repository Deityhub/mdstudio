import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createZip, readZip } from "../src/lib/storage/zip";

const editor = (page: Page) => page.locator(".cm-content");

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/editor");
  await expect(editor(page)).toBeVisible();
  return errors;
}

/** How a draft's text appears in storage; the `images` key that follows tells it from a saved version. */
const docContent = (text: string) => `"content":${JSON.stringify(text)},"images"`;

/**
 * The status label says "Saved" before a change has even started saving, so a test that reloads
 * right after typing can race the debounce. This waits until the text is really in IndexedDB.
 */
async function stored(page: Page, needle: string) {
  await expect
    .poll(() =>
      page.evaluate(async (n) => {
        const db = await new Promise<IDBDatabase>((res, rej) => {
          const r = indexedDB.open("mdstudio-db");
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const all = await new Promise<unknown[]>((res, rej) => {
          const r = db.transaction("mdstudio-store").objectStore("mdstudio-store").getAll();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        db.close();
        return JSON.stringify(all).includes(n);
      }, needle),
    )
    .toBe(true);
}

async function replaceText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

test("home page renders and links to the editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // links that leave the site open in a new tab, without handing it this one
  const changelog = page
    .getByRole("navigation", { name: "Footer" })
    .getByRole("link", { name: "Changelog" });
  await expect(changelog).toHaveAttribute("href", /github\.com\/Deityhub\/mdstudio/);
  await expect(changelog).toHaveAttribute("target", "_blank");
  await expect(changelog).toHaveAttribute("rel", /noopener/);
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
  await stored(page, docContent("# Persisted heading\n\nbody"));
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
  await stored(page, '"name":"My renamed draft"');
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

test("the drafts and the panels share the pane on the left", async ({ page }) => {
  const checks = page.getByText("Portable", { exact: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  await open(page);
  const panels = page.getByRole("navigation", { name: "Panels" });
  const drafts = page.getByRole("complementary").getByRole("navigation", { name: "Drafts" });
  const toggle = page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Drafts" });
  // the drafts show first, with the panel buttons to their left
  await expect(drafts).toBeVisible();
  await expect(checks).toBeHidden();
  const strip = (await panels.boundingBox())!;
  const list = (await drafts.boundingBox())!;
  expect(strip.x).toBeLessThan(list.x);
  // a panel takes their place, and the drafts button brings them back
  await panels.getByRole("button", { name: "Checks" }).click();
  await expect(checks).toBeVisible();
  await expect(drafts).toBeHidden();
  await toggle.click();
  await expect(drafts).toBeVisible();
  await expect(checks).toBeHidden();
  // pressing the open panel's button again closes it, and the drafts come back
  await panels.getByRole("button", { name: "Outline" }).click();
  await expect(drafts).toBeHidden();
  await panels.getByRole("button", { name: "Outline" }).click();
  await expect(drafts).toBeVisible();
  // the strip has its own drafts button too: it hides the list, and brings it back over a panel
  const draftsButton = panels.getByRole("button", { name: "Drafts" });
  await expect(draftsButton).toHaveAttribute("aria-pressed", "true");
  await draftsButton.click();
  await expect(drafts).toBeHidden();
  await panels.getByRole("button", { name: "History" }).click();
  await draftsButton.click();
  await expect(drafts).toBeVisible();
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
  // the example is not saved until it is changed, and the first version is taken when it is
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type(" ");
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
  await stored(page, docContent("# Kept\n\nbody two"));
  await stored(page, '"kind":"manual"');
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
  await stored(page, docContent(text));
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
  await page.getByRole("menuitem", { name: "Move to folder" }).click();
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

  await stored(page, '"folder":"Blog posts"');
  await page.reload();
  await expect(nav.getByRole("group", { name: "Folder Blog posts" })).toBeVisible();
  // folders start collapsed after a reload, and open when clicked
  await expect(nav.getByRole("button", { name: /^Blog posts/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(nav.getByText("One", { exact: true })).toBeHidden();
  await nav.getByRole("button", { name: /^Blog posts/ }).click();
  await expect(nav.getByText("One", { exact: true })).toBeVisible();

  await nav.getByText("One", { exact: true }).hover();
  await page.getByRole("button", { name: "Options for One" }).click();
  await page.getByRole("menuitem", { name: "Move to folder" }).click();
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
  await page.getByRole("menuitem", { name: "Move to folder" }).click();
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
    await page.getByRole("menuitem", { name: "Move to folder" }).click();
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

const bytes = (s: string) => new TextEncoder().encode(s);

test("bulk: export every draft as a ZIP, with folders", async ({ page }) => {
  await open(page);
  await replaceText(page, "# Loose note\n\nbody");
  await newDraft(page, "# Filed post\n\nbody");
  const nav = page.getByRole("navigation", { name: "Drafts" });
  await nav.getByText("Filed post", { exact: true }).hover();
  await page.getByRole("button", { name: "Options for Filed post" }).click();
  await page.getByRole("menuitem", { name: "Move to folder" }).click();
  await page.getByLabel("Folder name").fill("Blog");
  await page.getByRole("button", { name: "Move" }).click();

  await page.getByRole("button", { name: "Export" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /Download all drafts/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^mdstudio-drafts-\d{4}-\d{2}-\d{2}\.zip$/);
  const entries = await readZip(new Uint8Array(readFileSync((await download.path())!)));
  const byPath = Object.fromEntries(entries.map((e) => [e.path, new TextDecoder().decode(e.data)]));
  expect(byPath["Blog/filed-post.md"]).toBe("# Filed post\n\nbody");
  expect(byPath["loose-note.md"]).toBe("# Loose note\n\nbody");
});

test("bulk: import a ZIP of drafts, folders and images", async ({ page }) => {
  await open(page);
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const zip = await createZip([
    { path: "Notes/first.md", data: bytes("# First\n\n![pic](images/p.png)") },
    { path: "Notes/images/p.png", data: png },
    { path: "second.md", data: bytes("no heading, just words") },
    { path: "ignored.pdf", data: bytes("x") },
  ]);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "export.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  const nav = page.getByRole("navigation", { name: "Drafts" });
  await expect(page.getByText("Imported 2 drafts")).toBeVisible();
  // imported folders start collapsed
  await nav.getByRole("button", { name: /^Notes/ }).click();
  await expect(nav.getByRole("group", { name: "Folder Notes" }).getByText("First")).toBeVisible();
  // a file with no heading keeps its file name instead of "Untitled"
  await expect(nav.getByText("second", { exact: true })).toBeVisible();
  // the image came along and renders in the preview of the opened draft
  await nav.getByText("First", { exact: true }).click();
  await expect(page.locator(".md-preview img[alt='pic']")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
});

test("bulk: import a folder of Markdown files", async ({ page }) => {
  await open(page);
  const root = mkdtempSync(join(tmpdir(), "mdstudio-import-"));
  const dir = join(root, "My notes");
  mkdirSync(join(dir, "Work"), { recursive: true });
  writeFileSync(join(dir, "top.md"), "# Top level\n");
  writeFileSync(join(dir, "Work", "plan.md"), "# The plan\n");
  writeFileSync(join(dir, "Work", "data.csv"), "a,b");
  await page.getByLabel("Import a folder").setInputFiles(dir);
  const nav = page.getByRole("navigation", { name: "Drafts" });
  await expect(page.getByText("Imported 2 drafts")).toBeVisible();
  // imported folders start collapsed
  await nav
    .getByRole("button", { name: /^My notes/ })
    .first()
    .click();
  await nav.getByRole("button", { name: /^My notes \/ Work/ }).click();
  await expect(
    nav.getByRole("group", { name: "Folder My notes" }).getByText("Top level"),
  ).toBeVisible();
  await expect(
    nav.getByRole("group", { name: "Folder My notes / Work" }).getByText("The plan"),
  ).toBeVisible();
});

test("bulk: a broken ZIP shows an error and changes nothing", async ({ page }) => {
  await open(page);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "bad.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("this is not a zip file at all"),
    });
  await expect(page.getByText(/doesn't look like a ZIP/)).toBeVisible();
});

test("library: rename a folder through its menu, and its drafts follow", async ({ page }) => {
  await open(page);
  await replaceText(page, "# Inside\n\nbody");
  const nav = page.getByRole("navigation", { name: "Drafts" });
  for (const name of ["Blog", "Other"]) {
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByLabel("New folder name").fill(name);
    await page.getByRole("button", { name: "Create folder" }).click();
  }
  await nav.getByText("Inside", { exact: true }).hover();
  await page.getByRole("button", { name: "Options for Inside" }).click();
  await page.getByRole("menuitem", { name: "Move to folder" }).click();
  await page.getByLabel("Folder name", { exact: true }).fill("Blog");
  await page.getByRole("button", { name: "Move" }).click();

  const rename = async (from: string, to: string, save: "button" | "enter" = "button") => {
    await nav.getByRole("group", { name: `Folder ${from}` }).hover();
    await page.getByRole("button", { name: `Options for folder ${from}` }).click();
    await page.getByRole("menuitem", { name: "Rename folder" }).click();
    const field = page.getByLabel("Folder name", { exact: true });
    await expect(field).toBeFocused();
    await field.fill(to);
    if (save === "enter") await page.keyboard.press("Enter");
    else await page.getByRole("button", { name: "Save folder name" }).click();
  };

  await rename("Blog", "Posts");
  const posts = nav.getByRole("group", { name: "Folder Posts" });
  await expect(posts.getByText("Inside", { exact: true })).toBeVisible();
  await expect(nav.getByRole("group", { name: "Folder Blog" })).toHaveCount(0);

  // a name that belongs to another folder is refused and nothing changes
  await rename("Posts", "other");
  await expect(page.getByText("A folder named “other” already exists")).toBeVisible();
  await expect(posts.getByText("Inside", { exact: true })).toBeVisible();

  // only the case changes
  await nav.getByRole("group", { name: "Folder Posts" }).hover();
  await page.getByRole("button", { name: "Options for folder Posts" }).click();
  await page.getByRole("menuitem", { name: "Rename folder" }).click();
  await page.getByLabel("Folder name", { exact: true }).fill("POSTS");
  await page.keyboard.press("Enter");
  await expect(nav.getByRole("group", { name: "Folder POSTS" })).toBeVisible();

  // cancelling keeps the name, and the new name survives a reload
  await nav.getByRole("group", { name: "Folder POSTS" }).hover();
  await page.getByRole("button", { name: "Options for folder POSTS" }).click();
  await page.getByRole("menuitem", { name: "Rename folder" }).click();
  await page.getByLabel("Folder name", { exact: true }).fill("Nope");
  await page.getByRole("button", { name: "Cancel folder rename" }).click();
  await expect(nav.getByRole("group", { name: "Folder POSTS" })).toBeVisible();
  await stored(page, '"folder":"POSTS"');
  await page.reload();
  // collapsed after a reload; open it to see the draft
  await nav.getByRole("button", { name: /^POSTS/ }).click();
  await expect(
    nav.getByRole("group", { name: "Folder POSTS" }).getByText("Inside", { exact: true }),
  ).toBeVisible();
});

/** Resolves once the service worker controls the page and has kept the editor's files. */
async function offlineReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const paths: string[] = [];
        for (const name of await caches.keys())
          for (const r of await (await caches.open(name)).keys())
            paths.push(new URL(r.url).pathname);
        return (
          paths.some((p) => p.startsWith("/assets/MarkdownEditor")) && paths.includes("/editor")
        );
      }),
    )
    .toBe(true);
}

test("offline: the editor opens and keeps working with no network", async ({ page, context }) => {
  await open(page);
  await replaceText(page, "# Offline draft\n\nwritten online");
  await stored(page, docContent("# Offline draft\n\nwritten online"));
  await offlineReady(page);

  await context.setOffline(true);
  await page.reload();
  await expect(editor(page)).toContainText("Offline draft");
  await expect(page.getByText(/^Offline, your drafts are still saved here/)).toBeVisible();
  await expect(
    page.locator(".md-preview").getByRole("heading", { name: "Offline draft" }),
  ).toBeVisible();

  // writing, saving and a page that was never visited all still work
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nwritten offline");
  await stored(page, "written offline");
  await page.goto("/editor");
  await expect(editor(page)).toContainText("written offline");

  // coming back online is noticed
  await context.setOffline(false);
  await expect(page.getByText(/^Offline, your drafts/)).toBeHidden();
});

test("offline: a page that was never saved says so, and the manifest is installable", async ({
  page,
  context,
}) => {
  await open(page);
  await offlineReady(page);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/editor", id: "/editor" });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);

  await context.setOffline(true);
  // a guide was never visited: the cached home page stands in rather than a browser error page
  await page.goto("/guides/markdown-images");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

const SYNC_DOC = [
  "# Sync title",
  "",
  "first paragraph",
  "continues here",
  "",
  "- item one",
  "- item two",
  "",
  "A [link](#sync-title) and more.",
  "",
  "the last paragraph",
].join("\n");

const activeLine = (page: Page) => page.locator(".cm-activeLine");

test("click-through sync: a click in the preview puts the editor cursor on that block", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, SYNC_DOC);
  const preview = page.locator(".md-preview");
  await expect(preview.getByText("first paragraph")).toBeVisible();

  await preview.getByText("first paragraph").click();
  await expect(activeLine(page)).toHaveText("first paragraph");
  await preview.getByRole("listitem").filter({ hasText: "item two" }).click();
  await expect(activeLine(page)).toHaveText("- item two");
  await preview.getByRole("heading", { name: "Sync title" }).click();
  await expect(activeLine(page)).toHaveText("# Sync title");
});

test("click-through sync: the editor cursor marks its block in the preview", async ({ page }) => {
  await open(page);
  await replaceText(page, SYNC_DOC);
  const preview = page.locator(".md-preview");
  await editor(page).locator(".cm-line", { hasText: "item one" }).click();
  await expect(preview.locator("[data-active]")).toHaveCount(1);
  await expect(preview.locator("[data-active]")).toHaveText("item one");
  await page.keyboard.press("ArrowDown");
  await expect(preview.locator("[data-active]")).toHaveText("item two");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(preview.locator("[data-active]")).toContainText("A link and more.");
});

test("click-through sync: links and text selections are left alone", async ({ page }) => {
  await open(page);
  await replaceText(page, SYNC_DOC);
  const preview = page.locator(".md-preview");
  await editor(page).locator(".cm-line", { hasText: "the last paragraph" }).click();
  await expect(activeLine(page)).toHaveText("the last paragraph");

  // a link click follows the link, it doesn't move the cursor
  await preview.getByRole("link", { name: "link" }).click();
  await expect(activeLine(page)).toHaveText("the last paragraph");

  // dragging to select text in the preview (to copy it) doesn't move the cursor either
  const para = preview.getByText("first paragraph");
  const box = (await para.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(activeLine(page)).toHaveText("the last paragraph");
});

test("click-through sync: from the preview-only view a click brings the editor back", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, SYNC_DOC);
  await page.getByRole("button", { name: "preview view" }).click();
  await expect(editor(page)).toHaveCount(0);
  await page.locator(".md-preview").getByText("the last paragraph").click();
  await expect(editor(page)).toBeVisible();
  await expect(activeLine(page)).toHaveText("the last paragraph");
});

test("click-through sync: typing above never reloads the blocks below, and their lines follow", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, SYNC_DOC);
  const last = page.locator(".md-preview p", { hasText: "the last paragraph" });
  await expect(last).toHaveAttribute("data-sl", "11");
  await last.evaluate((el) => ((el as HTMLElement & { kept?: boolean }).kept = true));

  await editor(page).locator(".cm-line", { hasText: "# Sync title" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("an added line");
  await expect(last).toHaveAttribute("data-sl", "12");
  expect(await last.evaluate((el) => (el as HTMLElement & { kept?: boolean }).kept)).toBe(true);
});

/** Sections of different shapes: tall in the editor and short in the preview, and the reverse. */
function longDoc() {
  const parts: string[] = [];
  for (let i = 1; i <= 14; i++) {
    parts.push(`## Section ${i}`, "", `Paragraph for section ${i} with some text.`, "");
    parts.push(
      "```ts",
      ...Array.from({ length: 12 }, (_, n) => `const code${i}x${n} = ${n};`),
      "```",
      "",
    );
    parts.push(...Array.from({ length: 4 }, (_, n) => `- bullet ${i}.${n}`), "");
  }
  return parts.join("\n");
}

test("scroll sync: both panes stay on the same lines, in either direction", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await open(page);
  const text = longDoc();
  const lines = text.split("\n");
  await replaceText(page, text);
  // the preview catches up a moment after typing; wait until it has the whole document
  await expect(page.locator(".md-preview h2").last()).toHaveText("Section 14");

  /** The document line at the top of the editor, and the lines of the block at the top of the preview. */
  const tops = () =>
    page.evaluate((all) => {
      const scroller = document.querySelector(".cm-scroller")!.getBoundingClientRect();
      // blank lines and fences repeat, so count from the first line with text that is unique
      const visible = [...document.querySelectorAll(".cm-line")].filter(
        (l) => l.getBoundingClientRect().bottom > scroller.top + 2,
      );
      const skipped = visible.findIndex((l) => {
        const t = l.textContent ?? "";
        return t !== "" && all.indexOf(t) === all.lastIndexOf(t);
      });
      const editorLine = all.indexOf(visible[skipped]!.textContent ?? "") + 1 - skipped;
      const pane = document.querySelector(".md-preview")!.parentElement!.getBoundingClientRect();
      const leaf = [...document.querySelectorAll(".md-preview [data-sl]")].find(
        (el) => !el.querySelector("[data-sl]") && el.getBoundingClientRect().bottom > pane.top + 2,
      )!;
      return {
        editorLine,
        from: Number(leaf.getAttribute("data-sl")),
        to: Number(leaf.getAttribute("data-el")),
      };
    }, lines);
  const aligned = async () => {
    const t = await tops();
    // the preview's top block holds the editor's top line, give or take the blank lines between blocks
    expect(t.from - 2).toBeLessThanOrEqual(t.editorLine);
    expect(t.editorLine).toBeLessThanOrEqual(t.to + 2);
  };

  for (const frac of [0.15, 0.4, 0.65, 0.9]) {
    await page.locator(".cm-scroller").evaluate((el, f) => {
      el.scrollTop = f * (el.scrollHeight - el.clientHeight);
    }, frac);
    await page.waitForTimeout(300);
    await aligned();
  }
  for (const frac of [0.2, 0.5, 0.8]) {
    await page.locator(".md-preview").evaluate((el, f) => {
      const pane = el.parentElement!;
      pane.scrollTop = f * (pane.scrollHeight - pane.clientHeight);
    }, frac);
    await page.waitForTimeout(300);
    await aligned();
  }

  // at the very bottom of one, the other is at the bottom too
  await page.locator(".cm-scroller").evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(300);
  const atEnd = await page.locator(".md-preview").evaluate((el) => {
    const pane = el.parentElement!;
    return pane.scrollHeight - pane.clientHeight - pane.scrollTop;
  });
  expect(atEnd).toBeLessThan(3);
});

async function openRules(page: Page) {
  const rules = page.getByRole("button", { name: "Rules" });
  // the Checks panel is closed on narrower screens, and its button also closes it
  await rules.waitFor({ state: "visible", timeout: 1000 }).catch(async () => {
    await page.getByRole("button", { name: "Checks" }).click();
  });
  await rules.click();
  return page.getByRole("dialog", { name: "Checker rules" });
}
const issueButtons = (page: Page) => page.locator("button", { hasText: /^L\d+/ });

test("checker rules: switch a built-in rule off and change another's severity", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, "see [[Page]] and <b>bold</b>");
  await page.getByRole("button", { name: "Checks" }).click();
  await expect(page.getByText("[[Wiki links]] only work")).toBeVisible();

  const dialog = await openRules(page);
  await dialog.getByRole("switch", { name: "Report [[Wiki link]]", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("[[Wiki links]] only work")).toBeHidden();
  await expect(page.getByText("Raw HTML is stripped").first()).toBeVisible();

  // the choice is kept across a reload
  await page.reload();
  const again = await openRules(page);
  await expect(
    again.getByRole("switch", { name: "Report [[Wiki link]]", exact: true }),
  ).not.toBeChecked();
  await expect(again.getByText("1 setting changed from the defaults")).toBeVisible();
  await again.getByRole("button", { name: "Reset to defaults" }).click();
  await again.getByRole("button", { name: "Click again to reset" }).click();
  await expect(again.getByText("Using the defaults")).toBeVisible();
  await expect(
    again.getByRole("switch", { name: "Report [[Wiki link]]", exact: true }),
  ).toBeChecked();
});

test("checker rules: a publication standard with limits you set", async ({ page }) => {
  await open(page);
  await replaceText(page, "---\ntitle: A rather long title for a post\n---\n\nbody text");
  await stored(page, "A rather long title");
  const dialog = await openRules(page);
  await dialog.getByRole("tab", { name: "Standards" }).click();
  await dialog.getByRole("switch", { name: "Check title length" }).click();
  await dialog.getByLabel("At most").fill("10");
  await page.keyboard.press("Escape");

  const issue = page.getByRole("button", { name: /The title is 30 characters; the limit is 10/ });
  await expect(issue).toBeVisible();
  await expect(issue).toContainText("standard · title-length");
  await issue.click();
  await expect(page.locator(".cm-activeLine")).toHaveText("title: A rather long title for a post");
});

test("checker rules: your own rules, with a message and the matched text", async ({ page }) => {
  await open(page);
  await replaceText(page, "ship it\n\nwrite the TODO here\n\n```\nTODO in code is ignored\n```");
  const dialog = await openRules(page);
  await dialog.getByRole("tab", { name: "Your rules" }).click();
  await dialog.getByRole("button", { name: "Add a rule" }).click();

  // a pattern that isn't valid is explained, not saved
  await dialog.getByLabel("Name").fill("TODO markers");
  await dialog.getByRole("switch", { name: "Regular expression" }).click();
  await dialog.getByLabel("Pattern (regular expression)").fill("(");
  await dialog.getByLabel("Message").fill("Finish {match} before publishing");
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await expect(dialog.getByRole("alert")).toContainText("isn't a valid pattern");
  await dialog.getByLabel("Pattern (regular expression)").fill("\\bTODO\\b");
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await expect(dialog.getByText("/\\bTODO\\b/ · todo-markers")).toBeVisible();

  await page.keyboard.press("Escape");
  const issue = page.getByRole("button", { name: /Finish TODO before publishing/ });
  await expect(issue).toBeVisible();
  await expect(issue).toContainText("yours · todo-markers");
  await expect(issueButtons(page).filter({ hasText: "Finish" })).toHaveCount(1); // the one in code is skipped
  await issue.click();
  await expect(page.locator(".cm-activeLine")).toHaveText("write the TODO here");

  // edit, switch off, delete
  const again = await openRules(page);
  await again.getByRole("tab", { name: "Your rules" }).click();
  await again.getByRole("switch", { name: "Use TODO markers" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Finish TODO/ })).toBeHidden();
  const third = await openRules(page);
  await third.getByRole("tab", { name: "Your rules" }).click();
  await third.getByRole("button", { name: "Delete TODO markers" }).click();
  await expect(third.getByText("No rules yet.")).toBeVisible();
});

test("checker rules: a draft changes them from its front matter", async ({ page }) => {
  await open(page);
  await replaceText(page, "write the TODO here and [[a link]]");
  const dialog = await openRules(page);
  await dialog.getByRole("tab", { name: "Your rules" }).click();
  await dialog.getByRole("button", { name: "Add a rule" }).click();
  await dialog.getByLabel("Name").fill("todo");
  await dialog.getByLabel("Text to find").fill("TODO");
  await dialog.getByLabel("Message").fill("Finish it");
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Finish it/ })).toBeVisible();

  await replaceText(
    page,
    "---\ntitle: T\nchecks:\n  todo: false\n  wiki-link: error\n  mystery: false\n---\n\nwrite the TODO here and [[a link]]",
  );
  await expect(page.getByRole("button", { name: /Finish it/ })).toBeHidden();
  await expect(page.getByRole("button", { name: /Wiki links/ })).toBeVisible();
  await expect(page.getByText('Unknown check "mystery".')).toBeVisible();
});

test("checker rules: export, reset and import a rules file", async ({ page }) => {
  await open(page);
  const dialog = await openRules(page);
  await dialog.getByRole("switch", { name: "Report [[Wiki link]]", exact: true }).click();
  await dialog.getByRole("tab", { name: "Standards" }).click();
  await dialog.getByRole("switch", { name: "Check number of tags" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("mdstudio-check-rules.json");
  const text = readFileSync((await download.path())!, "utf8");
  const parsed = JSON.parse(text);
  expect(parsed.builtin["wiki-link"]).toEqual({ enabled: false });
  expect(parsed.standards["tag-count"].enabled).toBe(true);

  await dialog.getByRole("button", { name: "Reset to defaults" }).click();
  await dialog.getByRole("button", { name: "Click again to reset" }).click();
  await expect(dialog.getByText("Using the defaults")).toBeVisible();

  await dialog.getByLabel("Import rules file").setInputFiles({
    name: "rules.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(page.getByText("Rules imported")).toBeVisible();
  await expect(dialog.getByText("2 settings changed from the defaults")).toBeVisible();

  await dialog.getByLabel("Import rules file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  await expect(page.getByText("That isn't valid JSON.")).toBeVisible();
});

test("export: a plain .md that points at local images warns, the self-contained one does not", async ({
  page,
}) => {
  await open(page);
  await replaceText(page, "# Pictures\n\n");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
  await expect(editor(page)).toContainText("./images/photo.png");

  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download .md" }).click();
  await download;
  await expect(
    page.getByText("1 image points to files that only exist in this draft"),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Export" }).click();
  const self = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download self-contained .md" }).click();
  await self;
});

test("the editor header shows the release next to the logo", async ({ page }) => {
  await open(page);
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  await expect(page.getByLabel(`Version ${version}`)).toHaveText(`v${version}`);
});

test("focus mode is a toolbar button right after redo, not in the header", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("banner").getByRole("button", { name: "Focus mode" })).toHaveCount(0);

  const toolbar = page.getByRole("toolbar");
  const buttons = toolbar.getByRole("button");
  await expect(buttons.nth(0)).toHaveAccessibleName(/^Undo/);
  await expect(buttons.nth(1)).toHaveAccessibleName(/^Redo/);
  const focus = buttons.nth(2);
  await expect(focus).toHaveAccessibleName("Focus mode");
  await expect(focus).toHaveAttribute("aria-pressed", "false");

  const drafts = page.getByRole("navigation", { name: "Drafts" });
  await expect(drafts).toBeVisible();
  await focus.click();
  await expect(focus).toHaveAttribute("aria-pressed", "true");
  await expect(drafts).toBeHidden();
  await focus.click();
  await expect(focus).toHaveAttribute("aria-pressed", "false");
  await expect(drafts).toBeVisible();
});

test("in focus mode the drafts button opens the list as a panel and focus mode stays on", async ({
  page,
}) => {
  await open(page);
  const focus = page.getByRole("toolbar").getByRole("button", { name: "Focus mode" });
  const toggle = page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Drafts" });
  const sidebar = page.getByRole("complementary").getByRole("navigation", { name: "Drafts" });

  // normal mode: the button still opens and closes the sidebar in place
  await expect(sidebar).toBeVisible();
  await toggle.click();
  await expect(sidebar).toBeHidden();
  await toggle.click();
  await expect(sidebar).toBeVisible();

  await focus.click();
  await expect(sidebar).toBeHidden();
  await toggle.click();
  const panel = page.getByRole("dialog", { name: "Your drafts" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("navigation", { name: "Drafts" })).toBeVisible();

  // Escape closes it, focus mode is still on, and the cursor goes back to the writing
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(focus).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page)).toBeFocused();

  // choosing something in it (here a new draft) closes it and focus mode stays on
  await toggle.click();
  await panel.getByRole("button", { name: "New draft" }).click();
  await expect(panel).toBeHidden();
  await expect(focus).toHaveAttribute("aria-pressed", "true");
  await expect(sidebar).toBeHidden();

  // leaving focus mode brings the sidebar back as it was, and the panel does not linger
  await focus.click();
  await expect(sidebar).toBeVisible();
  await expect(panel).toBeHidden();
});

test("in focus mode the panel buttons stay, and open their panel from the left", async ({
  page,
}) => {
  await open(page);
  const focus = page.getByRole("toolbar").getByRole("button", { name: "Focus mode" });
  const rules = page.getByRole("button", { name: "Rules" }); // the Checks panel's own button

  // a panel docked beside the editor in normal mode
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await expect(rules).toBeVisible();

  // focus mode hides the docked panel, but not the buttons
  await focus.click();
  await expect(rules).toBeHidden();
  const history = page.getByRole("button", { name: "History", exact: true });
  await expect(history).toBeVisible();

  // a button opens its panel as an overlay; Esc closes it and the cursor returns to the editor
  await history.click();
  const panel = page.getByRole("dialog", { name: /history/i });
  await expect(panel.getByRole("button", { name: "Save a version now" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(focus).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page)).toBeFocused();

  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /outline/i })).toBeVisible();
  await page.keyboard.press("Escape");

  // leaving focus mode closes any overlay and brings the docked panel back as it was
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /checks/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await focus.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rules).toBeVisible();
});

test("on a phone the panel bar stays in focus mode too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const focus = page.getByRole("toolbar").getByRole("button", { name: "Focus mode" });
  await focus.click();
  await expect(focus).toHaveAttribute("aria-pressed", "true");

  const bar = page.getByRole("navigation", { name: "Document panels" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "History", exact: true }).click();
  const panel = page.getByRole("dialog", { name: /history/i });
  await expect(panel.getByRole("button", { name: "Save a version now" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(focus).toHaveAttribute("aria-pressed", "true");
});

test("one button for what leaves the studio: Export for a local draft, with the same menu", async ({
  page,
}) => {
  await open(page);
  // not in the cloud: Export, with no publishing section
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Download .md" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Publish to GitHub/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // the view switch and the target are in the first row, with the logo
  const bar = page.getByRole("banner");
  await expect(bar.getByRole("combobox", { name: "Target platform" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "preview view" })).toBeVisible();
});

test("the account sits in the side strip from 768px, and in the top bar on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const strip = page.getByRole("navigation", { name: "Panels", exact: true });
  const bar = page.getByRole("banner");
  await expect(strip.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Toggle drafts" })).toHaveCount(0);
  // a narrower window keeps the strip, with the search, theme and account in it
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(strip.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(strip.getByRole("button", { name: "Drafts" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Toggle drafts" })).toHaveCount(0);
  // only a phone drops the strip, and then the top bar has the account and the drafts toggle
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(strip).toBeHidden();
  await expect(bar.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Toggle drafts" })).toBeVisible();
});
