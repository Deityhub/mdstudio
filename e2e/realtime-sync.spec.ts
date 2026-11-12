import { expect, test } from "@playwright/test";
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
