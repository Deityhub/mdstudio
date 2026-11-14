import { expect, test, type Page } from "@playwright/test";
import { replaceText, startDraft } from "./draft";

const palette = (page: Page) => page.getByRole("dialog", { name: "Search" });
const search = async (page: Page, text: string) => {
  await palette(page).getByRole("combobox", { name: "Search" }).fill(text);
};

/** Two drafts: the second open, the first holding a rare word on its line 9. */
async function twoDrafts(page: Page) {
  await startDraft(page);
  const body = [
    "# Mission log",
    "",
    "Day one.",
    "",
    "Day two.",
    "",
    "Day three.",
    "",
    "The zebrafish swam past.",
  ];
  await replaceText(page, body.join("\n"));
  const first = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "New draft" }).first().click();
  await expect(page).not.toHaveURL(first);
  await replaceText(page, "# Shopping\n\nmilk");
  return first;
}

test("finds a word inside another draft and opens it at that line", async ({ page }) => {
  const first = await twoDrafts(page);
  await page.locator("body").click({ position: { x: 5, y: 5 } }); // out of the editor text
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toBeVisible();
  await search(page, "zebrafish");
  const option = palette(page).getByRole("option", { name: /Mission log/ });
  await expect(option).toContainText("The zebrafish swam past.");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeHidden();
  await expect(page).toHaveURL(first);
  await expect(page.locator(".cm-activeLine")).toContainText("zebrafish");
});

test("Ctrl/⌘ K inside the editor text stays Link; Ctrl/⌘ Shift P opens search there", async ({
  page,
}) => {
  await startDraft(page);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toBeHidden();
  await page.keyboard.press("Escape");
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Shift+p");
  await expect(palette(page)).toBeVisible();
});

test("runs an editor command and goes to a setting", async ({ page }) => {
  await startDraft(page);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await search(page, "insert table");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /table/i })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await search(page, "target platform");
  await palette(page)
    .getByRole("option", { name: /Target platform/ })
    .click();
  await expect(page).toHaveURL(/\/settings\?tab=editor/);
});

test("works on other pages but not on the home page", async ({ page }) => {
  await page.goto("/guides");
  // a server-rendered page: the button works once the page has hydrated
  await expect(async () => {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(palette(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
  await search(page, "privacy");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/privacy/);

  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
});
