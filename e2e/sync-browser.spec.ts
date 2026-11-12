import { expect, test } from "@playwright/test";
import {
  account,
  cloudDocs,
  editor,
  nav,
  onServer,
  password,
  replaceText,
  skipPicker,
  toCloud,
  twoBrowsers,
} from "./sync-helpers";

test("nothing is uploaded until it is chosen, and the usage shows", async ({ browser }) => {
  const address = `choose-${Date.now()}@example.com`;
  const { a, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await expect(
    a.getByRole("heading", { name: "Choose what to store in your cloud" }),
  ).toBeVisible();
  await skipPicker(a);

  await replaceText(a, "# Private\n\nStays in this browser");
  await expect(a.getByTestId("cloud-usage")).toHaveText("Cloud: 0 of 5 drafts");
  await a.waitForTimeout(4500); // longer than the delay before a sync round
  expect(await cloudDocs(a)).toEqual([]);

  await toCloud(a, "Private");
  await expect(a.getByTestId("cloud-usage")).toHaveText("Cloud: 1 of 5 drafts");
  await onServer(a, "# Private\n\nStays in this browser");
  await expect(a.getByLabel("Stored in your cloud")).toBeVisible();
  for (const c of contexts) await c.close();
});

test("a cloud draft reaches another browser and edits follow; local drafts do not", async ({
  browser,
}) => {
  const address = `follow-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Travelled\n\nWritten in browser A");
  await toCloud(a, "Travelled");
  await onServer(a, "# Travelled\n\nWritten in browser A");

  await account(b, "Sign in", address);
  await skipPicker(b);
  await expect(nav(b).getByText("Travelled")).toBeVisible({ timeout: 20_000 });
  await nav(b).getByText("Travelled").click();
  await expect(editor(b)).toContainText("Written in browser A");

  // An edit in A reaches B while B has the draft open, without a reload.
  await replaceText(a, "# Travelled\n\nEdited in browser A");
  await onServer(a, "# Travelled\n\nEdited in browser A");
  // No focus or online nudge: it arrives over the real-time channel, far sooner than the
  // minute the timer would take.
  await expect(editor(b)).toContainText("Edited in browser A", { timeout: 8_000 });
  await expect(b.getByTestId("sync-status")).toHaveText("Synced");
  for (const c of contexts) await c.close();
});

test("the later edit wins and the replaced text stays in History", async ({ browser }) => {
  const address = `later-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Shared\n\nStart");
  await toCloud(a, "Shared");
  await onServer(a, "# Shared\n\nStart");
  await account(b, "Sign in", address);
  await skipPicker(b);
  await nav(b).getByText("Shared").first().click();
  await expect(editor(b)).toContainText("Start");

  // B edits while offline, then A edits later and syncs first.
  await contexts[1]!.setOffline(true);
  await replaceText(b, "# Shared\n\nEarlier edit on B");
  await a.waitForTimeout(50);
  await replaceText(a, "# Shared\n\nLater edit on A");
  await onServer(a, "# Shared\n\nLater edit on A");

  await contexts[1]!.setOffline(false);
  await b.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(editor(b)).toContainText("Later edit on A", { timeout: 30_000 });
  await expect(nav(b).getByText(/conflict/)).toHaveCount(0); // no clutter in the library
  await b.getByRole("button", { name: "History", exact: true }).click();
  // The replaced text is a version in History, and comparing shows exactly what changed.
  await b.getByRole("button", { name: /words/ }).first().click();
  const dialog = b.getByRole("dialog", { name: "Compare with the current draft" });
  await expect(dialog.getByLabel("Line differences")).toContainText("Earlier edit on B");
  await expect(dialog.getByLabel("Line differences")).toContainText("Later edit on A");
  for (const c of contexts) await c.close();
});

test("signing out takes cloud drafts off the device and signing in brings them back", async ({
  browser,
}) => {
  const address = `out-${Date.now()}@example.com`;
  const { a, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Cloudy\n\nLives in the cloud");
  await toCloud(a, "Cloudy");
  await onServer(a, "# Cloudy\n\nLives in the cloud");

  // a second draft that stays local
  await a.getByRole("button", { name: "New draft" }).click();
  await replaceText(a, "# Plain\n\nOnly on this device");
  await expect(nav(a).getByText("Plain")).toBeVisible();

  await a.getByRole("button", { name: `Account: ${address}` }).click();
  await a.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(a.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(nav(a).getByText("Cloudy")).toHaveCount(0);
  await expect(nav(a).getByText("Plain")).toBeVisible();

  // nothing of the cloud draft is left in the browser's storage
  const left = await a.evaluate(
    () =>
      new Promise<boolean>((res) => {
        const r = indexedDB.open("mdstudio-db");
        r.onsuccess = () => {
          const q = r.result.transaction("mdstudio-store").objectStore("mdstudio-store").getAll();
          q.onsuccess = () => res(JSON.stringify(q.result).includes("Lives in the cloud"));
        };
      }),
  );
  expect(left).toBe(false);

  await a.getByRole("button", { name: "Sign in", exact: true }).click();
  await a.getByLabel("Email").fill(address);
  await a.getByLabel("Password", { exact: true }).fill(password);
  await a.getByRole("button", { name: "Sign in", exact: true }).click();
  await skipPicker(a);
  await expect(nav(a).getByText("Cloudy")).toBeVisible({ timeout: 20_000 });
  for (const c of contexts) await c.close();
});

test("signing in on a machine with no drafts replaces the example with the cloud's drafts", async ({
  browser,
}) => {
  const address = `example-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Waiting\n\nFrom the cloud");
  await toCloud(a, "Waiting");
  await onServer(a, "# Waiting\n\nFrom the cloud");

  // B has only the example, which was never stored
  await b.goto("/editor");
  await expect(b).toHaveURL(/\/editor\/new$/);
  await expect(editor(b)).toContainText("Writing portable Markdown");
  await b.getByRole("button", { name: "Sign in", exact: true }).click();
  await b.getByLabel("Email").fill(address);
  await b.getByLabel("Password", { exact: true }).fill(password);
  await b.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(editor(b)).toContainText("From the cloud", { timeout: 30_000 });
  await expect(editor(b)).not.toContainText("Writing portable Markdown");
  await expect(b).not.toHaveURL(/\/editor\/new$/);
  for (const c of contexts) await c.close();
});
