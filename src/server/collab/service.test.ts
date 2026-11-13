// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { documentEditors, documentRevisions, documents, users } from "../../../infra/db/schema";
import type { PublicUser } from "../auth/service";
import type { Db } from "../db";
import { pushDocs } from "../sync/service";
import {
  addEditor,
  applyCollabText,
  disableCollab,
  docAccess,
  enableCollab,
  ensureLink,
  leaveDoc,
  linkTarget,
  listEditors,
  removeEditor,
  sharedWith,
} from "./service";

const t0 = 1_700_000_000_000;
let db: Db;

const person = (id: string, over: Partial<PublicUser> = {}): PublicUser => ({
  id,
  email: `${id}@x.co`,
  displayName: id.toUpperCase(),
  emailVerified: true,
  isAdmin: false,
  ...over,
});
const owner = person("o");
const bea = person("b");
const cy = person("c");
const limits = { people: 3, docs: 2 };

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  for (const id of ["o", "b", "c", "d"])
    await db.insert(users).values({
      id,
      email: `${id}@x.co`,
      emailKey: `${id}@x.co`,
      displayName: id.toUpperCase(),
      createdAt: t0,
      updatedAt: t0,
    });
});

async function draft(localId = "d1", content = "# Notes\n\nStart") {
  await pushDocs(
    db,
    "o",
    [{ id: `o:${localId}`, baseVersion: 0, title: "Notes", content, createdAt: t0, editedAt: t0 }],
    t0,
  );
}
const live = async (localId = "d1") => {
  await draft(localId);
  const r = await enableCollab(db, "o", localId, limits, t0 + 1);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("switching live editing on and off", () => {
  it("marks the draft, hands back its text to seed the room, and bumps the version for the owner's other devices", async () => {
    await draft();
    const r = await enableCollab(db, "o", "d1", limits, t0 + 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.text).toBe("# Notes\n\nStart");
    expect(r.doc).toMatchObject({ id: "o:d1", collab: true, version: 2 });
    const again = await enableCollab(db, "o", "d1", limits, t0 + 2); // already on
    expect(again).toMatchObject({ ok: true, doc: { version: 2 } });
  });

  it("refuses a draft that is not there or is deleted, and a third live draft", async () => {
    expect(await enableCollab(db, "o", "nope", limits, t0)).toEqual({
      ok: false,
      error: "not_found",
    });
    await draft("d1");
    await pushDocs(
      db,
      "o",
      [
        {
          id: "o:d1",
          baseVersion: 1,
          title: "",
          content: "",
          createdAt: 0,
          editedAt: t0 + 5,
          deleted: true,
        },
      ],
      t0 + 5,
    );
    expect(await enableCollab(db, "o", "d1", limits, t0)).toEqual({
      ok: false,
      error: "not_found",
    });
    for (const id of ["a1", "a2"]) await live(id);
    await draft("a3");
    expect(await enableCollab(db, "o", "a3", limits, t0)).toEqual({
      ok: false,
      error: "limit_reached",
    });
  });

  it("stops: the draft goes back to ordinary sync and everyone invited is let go", async () => {
    await live();
    await addEditor(db, owner, "d1", "b@x.co", limits.people, t0);
    const stopped = await disableCollab(db, "o", "d1", t0 + 5);
    expect(stopped).toMatchObject({ id: "o:d1", collab: false, version: 3 });
    expect(await db.select().from(documentEditors)).toEqual([]);
    expect(await disableCollab(db, "o", "d1", t0 + 6)).toBeNull(); // nothing to stop
  });
});

describe("who may edit", () => {
  it("is the owner and the people they invited, who must have a confirmed account with that address", async () => {
    await live();
    await addEditor(db, owner, "d1", "b@x.co", limits.people, t0);
    expect(await docAccess(db, owner, "o", "d1")).toMatchObject({ ok: true, isOwner: true });
    expect(await docAccess(db, bea, "o", "d1")).toMatchObject({ ok: true, isOwner: false });
    expect(await docAccess(db, cy, "o", "d1")).toEqual({ ok: false });
    expect(await docAccess(db, person("b", { emailVerified: false }), "o", "d1")).toEqual({
      ok: false,
    });
    expect(await docAccess(db, bea, "o", "nope")).toEqual({ ok: false });
  });

  it("matches the address the way sign-in does: dots and plus tags in Gmail, upper case", async () => {
    await db.insert(users).values({
      id: "g",
      email: "ada.l@gmail.com",
      emailKey: "adal@gmail.com",
      createdAt: t0,
      updatedAt: t0,
    });
    await live();
    await addEditor(db, owner, "d1", "Ada.L+news@Gmail.com", limits.people, t0);
    const ada = person("g", { email: "ada.l@gmail.com" });
    expect(await docAccess(db, ada, "o", "d1")).toMatchObject({ ok: true });
  });

  it("stops when the draft is not live, was deleted, or its owner is suspended", async () => {
    await live();
    await addEditor(db, owner, "d1", "b@x.co", limits.people, t0);
    await db.update(users).set({ suspendedAt: t0 }).where(eq(users.id, "o"));
    expect(await docAccess(db, bea, "o", "d1")).toEqual({ ok: false });
    expect(await docAccess(db, owner, "o", "d1")).toEqual({ ok: false });
    await db.update(users).set({ suspendedAt: null }).where(eq(users.id, "o"));
    await db.update(documents).set({ collab: 0 }).where(eq(documents.id, "o:d1"));
    expect(await docAccess(db, bea, "o", "d1")).toEqual({ ok: false });
  });
});

describe("inviting", () => {
  it("adds people up to the limit, the owner counting as one", async () => {
    await live();
    const first = await addEditor(db, owner, "d1", "b@x.co", 3, t0);
    expect(first).toMatchObject({ ok: true });
    expect(await addEditor(db, owner, "d1", "c@x.co", 3, t0)).toMatchObject({ ok: true });
    expect(await addEditor(db, owner, "d1", "d@x.co", 3, t0)).toEqual({
      ok: false,
      error: "limit_reached",
    });
    expect((await listEditors(db, "o", "d1"))?.map((e) => e.email)).toEqual(["b@x.co", "c@x.co"]);
  });

  it("is the same person once, and never the owner", async () => {
    await live();
    await addEditor(db, owner, "d1", "b@x.co", 5, t0);
    const again = await addEditor(db, owner, "d1", " B@X.CO ", 5, t0 + 1);
    expect(again).toMatchObject({ ok: true });
    expect(await listEditors(db, "o", "d1")).toHaveLength(1);
    expect(await addEditor(db, owner, "d1", "o@x.co", 5, t0)).toEqual({
      ok: false,
      error: "invalid",
    });
    for (const bad of ["", "nope", "a@", "x".repeat(300) + "@x.co"])
      expect(await addEditor(db, owner, "d1", bad, 5, t0), bad).toEqual({
        ok: false,
        error: "invalid",
      });
  });

  it("is only for the owner of a live draft", async () => {
    await draft();
    expect(await addEditor(db, owner, "d1", "b@x.co", 5, t0)).toEqual({
      ok: false,
      error: "not_live",
    });
    await enableCollab(db, "o", "d1", limits, t0);
    expect(await addEditor(db, bea, "d1", "c@x.co", 5, t0)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("can be undone by the owner, or by the person themselves, and says who it was", async () => {
    await live();
    await addEditor(db, owner, "d1", "b@x.co", 5, t0);
    await addEditor(db, owner, "d1", "c@x.co", 5, t0);
    const [first, second] = (await listEditors(db, "o", "d1"))!;
    expect(await removeEditor(db, "o", "d1", first!.id)).toMatchObject({ email: "b@x.co" });
    expect(await removeEditor(db, "o", "d1", first!.id)).toBeNull();
    expect(await leaveDoc(db, cy, "o", "d1")).toBe(true);
    expect(await leaveDoc(db, cy, "o", "d1")).toBe(false);
    expect(await listEditors(db, "o", "d1")).toEqual([]);
    expect(second).toBeDefined();
  });
});

describe("shared with you", () => {
  it("lists live drafts others invited this person to, with the owner's name", async () => {
    await live("d1");
    await live("d2");
    await addEditor(db, owner, "d1", "b@x.co", 5, t0);
    await addEditor(db, owner, "d2", "b@x.co", 5, t0);
    await disableCollab(db, "o", "d2", t0 + 3);
    const list = await sharedWith(db, bea);
    expect(list).toEqual([
      { ownerId: "o", id: "d1", title: "Notes", ownerName: "O", updatedAt: expect.any(Number) },
    ]);
    expect(await sharedWith(db, cy)).toEqual([]);
    expect(await sharedWith(db, person("b", { emailVerified: false }))).toEqual([]);
  });
});

describe("the text copy", () => {
  it("is refreshed from the room, with the title, a version and a history entry of what it replaced", async () => {
    await live();
    const changed = await applyCollabText(
      db,
      "o:d1",
      "# New title\n\nWritten together",
      t0 + 100_000,
      { max: 10, intervalMs: 0 },
    );
    expect(changed).toBe(true);
    const [row] = await db.select().from(documents).where(eq(documents.id, "o:d1"));
    expect(row).toMatchObject({
      content: "# New title\n\nWritten together",
      title: "New title",
      version: 3,
    });
    const revisions = await db.select().from(documentRevisions);
    expect(revisions).toHaveLength(1);
  });

  it("changes nothing when the text is the same, and only touches live drafts", async () => {
    await live();
    expect(
      await applyCollabText(db, "o:d1", "# Notes\n\nStart", t0 + 5, { max: 10, intervalMs: 0 }),
    ).toBe(false);
    await draft("solo");
    expect(await applyCollabText(db, "o:solo", "changed", t0 + 5, { max: 10, intervalMs: 0 })).toBe(
      false,
    );
    expect(await applyCollabText(db, "o:nope", "x", t0 + 5, { max: 10, intervalMs: 0 })).toBe(
      false,
    );
  });
});

describe("the draft's link", () => {
  it("is made when live editing starts, is short and not the owner's id, and stays the same", async () => {
    await live();
    const link = await ensureLink(db, "o:d1");
    expect(link).toMatch(/^[A-Za-z0-9_-]{10,16}$/);
    expect(link).not.toContain("o:");
    expect(await ensureLink(db, "o:d1")).toBe(link);
  });

  it("is made on the spot for a draft that was live before links existed", async () => {
    await live();
    await db.update(documents).set({ collabLink: null }).where(eq(documents.id, "o:d1"));
    const link = await ensureLink(db, "o:d1");
    expect(link).toBeTruthy();
    expect(await ensureLink(db, "o:d1")).toBe(link);
  });

  it("is not made for a draft that is not live", async () => {
    await draft();
    expect(await ensureLink(db, "o:d1")).toBeNull();
  });

  it("finds the draft for the people invited to it, and says nothing to anyone else", async () => {
    await live();
    await addEditor(db, owner, "d1", "b@x.co", 3, t0 + 2);
    const link = (await ensureLink(db, "o:d1"))!;
    expect(await linkTarget(db, bea, link)).toMatchObject({
      ownerId: "o",
      id: "d1",
      title: "Notes",
      ownerName: "O",
    });
    expect(await linkTarget(db, owner, link)).toMatchObject({ ownerId: "o", id: "d1" });
    expect(await linkTarget(db, cy, link)).toBeNull(); // not invited: the same answer as for no such link
    expect(await linkTarget(db, bea, "nosuchlink1")).toBeNull();
    expect(await linkTarget(db, person("b", { emailVerified: false }), link)).toBeNull();
  });

  it("stops working when live editing stops, and a restart gets a new link", async () => {
    await live();
    await addEditor(db, owner, "d1", "b@x.co", 3, t0 + 2);
    const first = (await ensureLink(db, "o:d1"))!;
    await disableCollab(db, "o", "d1", t0 + 3);
    expect(await linkTarget(db, bea, first)).toBeNull();
    await enableCollab(db, "o", "d1", limits, t0 + 4);
    const second = (await ensureLink(db, "o:d1"))!;
    expect(second).not.toBe(first);
    await addEditor(db, owner, "d1", "b@x.co", 3, t0 + 5);
    expect(await linkTarget(db, bea, first)).toBeNull();
    expect(await linkTarget(db, bea, second)).toMatchObject({ id: "d1" });
  });
});
