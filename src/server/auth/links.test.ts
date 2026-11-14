// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { oauthAccounts, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { linkSocial, linkedProviders, unlinkSocial } from "./links";
import { signup } from "./service";
import { socialSignIn } from "./social";

let db: Db;
let ada: { id: string; email: string };
const now = 1_700_000_000_000;
const password = "the first long password";
const profile = (id: string, extra: object = {}) => ({
  id,
  email: "someone@elsewhere.example",
  verified: true,
  name: "Someone",
  avatar: "https://img.example/a.png",
  ...extra,
});

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  const r = await signup(db, { email: "ada@example.com", password }, now, { verifyByEmail: false });
  if ("error" in r) throw new Error(r.error);
  ada = r.user;
});

describe("linkSocial", () => {
  it("adds a provider identity even when its email is not the account's", async () => {
    expect(await linkSocial(db, "github", profile("gh-1"), ada.id, now)).toEqual({ ok: true });
    expect(await linkedProviders(db, ada.id)).toEqual(["github"]);
    // and signing in with it now reaches this account, not a new one
    const signed = await socialSignIn(db, "github", profile("gh-1"), now);
    if ("error" in signed) throw new Error(signed.error);
    expect(signed.user.id).toBe(ada.id);
  });
  it("is harmless to repeat, and fills in a name or picture the account lacks, never replacing one", async () => {
    await linkSocial(db, "github", profile("gh-1"), ada.id, now);
    expect(await linkSocial(db, "github", profile("gh-1"), ada.id, now)).toEqual({ ok: true });
    expect(await db.select().from(oauthAccounts)).toHaveLength(1);
    const [row] = await db.select().from(users).where(eq(users.id, ada.id));
    expect(row).toMatchObject({ displayName: "Someone", avatarUrl: "https://img.example/a.png" });
    await db.update(users).set({ displayName: "Ada" }).where(eq(users.id, ada.id));
    await linkSocial(db, "google", profile("g-1", { name: "Other" }), ada.id, now);
    expect((await db.select().from(users).where(eq(users.id, ada.id)))[0]?.displayName).toBe("Ada");
  });
  it("refuses an identity that belongs to another account", async () => {
    const bob = await signup(db, { email: "bob@example.com", password }, now, {
      verifyByEmail: false,
    });
    if ("error" in bob) throw new Error(bob.error);
    await linkSocial(db, "github", profile("gh-1"), bob.user.id, now);
    expect(await linkSocial(db, "github", profile("gh-1"), ada.id, now)).toEqual({
      ok: false,
      error: "already_linked",
    });
    expect(await linkedProviders(db, ada.id)).toEqual([]);
  });
  it("allows one identity per provider: unlink the first to use another", async () => {
    await linkSocial(db, "github", profile("gh-1"), ada.id, now);
    expect(await linkSocial(db, "github", profile("gh-2"), ada.id, now)).toEqual({
      ok: false,
      error: "provider_taken",
    });
  });
});

describe("unlinkSocial", () => {
  it("removes a provider while the account can still sign in another way", async () => {
    await linkSocial(db, "github", profile("gh-1"), ada.id, now);
    await linkSocial(db, "google", profile("g-1"), ada.id, now);
    expect(await unlinkSocial(db, "github", ada.id)).toEqual({ ok: true });
    expect(await linkedProviders(db, ada.id)).toEqual(["google"]);
  });
  it("keeps the last way to sign in", async () => {
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, ada.id));
    await linkSocial(db, "github", profile("gh-1"), ada.id, now);
    expect(await unlinkSocial(db, "github", ada.id)).toEqual({ ok: false, error: "last_method" });
    await linkSocial(db, "google", profile("g-1"), ada.id, now);
    expect(await unlinkSocial(db, "github", ada.id)).toEqual({ ok: true });
    expect(await unlinkSocial(db, "google", ada.id)).toEqual({ ok: false, error: "last_method" });
  });
  it("says so when the provider was not linked", async () => {
    expect(await unlinkSocial(db, "github", ada.id)).toEqual({ ok: false, error: "not_linked" });
  });
});
