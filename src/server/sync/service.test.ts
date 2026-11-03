// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { parsePush, pullDocs, pushDocs } from "./service";

let db: Db;
const t0 = 1_700_000_000_000;
const item = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  baseVersion: 0,
  title: "Hello",
  content: "# Hello",
  createdAt: t0 - 1000,
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
    expect(r).toMatchObject({ id: "d1", status: "ok", version: 1 });
    const { docs } = await pullDocs(db, "a", 0);
    expect(docs).toEqual([
      expect.objectContaining({
        id: "d1",
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

  it("rejects a stale base with the server's state, and changes nothing", async () => {
    await pushDocs(db, "a", [item()], t0);
    await pushDocs(db, "a", [item({ baseVersion: 1, content: "from device 1" })], t0 + 5);
    const [r] = await pushDocs(
      db,
      "a",
      [item({ baseVersion: 1, content: "from device 2" })],
      t0 + 9,
    );
    expect(r).toMatchObject({
      status: "conflict",
      server: { id: "d1", version: 2, content: "from device 1", deleted: false },
    });
    expect((await pullDocs(db, "a", 0)).docs[0]?.content).toBe("from device 1");
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
    const [late] = await pushDocs(db, "a", [item({ baseVersion: 1, content: "late" })], t0 + 9);
    expect(late).toMatchObject({ status: "conflict", server: { deleted: true } });
  });

  it("never touches another user's document", async () => {
    await pushDocs(db, "a", [item()], t0);
    const [r] = await pushDocs(db, "b", [item({ baseVersion: 1, content: "stolen" })], t0 + 1);
    expect(r).toEqual({ id: "d1", status: "rejected" });
    const [again] = await pushDocs(db, "b", [item({ content: "squat" })], t0 + 2);
    expect(again).toEqual({ id: "d1", status: "rejected" });
    expect((await pullDocs(db, "a", 0)).docs[0]?.content).toBe("# Hello");
    expect((await pullDocs(db, "b", 0)).docs).toEqual([]);
  });
});

describe("pullDocs", () => {
  it("returns changes since the cursor, oldest first, inclusive of the cursor", async () => {
    await pushDocs(db, "a", [item({ id: "x" })], t0);
    await pushDocs(db, "a", [item({ id: "y" })], t0 + 10);
    await pushDocs(db, "a", [item({ id: "z" })], t0 + 20);
    const all = await pullDocs(db, "a", 0);
    expect(all.docs.map((d) => d.id)).toEqual(["x", "y", "z"]);
    expect(all.cursor).toBe(t0 + 20);
    // Inclusive: a second write in the same millisecond as the cursor is never missed.
    expect((await pullDocs(db, "a", t0 + 10)).docs.map((d) => d.id)).toEqual(["y", "z"]);
  });

  it("pages with hasMore", async () => {
    for (const [i, id] of ["p", "q", "r"].entries())
      await pushDocs(db, "a", [item({ id })], t0 + i);
    const page = await pullDocs(db, "a", 0, 2);
    expect(page).toMatchObject({ hasMore: true, cursor: t0 + 1 });
    expect(page.docs.map((d) => d.id)).toEqual(["p", "q"]);
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
      { docs: Array.from({ length: 51 }, (_, i) => item({ id: `d${i}` })) },
    ])
      expect(parsePush(bad)).toBeNull();
  });
});
