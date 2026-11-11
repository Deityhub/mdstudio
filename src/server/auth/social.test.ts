// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { emailTokens, oauthAccounts, sessions, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { updateSettings } from "../settings/service";
import { login, signup, userForToken } from "./service";
import { socialSignIn, type SocialProfile } from "./social";

const now = 1_700_000_000_000;
const password = "a long enough password";
let db: Db;
beforeEach(() => void (db = createNodeDb(":memory:") as unknown as Db));

const profile = (over: Partial<SocialProfile> = {}): SocialProfile => ({
  id: "g-1",
  email: "ada@example.com",
  verified: true,
  name: "Ada L",
  avatar: "https://a/b.png",
  ...over,
});
const ok = async (provider: "google" | "github", p: SocialProfile) => {
  const result = await socialSignIn(db, provider, p, now);
  if ("error" in result) throw new Error(result.error);
  return result;
};

describe("socialSignIn", () => {
  it("creates a password-less, confirmed user with a session", async () => {
    const result = await ok("google", profile());
    expect(result.user).toMatchObject({
      email: "ada@example.com",
      displayName: "Ada L",
      emailVerified: true,
      isAdmin: true, // the first account
    });
    expect((await userForToken(db, result.token, now))?.user.id).toBe(result.user.id);
    // the picture comes with the user, for the account menu
    expect(result.user.avatarUrl).toBe("https://a/b.png");
    expect((await userForToken(db, result.token, now))?.user.avatarUrl).toBe("https://a/b.png");
    const [row] = await db.select().from(users);
    expect(row?.passwordHash).toBeNull();
    expect(await db.select().from(oauthAccounts)).toMatchObject([
      { provider: "google", providerUserId: "g-1" },
    ]);
  });

  it("signs a known identity into the same user, even if its email changed", async () => {
    const first = await ok("google", profile());
    const again = await ok("google", profile({ email: "new@example.com" }));
    expect(again.user.id).toBe(first.user.id);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("does not mix up two providers that use the same id", async () => {
    const google = await ok("google", profile({ id: "7" }));
    const github = await ok("github", profile({ id: "7", email: "other@example.com" }));
    expect(github.user.id).not.toBe(google.user.id);
  });

  it("refuses an email the provider has not verified", async () => {
    expect(await socialSignIn(db, "google", profile({ verified: false }), now)).toEqual({
      error: "no_verified_email",
    });
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("links Google to a confirmed password account with the same email", async () => {
    const made = await signup(db, { email: "ada@example.com", password }, now);
    if ("error" in made) throw new Error(made.error);
    const result = await ok("google", profile());
    expect(result.user.id).toBe(made.user.id);
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(oauthAccounts)).toHaveLength(1);
    // the password still works
    expect("error" in (await login(db, { email: "ada@example.com", password }, now))).toBe(false);
  });

  it("links by the same inbox, however the address is spelled", async () => {
    const made = await signup(db, { email: "ada.l@gmail.com", password }, now);
    if ("error" in made) throw new Error(made.error);
    const result = await ok("google", profile({ email: "adal+news@googlemail.com" }));
    expect(result.user.id).toBe(made.user.id);
  });

  it("one account for Google and GitHub with the same email, whichever comes first", async () => {
    const google = await ok("google", profile());
    const github = await ok("github", profile({ id: "42" }));
    expect(github.user.id).toBe(google.user.id);
    expect(await db.select().from(users)).toHaveLength(1);
    expect((await db.select().from(oauthAccounts)).map((a) => a.provider).sort()).toEqual([
      "github",
      "google",
    ]);
    // and the other way round
    const again = await ok("github", profile({ id: "42" }));
    expect(again.user.id).toBe(google.user.id);
  });

  it("takes over an unconfirmed password account: its password and sessions are gone", async () => {
    // Sign-up with mail on leaves the address unconfirmed, so whoever made it may not own it.
    const made = await signup(db, { email: "ada@example.com", password }, now, {
      verifyByEmail: true,
    });
    if ("error" in made) throw new Error(made.error);
    await db.insert(emailTokens).values({
      id: "t",
      userId: made.user.id,
      tokenHash: "h",
      email: "ada@example.com",
      purpose: "verify",
      expiresAt: now + 1000,
      createdAt: now,
    });
    const result = await ok("google", profile());
    expect(result.user.id).toBe(made.user.id);
    expect(result.user.emailVerified).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, made.user.id));
    expect(row?.passwordHash).toBeNull();
    expect(row?.emailVerifiedAt).toBe(now);
    expect(await db.select().from(emailTokens)).toHaveLength(0);
    // only the new session is left, the pre-registrant's is gone
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await userForToken(db, made.token, now)).toBeNull();
    expect(await login(db, { email: "ada@example.com", password }, now)).toMatchObject({
      error: "invalid_credentials",
    });
  });

  it("keeps the name and avatar of an account it links to", async () => {
    await db.insert(users).values({
      id: "u1",
      email: "ada@example.com",
      emailKey: "ada@example.com",
      emailVerifiedAt: now,
      displayName: "Mine",
      createdAt: now,
      updatedAt: now,
    });
    await ok("google", profile());
    const [row] = await db.select().from(users);
    expect(row?.displayName).toBe("Mine");
  });

  it("fills in a missing name and picture when it links, and keeps what is there", async () => {
    await db.insert(users).values([
      {
        id: "u1",
        email: "ada@example.com",
        emailKey: "ada@example.com",
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "u2",
        email: "bo@example.com",
        emailKey: "bo@example.com",
        emailVerifiedAt: now,
        displayName: "Bo",
        avatarUrl: "https://mine/b.png",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const filled = await ok("google", profile());
    expect(filled.user).toMatchObject({
      id: "u1",
      displayName: "Ada L",
      avatarUrl: "https://a/b.png",
    });
    const kept = await ok("google", profile({ id: "g-2", email: "bo@example.com" }));
    expect(kept.user).toMatchObject({
      id: "u2",
      displayName: "Bo",
      avatarUrl: "https://mine/b.png",
    });
  });

  it("does not sign in, or link to, a suspended account", async () => {
    const made = await ok("google", profile());
    await db.update(users).set({ suspendedAt: now }).where(eq(users.id, made.user.id));
    expect(await socialSignIn(db, "google", profile(), now)).toEqual({ error: "suspended" });
    // same email through another provider: not linked either
    expect(await socialSignIn(db, "github", profile({ id: "42" }), now)).toEqual({
      error: "suspended",
    });
    expect(await db.select().from(oauthAccounts)).toHaveLength(1);
  });

  it("refuses to create an account while sign-ups are closed, but still signs people in", async () => {
    const made = await ok("google", profile());
    await updateSettings(db, { signupsOpen: false });
    expect(
      await socialSignIn(db, "google", profile({ id: "g-2", email: "b@example.com" }), now),
    ).toEqual({ error: "signups_closed" });
    expect((await ok("google", profile())).user.id).toBe(made.user.id);
    // linking to an existing account is not a sign-up
    expect((await ok("github", profile({ id: "42" }))).user.id).toBe(made.user.id);
  });

  it("makes only the first account an admin", async () => {
    expect((await ok("google", profile())).user.isAdmin).toBe(true);
    expect((await ok("google", profile({ id: "g-2", email: "b@example.com" }))).user.isAdmin).toBe(
      false,
    );
  });
});
