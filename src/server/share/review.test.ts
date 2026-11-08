// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { shareComments, sharePeople, shareLinks, users } from "../../../infra/db/schema";
import type { PublicUser } from "../auth/service";
import type { Db } from "../db";
import { pushDocs } from "../sync/service";
import {
  addComment,
  deleteComment,
  listComments,
  ownerComments,
  ownerDeleteComment,
  ownerResolveComment,
} from "./comments";
import { addPerson, listPeople, removePerson } from "./people";
import {
  DEFAULT_SHARE,
  getPublicShare,
  listShares,
  publishShare,
  sitemapShares,
  updateShare,
  viewShare,
} from "./service";

const DAY = 86_400_000;
const t0 = 1_700_000_000_000;
let db: Db;

const person = (id: string, over: Partial<PublicUser> = {}): PublicUser => ({
  id,
  email: `${id}@x.co`,
  displayName: null,
  emailVerified: true,
  ...over,
});
const owner = person("a", { displayName: "Ada" });
const bea = person("b", { displayName: "Bea" });
const cy = person("c");

async function shared(
  opts: { access?: "public" | "people"; comments?: boolean; days?: number } = {},
) {
  await pushDocs(
    db,
    "a",
    [
      {
        id: "a:d1",
        baseVersion: 0,
        title: "Plan",
        content: "# Plan\n\nBody",
        createdAt: t0,
        editedAt: t0,
      },
    ],
    t0,
  );
  const r = await publishShare(db, "a", "d1", opts.days ?? 3, DEFAULT_SHARE, t0);
  if (!r.ok) throw new Error(r.error);
  if (opts.access || opts.comments !== undefined) {
    const u = await updateShare(
      db,
      "a",
      "d1",
      {
        ...(opts.access && { access: opts.access }),
        ...(opts.comments !== undefined && { comments: opts.comments }),
      },
      DEFAULT_SHARE,
      t0,
    );
    if (!u.ok) throw new Error(u.error);
    return u.share;
  }
  return r.share;
}

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  const names: Record<string, string> = { a: "Ada", b: "Bea" };
  for (const id of ["a", "b", "c"])
    await db.insert(users).values({
      id,
      email: `${id}@x.co`,
      ...(names[id] && { displayName: names[id] }),
      createdAt: t0,
      updatedAt: t0,
    });
});

describe("share settings", () => {
  it("starts public with comments off, and the owner can change both", async () => {
    const s = await shared();
    expect(s).toMatchObject({ access: "public", comments: false });
    const u = await updateShare(
      db,
      "a",
      "d1",
      { comments: true, access: "people" },
      DEFAULT_SHARE,
      t0 + 1,
    );
    if (!u.ok) throw new Error(u.error);
    expect(u.share).toMatchObject({ access: "people", comments: true });
    expect(u.share.expiresAt).toBe(t0 + 3 * DAY); // untouched
  });

  it("refuses a change that says nothing, bad values, strangers, and private links when switched off", async () => {
    await shared();
    expect(await updateShare(db, "a", "d1", {}, DEFAULT_SHARE, t0)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(
      await updateShare(db, "a", "d1", { access: "everyone" as never }, DEFAULT_SHARE, t0),
    ).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await updateShare(db, "b", "d1", { comments: true }, DEFAULT_SHARE, t0)).toEqual({
      ok: false,
      error: "not_found",
    });
    const off = { ...DEFAULT_SHARE, privateLinks: false };
    expect(await updateShare(db, "a", "d1", { access: "people" }, off, t0)).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(
      (await updateShare(db, "a", "d1", { access: "public", comments: true }, off, t0)).ok,
    ).toBe(true);
  });

  it("republishing keeps the settings", async () => {
    await shared({ access: "people", comments: true });
    const r = await publishShare(db, "a", "d1", undefined, DEFAULT_SHARE, t0 + 10);
    if (!r.ok) throw new Error(r.error);
    expect(r.share).toMatchObject({ access: "people", comments: true });
  });
});

describe("who can open a link", () => {
  it("a public link is open to anyone, and is the only kind the plain public read returns", async () => {
    const s = await shared();
    expect((await viewShare(db, s.slug, null, t0)).status).toBe("ok");
    expect((await getPublicShare(db, s.slug, t0))?.title).toBe("Plan");
    await updateShare(db, "a", "d1", { access: "people" }, DEFAULT_SHARE, t0);
    expect(await getPublicShare(db, s.slug, t0)).toBeNull(); // never leaks through the public read
  });

  it("a private link asks a stranger to sign in, shows nothing to anyone not invited, and opens for the owner and the invited", async () => {
    const s = await shared({ access: "people" });
    await addPerson(db, "a", "d1", "b@x.co", t0);
    expect(await viewShare(db, s.slug, null, t0)).toEqual({ status: "sign_in" });
    expect(await viewShare(db, s.slug, cy, t0)).toEqual({ status: "not_found" });
    expect(await viewShare(db, s.slug, owner, t0)).toMatchObject({ status: "ok", isOwner: true });
    expect(await viewShare(db, s.slug, bea, t0)).toMatchObject({ status: "ok", isOwner: false });
  });

  it("an invited address must be confirmed by whoever signs in with it, and spellings of one inbox match", async () => {
    const s = await shared({ access: "people" });
    await addPerson(db, "a", "d1", "B.ea+news@gmail.com", t0);
    const gmail = person("g", { email: "bea@googlemail.com", emailVerified: true });
    expect((await viewShare(db, s.slug, gmail, t0)).status).toBe("ok");
    const unconfirmed = person("g2", { email: "bea@gmail.com", emailVerified: false });
    expect(await viewShare(db, s.slug, unconfirmed, t0)).toEqual({ status: "not_found" });
  });

  it("an expired or unknown link is not found for everyone, the owner included", async () => {
    const s = await shared({ access: "people", days: 1 });
    expect(await viewShare(db, s.slug, owner, t0 + DAY)).toEqual({ status: "not_found" });
    expect(await viewShare(db, "nope", owner, t0)).toEqual({ status: "not_found" });
  });

  it("private links stay out of the sitemap", async () => {
    await shared({ access: "people" });
    expect(await sitemapShares(db, t0, 10)).toEqual([]);
  });
});

