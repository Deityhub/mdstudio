// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { documents, users } from "../../../infra/db/schema";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { parsePush, pullDocs, pushDocs, type ServerDoc } from "./service";
import { DEFAULT_REVISIONS } from "../revisions/service";

let db: Db;
const t0 = 1_700_000_000_000;
const item = (over: Record<string, unknown> = {}) => ({
  id: "a:d1",
  baseVersion: 0,
  title: "Hello",
  content: "# Hello",
  createdAt: t0 - 1000,
  editedAt: t0,
  ...over,
});

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  for (const id of ["a", "b"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: t0, updatedAt: t0 });
});

describe("pushDocs", () => {
  it("creates a document at version 1 and pull returns it", async () => {
    const [r] = await pushDocs(db, "a", [item({ name: "Mine", folder: "Writing" })], t0);
    expect(r).toMatchObject({ id: "a:d1", status: "ok", version: 1 });
    const { docs } = await pullDocs(db, "a", 0);
    expect(docs).toEqual([
      expect.objectContaining({
        id: "a:d1",
        version: 1,
        title: "Hello",
        name: "Mine",
        folder: "Writing",
        content: "# Hello",
        deleted: false,
        updatedAt: t0,
      }),
    ]);
  });

  it("accepts an update on the current version and bumps it", async () => {
    await pushDocs(db, "a", [item()], t0);
    const [r] = await pushDocs(db, "a", [item({ baseVersion: 1, content: "# Changed" })], t0 + 5);
    expect(r).toMatchObject({ status: "ok", version: 2 });
    expect((await pullDocs(db, "a", 0)).docs[0]?.content).toBe("# Changed");
  });

  it("last edit wins: a stale push with an older edit loses and changes nothing", async () => {
    await pushDocs(db, "a", [item()], t0);
    await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "from device 1", editedAt: t0 + 50 })],
      t0 + 60,
    );
    const [r] = await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "from device 2", editedAt: t0 + 10 })],
      t0 + 90,
    );
    expect(r).toMatchObject({
      status: "conflict",
      server: {
        id: "a:d1",
        version: 2,
        content: "from device 1",
        editedAt: t0 + 50,
        deleted: false,
      },
    });
    expect((await pullDocs(db, "a", 0)).docs[0]?.content).toBe("from device 1");
  });

  it("last edit wins: a stale push with a newer edit replaces the server's text", async () => {
    await pushDocs(db, "a", [item()], t0);
    await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "from device 1", editedAt: t0 + 10 })],
      t0 + 20,
    );
    const [r] = await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "from device 2", editedAt: t0 + 80 })],
      t0 + 90,
    );
    expect(r).toMatchObject({ status: "ok", version: 3 });
    expect((await pullDocs(db, "a", 0)).docs[0]).toMatchObject({
      content: "from device 2",
      editedAt: t0 + 80,
    });
  });

  it("does not let a clock far in the future win every time", async () => {
    await pushDocs(db, "a", [item()], t0);
    await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "x", editedAt: t0 + 10 ** 12 })],
      t0 + 5,
    );
    const doc = (await pullDocs(db, "a", 0)).docs[0];
    expect(doc?.editedAt).toBeLessThanOrEqual(t0 + 5 + 5 * 60_000);
  });

  it("an identical stale push is not a conflict", async () => {
    await pushDocs(db, "a", [item()], t0);
    await pushDocs(db, "a", [item({ baseVersion: 1, content: "same", editedAt: t0 + 5 })], t0 + 6);
    const [r] = await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "same", editedAt: t0 + 9 })],
      t0 + 10,
    );
    expect(r).toMatchObject({ status: "ok", version: 2 });
  });

  it("treats creating an id that already exists as a conflict", async () => {
    await pushDocs(db, "a", [item()], t0);
    const [r] = await pushDocs(db, "a", [item({ content: "again" })], t0 + 1);
    expect(r).toMatchObject({ status: "conflict" });
  });

  it("does not bump the version when nothing changed", async () => {
    await pushDocs(db, "a", [item()], t0);
    const [r] = await pushDocs(db, "a", [item({ baseVersion: 1 })], t0 + 5);
    expect(r).toMatchObject({ status: "ok", version: 1 });
    expect((await pullDocs(db, "a", 0)).docs[0]?.updatedAt).toBe(t0);
  });

  it("deletes as a tombstone without keeping the text", async () => {
    await pushDocs(db, "a", [item()], t0);
    const [r] = await pushDocs(db, "a", [item({ baseVersion: 1, deleted: true })], t0 + 5);
    expect(r).toMatchObject({ status: "ok", version: 2 });
    expect((await pullDocs(db, "a", 0)).docs[0]).toMatchObject({ deleted: true, content: "" });
    // Editing a deleted document from a stale device is a conflict, not a resurrection.
    const [late] = await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "late", editedAt: t0 + 999 })],
      t0 + 9,
    );
    expect(late).toMatchObject({ status: "conflict", server: { deleted: true } });
    // A device that has seen the tombstone can bring the document back.
    const [back] = await pushDocs(db, "a", [item({ baseVersion: 2, content: "revived" })], t0 + 12);
    expect(back).toMatchObject({ status: "ok", version: 3 });
    expect((await pullDocs(db, "a", 0)).docs[0]).toMatchObject({
      deleted: false,
      content: "revived",
    });
  });

  it("never touches another user's document", async () => {
    await pushDocs(db, "a", [item()], t0);
    const [r] = await pushDocs(db, "b", [item({ baseVersion: 1, content: "stolen" })], t0 + 1);
    expect(r).toEqual({ id: "a:d1", status: "rejected" });
    const [again] = await pushDocs(db, "b", [item({ content: "squat" })], t0 + 2);
    expect(again).toEqual({ id: "a:d1", status: "rejected" });
    // Ids outside the caller's own namespace are refused outright, even unused ones.
    const [free] = await pushDocs(db, "b", [item({ id: "plain" })], t0 + 3);
    expect(free).toEqual({ id: "plain", status: "rejected" });
    expect((await pullDocs(db, "a", 0)).docs[0]?.content).toBe("# Hello");
    expect((await pullDocs(db, "b", 0)).docs).toEqual([]);
  });
});

