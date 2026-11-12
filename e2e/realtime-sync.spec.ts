import { expect, test, type Page } from "@playwright/test";
import { makeAdmin, signUp } from "./admin-helpers";
import {
  account,
  editor,
  nav,
  onServer,
  replaceText,
  skipPicker,
  toCloud,
  twoBrowsers,
} from "./sync-helpers";

// Cloud drafts and sessions over the real-time channel (src/lib/realtime, src/server/realtime).
// The timer poll is a minute, so anything that arrives within seconds did not wait for it.

test("a new draft and its edits appear on another device within seconds, with no nudge", async ({
  browser,
}) => {
  const address = `live-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await skipPicker(a);
  await account(b, "Sign in", address);
  await skipPicker(b);

  // B is already signed in and listening when A puts a draft in the cloud
  await replaceText(a, "# Live\n\nFrom A");
  await toCloud(a, "Live");
  await onServer(a, "# Live\n\nFrom A");
  await expect(nav(b).getByText("Live")).toBeVisible({ timeout: 8_000 });
  await nav(b).getByText("Live").click();
  await expect(editor(b)).toContainText("From A");

  await replaceText(a, "# Live\n\nEdited by A");
  await expect(editor(b)).toContainText("Edited by A", { timeout: 8_000 });

  // and back the other way
  await replaceText(b, "# Live\n\nAnd by B");
  await expect(editor(a)).toContainText("And by B", { timeout: 8_000 });
  for (const c of contexts) await c.close();
});

test("a draft deleted on one device leaves the other at once", async ({ browser }) => {
  const address = `gone-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Short lived\n\nText");
  await toCloud(a, "Short lived");
  await onServer(a, "# Short lived\n\nText");
  await account(b, "Sign in", address);
  await skipPicker(b);
  await expect(nav(b).getByText("Short lived")).toBeVisible({ timeout: 20_000 });

  await a.getByRole("button", { name: "Options for Short lived" }).click();
  await a.getByRole("menuitem", { name: "Delete" }).click();
  await a.getByRole("button", { name: "Delete draft" }).click();
  await expect(nav(b).getByText("Short lived")).toHaveCount(0, { timeout: 8_000 });
  for (const c of contexts) await c.close();
});

test("signing out in one tab signs the other tab of that browser out too", async ({ browser }) => {
  const address = `bye-${Date.now()}@example.com`;
  const context = await browser.newContext();
  const first = await context.newPage();
  await account(first, "Create account", address);
  await skipPicker(first);
  const second = await context.newPage();
  await second.goto("/editor");
  await expect(second.getByRole("button", { name: `Account: ${address}` })).toBeVisible();

  await first.getByRole("button", { name: `Account: ${address}` }).click();
  await first.getByRole("menuitem", { name: "Sign out" }).click();
  // the second tab shares the cookie that just ended; it hears about it instead of waiting
  await expect(second.getByRole("button", { name: "Sign in", exact: true })).toBeVisible({
    timeout: 8_000,
  });
  await context.close();
});

test("an admin suspending an account closes its open sessions at once", async ({
  browser,
  playwright,
  baseURL,
}) => {
  const address = `susp-${Date.now()}@example.com`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await account(page, "Create account", address);
  await skipPicker(page);
  const { id } = await (await page.request.get("/api/auth/me")).json().then((m) => m.user);

  const admin = await playwright.request.newContext({ baseURL: baseURL! });
  makeAdmin((await signUp(admin)).address);
  const res = await admin.patch(`/api/admin/users/${id}`, { data: { suspended: true } });
  expect(res.status()).toBe(200);

  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible({
    timeout: 8_000,
  });
  await context.close();
});

test("sync still works when the socket cannot connect, by the old nudges", async ({ browser }) => {
  const address = `nosocket-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  // B's socket is refused, as behind a proxy that drops upgrades
  await b.routeWebSocket(/\/api\/realtime/, (ws) => void ws.close({ code: 1011 }));
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Fallback\n\nFrom A");
  await toCloud(a, "Fallback");
  await onServer(a, "# Fallback\n\nFrom A");
  await account(b, "Sign in", address);
  await skipPicker(b);
  await expect(nav(b).getByText("Fallback")).toBeVisible({ timeout: 20_000 });
  await nav(b).getByText("Fallback").click();

  await replaceText(a, "# Fallback\n\nEdited");
  await onServer(a, "# Fallback\n\nEdited");
  await b.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(editor(b)).toContainText("Edited", { timeout: 30_000 });
  for (const c of contexts) await c.close();
});

/** Counts the pulls a page makes, from now on. */
function countPulls(page: Page) {
  let n = 0;
  page.on("request", (r) => void (r.url().includes("/api/sync/pull") && n++));
  return () => n;
}

test("with the socket up, nothing pulls: not for a change elsewhere, a local edit, focus or coming online", async ({
  browser,
}) => {
  const address = `quiet-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Quiet\n\nFrom A");
  await toCloud(a, "Quiet");
  await onServer(a, "# Quiet\n\nFrom A");

  const pulls = countPulls(b);
  await account(b, "Sign in", address);
  await skipPicker(b);
  await expect(nav(b).getByText("Quiet")).toBeVisible({ timeout: 20_000 });
  await nav(b).getByText("Quiet").click();
  await b.waitForTimeout(2500); // let the socket become ready and the first round finish
  const settled = pulls();
  expect(settled, "one pull to start, and no more once the socket is up").toBe(1);

  await replaceText(a, "# Quiet\n\nEdited by A");
  await expect(editor(b)).toContainText("Edited by A", { timeout: 8_000 }); // by the socket
  await replaceText(b, "# Quiet\n\nEdited by B"); // a push, which must not pull first
  await onServer(b, "# Quiet\n\nEdited by B");
  for (const event of ["focus", "online"])
    await b.evaluate((name) => window.dispatchEvent(new Event(name)), event);
  await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await b.waitForTimeout(4000);
  expect(pulls()).toBe(settled);
  for (const c of contexts) await c.close();
});

