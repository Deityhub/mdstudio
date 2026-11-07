import { expect, test, type Browser, type Page } from "@playwright/test";
import { startDraft } from "./draft";

const password = "a long enough password";
const editor = (page: Page) => page.locator(".cm-content");

async function signIn(page: Page) {
  await startDraft(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await page
    .getByLabel("Email")
    .fill(`ui-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("button", { name: "Not now" }).click();
}
async function replaceText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}
/** Writes a draft, puts it in the cloud and waits until it has reached the server. */
async function cloudDraft(page: Page, title: string, body = "first version") {
  await replaceText(page, `# ${title}\n\n${body}`);
  await page.getByRole("button", { name: `Options for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Save to cloud" }).click();
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
}
const openShare = async (page: Page, title: string) => {
  await page.getByRole("button", { name: `Options for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Share…" }).click();
  return page.getByRole("dialog", { name: "Share" });
};
async function stranger(browser: Browser) {
  const context = await browser.newContext();
  return { page: await context.newPage(), close: () => context.close() };
}

test("a cloud draft is shared from its menu, read by a stranger, updated and stopped", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await cloudDraft(page, "Quarterly notes");
  const dialog = await openShare(page, "Quarterly notes");
  await expect(
    dialog.getByText("Anyone with the link can read the copy you publish"),
  ).toBeVisible();
  // the default is 4 days
  await expect(dialog.getByRole("combobox", { name: "Link lasts" })).toContainText("4 days");
  await dialog.getByRole("button", { name: "Publish" }).click();
  const link = dialog.getByRole("textbox", { name: "Public link" });
  await expect(link).toHaveValue(/\/s\/[\w-]{12}$/);
  await expect(dialog.getByText(/Available until/)).toBeVisible();
  const url = await link.inputValue();

  const { page: reader, close } = await stranger(browser);
  await reader.goto(url);
  await expect(reader.locator(".md-preview")).toContainText("first version");

  // edits stay private until the update is published
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await replaceText(page, "# Quarterly notes\n\nsecond version");
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
  await reader.reload();
  await expect(reader.locator(".md-preview")).toContainText("first version");

  const again = await openShare(page, "Quarterly notes");
  await expect(again.getByText("Your draft has changes that are not published")).toBeVisible();
  await again.getByRole("button", { name: "Publish update" }).click();
  await expect(again.getByText("Your draft has changes that are not published")).toBeHidden();
  await reader.reload();
  await expect(reader.locator(".md-preview")).toContainText("second version");

  // a different length
  await again.getByRole("combobox", { name: "Link lasts" }).click();
  await page.getByRole("option", { name: "2 days" }).click();
  await expect(again.getByText(/Available until/)).toBeVisible();

  await again.getByRole("button", { name: "Stop sharing" }).click();
  await expect(again.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  expect((await reader.goto(url))?.status()).toBe(404);
  await close();
});

test("the library marks shared drafts, and the header button belongs to cloud drafts", async ({
  page,
}) => {
  await signIn(page);
  await replaceText(page, "# Local only\n\nnot in the cloud");
  await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Options for Local only" }).click();
  await expect(page.getByRole("menuitem", { name: "Share…" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "New draft" }).click();
  await cloudDraft(page, "In the cloud");
  await expect(page.getByLabel("Shared publicly")).toHaveCount(0);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share" });
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect(dialog.getByRole("textbox", { name: "Public link" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByLabel("Shared publicly")).toBeVisible();
});

test("taking a draft out of the cloud also takes its public link down", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await cloudDraft(page, "Short lived");
  const dialog = await openShare(page, "Short lived");
  await dialog.getByRole("button", { name: "Publish" }).click();
  const url = await dialog.getByRole("textbox", { name: "Public link" }).inputValue();
  await dialog.getByRole("button", { name: "Close" }).first().click();

  await page.getByRole("button", { name: "Options for Short lived" }).click();
  await page.getByRole("menuitem", { name: "Remove from cloud" }).click();
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
  const { page: reader, close } = await stranger(browser);
  await expect.poll(async () => (await reader.goto(url))?.status(), { timeout: 20_000 }).toBe(404);
  await close();
});
