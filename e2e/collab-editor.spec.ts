import { expect, test, type Page } from "@playwright/test";
import {
  type Account,
  Collab,
  account as personAccount,
  invite,
  serverDoc,
  startLive,
  textOf,
} from "./collab-helpers";
import { networkSwitch } from "./collab-people";
import { account, editor, onServer, replaceText, skipPicker, toCloud } from "./sync-helpers";

// The live editor in a real browser: the owner's page on one side, a Yjs client (another person)
// on a real socket on the other. The network is cut and restored by holding the page's room socket.

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Signs the owner in on a page with one cloud draft; the owner is also usable where an account is. */
async function ownerWithDraft(page: Page, text = "# Notes\n\nStart") {
  await account(page, "Create account", `owner-${stamp()}@example.com`);
  await skipPicker(page);
  await replaceText(page, text);
  await toCloud(page, "Notes");
  await onServer(page, text);
  const draft = new URL(page.url()).pathname.split("/").pop()!;
  const me = (await (await page.request.get("/api/auth/me")).json()).user as { id: string };
  const owner = { request: page.request, id: me.id, base: "http://localhost:4173" } as Account;
  return { owner, draft };
}

const status = (page: Page) => page.getByTestId("collab-status");

test("a draft shared for editing opens live, and another person's typing arrives as they type", async ({
  page,
  playwright,
}) => {
  test.setTimeout(90_000); // the saved copy on the server is refreshed 30 seconds after the last edit
  const { owner, draft } = await ownerWithDraft(page);
  const bea = await personAccount(playwright, "bea");
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(editor(page)).toContainText("Start"); // the text was not doubled by joining

  const b = new Collab(owner, draft, bea);
  expect(await b.opened).toBe(true);
  await expect.poll(() => textOf(b)).toBe("# Notes\n\nStart");
  await expect(page.getByTestId("collab-peers")).toBeVisible();

  b.insert(b.text.length, "\n\nBea was here");
  await expect(editor(page)).toContainText("Bea was here");

  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nOwner too");
  await expect.poll(() => textOf(b)).toContain("Owner too");
  // the saved copy on the server follows, without anyone asking
  await expect
    .poll(async () => (await serverDoc(owner, draft)).content, { timeout: 45_000 })
    .toContain("Owner too");
  b.close();
});

test("edits made while offline are kept, and merge with the others' when the network returns", async ({
  page,
  playwright,
}) => {
  const { owner, draft } = await ownerWithDraft(page, "# Notes\n\none two three");
  const bea = await personAccount(playwright, "bea");
  const net = await networkSwitch(page);
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  const b = new Collab(owner, draft, bea);
  await b.opened;
  await expect.poll(() => textOf(b)).toContain("one two three");

  net.cut();
  await expect(status(page)).toHaveText(/Offline/);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" (typed offline)");
  b.insert(b.text.length, " (typed by Bea)");
  await expect(editor(page)).toContainText("typed offline"); // still editable

  await net.restore();
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  await expect(editor(page)).toContainText("typed by Bea");
  await expect.poll(() => textOf(b)).toContain("typed offline");
  expect(textOf(b)).toContain("typed by Bea");
  b.close();
});

test("a reload while offline keeps what was typed, and it reaches the others afterwards", async ({
  page,
  playwright,
}) => {
  const { owner, draft } = await ownerWithDraft(page);
  const bea = await personAccount(playwright, "bea");
  const net = await networkSwitch(page);
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  const b = new Collab(owner, draft, bea);
  await b.opened;

  net.cut();
  await expect(status(page)).toHaveText(/Offline/);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nwritten on the train");
  await page.waitForTimeout(2600); // kept on the device a couple of seconds after typing stops

  await page.reload();
  // still cut: the draft opens from what this browser kept, editable, saying it is offline
  await expect(editor(page)).toContainText("written on the train");
  await expect(status(page)).toHaveText(/Offline/);

  await net.restore();
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  await expect.poll(() => textOf(b)).toContain("written on the train");
  expect(textOf(b)).toContain("Start"); // not doubled by the merge
  expect(textOf(b).match(/Start/g)).toHaveLength(1);
  b.close();
});

test("a draft that is not live has no live status, and stopping live editing returns to ordinary sync", async ({
  page,
  playwright,
}) => {
  test.setTimeout(60_000); // the page learns of the stop through a sync round, slower on a busy machine
  const { owner, draft } = await ownerWithDraft(page);
  await expect(status(page)).toHaveCount(0);
  const bea = await personAccount(playwright, "bea");
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  const b = new Collab(owner, draft, bea);
  await b.opened;
  b.insert(b.text.length, "\n\nfrom Bea");
  await expect(editor(page)).toContainText("from Bea");

  expect((await owner.request.delete(`/api/collab/${draft}`)).ok()).toBe(true);
  await expect(status(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(editor(page)).toContainText("from Bea"); // the room's last text stays

  // from now on an edit goes to the cloud as before
  await replaceText(page, "# Notes\n\nordinary again");
  await onServer(page, "# Notes\n\nordinary again");
  expect((await serverDoc(owner, draft)).collab).toBe(false);
});

test("a reader of the preview sees a live draft follow the others while the editor is hidden", async ({
  page,
  playwright,
}) => {
  const { owner, draft } = await ownerWithDraft(page);
  const bea = await personAccount(playwright, "bea");
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  const b = new Collab(owner, draft, bea);
  await b.opened;
  await page.getByRole("button", { name: "preview view" }).click();
  await expect(editor(page)).toHaveCount(0);
  b.insert(b.text.length, "\n\nSeen in the preview");
  await expect(page.locator(".md-preview")).toContainText("Seen in the preview");
  b.close();
});

test("Undo takes back only the person's own edit, never what others typed", async ({
  page,
  playwright,
}) => {
  const { owner, draft } = await ownerWithDraft(page, "# Notes\n\nStart");
  const bea = await personAccount(playwright, "bea");
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  await expect(status(page)).toHaveText(/Live/, { timeout: 15_000 });
  const b = new Collab(owner, draft, bea);
  await b.opened;

  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" mine");
  await expect.poll(() => textOf(b)).toContain("mine");
  b.insert(0, "Bea: "); // after the owner's edit
  await expect(editor(page)).toContainText("Bea: ");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor(page)).not.toContainText("mine");
  await expect(editor(page)).toContainText("Bea: # Notes"); // hers stays
  await expect.poll(() => textOf(b)).toBe("Bea: # Notes\n\nStart");
  b.close();
});
