// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createNodeDb } from "./node";
import { documentRevisions, documents, shareLinks, users } from "./schema";

let db: ReturnType<typeof createNodeDb>;
const now = 1_700_000_000_000;
const user = { id: "u1", email: "a@b.c", createdAt: now, updatedAt: now };
const doc = (id: string) => ({
  id,
  userId: "u1",
  contentHash: "h",
  createdAt: now,
  updatedAt: now,
});

beforeEach(() => {
  db = createNodeDb(":memory:");
  db.insert(users).values(user).run();
});

describe("migrated schema", () => {
  it("applies defaults to documents", () => {
    db.insert(documents).values(doc("d1")).run();
    expect(db.select().from(documents).get()).toMatchObject({
      title: "Untitled",
      content: "",
      version: 1,
      deletedAt: null,
    });
  });

  it("enforces unique emails", () => {
    expect(() =>
      db
        .insert(users)
        .values({ ...user, id: "u2" })
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it("rejects rows for unknown users (foreign keys are on)", () => {
    expect(() =>
      db
        .insert(documents)
        .values({ ...doc("d1"), userId: "ghost" })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("cascades deletes from users to documents and revisions", () => {
    db.insert(documents).values(doc("d1")).run();
    db.insert(documentRevisions)
      .values({
        id: "r1",
        documentId: "d1",
        userId: "u1",
        version: 1,
        title: "t",
        content: "",
        createdAt: now,
      })
      .run();
    db.delete(users).where(eq(users.id, "u1")).run();
    expect(db.select().from(documents).all()).toEqual([]);
    expect(db.select().from(documentRevisions).all()).toEqual([]);
  });

  it("keeps a share link's slug unique", () => {
    db.insert(documents).values(doc("d1")).run();
    const link = { documentId: "d1", slug: "abc", createdAt: now };
    db.insert(shareLinks)
      .values({ ...link, id: "s1" })
      .run();
    expect(() =>
      db
        .insert(shareLinks)
        .values({ ...link, id: "s2" })
        .run(),
    ).toThrow(/UNIQUE/);
  });
});
