import { expect, test } from "@playwright/test";
import { makeMailAdmin } from "./admin-helpers";
import {
  Collab,
  account,
  cloudDraft,
  invite,
  serverDoc,
  startLive,
  textOf,
  unique,
} from "./collab-helpers";

// Live editing against the self-hosted server: the HTTP routes, the room door, and Yjs clients on
// real sockets. The editor itself comes in a later unit; these are what the editor will talk to.

test("people invited to a draft edit it together and end up with the same text", async ({
  playwright,
}) => {
  const owner = await account(playwright, "owner");
  const bea = await account(playwright, "bea");
  const draft = await cloudDraft(owner, "# Notes\n\nStart");
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);

  const a = new Collab(owner, draft, owner);
  const b = new Collab(owner, draft, bea);
  expect(await a.opened).toBe(true);
  expect(await b.opened).toBe(true);
  await expect.poll(() => textOf(a)).toBe("# Notes\n\nStart"); // seeded once, not doubled
  await expect.poll(() => textOf(b)).toBe("# Notes\n\nStart");

  a.insert(0, "A: ");
  b.insert(b.text.length, "\nB was here");
  await expect.poll(() => textOf(a)).toContain("B was here");
  await expect.poll(() => textOf(b)).toContain("A: ");
  expect(textOf(a)).toBe(textOf(b));
  a.close();
  b.close();
});

test("someone offline for a while merges back in without losing either side", async ({
  playwright,
}) => {
  const owner = await account(playwright, "owner");
  const bea = await account(playwright, "bea");
  const draft = await cloudDraft(owner, "one\ntwo\nthree");
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  const a = new Collab(owner, draft, owner);
  const b = new Collab(owner, draft, bea);
  await expect.poll(() => textOf(b)).toBe("one\ntwo\nthree");

  // B loses its connection; both keep editing; B comes back with the document it kept
  b.close();
  await b.closed;
  a.insert(0, "from A. ");
  b.insert(b.text.length, "\nfrom B while offline");
  await expect.poll(() => textOf(a)).toContain("from A. ");
  expect(textOf(b)).not.toContain("from A. ");
  const again = new Collab(owner, draft, bea, { doc: b.doc });
  await expect.poll(() => textOf(again)).toContain("from A. ");
  await expect.poll(() => textOf(a)).toContain("from B while offline");
  expect(textOf(again)).toBe(textOf(a));
  a.close();
  again.close();
});

test("the text copy on the server is refreshed from the room, and a device cannot overwrite a live draft", async ({
  playwright,
}) => {
  const owner = await account(playwright, "owner");
  const bea = await account(playwright, "bea");
  const draft = await cloudDraft(owner, "# Notes\n\nStart");
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  const b = new Collab(owner, draft, bea);
  await expect.poll(() => textOf(b)).toBe("# Notes\n\nStart");
  b.insert(b.text.length, "\n\nWritten live");
  await expect
    .poll(async () =>
      (await bea.request.post(`/api/collab/doc/${owner.id}/${draft}/flush`)).status(),
    )
    .toBe(200);
  await expect
    .poll(async () => (await serverDoc(owner, draft)).content, { timeout: 10_000 })
    .toContain("Written live");
  const copy = await serverDoc(owner, draft);
  expect(copy.collab).toBe(true);

  // a device pushing its own text is refused and told the draft is live
  const push = await owner.request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: `${owner.id}:${draft}`,
          baseVersion: copy.version,
          title: "Notes",
          content: "# stale device",
          createdAt: 1,
          editedAt: Date.now() + 5000,
        },
      ],
    },
  });
  expect((await push.json()).results[0]).toMatchObject({ status: "collab" });
  expect((await serverDoc(owner, draft)).content).toContain("Written live");
  b.close();
});

test("a person who was not invited, or was removed, cannot be in the room", async ({
  playwright,
}) => {
  const owner = await account(playwright, "owner");
  const bea = await account(playwright, "bea");
  const stranger = await account(playwright, "stranger");
  const draft = await cloudDraft(owner);
  await startLive(owner, draft);
  const editors = await invite(owner, draft, bea.email);

  expect(await new Collab(owner, draft, stranger).opened).toBe(false);
  const b = new Collab(owner, draft, bea);
  expect(await b.opened).toBe(true);
  await expect.poll(() => textOf(b)).toContain("Start");

  const removed = await owner.request.delete(`/api/collab/${draft}/editors/${editors[0]!.id}`);
  expect(removed.status()).toBe(200);
  expect(await b.closed).toBe(4005); // ended at once, not at the next reconnect
  expect(await new Collab(owner, draft, bea).opened).toBe(false);
  // and it is gone from their list
  expect((await (await bea.request.get("/api/collab")).json()).drafts).toEqual([]);
});

test("shared drafts are listed for the person invited, who can leave", async ({ playwright }) => {
  const owner = await account(playwright, "owner");
  const bea = await account(playwright, "bea");
  const draft = await cloudDraft(owner);
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  const { drafts } = await (await bea.request.get("/api/collab")).json();
  expect(drafts).toEqual([
    {
      ownerId: owner.id,
      id: draft,
      title: "Notes",
      ownerName: null,
      updatedAt: expect.any(Number),
    },
  ]);
  expect((await bea.request.delete(`/api/collab/doc/${owner.id}/${draft}`)).status()).toBe(200);
  expect((await (await bea.request.get("/api/collab")).json()).drafts).toEqual([]);
});

