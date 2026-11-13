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

/**
 * Holds the page's room socket: while cut it is refused, and an open one is dropped. With
 * `everything` the account's own channel is cut too, so nothing can be told to the page over a socket.
 */
export async function networkSwitch(page: Page, opts: { everything?: boolean } = {}) {
  let down = false;
  const open = new Set<{ drop: () => void }>();
  await page.routeWebSocket(opts.everything ? /\/api\/realtime/ : /topic=doc/, (ws) => {
    if (down) return void ws.close({ code: 1001 });
    const server = ws.connectToServer();
    const link = {
      // the connection is gone at both ends, as when a network vanishes
      drop: () => {
        ws.close({ code: 1001 });
        void server.close();
      },
    };
    open.add(link);
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(m));
    server.onClose((code) => {
      open.delete(link);
      ws.close({ code });
    });
  });
  return {
    cut() {
      down = true;
      for (const link of open) link.drop();
      open.clear();
    },
    async restore() {
      down = false;
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    },
  };
}
