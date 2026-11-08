// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { shareLinks, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { sha256Hex } from "../auth/tokens";
import { pushDocs } from "../sync/service";
import {
  DEFAULT_SHARE,
  extendShare,
  getPublicShare,
  listShares,
  publishShare,
  revokeShare,
  sitemapShares,
} from "./service";

const DAY = 86_400_000;
const t0 = 1_700_000_000_000;
let db: Db;

const draft = (over: Record<string, unknown> = {}) => ({
  id: "a:d1",
  baseVersion: 0,
  title: "Launch notes",
  content: "# Launch notes\n\nFirst version",
  createdAt: t0 - 1000,
  editedAt: t0,
  ...over,
});
const cloud = (item = draft()) => pushDocs(db, "a", [item], t0);
const rows = async () => db.select().from(shareLinks);

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  for (const id of ["a", "b"])
    await db.insert(users).values({ id, email: `${id}@x.co`, createdAt: t0, updatedAt: t0 });
});

describe("publishShare", () => {
  it("publishes a cloud draft as a snapshot that expires in 4 days by default", async () => {
    await cloud();
    const r = await publishShare(db, "a", "d1", undefined, DEFAULT_SHARE, t0);
    if (!r.ok) throw new Error(r.error);
    expect(r.created).toBe(true);
    expect(r.share).toMatchObject({ id: "d1", publishedAt: t0, expiresAt: t0 + 4 * DAY });
    expect(r.share.slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(await getPublicShare(db, r.share.slug, t0 + 1)).toEqual({
      title: "Launch notes",
      content: "# Launch notes\n\nFirst version",
      publishedAt: t0,
      expiresAt: t0 + 4 * DAY,
    });
  });

  it("only publishes the caller's own live cloud drafts", async () => {
    expect(await publishShare(db, "a", "d1", 2, DEFAULT_SHARE, t0)).toEqual({
      ok: false,
      error: "not_found",
    }); // never in the cloud
    await cloud();
    expect(await publishShare(db, "b", "d1", 2, DEFAULT_SHARE, t0)).toEqual({
      ok: false,
      error: "not_found",
    }); // someone else's
    await cloud(draft({ baseVersion: 1, deleted: true, editedAt: t0 + 5 }));
    expect(await publishShare(db, "a", "d1", 2, DEFAULT_SHARE, t0 + 10)).toEqual({
      ok: false,
      error: "not_found",
    }); // deleted
    expect(await rows()).toEqual([]);
  });

  it("refuses ids that could reach into another namespace", async () => {
    await cloud();
    for (const id of ["", "a:d1", "../d1", "d1 "])
      expect(await publishShare(db, "a", id, 2, DEFAULT_SHARE, t0)).toEqual({
        ok: false,
        error: "not_found",
      });
  });

  it("keeps the public text until the writer publishes the update", async () => {
    await cloud();
    const first = await publishShare(db, "a", "d1", 3, DEFAULT_SHARE, t0);
    if (!first.ok) throw new Error(first.error);
    await cloud(
      draft({ baseVersion: 1, content: "# Launch notes\n\nSecond version", editedAt: t0 + 10 }),
    );
    expect((await getPublicShare(db, first.share.slug, t0 + 20))?.content).toContain("First");

    const again = await publishShare(db, "a", "d1", undefined, DEFAULT_SHARE, t0 + 1000);
    if (!again.ok) throw new Error(again.error);
    expect(again.created).toBe(false);
    expect(again.share.slug).toBe(first.share.slug); // same address
    expect(again.share.expiresAt).toBe(t0 + 3 * DAY); // same expiry unless a new one is asked for
    expect(again.share.publishedAt).toBe(t0 + 1000);
    expect((await getPublicShare(db, first.share.slug, t0 + 2000))?.content).toContain("Second");
    expect(await rows()).toHaveLength(1); // one link per draft
  });

  it("can set a new expiry while publishing an update", async () => {
    await cloud();
    await publishShare(db, "a", "d1", 3, DEFAULT_SHARE, t0);
    const r = await publishShare(db, "a", "d1", 6, DEFAULT_SHARE, t0 + DAY);
    if (!r.ok) throw new Error(r.error);
    expect(r.share.expiresAt).toBe(t0 + DAY + 6 * DAY);
  });

  it("accepts 1 to the maximum number of whole days, and nothing else", async () => {
    await cloud();
    for (const days of [0, 8, 1.5, -1, Number.NaN, Infinity])
      expect(await publishShare(db, "a", "d1", days, DEFAULT_SHARE, t0)).toEqual({
        ok: false,
        error: "invalid",
      });
    expect((await publishShare(db, "a", "d1", 1, DEFAULT_SHARE, t0)).ok).toBe(true);
    expect((await publishShare(db, "a", "d1", 7, DEFAULT_SHARE, t0)).ok).toBe(true);
  });

  it("follows the configured default and maximum", async () => {
    await cloud();
    const cfg = { defaultDays: 2, maxDays: 3, privateLinks: true };
    const r = await publishShare(db, "a", "d1", undefined, cfg, t0);
    if (!r.ok) throw new Error(r.error);
    expect(r.share.expiresAt).toBe(t0 + 2 * DAY);
    expect(await publishShare(db, "a", "d1", 4, cfg, t0)).toEqual({ ok: false, error: "invalid" });
  });

  it("gives an expired link a new address when it is published again", async () => {
    await cloud();
    const old = await publishShare(db, "a", "d1", 1, DEFAULT_SHARE, t0);
    if (!old.ok) throw new Error(old.error);
    const later = t0 + 2 * DAY;
    expect(await getPublicShare(db, old.share.slug, later)).toBeNull();
    const fresh = await publishShare(db, "a", "d1", undefined, DEFAULT_SHARE, later);
    if (!fresh.ok) throw new Error(fresh.error);
    expect(fresh.created).toBe(true);
    expect(fresh.share.slug).not.toBe(old.share.slug);
    expect(await getPublicShare(db, old.share.slug, later)).toBeNull();
    expect(await rows()).toHaveLength(1);
  });
});

describe("getPublicShare", () => {
  it("is null for an unknown slug and exactly at the expiry time", async () => {
    await cloud();
    const r = await publishShare(db, "a", "d1", 1, DEFAULT_SHARE, t0);
    if (!r.ok) throw new Error(r.error);
    expect(await getPublicShare(db, "nope", t0)).toBeNull();
    expect(await getPublicShare(db, r.share.slug, t0 + DAY - 1)).not.toBeNull();
    expect(await getPublicShare(db, r.share.slug, t0 + DAY)).toBeNull();
  });
});

describe("extendShare", () => {
  it("sets the expiry that many days from now, longer or shorter", async () => {
    await cloud();
    await publishShare(db, "a", "d1", 2, DEFAULT_SHARE, t0);
    const longer = await extendShare(db, "a", "d1", 7, DEFAULT_SHARE, t0 + DAY);
    if (!longer.ok) throw new Error(longer.error);
    expect(longer.share.expiresAt).toBe(t0 + 8 * DAY);
    const shorter = await extendShare(db, "a", "d1", 1, DEFAULT_SHARE, t0 + DAY);
    if (!shorter.ok) throw new Error(shorter.error);
    expect(shorter.share.expiresAt).toBe(t0 + 2 * DAY);
  });

  it("refuses bad days, other people's links and expired links", async () => {
    await cloud();
    await publishShare(db, "a", "d1", 2, DEFAULT_SHARE, t0);
    expect(await extendShare(db, "a", "d1", 8, DEFAULT_SHARE, t0)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await extendShare(db, "b", "d1", 2, DEFAULT_SHARE, t0)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await extendShare(db, "a", "d1", 2, DEFAULT_SHARE, t0 + 3 * DAY)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("revokeShare", () => {
  it("takes the link down at once, and only for its owner", async () => {
    await cloud();
    const r = await publishShare(db, "a", "d1", 2, DEFAULT_SHARE, t0);
    if (!r.ok) throw new Error(r.error);
    expect(await revokeShare(db, "b", "d1")).toBe(false);
    expect(await getPublicShare(db, r.share.slug, t0)).not.toBeNull();
    expect(await revokeShare(db, "a", "d1")).toBe(true);
    expect(await getPublicShare(db, r.share.slug, t0)).toBeNull();
    expect(await revokeShare(db, "a", "d1")).toBe(false);
  });
});

describe("listShares", () => {
  it("lists the caller's live links with a hash of the published text, and drops expired ones", async () => {
    await cloud();
    await cloud(draft({ id: "a:d2", title: "Other", content: "# Other", editedAt: t0 + 1 }));
    await publishShare(db, "a", "d1", 5, DEFAULT_SHARE, t0);
    await publishShare(db, "a", "d2", 1, DEFAULT_SHARE, t0);
    const list = await listShares(db, "a", t0 + 2 * DAY);
    expect(list.map((s) => s.id)).toEqual(["d1"]);
    expect(list[0]!.hash).toBe(await sha256Hex("# Launch notes\n\nFirst version"));
    expect(await rows()).toHaveLength(2); // an expired one is kept for a while, but not listed
    expect(await listShares(db, "b", t0)).toEqual([]);
  });
});

describe("when a draft goes", () => {
  it("deleting the draft from the cloud removes its link", async () => {
    await cloud();
    const r = await publishShare(db, "a", "d1", 5, DEFAULT_SHARE, t0);
    if (!r.ok) throw new Error(r.error);
    await cloud(draft({ baseVersion: 1, deleted: true, editedAt: t0 + 5 }));
    expect(await getPublicShare(db, r.share.slug, t0 + 10)).toBeNull();
    expect(await rows()).toEqual([]);
  });
});

describe("sitemapShares", () => {
  it("lists live links, newest first, up to the limit", async () => {
    for (const [i, id] of ["d1", "d2", "d3"].entries())
      await cloud(draft({ id: `a:${id}`, title: id, content: `# ${id}`, editedAt: t0 + i }));
    await publishShare(db, "a", "d1", 1, DEFAULT_SHARE, t0);
    await publishShare(db, "a", "d2", 5, DEFAULT_SHARE, t0 + 10);
    await publishShare(db, "a", "d3", 5, DEFAULT_SHARE, t0 + 20);
    const all = await sitemapShares(db, t0 + 2 * DAY, 10);
    expect(all.map((s) => s.updatedAt)).toEqual([t0 + 20, t0 + 10]); // d1 expired
    expect(await sitemapShares(db, t0 + 2 * DAY, 1)).toHaveLength(1);
  });
});