describe("people", () => {
  it("adds, lists and removes, one row per inbox, up to 10", async () => {
    await shared({ access: "people" });
    const first = await addPerson(db, "a", "d1", "Bea@X.co", t0);
    if (!first.ok) throw new Error(first.error);
    expect(first.people.map((p) => p.email)).toEqual(["bea@x.co"]);
    await addPerson(db, "a", "d1", "bea+other@x.co", t0); // the same inbox
    expect((await listPeople(db, "a", "d1"))?.length).toBe(1);
    for (let i = 0; i < 9; i++) await addPerson(db, "a", "d1", `p${i}@x.co`, t0);
    expect(await addPerson(db, "a", "d1", "one-too-many@x.co", t0)).toEqual({
      ok: false,
      error: "limit_reached",
    });
    const id = first.people[0]!.id;
    expect(await removePerson(db, "a", "d1", id)).toBe(true);
    expect(await removePerson(db, "a", "d1", id)).toBe(false);
  });

  it("rejects things that are not addresses and the owner's own, and is owner-only", async () => {
    await shared({ access: "people" });
    for (const bad of ["", "no-at", "a b@x.co", "x".repeat(300) + "@x.co"])
      expect(await addPerson(db, "a", "d1", bad, t0)).toEqual({ ok: false, error: "invalid" });
    expect(await addPerson(db, "a", "d1", "a@x.co", t0)).toEqual({ ok: false, error: "invalid" }); // yourself
    expect(await addPerson(db, "b", "d1", "c@x.co", t0)).toEqual({ ok: false, error: "not_found" });
    expect(await listPeople(db, "b", "d1")).toBeNull();
  });

  it("goes with the link", async () => {
    await shared({ access: "people" });
    await addPerson(db, "a", "d1", "b@x.co", t0);
    await db.delete(shareLinks);
    expect(await db.select().from(sharePeople)).toEqual([]);
  });
});

