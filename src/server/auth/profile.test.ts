// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { emailTokens, sessions, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { changePassword, updateProfile } from "./profile";
import { issueReset } from "./reset";
import { login, signup, startSession, userForToken } from "./service";

let db: Db;
let user: { id: string; email: string };
let token: string;
const now = 1_700_000_000_000;
const creds = { email: "ada@example.com", password: "the first long password" };
const next = "a brand new long password";

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  const r = await signup(db, creds, now, { verifyByEmail: false });
  if ("error" in r) throw new Error(r.error);
  user = r.user;
  token = r.token;
});

describe("updateProfile", () => {
  it("sets the display name, trimmed, and shows it in the session's user", async () => {
    const r = await updateProfile(db, user.id, { displayName: "  Ada L.  " }, now);
    expect(r).toMatchObject({ ok: true, user: { displayName: "Ada L." } });
    expect((await userForToken(db, token, now))?.user.displayName).toBe("Ada L.");
  });
  it("clears the name when it is empty, and refuses a name that is too long", async () => {
    await updateProfile(db, user.id, { displayName: "Ada" }, now);
    expect(await updateProfile(db, user.id, { displayName: "   " }, now)).toMatchObject({
      ok: true,
      user: { displayName: null },
    });
    expect(await updateProfile(db, user.id, { displayName: "x".repeat(61) }, now)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await updateProfile(db, user.id, {}, now)).toEqual({ ok: false, error: "invalid" });
  });
});

describe("changePassword", () => {
  it("needs the current password, then signs in with the new one only", async () => {
    expect(await changePassword(db, user.id, token, { current: "wrong password!!", next })).toEqual(
      { ok: false, error: "wrong_password" },
    );
    expect(await changePassword(db, user.id, token, { next })).toEqual({
      ok: false,
      error: "wrong_password",
    });
    expect(
      await changePassword(db, user.id, token, { current: creds.password, next }, now),
    ).toEqual({ ok: true });
    expect(await login(db, { email: creds.email, password: next }, now)).toHaveProperty("token");
    expect(await login(db, creds, now)).toEqual({ error: "invalid_credentials" });
  });
  it("keeps this session and ends the account's others, and its reset links", async () => {
    const other = await startSession(db, { ...(await userForToken(db, token, now))!.user }, now);
    await issueReset(db, user, now);
    await changePassword(db, user.id, token, { current: creds.password, next }, now);
    expect(await userForToken(db, token, now)).not.toBeNull();
    expect(await userForToken(db, other.token, now)).toBeNull();
    expect(await db.select().from(emailTokens).where(eq(emailTokens.userId, user.id))).toEqual([]);
  });
  it("turns away a weak or unchanged password without touching anything", async () => {
    const same = { current: creds.password, next: creds.password };
    expect(await changePassword(db, user.id, token, same)).toEqual({ ok: false, error: "same" });
    expect(
      await changePassword(db, user.id, token, { current: creds.password, next: "short" }),
    ).toEqual({ ok: false, error: "invalid" });
    expect(await login(db, creds, now)).toHaveProperty("token");
  });
  it("lets an account with no password (a social sign-in) set one without a current one", async () => {
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, user.id));
    expect(await changePassword(db, user.id, token, { next }, now)).toEqual({ ok: true });
    expect(await login(db, { email: creds.email, password: next }, now)).toHaveProperty("token");
    expect((await db.select().from(sessions)).length).toBeGreaterThan(0);
  });
  it("says whether the account has a password", async () => {
    expect((await userForToken(db, token, now))?.user.hasPassword).toBe(true);
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, user.id));
    expect((await userForToken(db, token, now))?.user.hasPassword).toBe(false);
  });
});
