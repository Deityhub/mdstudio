import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.locator(".cm-content");
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("mdstudio-db");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("mdstudio-store")) return resolve(0);
          const all = db.transaction("mdstudio-store").objectStore("mdstudio-store").getAllKeys();
          all.onsuccess = () =>
            resolve(all.result.filter((k) => String(k).startsWith("doc:")).length);
        };
      }),
  );

test("a first visit shows the example without saving it", async ({ page }) => {
  await page.goto("/editor");
  await expect(page).toHaveURL(/\/editor\/new$/);
  await expect(editor(page)).toContainText("Writing portable Markdown");
  await page.waitForTimeout(1200); // longer than the autosave delay
  expect(await stored(page)).toBe(0);
  // the library has nothing in it: the example is not a draft
  await page.reload();
  await expect(editor(page)).toContainText("Writing portable Markdown");
  expect(await stored(page)).toBe(0);
});

test("the example becomes a draft on the first edit, and survives a reload", async ({ page }) => {
  await page.goto("/editor");
  await expect(editor(page)).toContainText("Writing portable Markdown");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type("my own words ");
  await expect(page).toHaveURL(/\/editor\/(?!new)[\w-]+$/);
  await expect.poll(() => stored(page)).toBe(1);
  await page.reload();
  await expect(editor(page)).toContainText("my own words");
  expect(await stored(page)).toBe(1);
});

test("typing is not lost while the example turns into a draft", async ({ page }) => {
  await page.goto("/editor");
  await expect(editor(page)).toContainText("Writing portable Markdown");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" one two three four five six seven eight nine ten", { delay: 60 });
  await expect(editor(page)).toContainText("nine ten");
  await page.waitForTimeout(800);
  await expect(editor(page)).toContainText("one two three four five six seven eight nine ten");
});

test("with a draft on the machine, the example is not shown", async ({ page }) => {
  await page.goto("/editor");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("# Mine\n\nreal text");
  await expect.poll(() => stored(page)).toBe(1);
  await page.goto("/editor");
  await expect(page).not.toHaveURL(/\/editor\/new$/);
  await expect(editor(page)).toContainText("real text");
  await expect(editor(page)).not.toContainText("Writing portable Markdown");
});

test("deleting the last draft leaves a blank editor, also after a reload", async ({ page }) => {
  await page.goto("/editor");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText("# Only one");
  await expect.poll(() => stored(page)).toBe(1);
  await page
    .getByRole("button", { name: /Options for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(page).toHaveURL(/\/editor\/new$/);
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).not.toContainText("Writing portable Markdown");
  await expect(editor(page)).not.toContainText("Only one");
  await page.waitForTimeout(1200);
  expect(await stored(page)).toBe(0);

  // reloading, or coming back later, is the same: the example is only for a first visit
  await page.reload();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).not.toContainText("Writing portable Markdown");
  await page.goto("/editor");
  await expect(page).toHaveURL(/\/editor\/new$/);
  await expect(editor(page)).not.toContainText("Writing portable Markdown");
  expect(await stored(page)).toBe(0);

  // typing into it starts a draft, as it does with the example
  await editor(page).click();
  await page.keyboard.type("Back again");
  await expect(page).toHaveURL(/\/editor\/(?!new)[\w-]+$/);
  await expect.poll(() => stored(page)).toBe(1);
  await page.reload();
  await expect(editor(page)).toContainText("Back again");
});

