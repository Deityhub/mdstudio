import { describe, expect, it } from "vitest";
import { createDocumentStore, docTitle, type KeyValueStore } from "./documentStore";

function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async <T>(k: string) => data.get(k) as T | undefined,
    set: async (k, v) => void data.set(k, structuredClone(v)),
    del: async (k) => void data.delete(k),
    values: async <T>(prefix: string) =>
      [...data].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v as T),
  };
}

describe("documentStore", () => {
  it("creates documents with defaults and round-trips them", async () => {
    const store = createDocumentStore(memoryStore());
    const doc = await store.create({
      content: "# Hi",
      images: { "a.png": "data:image/png;base64,AA" },
    });
    expect(doc).toMatchObject({ title: "Untitled", content: "# Hi" });
    expect(doc.id).toHaveLength(8);
    expect(await store.get(doc.id)).toEqual(doc);
  });

  it("lists newest first and ignores keys outside the doc prefix", async () => {
    const kv = memoryStore();
    await kv.set("other:1", { updatedAt: 99 });
    const store = createDocumentStore(kv);
    const base = { title: "", content: "", images: {}, createdAt: 0 };
    await store.save({ ...base, id: "old", updatedAt: 1 });
    await store.save({ ...base, id: "new", updatedAt: 2 });
    expect((await store.list()).map((d) => d.id)).toEqual(["new", "old"]);
  });

  it("removes documents and returns undefined for missing ones", async () => {
    const store = createDocumentStore(memoryStore());
    const doc = await store.create();
    await store.remove(doc.id);
    expect(await store.get(doc.id)).toBeUndefined();
    expect(await store.list()).toEqual([]);
  });
});

describe("docTitle", () => {
  it("derives the title from the content", () =>
    expect(docTitle({ content: "# From heading" })).toBe("From heading"));
  it("prefers a name set in the library, trimmed", () =>
    expect(docTitle({ name: "  My name ", content: "# From heading" })).toBe("My name"));
  it("falls back to the content when the name is blank", () =>
    expect(docTitle({ name: "   ", content: "# From heading" })).toBe("From heading"));
});
