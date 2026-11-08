import { expect, type Page } from "@playwright/test";

/**
 * Opens the editor and makes the first edit, so there is a draft saved on the machine. The example
 * that opens on a first visit is not stored until it is changed, and signing in offers the stored
 * drafts for the cloud.
 */
export async function startDraft(page: Page) {
  await page.goto("/editor");
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type(" ");
  await expect(page).toHaveURL(/\/editor\/(?!new)[\w-]+$/);
}

export const password = "a long enough password";
const editor = (page: Page) => page.locator(".cm-content");

export async function signIn(page: Page) {
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
export async function replaceText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}
/** Writes a draft, puts it in the cloud and waits until it has reached the server. */
export async function cloudDraft(page: Page, title: string, body = "first version") {
  await replaceText(page, `# ${title}\n\n${body}`);
  await page.getByRole("button", { name: `Options for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Save to cloud" }).click();
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 20_000 });
}
export const openShare = async (page: Page, title: string) => {
  await page.getByRole("button", { name: `Options for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Share…" }).click();
  return page.getByRole("dialog", { name: "Share" });
};
