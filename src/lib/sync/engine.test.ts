// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import type { Db } from "@/server/db";
import { applyCollabText, enableCollab, disableCollab } from "@/server/collab/service";
import { DEFAULT_REVISIONS } from "@/server/revisions/service";
import { pullDocs, pushDocs } from "@/server/sync/service";
import { createDocumentStore, type KeyValueStore, type MdDocument } from "../storage/documentStore";
import { checkSignOut, leaveAccount, linkDrafts, unlinkDraft } from "./cloud";
import { type SyncApi, applyPushed, syncOnce } from "./engine";
import { cloudOwners, createSyncMeta, isVisible } from "./meta";
import { type ServerDoc, fieldsHash, remoteId } from "./protocol";

// Two browsers sharing one account, talking to the real server logic over an in-memory database.
let db: Db;
let clock: number;
const U = "u1";
const LIMIT = 3;

const memoryKv = (): KeyValueStore => {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => data.get(k) as T | undefined,
    set: async (k, v) => void data.set(k, structuredClone(v)),
    del: async (k) => void data.delete(k),
    values: async <T>(p: string) =>
      [...data].filter(([k]) => k.startsWith(p)).map(([, v]) => v as T),
  };
};

function device(userId = U, api?: Partial<SyncApi>) {
  const kv = memoryKv();
  const store = createDocumentStore(kv);
  const meta = createSyncMeta(kv, userId);
  const real: SyncApi = {
    push: (docs) => pushDocs(db, userId, docs, ++clock, LIMIT),
    pull: async (since) => ({ ...(await pullDocs(db, userId, since)), limit: LIMIT }),
  };
  const busy = new Set<string>();
  const kept: MdDocument[] = [];
  const left: string[] = [];
  const pulls: number[] = [];
  const deps = {
    userId,
    store,
    meta,
    api: {
      ...real,
      pull: async (since: number) => (pulls.push(since), real.pull(since)),
      ...api,
    },
    isBusy: (id: string) => busy.has(id),
    snapshot: async (d: MdDocument) => void kept.push(d),
    onLeaveLive: async (id: string) => void left.push(id),
  };
  const run = (opts?: { pull?: boolean }) => syncOnce(deps, opts);
  /** What the real-time channel does when another device's change arrives. */
  const pushed = (docs: ServerDoc[]) => applyPushed(deps, docs);
  const link = (...ids: string[]) => linkDrafts(meta, ids);
  return { kv, store, meta, run, pushed, busy, kept, left, link, pulls };
}
type Device = ReturnType<typeof device>;

const doc = (id: string, over: Partial<MdDocument> = {}): MdDocument => ({
  id,
  title: "Hello",
  content: "# Hello",
  images: {},
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
const texts = async (d: Device) => (await d.store.list()).map((x) => x.content).sort();
const edit = async (d: Device, id: string, content: string, at: number) =>
  d.store.save({ ...(await d.store.get(id))!, content, updatedAt: at });
const cloud = async () => (await pullDocs(db, U, 0)).docs.filter((d) => !d.deleted);

/** One draft already in the cloud and on two devices. */
async function shared() {
  const a = device();
  const b = device();
  await a.store.save(doc("d1", { updatedAt: 100 }));
  await a.link("d1");
  await a.run();
  await b.run();
  return { a, b };
}

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  clock = 1_700_000_000_000;
  for (const id of [U, "u2"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: 1, updatedAt: 1 });
});