describe("the cloud limit", () => {
  const limit = 2;
  const push = (items: ReturnType<typeof item>[], now = t0) => pushDocs(db, "a", items, now, limit);

  it("refuses a new draft past the limit but keeps updating existing ones", async () => {
    await push([item({ id: "a:1" }), item({ id: "a:2" })]);
    const [third] = await push([item({ id: "a:3" })]);
    expect(third).toEqual({ id: "a:3", status: "limit_reached", limit });
    const [update] = await push([item({ id: "a:1", baseVersion: 1, content: "edited" })], t0 + 1);
    expect(update).toMatchObject({ status: "ok", version: 2 });
    expect((await pullDocs(db, "a", 0)).docs.map((d) => d.id).sort()).toEqual(["a:1", "a:2"]);
  });

  it("frees a slot when a draft is deleted, and counts a revived one again", async () => {
    await push([item({ id: "a:1" }), item({ id: "a:2" })]);
    await push([item({ id: "a:1", baseVersion: 1, deleted: true })], t0 + 1);
    const [third] = await push([item({ id: "a:3" })], t0 + 2);
    expect(third).toMatchObject({ status: "ok" });
    const [revive] = await push([item({ id: "a:1", baseVersion: 2 })], t0 + 3);
    expect(revive).toEqual({ id: "a:1", status: "limit_reached", limit });
  });

  it("counts per account", async () => {
    await push([item({ id: "a:1" }), item({ id: "a:2" })]);
    const [other] = await pushDocs(db, "b", [item({ id: "b:1" })], t0, limit);
    expect(other).toMatchObject({ status: "ok" });
  });
});

describe("pullDocs", () => {
  it("returns changes since the cursor, oldest first, inclusive of the cursor", async () => {
    await pushDocs(db, "a", [item({ id: "a:x" })], t0);
    await pushDocs(db, "a", [item({ id: "a:y" })], t0 + 10);
    await pushDocs(db, "a", [item({ id: "a:z" })], t0 + 20);
    const all = await pullDocs(db, "a", 0);
    expect(all.docs.map((d) => d.id)).toEqual(["a:x", "a:y", "a:z"]);
    expect(all.cursor).toBe(t0 + 20);
    // Inclusive: a second write in the same millisecond as the cursor is never missed.
    expect((await pullDocs(db, "a", t0 + 10)).docs.map((d) => d.id)).toEqual(["a:y", "a:z"]);
  });

  it("pages with hasMore", async () => {
    for (const [i, id] of ["a:p", "a:q", "a:r"].entries())
      await pushDocs(db, "a", [item({ id })], t0 + i);
    const page = await pullDocs(db, "a", 0, 2);
    expect(page).toMatchObject({ hasMore: true, cursor: t0 + 1 });
    expect(page.docs.map((d) => d.id)).toEqual(["a:p", "a:q"]);
    expect((await pullDocs(db, "a", page.cursor, 2)).hasMore).toBe(false);
  });
});

