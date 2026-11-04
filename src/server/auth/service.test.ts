// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import type { Db } from "../db";
import { SESSION_MAX_MS, SESSION_MS, login, logout, signup, userForToken } from "./service";

let db: Db;
const now = 1_700_000_000_000;
const creds = { email: "Ada@Example.com", password: "a long enough password" };

beforeEach(() => {
  db = createNodeDb(":memory:") as unknown as Db;
});

describe("signup", () => {
  it("creates a user with a normalized email and signs them in", async () => {
    const result = await signup(db, creds, now);
    if ("error" in result) throw new Error(result.error);
    expect(result.user).toMatchObject({ email: "ada@example.com" });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect((await userForToken(db, result.token, now))?.user).toEqual(result.user);
  });

  it("rejects a taken email, whatever its case", async () => {
    await signup(db, creds, now);
    expect(await signup(db, { ...creds, email: "ADA@example.com" }, now)).toEqual({
      error: "email_taken",
    });
  });

  it("rejects weak input", async () => {
    expect(await signup(db, { email: "nope", password: "a long enough password" }, now)).toEqual({
      error: "invalid",
    });
    expect(await signup(db, { email: "a@b.co", password: "short" }, now)).toEqual({
      error: "invalid",
    });
  });
});

describe("one inbox, one account", () => {
  it("refuses the same inbox under another spelling", async () => {
    await signup(db, { email: "test@gmail.com", password: creds.password }, now);
    for (const alias of ["test+test1@gmail.com", "t.e.s.t@gmail.com", "TEST+x@googlemail.com"])
      expect(await signup(db, { email: alias, password: creds.password }, now), alias).toEqual({
        error: "email_taken",
      });
    // a different inbox is fine
    expect(
      "token" in (await signup(db, { email: "other@gmail.com", password: creds.password }, now)),
    ).toBe(true);
  });

  it("signs in with any spelling of the address the account has", async () => {
    await signup(db, { email: "test@gmail.com", password: creds.password }, now);
    expect(
      "token" in
        (await login(db, { email: "te.st+shop@gmail.com", password: creds.password }, now)),
    ).toBe(true);
  });

  it("finds an older account that has no key yet", async () => {
    const { users } = await import("../../../infra/db/schema");
    const { hashPassword } = await import("./password");
    await db.insert(users).values({
      id: "old",
      email: "legacy@example.com",
      passwordHash: await hashPassword(creds.password),
      createdAt: now,
      updatedAt: now,
    });
    expect(
      "token" in (await login(db, { email: "legacy@example.com", password: creds.password }, now)),
    ).toBe(true);
    // and it is now protected from an alias being registered
    expect(
      await signup(db, { email: "legacy+2@example.com", password: creds.password }, now),
    ).toEqual({ error: "email_taken" });
  });
});

describe("login", () => {
  beforeEach(async () => void (await signup(db, creds, now)));

  it("accepts the right password", async () => {
    const result = await login(db, { ...creds, email: "ada@example.com" }, now + 1);
    expect("token" in result).toBe(true);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await login(db, { ...creds, password: "not the password" }, now);
    const unknown = await login(db, { email: "who@example.com", password: creds.password }, now);
    expect(wrong).toEqual({ error: "invalid_credentials" });
    expect(unknown).toEqual(wrong);
  });
});

describe("sessions", () => {
  it("stores only a hash of the token", async () => {
    const result = await signup(db, creds, now);
    if ("error" in result) throw new Error(result.error);
    const { sessions } = await import("../../../infra/db/schema");
    const [row] = await db.select().from(sessions);
    expect(row?.tokenHash).not.toBe(result.token);
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expires after 24 hours idle and can be revoked", async () => {
    const result = await signup(db, creds, now);
    if ("error" in result) throw new Error(result.error);
    const day = 24 * 60 * 60 * 1000;
    expect(SESSION_MS).toBe(day);
    expect(await userForToken(db, result.token, now + day + 1)).toBeNull();
    const again = await login(db, { ...creds, email: "ada@example.com" }, now);
    if ("error" in again) throw new Error(again.error);
    expect(await userForToken(db, again.token, now + 1)).not.toBeNull();
    await logout(db, again.token);
    expect(await userForToken(db, again.token, now + 1)).toBeNull();
    expect(await userForToken(db, "garbage", now)).toBeNull();
  });

  it("slides: activity extends the session, idleness does not", async () => {
    const result = await signup(db, creds, now);
    if ("error" in result) throw new Error(result.error);
    const hour = 60 * 60 * 1000;
    // Early use leaves the expiry alone (no write on every request).
    expect((await userForToken(db, result.token, now + hour))?.expiresAt).toBe(now + SESSION_MS);
    // Past the halfway point, use pushes the expiry a full lifetime out.
    const later = now + 13 * hour;
    expect((await userForToken(db, result.token, later))?.expiresAt).toBe(later + SESSION_MS);
    // So a person who keeps working is still signed in after the first lifetime...
    expect(await userForToken(db, result.token, now + SESSION_MS + hour)).not.toBeNull();
    // ...while one who stops for a lifetime is signed out.
    const last = now + SESSION_MS + hour;
    expect(await userForToken(db, result.token, last + SESSION_MS + 1)).toBeNull();
  });

  it("never outlives the absolute cap, however active the user is", async () => {
    const result = await signup(db, creds, now);
    if ("error" in result) throw new Error(result.error);
    expect(SESSION_MAX_MS).toBe(5 * SESSION_MS);
    // Used every 20 hours for the whole cap: it keeps sliding, but only up to signup + 5 days.
    let t = now;
    let last = now + SESSION_MS;
    while (t + 20 * 60 * 60 * 1000 < now + SESSION_MAX_MS) {
      t += 20 * 60 * 60 * 1000;
      const session = await userForToken(db, result.token, t);
      expect(session).not.toBeNull();
      expect(session!.expiresAt).toBeLessThanOrEqual(now + SESSION_MAX_MS);
      last = session!.expiresAt;
    }
    expect(last).toBe(now + SESSION_MAX_MS);
    expect(await userForToken(db, result.token, now + SESSION_MAX_MS + 1)).toBeNull();
  });
});