describe("comments", () => {
  const write = (
    viewer: PublicUser,
    slug: string,
    body: string,
    over: Record<string, unknown> = {},
    now = t0 + 1000,
  ) => addComment(db, viewer, slug, { body, line: 3, snippet: "Body", ...over }, now);

  it("only appear once the owner turns them on, and need a signed-in confirmed reader", async () => {
    const s = await shared();
    expect(await write(bea, s.slug, "Nice")).toEqual({ ok: false, error: "forbidden" }); // off
    await updateShare(db, "a", "d1", { comments: true }, DEFAULT_SHARE, t0);
    expect(await write(person("b", { emailVerified: false }), s.slug, "Nice")).toEqual({
      ok: false,
      error: "forbidden",
    });
    const ok = await write(bea, s.slug, "  Nice work  ");
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.comment).toMatchObject({
      author: "Bea",
      body: "Nice work",
      line: 3,
      mine: true,
      outdated: false,
      resolved: false,
    });
  });

  it("are shown to signed-in readers only, by display name and never by email", async () => {
    const s = await shared({ comments: true });
    await write(bea, s.slug, "From Bea");
    await write(cy, s.slug, "From Cy");
    expect(await listComments(db, null, s.slug, t0 + 2000)).toEqual({
      ok: false,
      error: "sign_in",
    });
    const seen = await listComments(db, bea, s.slug, t0 + 2000);
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.comments.map((c) => [c.author, c.mine])).toEqual([
      ["Bea", true],
      ["Reviewer", false],
    ]);
    expect(JSON.stringify(seen)).not.toContain("@x.co");
  });

  it("follow the access rules of a private link", async () => {
    const s = await shared({ access: "people", comments: true });
    await addPerson(db, "a", "d1", "b@x.co", t0);
    expect((await write(bea, s.slug, "Hello")).ok).toBe(true);
    expect(await write(cy, s.slug, "Let me in")).toEqual({ ok: false, error: "not_found" });
    expect(await listComments(db, cy, s.slug, t0 + 2000)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("check the text, the line, and the parent, and cap what one link can hold", async () => {
    const s = await shared({ comments: true });
    for (const body of ["", "   ", "x".repeat(2001)])
      expect(await write(bea, s.slug, body)).toEqual({ ok: false, error: "invalid" });
    for (const line of [0, -1, 1.5, 1_000_001])
      expect(await write(bea, s.slug, "ok", { line })).toEqual({ ok: false, error: "invalid" });
    expect(
      await write(bea, s.slug, "ok", { snippet: "y".repeat(500) }).then((r) =>
        r.ok ? r.comment.snippet.length : -1,
      ),
    ).toBe(120);
    const top = await write(bea, s.slug, "top");
    if (!top.ok) throw new Error(top.error);
    expect((await write(cy, s.slug, "reply", { parentId: top.comment.id })).ok).toBe(true);
    const reply = await listComments(db, bea, s.slug, t0 + 2000);
    if (!reply.ok) throw new Error(reply.error);
    const replyId = reply.comments.find((c) => c.parentId)!.id;
    expect(await write(bea, s.slug, "nested", { parentId: replyId })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await write(bea, s.slug, "stray", { parentId: "nope" })).toEqual({
      ok: false,
      error: "invalid",
    });
    for (let i = (await db.select().from(shareComments)).length; i < 100; i++)
      await write(bea, s.slug, `c${i}`);
    expect(await write(bea, s.slug, "one more")).toEqual({ ok: false, error: "limit_reached" });
  });

  it("are marked outdated once a newer copy is published, and stay", async () => {
    const s = await shared({ comments: true });
    await write(bea, s.slug, "On version one");
    await pushDocs(
      db,
      "a",
      [
        {
          id: "a:d1",
          baseVersion: 1,
          title: "Plan",
          content: "# Plan\n\nChanged",
          createdAt: t0,
          editedAt: t0 + 10,
        },
      ],
      t0 + 10,
    );
    await publishShare(db, "a", "d1", undefined, DEFAULT_SHARE, t0 + 5000);
    const seen = await listComments(db, bea, s.slug, t0 + 6000);
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.comments[0]).toMatchObject({ body: "On version one", outdated: true });
  });

  it("can be deleted by their author or the owner, resolved by the owner, and replies go with their parent", async () => {
    const s = await shared({ comments: true });
    const top = await write(bea, s.slug, "top");
    if (!top.ok) throw new Error(top.error);
    await write(cy, s.slug, "reply", { parentId: top.comment.id });
    const other = await write(cy, s.slug, "mine");
    if (!other.ok) throw new Error(other.error);
    expect(await deleteComment(db, bea, s.slug, other.comment.id, t0 + 2000)).toBe(false); // not theirs
    expect(await ownerResolveComment(db, "b", "d1", top.comment.id, true)).toBe(false); // not the owner
    expect(await ownerResolveComment(db, "a", "d1", top.comment.id, true)).toBe(true);
    const all = await ownerComments(db, "a", "d1");
    expect(all?.find((c) => c.id === top.comment.id)?.resolved).toBe(true);
    expect(await ownerDeleteComment(db, "a", "d1", other.comment.id)).toBe(true);
    expect(await deleteComment(db, bea, s.slug, top.comment.id, t0 + 2000)).toBe(true);
    expect(await db.select().from(shareComments)).toEqual([]); // the reply went too
  });

  it("go when the link is taken down", async () => {
    const s = await shared({ comments: true });
    await write(bea, s.slug, "hello");
    await db.delete(shareLinks);
    expect(await db.select().from(shareComments)).toEqual([]);
  });
});

describe("after a link expires", () => {
  it("the owner keeps the comments for 30 days, and republishing keeps them under a new address", async () => {
    const s = await shared({ comments: true, days: 1 });
    await addComment(db, bea, s.slug, { body: "Kept", line: 1 }, t0 + 1000);
    const later = t0 + 10 * DAY;
    expect(await viewShare(db, s.slug, bea, later)).toEqual({ status: "not_found" });
    expect(await listShares(db, "a", later)).toEqual([]); // not listed as live
    expect((await ownerComments(db, "a", "d1"))?.map((c) => c.body)).toEqual(["Kept"]);

    const again = await publishShare(db, "a", "d1", undefined, DEFAULT_SHARE, later);
    if (!again.ok) throw new Error(again.error);
    expect(again.created).toBe(true);
    expect(again.share.slug).not.toBe(s.slug);
    expect((await ownerComments(db, "a", "d1"))?.map((c) => c.body)).toEqual(["Kept"]);
    expect((await db.select().from(shareLinks)).length).toBe(1);
  });

  it("clears the link and its comments 30 days after it ran out", async () => {
    const s = await shared({ comments: true, days: 1 });
    await addComment(db, bea, s.slug, { body: "Gone", line: 1 }, t0 + 1000);
    await listShares(db, "a", t0 + DAY + 29 * DAY);
    expect((await db.select().from(shareLinks)).length).toBe(1);
    await listShares(db, "a", t0 + DAY + 31 * DAY);
    expect(await db.select().from(shareLinks)).toEqual([]);
    expect(await db.select().from(shareComments)).toEqual([]);
  });
});