describe("only chosen drafts go to the cloud", () => {
  it("never uploads a draft the writer did not choose", async () => {
    const a = device();
    await a.store.save(doc("private"));
    await a.run();
    expect(await cloud()).toEqual([]);
    await a.link("private");
    await a.run();
    expect((await cloud()).map((d) => d.id)).toEqual([remoteId(U, "private")]);
  });

  it("downloads the account's drafts on another device, leaving that device's own drafts alone", async () => {
    const a = device();
    await a.store.save(
      doc("aaaa1111", { name: "Mine", folder: "Writing", images: { "p.png": "data:x" } }),
    );
    await a.link("aaaa1111");
    await a.run();

    const b = device();
    await b.store.save(doc("bbbb2222", { content: "# Only on B" }));
    await b.run();
    expect(await b.store.get("aaaa1111")).toMatchObject({
      name: "Mine",
      folder: "Writing",
      content: "# Hello",
      images: {},
    });
    expect(await b.store.folders.list()).toContain("Writing");
    expect(await cloud()).toHaveLength(1); // B's draft stayed on B
    expect(await a.store.get("bbbb2222")).toBeUndefined();
  });

  it("follows edits and deletes of cloud drafts, and does nothing when nothing changed", async () => {
    const { a, b } = await shared();
    await edit(a, "d1", "# Edited", 200);
    await a.run();
    await b.run();
    expect((await b.store.get("d1"))?.content).toBe("# Edited");

    const push = vi.fn(async () => []);
    const idle = await syncOnce({
      userId: U,
      store: a.store,
      meta: a.meta,
      api: { push, pull: (s) => pullDocs(db, U, s) },
    });
    expect(push).not.toHaveBeenCalled();
    expect(idle).toMatchObject({ pushed: 0, applied: [], removed: [] });

    await a.store.remove("d1");
    await a.run();
    await b.run();
    expect(await b.store.get("d1")).toBeUndefined();
  });

  it("keeps the local images when a cloud edit arrives", async () => {
    const { a, b } = await shared();
    await b.store.save({ ...(await b.store.get("d1"))!, images: { "mine.png": "data:y" } });
    await edit(a, "d1", "# From A", 200);
    await a.run();
    await b.run();
    expect(await b.store.get("d1")).toMatchObject({
      content: "# From A",
      images: { "mine.png": "data:y" },
    });
  });
});

describe("the later edit wins, and the other is kept in history", () => {
  it("replaces an older local edit with the cloud's newer one", async () => {
    const { a, b } = await shared();
    await edit(a, "d1", "# Edit on A", 300);
    await edit(b, "d1", "# Edit on B", 200);
    await a.run();
    const report = await b.run();
    expect((await b.store.get("d1"))?.content).toBe("# Edit on A");
    expect(report.replaced).toEqual(["d1"]);
    expect(b.kept.map((d) => d.content)).toEqual(["# Edit on B"]);
    expect(await texts(b)).toEqual(["# Edit on A"]); // no clutter in the library
  });

  it("lets a newer local edit replace the cloud's older one, which the other device keeps", async () => {
    const { a, b } = await shared();
    await edit(a, "d1", "# Edit on A", 200);
    await edit(b, "d1", "# Edit on B", 300);
    await a.run();
    await b.run();
    expect((await cloud())[0]?.content).toBe("# Edit on B");
    await a.run();
    expect((await a.store.get("d1"))?.content).toBe("# Edit on B");
    expect(a.kept.map((d) => d.content)).toEqual([]); // A had nothing unsynced to lose
  });

  it("does not call identical edits a conflict", async () => {
    const { a, b } = await shared();
    await edit(a, "d1", "# Same", 200);
    await edit(b, "d1", "# Same", 250);
    await a.run();
    const report = await b.run();
    expect(report.replaced).toEqual([]);
    expect(b.kept).toEqual([]);
  });

  it("an edit beats a delete: the draft stays on the device that edited it, out of the cloud", async () => {
    const { a, b } = await shared();
    await edit(b, "d1", "# Kept", 500);
    await a.store.remove("d1");
    await a.run();
    const report = await b.run();
    expect((await b.store.get("d1"))?.content).toBe("# Kept");
    expect(report.detached).toEqual(["d1"]);
    expect(await cloud()).toEqual([]);
    // It can be put back in the cloud afterwards.
    await b.link("d1");
    await b.run();
    expect((await cloud())[0]?.content).toBe("# Kept");
  });
});

