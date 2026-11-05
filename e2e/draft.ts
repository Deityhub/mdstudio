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
