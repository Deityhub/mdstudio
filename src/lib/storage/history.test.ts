import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./documentStore";
import { createHistoryStore, MAX_REVISIONS, SNAPSHOT_INTERVAL_MS } from "./history";

function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => data.get(k) as T | undefined,
    set: async (k, v) => void data.set(k, structuredClone(v)),
    del: async (k) => void data.delete(k),
    values: async <T>(prefix: string) =>
      [...data].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v as T),
  };
}

const doc = (content: string, id = "d1") => ({ id, title: "T", content });
const MIN = 60_000;

describe("history store", () => {
  it("takes a first snapshot, but not of an empty draft", async () => {
    const h = createHistoryStore(memoryStore());
    expect(await h.maybeSnapshot(doc(""), 0)).toBeNull();
    expect(await h.maybeSnapshot(doc("one"), 1000)).toMatchObject({ content: "one", at: 1000 });
  });

  it("waits for the interval, and skips unchanged text", async () => {
    const h = createHistoryStore(memoryStore());
    await h.maybeSnapshot(doc("one"), 0);
    expect(await h.maybeSnapshot(doc("two"), SNAPSHOT_INTERVAL_MS - 1)).toBeNull();
    expect(await h.maybeSnapshot(doc("one"), SNAPSHOT_INTERVAL_MS * 2)).toBeNull();
    expect(await h.maybeSnapshot(doc("two"), SNAPSHOT_INTERVAL_MS)).toMatchObject({
      content: "two",
    });
  });

  it("lists newest first and keeps drafts apart", async () => {
    const h = createHistoryStore(memoryStore());
    await h.maybeSnapshot(doc("a"), 0);
    await h.maybeSnapshot(doc("b"), 10 * MIN);
    await h.maybeSnapshot(doc("other", "d2"), 0);
    expect((await h.list("d1")).map((r) => r.content)).toEqual(["b", "a"]);
    expect((await h.list("d2")).map((r) => r.content)).toEqual(["other"]);
  });

  it("saves a named version on demand, even inside the interval", async () => {
    const h = createHistoryStore(memoryStore());
    await h.maybeSnapshot(doc("a"), 0);
    const rev = await h.save(doc("b"), 1000, "manual");
    expect(rev).toMatchObject({ content: "b", kind: "manual" });
    expect(await h.list("d1")).toHaveLength(2);
  });

  it("does not repeat a version identical to the newest one", async () => {
    const h = createHistoryStore(memoryStore());
    await h.save(doc("a"), 0, "manual");
    expect(await h.save(doc("a"), 1000, "manual")).toBeNull();
  });

  it("keeps at most MAX_REVISIONS, dropping the oldest automatic ones first", async () => {
    const h = createHistoryStore(memoryStore());
    await h.save(doc("keep me"), 0, "manual");
    for (let i = 1; i <= MAX_REVISIONS + 5; i++) await h.maybeSnapshot(doc(`v${i}`), i * 10 * MIN);
    const list = await h.list("d1");
    expect(list).toHaveLength(MAX_REVISIONS);
    expect(list.some((r) => r.content === "keep me")).toBe(true);
    expect(list.some((r) => r.content === "v1")).toBe(false);
    expect(list[0]?.content).toBe(`v${MAX_REVISIONS + 5}`);
  });

  it("removes one revision or a whole draft's history", async () => {
    const h = createHistoryStore(memoryStore());
    const a = (await h.maybeSnapshot(doc("a"), 0))!;
    await h.maybeSnapshot(doc("b"), 10 * MIN);
    await h.remove(a);
    expect((await h.list("d1")).map((r) => r.content)).toEqual(["b"]);
    await h.clear("d1");
    expect(await h.list("d1")).toEqual([]);
  });

  it("recovers its state from storage after a reload", async () => {
    const kv = memoryStore();
    await createHistoryStore(kv).maybeSnapshot(doc("a"), 0);
    const fresh = createHistoryStore(kv);
    expect(await fresh.maybeSnapshot(doc("b"), 1000)).toBeNull();
    expect(await fresh.maybeSnapshot(doc("b"), SNAPSHOT_INTERVAL_MS)).not.toBeNull();
  });
});