describe("the cloud limit", () => {
  it("turns a draft away when the account is full, and it stays local", async () => {
    const a = device();
    for (const id of ["1", "2", "3", "4"]) await a.store.save(doc(id, { content: `# ${id}` }));
    await a.link("1", "2", "3", "4");
    const report = await a.run();
    expect(report.overLimit).toHaveLength(1);
    expect(report.limit).toBe(LIMIT);
    expect(await cloud()).toHaveLength(LIMIT);
    expect(await a.store.list()).toHaveLength(4);
    expect(await a.meta.linked()).toHaveLength(LIMIT);
  });
});

describe("leaving the cloud for one draft", () => {
  it("removes the cloud copy, keeps the local draft, and can bring it back", async () => {
    const { a, b } = await shared();
    await unlinkDraft(a.meta, "d1");
    const report = await a.run();
    expect(report.detached).toEqual(["d1"]);
    expect(await a.store.get("d1")).toBeDefined();
    expect(await cloud()).toEqual([]);
    await b.run();
    expect(await b.store.get("d1")).toBeUndefined();

    await a.link("d1");
    await a.run();
    expect(await cloud()).toHaveLength(1);
  });
});

describe("signing out", () => {
  it("removes cloud drafts from the browser, keeps the others, and signing in brings them back", async () => {
    const a = device();
    await a.store.save(doc("cloudy", { content: "# In the cloud" }));
    await a.store.save(doc("local", { content: "# Only here" }));
    await a.link("cloudy");
    await a.run();

    const check = await checkSignOut(a.store, a.meta, fieldsHash);
    expect(check).toEqual({ unsynced: [], withImages: [] });
    await leaveAccount(a.store, a.meta);
    expect(await texts(a)).toEqual(["# Only here"]);
    expect(await a.meta.list()).toEqual([]);

    await a.run(); // signing in again
    expect(await texts(a)).toEqual(["# In the cloud", "# Only here"]);
  });

  it("reports unsynced edits and images, and keeps the drafts it is told to keep", async () => {
    const a = device();
    await a.store.save(doc("pic", { images: { "a.png": "data:x" } }));
    await a.link("pic");
    await a.run();
    await edit(a, "pic", "# Unsynced", 999);
    expect(await checkSignOut(a.store, a.meta, fieldsHash)).toEqual({
      unsynced: ["pic"],
      withImages: ["pic"],
    });
    await leaveAccount(a.store, a.meta, { keep: new Set(["pic"]) });
    expect((await a.store.get("pic"))?.content).toBe("# Unsynced");
    expect(await a.meta.list()).toEqual([]);

    // Back in: the kept draft meets its cloud copy, and its newer text wins.
    await a.run();
    expect((await cloud())[0]?.content).toBe("# Unsynced");
    expect((await a.store.get("pic"))?.images).toEqual({ "a.png": "data:x" });
  });

  it("hides one account's cloud drafts from anyone else, and shows local drafts to all", async () => {
    const a = device();
    await a.store.save(doc("mine"));
    await a.store.save(doc("open"));
    await a.link("mine");
    await a.run();
    const owners = await cloudOwners(a.kv);
    expect(isVisible(owners, "mine", U)).toBe(true);
    expect(isVisible(owners, "mine", "u2")).toBe(false);
    expect(isVisible(owners, "mine", undefined)).toBe(false);
    expect(isVisible(owners, "open", undefined)).toBe(true);
  });
});

