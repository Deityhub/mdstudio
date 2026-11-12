import { expect, test, type Browser, type Page } from "@playwright/test";
import { account, editor, nav, onServer, replaceText, skipPicker, toCloud } from "./sync-helpers";
import { makeAdmin, signUp } from "./admin-helpers";

// Editing together, from the owner's Share-like dialog to the invited person's library, in two real
// browsers: invite, open from "Shared with you", type together, be removed, leave.

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const status = (page: Page) => page.getByTestId("collab-status");
const shared = (page: Page) => page.getByRole("region", { name: "Shared with you" });

async function twoPeople(browser: Browser) {
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

async function openDialog(a: Page) {
  await a.getByRole("button", { name: "Options for Notes" }).click();
  await a.getByRole("menuitem", { name: "Edit together…" }).click();
  return a.getByRole("dialog", { name: "Edit together" });
}

async function startAndInvite(a: Page, address: string) {
  const dialog = await openDialog(a);
  await dialog.getByRole("button", { name: "Start editing together" }).click();
  await dialog.getByLabel("Invite by email").fill(address);
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(dialog.getByRole("list", { name: "People who can edit" })).toContainText(address);
  return dialog;
}

test("an invited person finds the draft under Shared with you and edits it together with the owner", async ({
  browser,
}) => {
  const { a, b, contexts, beaAddress } = await twoPeople(browser);
  await startAndInvite(a, beaAddress);
  await a.keyboard.press("Escape");
  await expect(status(a)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(a.getByLabel("Edited together with other people")).toBeVisible();

  await b.reload();
  await expect(shared(b).getByRole("button", { name: /^Notes/ })).toBeVisible({ timeout: 15_000 });
  await shared(b)
    .getByRole("button", { name: /^Notes/ })
    .click();
  await expect(status(b)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(editor(b)).toContainText("Start");

  await editor(b).click();
  await b.keyboard.press("ControlOrMeta+End");
  await b.keyboard.insertText("\n\nBea was here");
  await expect(editor(a)).toContainText("Bea was here");
  await editor(a).click();
  await a.keyboard.press("ControlOrMeta+End");
  await a.keyboard.insertText("\n\nOwner too");
  await expect(editor(b)).toContainText("Owner too");
  await expect(b.getByTestId("collab-peers")).toBeVisible();
  // the shared draft is Bea's to read and edit, but it is not in her own list of drafts
  await expect(nav(b).getByText("Notes")).toHaveCount(0);
  for (const c of contexts) await c.close();
});

test("when the owner removes someone, the draft stays on their device as an ordinary draft", async ({
  browser,
}) => {
  const { a, b, contexts, beaAddress } = await twoPeople(browser);
  const dialog = await startAndInvite(a, beaAddress);
  await b.reload();
  await shared(b)
    .getByRole("button", { name: /^Notes/ })
    .click();
  await expect(status(b)).toHaveText(/Live/, { timeout: 15_000 });

  await dialog.getByRole("button", { name: `Remove ${beaAddress}` }).click();
  await expect(dialog.getByText("No one yet")).toBeVisible();

  await expect(b.getByText("You can no longer edit “Notes”")).toBeVisible({ timeout: 15_000 });
  await expect(status(b)).toHaveCount(0);
  await expect(shared(b)).toHaveCount(0);
  await expect(editor(b)).toContainText("Start"); // her copy is still there
  await expect(nav(b).getByText("Notes")).toBeVisible(); // as a draft of her own
  for (const c of contexts) await c.close();
});

test("someone can leave a draft they were invited to, and the owner sees it", async ({
  browser,
}) => {
  const { a, b, contexts, beaAddress, draft } = await twoPeople(browser);
  await startAndInvite(a, beaAddress);
  await b.reload();
  await shared(b)
    .getByRole("button", { name: /^Notes/ })
    .click();
  await expect(status(b)).toHaveText(/Live/, { timeout: 15_000 });

  await shared(b).getByRole("button", { name: "Leave Notes" }).click();
  await b.getByRole("button", { name: "Leave draft" }).click();
  await expect(shared(b)).toHaveCount(0);
  const state = await (await a.request.get(`/api/collab/${draft}`)).json();
  expect(state.editors).toEqual([]);
  for (const c of contexts) await c.close();
});

test("the admin sees live editing in the overview and has a switch for it", async ({ page }) => {
  const admin = await signUp(page.request);
  makeAdmin(admin.address);
  await page.goto("/admin");
  await expect(page.getByText("Edited together", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Server" }).click();
  await expect(page.getByRole("switch", { name: /Editing together is open/ })).toBeChecked();
});

test("signing out takes a shared draft, and what the browser kept of its room, off the device", async ({
  browser,
}) => {
  const { a, b, contexts, beaAddress } = await twoPeople(browser);
  await startAndInvite(a, beaAddress);
  await b.reload();
  await shared(b)
    .getByRole("button", { name: /^Notes/ })
    .click();
  await expect(status(b)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(editor(b)).toContainText("Start");
  await b.waitForTimeout(2600); // kept on the device a couple of seconds after the text arrives

  await b.getByRole("button", { name: `Account: ${beaAddress}` }).click();
  await b.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(b.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  const left = await b.evaluate(
    () =>
      new Promise<string>((res) => {
        const r = indexedDB.open("mdstudio-db");
        r.onsuccess = () => {
          const q = r.result.transaction("mdstudio-store").objectStore("mdstudio-store");
          const keys = q.getAllKeys();
          keys.onsuccess = () => res(JSON.stringify(keys.result));
        };
      }),
  );
  expect(left).not.toContain("ydoc:");
  expect(left).not.toContain("sh-");
  for (const c of contexts) await c.close();
});
