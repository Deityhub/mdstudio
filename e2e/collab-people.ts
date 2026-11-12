import { expect, type Browser, type Page } from "@playwright/test";
import { account, onServer, replaceText, skipPicker, toCloud } from "./sync-helpers";

// Shared by the specs about editing together in two browsers: an owner with one cloud draft and
// an invited person with an account of their own.

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const status = (page: Page) => page.getByTestId("collab-status");
export const shared = (page: Page) => page.getByRole("region", { name: "Shared with you" });

export async function twoPeople(browser: Browser) {
  const ownerAddress = `owner-${stamp()}@example.com`;
  const beaAddress = `bea-${stamp()}@example.com`;
  const contexts = [await browser.newContext(), await browser.newContext()];
  const a = await contexts[0]!.newPage();
  const b = await contexts[1]!.newPage();
  // Bea has an account first, so the invitation finds her
  await account(b, "Create account", beaAddress);
  await skipPicker(b);
  await account(a, "Create account", ownerAddress);
  await skipPicker(a);
  await replaceText(a, "# Notes\n\nStart");
  await toCloud(a, "Notes");
  await onServer(a, "# Notes\n\nStart");
  const draft = new URL(a.url()).pathname.split("/").pop()!;
  return { a, b, contexts, beaAddress, draft };
}

export async function openDialog(a: Page) {
  await a.getByRole("button", { name: "Options for Notes" }).click();
  await a.getByRole("menuitem", { name: "Edit together…" }).click();
  return a.getByRole("dialog", { name: "Edit together" });
}

export async function startAndInvite(a: Page, address: string) {
  const dialog = await openDialog(a);
  await dialog.getByRole("button", { name: "Start editing together" }).click();
  await dialog.getByLabel("Invite by email").fill(address);
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "People who can edit" })).toContainText(address);
  return dialog;
}