test("after the socket drops, one pull catches up on what was missed when it comes back", async ({
  browser,
}) => {
  const address = `catchup-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  const live: { close: (o: { code: number }) => Promise<void> }[] = [];
  let blocked = false;
  await b.routeWebSocket(/\/api\/realtime/, (ws) => {
    if (blocked) return void ws.close({ code: 1011 });
    ws.connectToServer();
    live.push(ws);
  });
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Catch up\n\nStart");
  await toCloud(a, "Catch up");
  await onServer(a, "# Catch up\n\nStart");
  const pulls = countPulls(b);
  await account(b, "Sign in", address);
  await skipPicker(b);
  await nav(b).getByText("Catch up").click();
  await expect(editor(b)).toContainText("Start", { timeout: 20_000 });
  await b.waitForTimeout(4500); // longer than the wait before a round, so none is still pending
  const settled = pulls();
  expect(live).toHaveLength(1);

  // B loses its connection, and A edits meanwhile
  blocked = true;
  await live[0]!.close({ code: 1006 });
  await replaceText(a, "# Catch up\n\nWritten while B was cut off");
  await onServer(a, "# Catch up\n\nWritten while B was cut off");
  await expect(editor(b)).not.toContainText("cut off");
  expect(pulls()).toBe(settled); // being cut off pulls nothing by itself

  // it comes back, and one pull brings B up to date
  blocked = false;
  await expect(editor(b)).toContainText("Written while B was cut off", { timeout: 30_000 });
  await b.waitForTimeout(3000);
  expect(pulls()).toBe(settled + 1);
  for (const c of contexts) await c.close();
});

test("a draft too big for the channel is a hint, and costs one pull", async ({ browser }) => {
  const address = `big-${Date.now()}@example.com`;
  const { a, b, contexts } = await twoBrowsers(browser);
  await account(a, "Create account", address);
  await skipPicker(a);
  await replaceText(a, "# Big\n\nSmall for now");
  await toCloud(a, "Big");
  await onServer(a, "# Big\n\nSmall for now");
  const pulls = countPulls(b);
  await account(b, "Sign in", address);
  await skipPicker(b);
  await nav(b).getByText("Big").click();
  await expect(editor(b)).toContainText("Small for now", { timeout: 20_000 });
  await b.waitForTimeout(2500);
  const settled = pulls();

  // a 200 KB text, over the 128 KB the channel carries
  const mine = (await (await a.request.get("/api/sync/pull?since=0")).json()).docs[0];
  const text = `# Big\n\nHuge start\n\n${"word ".repeat(40_000)}`;
  const res = await a.request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: mine.id,
          baseVersion: mine.version,
          title: "Big",
          content: text,
          createdAt: mine.createdAt,
          editedAt: Date.now() + 1000,
        },
      ],
    },
  });
  expect(res.status()).toBe(200);
  await expect(editor(b)).toContainText("Huge start", { timeout: 8_000 });
  await b.waitForTimeout(2000);
  expect(pulls()).toBe(settled + 1);
  for (const c of contexts) await c.close();
});

test("an admin raising an account's cloud limit shows in its open tab at once", async ({
  browser,
  playwright,
  baseURL,
}) => {
  const address = `limit-${Date.now()}@example.com`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await account(page, "Create account", address);
  await skipPicker(page);
  await expect(page.getByTestId("cloud-usage")).toHaveText("Cloud: 0 of 5 drafts");
  await page.waitForTimeout(2500); // the socket is up, so only an event can change it now
  const { id } = await (await page.request.get("/api/auth/me")).json().then((m) => m.user);

  const admin = await playwright.request.newContext({ baseURL: baseURL! });
  makeAdmin((await signUp(admin)).address);
  const res = await admin.patch(`/api/admin/users/${id}`, { data: { limits: { cloud_docs: 8 } } });
  expect(res.status()).toBe(200);
  await expect(page.getByTestId("cloud-usage")).toHaveText("Cloud: 0 of 8 drafts", {
    timeout: 8_000,
  });
  await context.close();
});