test("a blank editor does not turn into a draft until something is typed", async ({ page }) => {
  await page.goto("/editor");
  await editor(page).click();
  await page.keyboard.insertText("# Gone soon");
  await expect.poll(() => stored(page)).toBe(1);
  await page
    .getByRole("button", { name: /Options for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(page).toHaveURL(/\/editor\/new$/);
  await page.waitForTimeout(1200);
  expect(await stored(page)).toBe(0);
  await expect(page.getByRole("navigation", { name: "Drafts" })).not.toContainText("Untitled");
});

test("New draft leaves the example behind and starts empty", async ({ page }) => {
  await page.goto("/editor");
  await expect(editor(page)).toContainText("Writing portable Markdown");
  await page.getByRole("button", { name: "New draft" }).click();
  await expect(page).toHaveURL(/\/editor\/(?!new)[\w-]+$/);
  await expect(editor(page)).not.toContainText("Writing portable Markdown");
  expect(await stored(page)).toBe(1);
});

test("every enabled button shows a pointer, a disabled one does not", async ({ page }) => {
  await page.goto("/editor");
  await expect(editor(page)).toBeVisible();
  const cursors = await page.evaluate(() =>
    [...document.querySelectorAll("button, [role=tab], [role=button]")].map((el) => ({
      label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || "?",
      disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true",
      cursor: getComputedStyle(el).cursor,
    })),
  );
  expect(cursors.length).toBeGreaterThan(10);
  for (const c of cursors.filter((c) => !c.disabled))
    expect(c, c.label).toMatchObject({ cursor: "pointer" });
  for (const c of cursors.filter((c) => c.disabled)) expect(c.cursor, c.label).not.toBe("pointer");
});

const missing = (page: Page) => page.getByText("This draft doesn't exist in this browser.");
async function deleteOpenDraft(page: Page) {
  await page
    .getByRole("button", { name: /Options for/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete draft" }).click();
}

test("deleting the open draft switches to the first one left, never to a missing page", async ({
  page,
}) => {
  await page.goto("/editor");
  await editor(page).click();
  await page.keyboard.insertText("# First kept");
  await expect.poll(() => stored(page)).toBe(1);
  await page.getByRole("button", { name: "New draft" }).click();
  await editor(page).click();
  await page.keyboard.insertText("# Second doomed");
  await expect.poll(() => stored(page)).toBe(2);
  const doomed = page.url();

  await deleteOpenDraft(page);
  await expect(editor(page)).toContainText("First kept");
  await expect(page).not.toHaveURL(doomed);
  await expect(missing(page)).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(await stored(page)).toBe(1); // the deleted draft was not saved again

  // going back must not land on the deleted address either
  await page.goBack();
  await expect(missing(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(doomed);
});

test("deleting right after typing does not bring the draft back", async ({ page }) => {
  await page.goto("/editor");
  await editor(page).click();
  await page.keyboard.insertText("# Keeper");
  await expect.poll(() => stored(page)).toBe(1);
  await page.getByRole("button", { name: "New draft" }).click();
  await editor(page).click();
  await page.keyboard.insertText("# Typed then deleted");
  // no wait: the autosave is still pending when it is deleted
  await deleteOpenDraft(page);
  await expect(editor(page)).toContainText("Keeper");
  await page.waitForTimeout(1500);
  expect(await stored(page)).toBe(1);
  await expect(missing(page)).toHaveCount(0);
});

test("menu items show a pointer too", async ({ page }) => {
  await page.goto("/editor");
  await editor(page).click();
  await page.keyboard.insertText("# For the menu");
  await expect.poll(() => stored(page)).toBe(1);
  await page
    .getByRole("button", { name: /Options for/ })
    .first()
    .click();
  const items = page.getByRole("menuitem");
  await expect(items.first()).toBeVisible();
  const cursors = await items.evaluateAll((els) =>
    els.map((el) => ({
      label: el.textContent?.trim(),
      disabled: el.hasAttribute("data-disabled"),
      cursor: getComputedStyle(el).cursor,
    })),
  );
  expect(cursors.length).toBeGreaterThan(3);
  for (const c of cursors.filter((c) => !c.disabled))
    expect(c, c.label).toMatchObject({ cursor: "pointer" });
  for (const c of cursors.filter((c) => c.disabled)) expect(c.cursor, c.label).not.toBe("pointer");
});