describe("accounts and failures", () => {
  it("keeps two accounts apart even when they pick the same draft id", async () => {
    const one = device(U);
    const two = device("u2");
    await one.store.save(doc("same0000", { content: "# One" }));
    await two.store.save(doc("same0000", { content: "# Two" }));
    await one.link("same0000");
    await two.link("same0000");
    await one.run();
    await two.run();
    expect(await texts(one)).toEqual(["# One"]);
    expect(await texts(two)).toEqual(["# Two"]);
  });

  it("leaves everything as it was when the server is unreachable, then catches up", async () => {
    let down = true;
    const a = device(U, {
      push: async (docs) => {
        if (down) throw new TypeError("offline");
        return pushDocs(db, U, docs, ++clock, LIMIT);
      },
    });
    await a.store.save(doc("d1"));
    await a.link("d1");
    await expect(a.run()).rejects.toThrow("offline");
    expect(await cloud()).toEqual([]);
    down = false;
    await a.run();
    expect(await cloud()).toHaveLength(1);
  });

  it("does not overwrite a draft with unsaved edits, and picks the change up later", async () => {
    const { a, b } = await shared();
    await edit(a, "d1", "# New from A", 200);
    await a.run();
    b.busy.add("d1");
    expect((await b.run()).deferred).toBe(1);
    expect((await b.store.get("d1"))?.content).toBe("# Hello");
    b.busy.delete("d1");
    await b.run();
    expect((await b.store.get("d1"))?.content).toBe("# New from A");
  });

  it("skips a draft too large to sync instead of failing the rest", async () => {
    const a = device();
    await a.store.save(doc("big", { content: "x".repeat(1_000_001) }));
    await a.store.save(doc("small"));
    await a.link("big", "small");
    const report = await a.run();
    expect(report.tooLarge).toEqual(["big"]);
    expect((await cloud()).map((d) => d.id)).toEqual([remoteId(U, "small")]);
  });
});

describe("a draft pushed over the real-time channel", () => {
  /** What the server has for a draft, as the channel would carry it. */
  const serverDoc = async (id = "d1") =>
    (await pullDocs(db, U, 0)).docs.find((d) => d.id === remoteId(U, id))!;

  it("is applied without a pull, and leaves the pull cursor where it was", async () => {
    const { a, b } = await shared();
    const cursor = await b.meta.cursor();
    await edit(a, "d1", "# Hello\n\nFrom A", 200);
    await a.run();
    const report = await b.pushed([await serverDoc()]);
    expect(report.applied).toEqual(["d1"]);
    expect(await texts(b)).toEqual(["# Hello\n\nFrom A"]);
    expect((await b.meta.get("d1"))?.version).toBe(2);
    expect(await b.meta.cursor()).toBe(cursor); // only a real pull moves it, so no gap can open
  });

  it("is harmless when it arrives twice, late, or as the sender's own echo", async () => {
    const { a, b } = await shared();
    await edit(a, "d1", "# v2", 200);
    await a.run();
    const v2 = await serverDoc();
    expect((await b.pushed([v2])).applied).toEqual(["d1"]);
    expect((await b.pushed([v2])).applied).toEqual([]); // twice
    expect((await b.pushed([{ ...v2, version: 1, content: "# old" }])).applied).toEqual([]); // late
    expect(await texts(b)).toEqual(["# v2"]);
    expect((await a.pushed([v2])).applied).toEqual([]); // the device that made it
  });

  it("waits while the draft has unsaved edits here, and a pull brings it in afterwards", async () => {
    const { a, b } = await shared();
    await edit(a, "d1", "# From A", 200);
    await a.run();
    b.busy.add("d1");
    const report = await b.pushed([await serverDoc()]);
    expect(report).toMatchObject({ applied: [], deferred: 1 });
    expect(await texts(b)).toEqual(["# Hello"]);
    b.busy.clear();
    await b.run();
    expect(await texts(b)).toEqual(["# From A"]);
  });

  it("keeps a later edit made here, and keeps the text it replaces in history when it loses", async () => {
    const { a, b } = await shared();
    const c = device();
    await c.run(); // c has version 1
    await edit(a, "d1", "# A's", 200);
    await a.run();
    await edit(b, "d1", "# B's, later", 300);
    await b.pushed([await serverDoc()]);
    expect(await texts(b)).toEqual(["# B's, later"]); // this device's edit is the later one

    await edit(c, "d1", "# C's, earlier", 150);
    await c.pushed([await serverDoc()]);
    expect(await texts(c)).toEqual(["# A's"]);
    expect(c.kept.map((d) => d.content)).toEqual(["# C's, earlier"]);
  });

  it("removes a draft deleted elsewhere", async () => {
    const { a, b } = await shared();
    await a.store.remove("d1");
    await a.run();
    const gone = await serverDoc();
    expect(gone.deleted).toBe(true);
    expect((await b.pushed([gone])).removed).toEqual(["d1"]);
    expect(await texts(b)).toEqual([]);
  });

  it("never removes a draft that has edits which were not synced", async () => {
    const { a, b } = await shared();
    await a.store.remove("d1");
    await a.run();
    await edit(b, "d1", "# kept", 999);
    expect((await b.pushed([await serverDoc()])).detached).toEqual(["d1"]);
    expect(await texts(b)).toEqual(["# kept"]);
  });

  it("ignores a document that is not this account's", async () => {
    const b = device();
    const stranger = { ...(await serverDocFor("u2", "x")), id: "u2:x" };
    expect((await b.pushed([stranger])).applied).toEqual([]);
    expect(await texts(b)).toEqual([]);
  });

  it("a missed event costs nothing: the next pull has it", async () => {
    const { a, b } = await shared();
    await edit(a, "d1", "# While offline", 200);
    await a.run(); // b never heard about it
    await b.run();
    expect(await texts(b)).toEqual(["# While offline"]);
  });
});

