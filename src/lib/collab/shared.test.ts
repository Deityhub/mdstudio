import { beforeEach, describe, expect, it } from "vitest";
import { type KeyValueStore, createDocumentStore } from "../storage/documentStore";
import { keptKey } from "./kept";
import {
  type SharedItem,
  detachShared,
  isMine,
  openShared,
  reconcileShared,
  removeShared,
  removeSharedFor,
  sharedLocalId,
} from "./shared";

const memoryKv = () => {
  const data = new Map<string, unknown>();
  const kv: KeyValueStore & { data: Map<string, unknown> } = {
    data,
    get: async <T>(k: string) => data.get(k) as T | undefined,
    set: async (k, v) => void data.set(k, structuredClone(v)),
    del: async (k) => void data.delete(k),
    values: async <T>(p: string) =>
      [...data].filter(([k]) => k.startsWith(p)).map(([, v]) => v as T),
  };
  return kv;
};

const OWNER = "0190f3a2-7b1c-7000-8000-000000000001";
const item = (over: Partial<SharedItem> = {}): SharedItem => ({
  ownerId: OWNER,
  id: "abc12345",
  title: "Their notes",
  ownerName: "Ada",
  updatedAt: 5,
  ...over,
});

let kv: ReturnType<typeof memoryKv>;
let store: ReturnType<typeof createDocumentStore>;
beforeEach(() => {
  kv = memoryKv();
  store = createDocumentStore(kv);
});

describe("shared drafts on this device", () => {
  it("gives a draft an id that fits and is not the account's own", () => {
    const id = sharedLocalId(OWNER, "abc12345");
    expect(id).toBe("sh-0190f3a2-abc12345");
    expect(sharedLocalId(OWNER, "x".repeat(80)).length).toBe(64);
  });

  it("makes the local copy once, and finds it again", async () => {
    const id = await openShared(store, "me", item());
    expect(await openShared(store, "me", item({ title: "Renamed" }))).toBe(id);
    const docs = await store.list();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      id,
      title: "Their notes",
      content: "",
      shared: { ownerId: OWNER, id: "abc12345", userId: "me", ownerName: "Ada" },
    });
  });

  it("belongs to the account that opened it, and to nobody else in the same browser", async () => {
    await openShared(store, "me", item());
    const [d] = await store.list();
    expect(isMine(d!, "me")).toBe(true);
    expect(isMine(d!, "someone-else")).toBe(false);
    expect(isMine(d!, undefined)).toBe(false);
    expect(isMine({ ...d!, shared: undefined as never }, undefined)).toBe(true); // an ordinary draft
  });

  it("detaches into an ordinary draft, keeping its text, and forgets the room's kept state", async () => {
    const id = await openShared(store, "me", item());
    await store.save({ ...(await store.get(id))!, content: "# Kept text" });
    await kv.set(keptKey(OWNER, "abc12345"), { state: new Uint8Array(), epoch: "e", at: 1 });
    const plain = await detachShared(store, kv, id);
    expect(plain?.shared).toBeUndefined();
    expect((await store.get(id))?.content).toBe("# Kept text");
    expect("shared" in (await store.get(id))!).toBe(false);
    expect(kv.data.has(keptKey(OWNER, "abc12345"))).toBe(false);
    expect(await detachShared(store, kv, id)).toBeNull(); // already ordinary
  });

  it("detaches the drafts the server no longer lists, and only this account's", async () => {
    const a = await openShared(store, "me", item({ id: "keep0001" }));
    const b = await openShared(store, "me", item({ id: "gone0002" }));
    const other = await openShared(store, "someone-else", item({ id: "theirs03" }));
    const detached = await reconcileShared(store, kv, "me", [item({ id: "keep0001" })]);
    expect(detached.map((d) => d.id)).toEqual([b]);
    expect((await store.get(a))?.shared).toBeDefined();
    expect((await store.get(b))?.shared).toBeUndefined();
    expect((await store.get(other))?.shared).toBeDefined();
  });

  it("removes a draft the person leaves", async () => {
    const id = await openShared(store, "me", item());
    await kv.set(keptKey(OWNER, "abc12345"), { state: new Uint8Array(), epoch: null, at: 1 });
    const cleared: string[] = [];
    await removeShared(store, kv, id, async (gone) => void cleared.push(gone));
    expect(cleared).toEqual([id]);
    expect(await store.get(id)).toBeUndefined();
    expect(kv.data.has(keptKey(OWNER, "abc12345"))).toBe(false);
  });

  it("takes an account's shared drafts off the device at sign-out, leaving ordinary ones", async () => {
    await openShared(store, "me", item({ id: "one00001" }));
    await openShared(store, "someone-else", item({ id: "two00002" }));
    const own = await store.create({ title: "Mine" });
    await removeSharedFor(store, kv, "me");
    const left = (await store.list()).map((d) => d.id).sort();
    expect(left).toEqual([own.id, sharedLocalId(OWNER, "two00002")].sort());
  });
});
