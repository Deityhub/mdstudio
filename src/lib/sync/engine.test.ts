// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import type { Db } from "@/server/db";
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
  const deps = {
    userId,
    store,
    meta,
    api: { ...real, ...api },
    isBusy: (id: string) => busy.has(id),
    snapshot: async (d: MdDocument) => void kept.push(d),
  };
  const run = () => syncOnce(deps);
  /** What the real-time channel does when another device's change arrives. */
  const pushed = (docs: ServerDoc[]) => applyPushed(deps, docs);
  const link = (...ids: string[]) => linkDrafts(meta, ids);
  return { kv, store, meta, run, pushed, busy, kept, link };
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
