import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "../storage/documentStore";
import { type Kept, forgetKept, keptKey } from "./kept";
import { DEBOUNCE_MS, MAX_DELAY_MS, createPersistence } from "./persistence";
import { TEXT_KEY } from "./protocol";

const memory = () => {
  const map = new Map<string, unknown>();
  const kv: KeyValueStore & { map: Map<string, unknown>; sets: number } = {
    map,
    sets: 0,
    get: async <T>(k: string) => map.get(k) as T | undefined,
    set: async (k, v) => void (kv.sets++, map.set(k, v)),
    del: async (k) => void map.delete(k),
    values: async <T>(p: string) =>
      [...map].filter(([k]) => k.startsWith(p)).map(([, v]) => v as T),
  };
  return kv;
};
const KEY = keptKey("owner", "d1");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("persistence", () => {
  it("brings a kept state back, with the room it came from", async () => {
    const kv = memory();
    const before = new Y.Doc();
    before.getText(TEXT_KEY).insert(0, "kept text");
    await kv.set(KEY, {
      state: Y.encodeStateAsUpdate(before),
      epoch: "room-1",
      at: 1,
    } satisfies Kept);
    const doc = new Y.Doc();
    const kept = await createPersistence(kv, KEY, doc).load();
    expect(kept?.epoch).toBe("room-1");
    expect(doc.getText(TEXT_KEY).toString()).toBe("kept text");
  });

  it("has nothing to load the first time", async () => {
    expect(await createPersistence(memory(), KEY, new Y.Doc()).load()).toBeUndefined();
  });

  it("writes nothing before it is started: a document that never met its room is not kept", async () => {
    const kv = memory();
    const doc = new Y.Doc();
    createPersistence(kv, KEY, doc);
    doc.getText(TEXT_KEY).insert(0, "x");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(kv.sets).toBe(0);
  });

  it("writes when it starts, then a couple of seconds after typing stops", async () => {
    const kv = memory();
    const doc = new Y.Doc();
    const p = createPersistence(kv, KEY, doc);
    p.start("room-1");
    await vi.advanceTimersByTimeAsync(0);
    expect(kv.sets).toBe(1);
    doc.getText(TEXT_KEY).insert(0, "a");
    doc.getText(TEXT_KEY).insert(1, "b");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 10);
    expect(kv.sets).toBe(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(kv.sets).toBe(2);
    const kept = kv.map.get(KEY) as Kept;
    const copy = new Y.Doc();
    Y.applyUpdate(copy, kept.state);
    expect(copy.getText(TEXT_KEY).toString()).toBe("ab");
    expect(kept.epoch).toBe("room-1");
  });

  it("writes within ten seconds even when typing never stops", async () => {
    const kv = memory();
    const doc = new Y.Doc();
    createPersistence(kv, KEY, doc).start(null);
    await vi.advanceTimersByTimeAsync(0);
    const base = kv.sets;
    for (let t = 0; t < MAX_DELAY_MS; t += 1000) {
      doc.getText(TEXT_KEY).insert(0, "x");
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(kv.sets).toBeGreaterThan(base);
  });

  it("does not write back what it loaded, and writes on request", async () => {
    const kv = memory();
    const doc = new Y.Doc();
    const p = createPersistence(kv, KEY, doc);
    const other = new Y.Doc();
    other.getText(TEXT_KEY).insert(0, "hi");
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other), "kept");
    p.start("r");
    await vi.advanceTimersByTimeAsync(0);
    const base = kv.sets;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(kv.sets).toBe(base);
    doc.getText(TEXT_KEY).insert(2, "!");
    await p.flush();
    expect(kv.sets).toBe(base + 1);
  });

  it("forgets", async () => {
    const kv = memory();
    await kv.set(KEY, { state: new Uint8Array(), epoch: null, at: 1 });
    await forgetKept(kv, "owner", "d1");
    expect(kv.map.has(KEY)).toBe(false);
  });
});
