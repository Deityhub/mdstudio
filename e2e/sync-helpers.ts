import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { startDraft } from "./draft";

// Shared by the specs about cloud drafts: signing in, choosing drafts for the cloud, and two browsers.
export const password = "a long enough password";
export const editor = (page: Page) => page.locator(".cm-content");
export const nav = (page: Page) => page.getByRole("navigation", { name: "Drafts" });

export async function account(page: Page, mode: "Create account" | "Sign in", address: string) {
  await startDraft(page);
  await expect(editor(page)).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (mode === "Create account") await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: mode, exact: true }).click();
  // Signing in offers to pick drafts for the cloud (see skipPicker).
  await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
}

/** After signing in, the studio offers to pick drafts for the cloud; "Not now" leaves them all local. */
export async function skipPicker(page: Page) {
  await page.getByRole("button", { name: "Not now" }).click();
}

export async function replaceText(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}

/** Puts the open draft in the cloud through its library menu. */
export async function toCloud(page: Page, title: string) {
  await page.getByRole("button", { name: `Options for ${title}` }).click();
  await page.getByRole("menuitem", { name: "Save to cloud" }).click();
}

export const cloudDocs = async (page: Page) =>
  (await (await page.request.get("/api/sync/pull?since=0")).json()).docs as {
    content: string;
    deleted: boolean;
  }[];
export const onServer = (page: Page, text: string) =>
  expect
    .poll(async () => (await cloudDocs(page)).some((d) => d.content === text && !d.deleted), {
      timeout: 20_000,
    })
    .toBe(true);

export async function twoBrowsers(browser: Browser) {
  const contexts: BrowserContext[] = [await browser.newContext(), await browser.newContext()];
  return { a: await contexts[0]!.newPage(), b: await contexts[1]!.newPage(), contexts };
}
