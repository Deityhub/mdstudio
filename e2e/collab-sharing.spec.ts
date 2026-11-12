import { expect, test } from "@playwright/test";
import { shared, startAndInvite, status, twoPeople } from "./collab-people";
import { editor, nav } from "./sync-helpers";
import { makeAdmin, signUp } from "./admin-helpers";

// Editing together, from the owner's Share-like dialog to the invited person's library, in two real
// browsers: invite, open from "Shared with you", type together, be removed, leave.

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
