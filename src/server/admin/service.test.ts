// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { assets, sessions, users } from "../../../infra/db/schema";
import { login, signup, userForToken } from "../auth/service";
import type { Db } from "../db";
import { DEFAULT_SHARE, getPublicShare, publishShare } from "../share/service";
import { pushDocs } from "../sync/service";
import {
  audit,
  deleteUser,
  listAudit,
  listUsers,
  overview,
  removeDraft,
  removeShare,
  signOutEverywhere,
  updateUser,
  userContent,
  userDetail,
} from "./service";

const t0 = 1_700_000_000_000;
let db: Db;
const noEnv = () => undefined;

beforeEach(() => {
  db = createNodeDb(":memory:") as unknown as Db;
});

const join = async (email: string, now = t0) => {
  const r = await signup(db, { email, password: "a long enough password" }, now);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("who is an admin", () => {
  it("is the first account ever made, and nobody after", async () => {
    const first = await join("first@x.co");
    const second = await join("second@x.co", t0 + 1);
    expect(first.user.isAdmin).toBe(true);
    expect(second.user.isAdmin).toBe(false);
    expect((await userForToken(db, first.token, t0 + 5))?.user.isAdmin).toBe(true);
    expect((await userForToken(db, second.token, t0 + 5))?.user.isAdmin).toBe(false);
  });
  it("can be given to or taken from an account with a plain update", async () => {
    const first = await join("first@x.co");
    const second = await join("second@x.co", t0 + 1);
    await db.update(users).set({ role: "admin" }).where(eq(users.id, second.user.id));
    expect((await userForToken(db, second.token, t0 + 5))?.user.isAdmin).toBe(true);
    void first;
  });
});

import { eq } from "drizzle-orm";

describe("suspending an account", () => {
  it("ends its sessions, blocks sign-in (once the password is right) and hides its links", async () => {
    await join("admin@x.co");
    const writer = await join("writer@x.co", t0 + 1);
    const admin = (await db.select().from(users).where(eq(users.email, "admin@x.co")))[0]!;
    await pushDocs(
      db,
      writer.user.id,
      [
        {
          id: `${writer.user.id}:d1`,
          baseVersion: 0,
          title: "Notes",
          content: "# Notes",
          createdAt: 1,
          editedAt: t0,
        },
      ],
      t0,
    );
    const shared = await publishShare(db, writer.user.id, "d1", undefined, DEFAULT_SHARE, t0);
    if (!shared.ok) throw new Error(shared.error);
    expect(await getPublicShare(db, shared.share.slug, t0 + 1)).not.toBeNull();

    expect(await updateUser(db, admin.id, writer.user.id, { suspended: true }, t0 + 2)).toEqual({
      ok: true,
    });
    expect(await userForToken(db, writer.token, t0 + 3)).toBeNull();
    expect(await getPublicShare(db, shared.share.slug, t0 + 3)).toBeNull();
    expect(await login(db, { email: "writer@x.co", password: "a long enough password" })).toEqual({
      error: "suspended",
    });
    // a wrong password still looks like any wrong password
    expect(await login(db, { email: "writer@x.co", password: "wrong wrong wrong" })).toEqual({
      error: "invalid_credentials",
    });

    await updateUser(db, admin.id, writer.user.id, { suspended: false });
    expect(
      "token" in (await login(db, { email: "writer@x.co", password: "a long enough password" })),
    ).toBe(true);
    expect(await getPublicShare(db, shared.share.slug, t0 + 4)).not.toBeNull();
  });
});

describe("changing an account", () => {
  it("changes role, plan, limits and confirmation, and refuses unknown values", async () => {
    const admin = await join("admin@x.co");
    const w = await join("w@x.co", t0 + 1);
    expect(
      await updateUser(db, admin.user.id, w.user.id, {
        role: "admin",
        emailVerified: true,
        limits: { cloud_docs: 9 },
      }),
    ).toEqual({ ok: true });
    const d = await userDetail(db, noEnv, w.user.id);
    expect(d?.account).toMatchObject({ role: "admin", emailVerified: true });
    expect(d?.limits?.cloud_docs).toEqual({ value: 9, source: "override" });
    for (const bad of [
      { role: "root" },
      { suspended: "yes" },
      { plan: "made-up" },
      { limits: { cloud_docs: -1 } },
    ])
      expect(await updateUser(db, admin.user.id, w.user.id, bad)).toEqual({
        ok: false,
        error: "invalid",
      });
    expect(await updateUser(db, admin.user.id, "ghost", { role: "user" })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
  it("never lets the dashboard lock everyone out", async () => {
    const admin = await join("admin@x.co");
    const w = await join("w@x.co", t0 + 1);
    expect(await updateUser(db, admin.user.id, admin.user.id, { role: "user" })).toEqual({
      ok: false,
      error: "self",
    });
    expect(await updateUser(db, admin.user.id, admin.user.id, { suspended: true })).toEqual({
      ok: false,
      error: "self",
    });
    // another admin may not take the last admin away either
    await db.update(users).set({ role: "admin" }).where(eq(users.id, w.user.id));
    await db.update(users).set({ role: "user" }).where(eq(users.id, admin.user.id));
    expect(await updateUser(db, w.user.id, w.user.id, { role: "user" })).toEqual({
      ok: false,
      error: "self",
    });
    const third = await join("third@x.co", t0 + 2);
    expect(await updateUser(db, third.user.id, w.user.id, { role: "user" })).toEqual({
      ok: false,
      error: "last_admin",
    });
  });
  it("signs an account out everywhere", async () => {
    const w = await join("w@x.co");
    await login(db, { email: "w@x.co", password: "a long enough password" });
    expect(await signOutEverywhere(db, w.user.id)).toBe(2);
    expect(await db.select().from(sessions)).toEqual([]);
  });
});

describe("the account list and overview", () => {
  it("lists newest first, searches and pages", async () => {
    await join("ann@x.co", t0);
    await join("bob@y.co", t0 + 1);
    await join("cat@x.co", t0 + 2);
    const all = await listUsers(db, { q: "", limit: 2, offset: 0 });
    expect(all.total).toBe(3);
    expect(all.users.map((u) => u.email)).toEqual(["cat@x.co", "bob@y.co"]);
    expect((await listUsers(db, { q: "", limit: 2, offset: 2 })).users.map((u) => u.email)).toEqual(
      ["ann@x.co"],
    );
    expect((await listUsers(db, { q: "@x.co", limit: 10, offset: 0 })).users).toHaveLength(2);
    expect(Object.keys(all.users[0]!)).not.toContain("passwordHash");
  });
  it("counts what the site holds", async () => {
    const a = await join("a@x.co");
    await join("b@x.co", t0 + 1);
    await pushDocs(
      db,
      a.user.id,
      [
        {
          id: `${a.user.id}:d1`,
          baseVersion: 0,
          title: "T",
          content: "x",
          createdAt: 1,
          editedAt: t0,
        },
      ],
      t0,
    );
    const o = await overview(db, t0 + 10);
    expect(o).toMatchObject({
      accounts: 2,
      admins: 1,
      suspended: 0,
      drafts: 1,
      shares: 0,
      images: 0,
    });
    expect(o.newThisWeek).toBe(2);
  });
});

describe("an account's content", () => {
  it("shows titles and sizes but never the text, and can remove a draft, a link and an image", async () => {
    const admin = await join("admin@x.co");
    const w = await join("w@x.co", t0 + 1);
    await pushDocs(
      db,
      w.user.id,
      [
        {
          id: `${w.user.id}:d1`,
          baseVersion: 0,
          title: "Secret plans",
          content: "THE PRIVATE TEXT",
          createdAt: 1,
          editedAt: t0,
        },
      ],
      t0,
    );
    const shared = await publishShare(db, w.user.id, "d1", undefined, DEFAULT_SHARE, t0);
    if (!shared.ok) throw new Error(shared.error);
    await db.insert(assets).values({
      id: "img1",
      userId: w.user.id,
      storageKey: "k.png",
      fileName: "k.png",
      mimeType: "image/png",
      byteSize: 5,
      sha256: "h",
      createdAt: t0,
    });
    const c = await userContent(db, w.user.id, t0 + 1);
    expect(JSON.stringify(c)).not.toContain("THE PRIVATE TEXT");
    expect(c.drafts).toEqual([
      expect.objectContaining({ id: "d1", title: "Secret plans", bytes: 16 }),
    ]);
    expect(c.shares[0]).toMatchObject({ id: "d1", live: true });
    expect(c.images[0]).toMatchObject({ id: "img1", bytes: 5 });

    expect(await removeShare(db, w.user.id, "d1")).toBe(true);
    expect(await removeShare(db, w.user.id, "d1")).toBe(false);
    expect(await removeDraft(db, w.user.id, "d1", t0 + 2)).toBe(true);
    expect(await removeDraft(db, w.user.id, "d1")).toBe(false);
    expect((await userContent(db, w.user.id)).drafts).toEqual([]);
    void admin;
  });
});

describe("deleting an account", () => {
  it("removes it and its image files, but not yourself or the last admin", async () => {
    const admin = await join("admin@x.co");
    const w = await join("w@x.co", t0 + 1);
    await db.insert(assets).values({
      id: "img1",
      userId: w.user.id,
      storageKey: "k.png",
      fileName: "k.png",
      mimeType: "image/png",
      byteSize: 5,
      sha256: "h",
      createdAt: t0,
    });
    const fake = { delete: vi.fn(async () => {}) };
    const store = fake as never;
    expect(await deleteUser(db, store, admin.user.id, admin.user.id)).toEqual({
      ok: false,
      error: "self",
    });
    expect(await deleteUser(db, store, w.user.id, admin.user.id)).toEqual({
      ok: false,
      error: "last_admin",
    });
    expect(await deleteUser(db, store, admin.user.id, w.user.id)).toEqual({ ok: true });
    expect(fake.delete).toHaveBeenCalledWith("k.png");
    expect(await db.select().from(assets)).toEqual([]);
    expect(await deleteUser(db, store, admin.user.id, w.user.id)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("the audit log", () => {
  it("keeps who did what to whom, newest first, even after the account is gone", async () => {
    const a = { id: "admin1", email: "admin@x.co" };
    await audit(db, a, "user.update", { id: "u1", email: "w@x.co" }, { role: "admin" }, t0);
    await audit(db, a, "settings.update", undefined, { signupsOpen: false }, t0 + 5);
    const log = await listAudit(db, { limit: 10, offset: 0 });
    expect(log.total).toBe(2);
    expect(log.entries.map((e) => e.action)).toEqual(["settings.update", "user.update"]);
    expect(log.entries[1]).toMatchObject({
      actorEmail: "admin@x.co",
      targetEmail: "w@x.co",
      detail: { role: "admin" },
    });
  });
});