const serverDocFor = async (user: string, id: string): Promise<ServerDoc> => ({
  id: remoteId(user, id),
  version: 1,
  title: "x",
  name: null,
  folder: null,
  content: "x",
  createdAt: 1,
  updatedAt: 1,
  editedAt: 1,
  deleted: false,
});

describe("a round that does not pull (the real-time channel is up)", () => {
  it("pushes what changed here without asking the cloud for anything", async () => {
    const { a, b } = await shared();
    a.pulls.length = 0;
    await edit(a, "d1", "# From A", 200);
    const report = await a.run({ pull: false });
    expect(report.pushed).toBe(1);
    expect(a.pulls).toEqual([]);
    expect((await cloud())[0]?.content).toBe("# From A");
    await b.run();
    expect(await texts(b)).toEqual(["# From A"]);
  });

  it("still resolves a conflict from what the push answers, with no pull", async () => {
    const { a, b } = await shared();
    const c = device();
    await c.run(); // c has version 1, and will be behind
    await edit(a, "d1", "# A's, earlier", 200);
    await a.run();
    await edit(b, "d1", "# B's, later", 300);
    b.pulls.length = 0;
    await b.run({ pull: false }); // b is behind too, but its edit is the later one
    expect(b.pulls).toEqual([]);
    expect((await cloud())[0]?.content).toBe("# B's, later");

    await edit(c, "d1", "# C's, earliest", 100);
    c.pulls.length = 0;
    await c.run({ pull: false });
    expect(c.pulls).toEqual([]);
    expect(await texts(c)).toEqual(["# B's, later"]); // the server's copy came with the answer
  });

  it("pulls as always unless told not to", async () => {
    const { a } = await shared();
    a.pulls.length = 0;
    await a.run();
    expect(a.pulls.length).toBeGreaterThan(0);
  });
});