describe("parsePush", () => {
  it("accepts a well-formed body", () => expect(parsePush({ docs: [item()] })).toHaveLength(1));

  it("rejects bad bodies", () => {
    for (const bad of [
      null,
      {},
      { docs: "x" },
      { docs: [item({ id: "" })] },
      { docs: [item({ baseVersion: -1 })] },
      { docs: [item({ content: "x".repeat(1_000_001) })] },
      { docs: Array.from({ length: 51 }, (_, i) => item({ id: `a:d${i}` })) },
    ])
      expect(parsePush(bad)).toBeNull();
  });
});

describe("pushDocs reports what it changed, for other devices to hear about", () => {
  const push = async (items: ReturnType<typeof item>[], now = t0) => {
    const changed: ServerDoc[] = [];
    const results = await pushDocs(db, "a", items, now, 5, DEFAULT_REVISIONS, changed);
    return { results, changed };
  };

  it("gives the new draft and the update, as a pull would", async () => {
    const first = await push([item()]);
    expect(first.changed).toEqual([
      expect.objectContaining({ id: "a:d1", version: 1, content: "# Hello", deleted: false }),
    ]);
    const second = await push([item({ baseVersion: 1, content: "# Hello\n\nMore" })], t0 + 5);
    expect(second.changed).toEqual([
      expect.objectContaining({ version: 2, content: "# Hello\n\nMore", updatedAt: t0 + 5 }),
    ]);
    // the same state a pull returns, so a device applying it ends where a pull would put it
    const { docs } = await pullDocs(db, "a", 0);
    expect(second.changed[0]).toEqual(docs[0]);
  });

  it("says nothing for a push that changed nothing, a conflict or a refusal", async () => {
    await push([item()]);
    expect((await push([item({ baseVersion: 1 })], t0 + 1)).changed).toEqual([]); // same text
    // stale base and an older edit: the server's copy wins, so nothing changed
    await push([item({ baseVersion: 1, content: "# Newer", editedAt: t0 + 100 })], t0 + 100);
    const stale = await push(
      [item({ baseVersion: 1, content: "# Old", editedAt: t0 + 1 })],
      t0 + 2,
    );
    expect(stale.results[0]).toMatchObject({ status: "conflict" });
    expect(stale.changed).toEqual([]);
    expect((await push([item({ id: "b:d1" })])).changed).toEqual([]); // another account's id
  });

  it("gives a deleted draft as a tombstone, without its text", async () => {
    await push([item()]);
    const gone = await push([item({ baseVersion: 1, deleted: true })], t0 + 3);
    expect(gone.changed).toEqual([
      expect.objectContaining({ id: "a:d1", version: 2, deleted: true, content: "" }),
    ]);
  });

  it("is optional: pushing without it works as before", async () => {
    expect(await pushDocs(db, "a", [item()], t0)).toMatchObject([{ status: "ok" }]);
  });
});

describe("a draft that is being edited live", () => {
  const live = async () => {
    await pushDocs(db, "a", [item()], t0);
    await db.update(documents).set({ collab: 1 }).where(eq(documents.id, "a:d1"));
  };

  it("is marked in what a pull returns", async () => {
    await live();
    await pushDocs(db, "a", [item({ id: "a:d2", content: "solo" })], t0);
    const { docs } = await pullDocs(db, "a", 0);
    expect(docs.map((d) => [d.id, d.collab])).toEqual([
      ["a:d1", true],
      ["a:d2", false],
    ]);
  });

  it("does not take text from a device: the room is the text, so a stale device cannot undo it", async () => {
    await live();
    const [r] = await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "# stale device" })],
      t0 + 5,
    );
    expect(r).toMatchObject({ id: "a:d1", status: "collab", server: { collab: true } });
    const [row] = await db.select().from(documents).where(eq(documents.id, "a:d1"));
    expect(row?.content).toBe("# Hello");
    expect(row?.version).toBe(1);
  });

  it("can still be deleted by its owner", async () => {
    await live();
    const changed: ServerDoc[] = [];
    const [r] = await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, deleted: true })],
      t0 + 5,
      5,
      DEFAULT_REVISIONS,
      changed,
    );
    expect(r).toMatchObject({ status: "ok" });
    expect(changed[0]).toMatchObject({ deleted: true, collab: true }); // the caller can end the room
  });
});