test("stopping returns the draft to ordinary sync with the room's last text, and lets everyone go", async ({
  playwright,
}) => {
  const owner = await account(playwright, "owner");
  const bea = await account(playwright, "bea");
  const draft = await cloudDraft(owner, "# Notes\n\nStart");
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  const b = new Collab(owner, draft, bea);
  await expect.poll(() => textOf(b)).toContain("Start");
  b.insert(b.text.length, "\n\nLast words");
  await expect.poll(() => textOf(b)).toContain("Last words");

  expect((await owner.request.delete(`/api/collab/${draft}`)).status()).toBe(200);
  expect(await b.closed).toBe(4005);
  const copy = await serverDoc(owner, draft);
  expect(copy.collab).toBe(false);
  await expect.poll(async () => (await serverDoc(owner, draft)).content).toContain("Last words");
  expect(await new Collab(owner, draft, bea).opened).toBe(false);
  // and it can be pushed again from a device
  const state = await (await owner.request.get(`/api/collab/${draft}`)).json();
  expect(state.live).toBe(false);
});

test("deleting a live draft ends its room", async ({ playwright }) => {
  const owner = await account(playwright, "owner");
  const bea = await account(playwright, "bea");
  const draft = await cloudDraft(owner);
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  const b = new Collab(owner, draft, bea);
  await expect.poll(() => textOf(b)).toContain("Start");
  const copy = await serverDoc(owner, draft);
  await owner.request.post("/api/sync/push", {
    data: {
      docs: [
        {
          id: `${owner.id}:${draft}`,
          baseVersion: copy.version,
          title: "",
          content: "",
          createdAt: 0,
          editedAt: Date.now(),
          deleted: true,
        },
      ],
    },
  });
  expect(await b.closed).toBe(4005);
  expect((await (await bea.request.get("/api/collab")).json()).drafts).toEqual([]);
});

test("the room keeps its text when everyone has left", async ({ playwright }) => {
  const owner = await account(playwright, "owner");
  const draft = await cloudDraft(owner, "# Notes");
  await startLive(owner, draft);
  const a = new Collab(owner, draft, owner);
  await expect.poll(() => textOf(a)).toBe("# Notes");
  a.insert(a.text.length, "\n\nKept");
  await expect.poll(() => textOf(a)).toContain("Kept");
  await new Promise((r) => setTimeout(r, 300));
  a.close();
  await a.closed;
  await new Promise((r) => setTimeout(r, 500));
  const again = new Collab(owner, draft, owner);
  await expect.poll(() => textOf(again)).toBe("# Notes\n\nKept");
  again.close();
});

test("limits: people per draft and live drafts per account", async ({ playwright }) => {
  const owner = await account(playwright, "owner");
  const first = await cloudDraft(owner);
  const second = await cloudDraft(owner);
  const third = await cloudDraft(owner);
  await startLive(owner, first);
  await startLive(owner, second);
  const over = await owner.request.post(`/api/collab/${third}`);
  expect(over.status()).toBe(403);
  expect((await over.json()).error).toBe("limit_reached");

  // three people in a draft: the owner and two more, not a third
  await invite(owner, first, `x1-${unique()}@example.com`);
  await invite(owner, first, `x2-${unique()}@example.com`);
  const full = await owner.request.post(`/api/collab/${first}/editors`, {
    data: { email: `x3-${unique()}@example.com` },
  });
  expect(full.status()).toBe(403);
});

// A server-wide switch is thrown on the server that sends mail, which no other spec's live drafts use.
test("the admin's kill switch closes new rooms and new connections", async ({ playwright }) => {
  const owner = await account(playwright, "owner", true);
  const draft = await cloudDraft(owner);
  await startLive(owner, draft);
  expect(await new Collab(owner, draft, owner).opened).toBe(true);

  const admin = await account(playwright, "admin", true);
  makeMailAdmin(admin.email);
  const set = (open: boolean) =>
    admin.request.patch("/api/admin/settings", { data: { collabOpen: open } });
  expect((await set(false)).status()).toBe(200);
  try {
    const refused = new Collab(owner, draft, owner);
    expect(await refused.opened).toBe(false);
    const other = await cloudDraft(owner);
    const blocked = await owner.request.post(`/api/collab/${other}`);
    expect((await blocked.json()).error).toBe("collab_closed");
  } finally {
    await set(true);
  }
  expect(await new Collab(owner, draft, owner).opened).toBe(true);
});

test("only the owner may manage a draft, and a plain request to the room is refused", async ({
  playwright,
}) => {
  const owner = await account(playwright, "owner");
  const bea = await account(playwright, "bea");
  const draft = await cloudDraft(owner);
  await startLive(owner, draft);
  await invite(owner, draft, bea.email);
  // the invited person has no draft of that id of their own to manage
  expect(
    (
      await bea.request.post(`/api/collab/${draft}/editors`, { data: { email: "x@example.com" } })
    ).status(),
  ).toBe(404);
  expect((await bea.request.delete(`/api/collab/${draft}`)).status()).toBe(404);
  expect((await bea.request.post(`/api/collab/${draft}`)).status()).toBe(404);
  const signedOut = await playwright.request.newContext({ baseURL: "http://localhost:4173" });
  expect((await signedOut.get("/api/collab")).status()).toBe(401);
});