describe("a draft edited live with other people", () => {
  /** The owner switches the shared draft to live editing, and the room later writes a new text copy. */
  const goLive = async () => enableCollab(db, U, "d1", { docs: 2 }, ++clock);
  const roomWrites = (text: string) =>
    applyCollabText(db, remoteId(U, "d1"), text, ++clock, DEFAULT_REVISIONS);

  it("is marked live on a device that pulls, and its text is left to the room from then on", async () => {
    const { a, b } = await shared();
    await goLive();
    await b.run();
    expect((await b.meta.get("d1"))?.collab).toBe(true);
    // the room's later copies are not applied to this device's text, and a local edit is not pushed
    await roomWrites("# From the room");
    await edit(b, "d1", "# Typed here", 500);
    await b.run();
    expect((await b.store.get("d1"))?.content).toBe("# Typed here");
    expect((await cloud())[0]?.content).toBe("# From the room");
    expect((await b.meta.get("d1"))?.version).toBe((await cloud())[0]?.version);
    expect(b.pulls.length).toBeGreaterThan(0);
  });

  it("keeps unsynced text of this device in history when the draft goes live, and shows the cloud copy", async () => {
    const { a, b } = await shared();
    await edit(b, "d1", "# Edited offline", 400); // not pushed yet
    await goLive();
    await b.run();
    expect(b.kept.map((d) => d.content)).toEqual(["# Edited offline"]);
    expect((await b.store.get("d1"))?.content).toBe("# Hello");
    expect((await b.meta.get("d1"))?.collab).toBe(true);
    expect(a).toBeDefined();
  });

  it("is refused a push of its text, learns it is live, and loses nothing", async () => {
    const { a, b } = await shared();
    await goLive();
    // b has not heard yet, and pushes an edit: the cloud says it is live instead of taking it
    await edit(b, "d1", "# Stale device", 900);
    const report = await b.run({ pull: false });
    expect(report.rejected).toBe(0);
    expect((await b.meta.get("d1"))?.collab).toBe(true);
    expect(b.kept.map((d) => d.content)).toEqual(["# Stale device"]);
    expect((await cloud())[0]?.content).toBe("# Hello");
    void a;
  });

  it("is applied from the real-time channel the same way", async () => {
    const { b } = await shared();
    const live = await goLive();
    if (!live.ok) throw new Error("not live");
    await b.pushed([live.doc]);
    expect((await b.meta.get("d1"))?.collab).toBe(true);
  });

  it("returns to ordinary sync when live editing stops, taking the room's last text", async () => {
    const { b } = await shared();
    await goLive();
    await b.run();
    await roomWrites("# Final text");
    const stopped = await disableCollab(db, U, "d1", ++clock);
    expect(stopped?.collab).toBe(false);
    await edit(b, "d1", "# Mirror that lagged", 700);
    await b.run();
    expect((await b.store.get("d1"))?.content).toBe("# Final text");
    expect((await b.meta.get("d1"))?.collab).toBeUndefined();
    expect(b.left).toEqual(["d1"]);
    // and from now on an edit goes up as usual
    await edit(b, "d1", "# Normal again", 800);
    await b.run();
    expect((await cloud())[0]?.content).toBe("# Normal again");
  });

  it("keeps the name and folder given on this device when it goes live, and when it stops", async () => {
    const { b } = await shared();
    await b.store.save({
      ...(await b.store.get("d1"))!,
      name: "My name",
      folder: "Work",
      updatedAt: 150,
    });
    await goLive();
    await b.run();
    expect(await b.store.get("d1")).toMatchObject({ name: "My name", folder: "Work" });
    // renamed while live: that is not pushed (the room carries the text), but it is not lost either
    await b.store.save({ ...(await b.store.get("d1"))!, name: "Renamed live", updatedAt: 300 });
    await roomWrites("# Notes\n\nfrom the room");
    await b.run();
    expect((await b.store.get("d1"))?.name).toBe("Renamed live");
    await disableCollab(db, U, "d1", ++clock);
    await b.run();
    expect(await b.store.get("d1")).toMatchObject({
      name: "Renamed live",
      folder: "Work",
      content: "# Notes\n\nfrom the room",
    });
    // and now that it is ordinary again, the name goes up with the next round
    await b.run();
    expect((await cloud())[0]).toMatchObject({ name: "Renamed live", folder: "Work" });
  });

  it("is not counted as unsynced when signing out", async () => {
    const { b } = await shared();
    await goLive();
    await b.run();
    await edit(b, "d1", "# More typed", 600);
    const check = await checkSignOut(b.store, b.meta, fieldsHash);
    expect(check.unsynced).toEqual([]);
  });

  it("is told to the engine as gone when the owner deletes it elsewhere", async () => {
    const { a, b } = await shared();
    await goLive();
    await a.run();
    await b.run();
    await a.store.remove("d1");
    await a.run();
    await b.run();
    expect(b.left).toContain("d1");
  });
});
