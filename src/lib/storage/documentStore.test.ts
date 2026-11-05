import { describe, expect, it } from "vitest";
import {
  SAMPLE,
  createDocumentStore,
  docTitle,
  emptyDocument,
  sampleDocument,
  type KeyValueStore,
} from "./documentStore";

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

describe("folders", () => {
  it("keeps folder names, so an empty folder survives", async () => {
    const store = createDocumentStore(memoryStore());
    expect(await store.folders.list()).toEqual([]);
    await store.folders.add("Blog");
    await store.folders.add("archive");
    expect(await store.folders.list()).toEqual(["archive", "Blog"]);
  });
  it("ignores a name that exists in another case, and removes by name", async () => {
    const store = createDocumentStore(memoryStore());
    await store.folders.add("Blog");
    await store.folders.add("blog");
    expect(await store.folders.list()).toEqual(["Blog"]);
    await store.folders.remove("BLOG");
    expect(await store.folders.list()).toEqual([]);
  });
  it("renames a folder and moves its drafts with it", async () => {
    const store = createDocumentStore(memoryStore());
    await store.folders.add("Blog");
    await store.folders.add("Other");
    const inBlog = await store.create({ content: "a", folder: "Blog" });
    const inOther = await store.create({ content: "b", folder: "Other" });
    const loose = await store.create({ content: "c" });
    await store.renameFolder("blog", "Posts");
    expect(await store.folders.list()).toEqual(["Other", "Posts"]);
    expect((await store.get(inBlog.id))?.folder).toBe("Posts");
    expect((await store.get(inOther.id))?.folder).toBe("Other");
    expect((await store.get(loose.id))?.folder).toBeUndefined();
  });
  it("renames a folder that only exists on its drafts, and can change just the case", async () => {
    const store = createDocumentStore(memoryStore());
    const d = await store.create({ content: "a", folder: "notes" });
    await store.renameFolder("notes", "Notes");
    expect(await store.folders.list()).toEqual(["Notes"]);
    expect((await store.get(d.id))?.folder).toBe("Notes");
  });
  it("does not show up among the documents", async () => {
    const store = createDocumentStore(memoryStore());
    await store.folders.add("Blog");
    await store.create();
    expect(await store.list()).toHaveLength(1);
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

describe("sampleDocument", () => {
  it("is the example text in a fresh draft that is not saved anywhere", async () => {
    const kv = memoryStore();
    const store = createDocumentStore(kv);
    const a = sampleDocument(1000);
    const b = sampleDocument(1000);
    expect(a.content).toBe(SAMPLE);
    expect(a).toMatchObject({ createdAt: 1000, updatedAt: 1000, images: {} });
    expect(a.id).toHaveLength(8);
    expect(a.id).not.toBe(b.id);
    expect(await store.list()).toEqual([]);
    expect(kv.data.size).toBe(0);
  });
});

describe("emptyDocument", () => {
  it("is a blank draft that is not saved anywhere", async () => {
    const kv = memoryStore();
    const store = createDocumentStore(kv);
    const d = emptyDocument(5);
    expect(d).toMatchObject({ title: "Untitled", content: "", images: {}, createdAt: 5 });
    expect(d.id).toHaveLength(8);
    expect(await store.list()).toEqual([]);
    expect(kv.data.size).toBe(0);
  });
});

describe("hadDraft", () => {
  it("is false on a new machine, true once any draft was saved, and stays true after it is removed", async () => {
    const kv = memoryStore();
    const store = createDocumentStore(kv);
    expect(await store.hadDraft()).toBe(false);
    const d = await store.create({ content: "# a" });
    expect(await store.hadDraft()).toBe(true);
    await store.remove(d.id);
    expect(await store.list()).toEqual([]);
    // a new store over the same data (a reload) still knows
    expect(await createDocumentStore(kv).hadDraft()).toBe(true);
  });

  it("is not counted as a draft, and a sync write counts too", async () => {
    const kv = memoryStore();
    const store = createDocumentStore(kv);
    await store.save({ ...emptyDocument(1), content: "x" }, { quiet: true });
    expect(await store.hadDraft()).toBe(true);
    expect(await store.list()).toHaveLength(1);
  });
});
