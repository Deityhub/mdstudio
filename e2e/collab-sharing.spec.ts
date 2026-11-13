import { expect, test } from "@playwright/test";
import { shared, startAndInvite, status, twoPeople } from "./collab-people";
import { editor, nav } from "./sync-helpers";
import { makeAdmin, signUp } from "./admin-helpers";
import { account as person, cloudDraft, invite, startLive } from "./collab-helpers";
import { account as mailPerson } from "./review-helpers";
import { SITE, linkIn, mailTo } from "./mail-server";
import { password } from "./sync-helpers";

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

test("an invitation shows up for the invited person at once, and so does a removal, with no reload", async ({
  browser,
}) => {
  const { a, b, contexts, beaAddress } = await twoPeople(browser);
  await expect(shared(b)).toHaveCount(0);
  const dialog = await startAndInvite(a, beaAddress);
  // Bea did nothing: the list is read again when the event reaches her studio
  await expect(shared(b).getByRole("button", { name: /^Notes/ })).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: `Remove ${beaAddress}` }).click();
  await expect(shared(b)).toHaveCount(0, { timeout: 10_000 });
  for (const c of contexts) await c.close();
});

test("the draft link opens the draft after signing in with the invited address, and only for them", async ({
  browser,
  playwright,
}) => {
  const owner = await person(playwright, "owner");
  const draft = await cloudDraft(owner, "# Notes\n\nStart");
  await startLive(owner, draft);
  const beaAddress = `bea-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await invite(owner, draft, beaAddress);
  const state = await (await owner.request.get(`/api/collab/${draft}`)).json();
  const path = new URL(state.link).pathname;
  expect(path).toMatch(/^\/c\/[A-Za-z0-9_-]{10,16}$/);
  expect(path).not.toContain(owner.id);

  // signed out: the page asks for a sign-in, and carries on to the draft afterwards
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(path);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(beaAddress);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/editor\/sh-/, { timeout: 20_000 });
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(editor(page)).toContainText("Start");

  // someone who was not invited is told the same as for a wrong address
  const stranger = await ctx.browser()!.newContext();
  const other = await stranger.newPage();
  await other.goto("/");
  await other.request.post("/api/auth/signup", {
    data: { email: `cy-${Date.now()}@example.com`, password },
  });
  await other.goto(path);
  await expect(other.getByRole("heading", { name: "You can't open this draft" })).toBeVisible();
  await other.goto("/c/NoSuchLink12");
  await expect(other.getByRole("heading", { name: "You can't open this draft" })).toBeVisible();
  await ctx.close();
  await stranger.close();
});

test("the invitation email links straight to the draft", async ({ playwright }) => {
  const owner = await mailPerson(playwright, "owner");
  const bea = await mailPerson(playwright, "bea");
  const draft = `d${Math.random().toString(36).slice(2, 8)}`;
  await owner.request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: `${owner.id}:${draft}`,
          baseVersion: 0,
          title: "Quarterly plan",
          content: "# Quarterly plan",
          createdAt: Date.now(),
          editedAt: Date.now(),
        },
      ],
    },
  });
  expect((await owner.request.post(`/api/collab/${draft}`)).ok()).toBe(true);
  expect(
    (await owner.request.post(`/api/collab/${draft}/editors`, { data: { email: bea.email } })).ok(),
  ).toBe(true);
  const mail = await mailTo(bea.email, /invited you to edit/);
  const link = linkIn(mail);
  expect(link.origin).toBe(new URL(SITE).origin);
  expect(link.pathname).toMatch(/^\/c\/[A-Za-z0-9_-]{10,16}$/);
  expect(mail.text).not.toContain(owner.id);
  // the same address opens it for the invited person, and not for the owner's other accounts
  const found = await bea.request.get(link.pathname.replace("/c/", "/api/collab/link/"));
  expect(found.status()).toBe(200);
  expect((await found.json()).title).toBe("Quarterly plan");
  const anon = await playwright.request.newContext({ baseURL: SITE });
  expect((await anon.get(link.pathname.replace("/c/", "/api/collab/link/"))).status()).toBe(401);
});

test("the owner opening the draft link lands on their own draft, not a second copy", async ({
  browser,
}) => {
  const { a, b, contexts, beaAddress, draft } = await twoPeople(browser);
  await startAndInvite(a, beaAddress);
  await a.keyboard.press("Escape");
  const { link } = await (await a.request.get(`/api/collab/${draft}`)).json();
  await a.goto(new URL(link).pathname);
  await expect(a).toHaveURL(new RegExp(`/editor/${draft}$`), { timeout: 15_000 });
  await expect(status(a)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(nav(a).getByText("Notes")).toHaveCount(1);
  await expect(shared(a)).toHaveCount(0);
  void b;
  for (const c of contexts) await c.close();
});
