// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { emailTokens, sessions, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { RESET_TTL_MS, findForReset, issueReset, resetMail, resetPassword } from "./reset";
import { login, signup, userForToken } from "./service";
import { confirmVerification, issueVerification } from "./verify";

let db: Db;
let user: { id: string; email: string };
let session: string;
const now = 1_700_000_000_000;
const creds = { email: "ada@example.com", password: "the first long password" };
const next = "a brand new long password";

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  const r = await signup(db, creds, now, { verifyByEmail: true });
  if ("error" in r) throw new Error(r.error);
  user = r.user;
  session = r.token;
});

describe("findForReset", () => {
  it("finds an account by any spelling of its address, and nothing for a stranger", async () => {
    expect((await findForReset(db, "ADA+news@example.com"))?.id).toBe(user.id);
    expect(await findForReset(db, "nobody@example.com")).toBeNull();
    expect(await findForReset(db, "not an address")).toBeNull();
  });
});

describe("resetPassword", () => {
  it("sets the new password, ends every session, and counts as confirming the address", async () => {
    const token = await issueReset(db, user, now);
    expect(await resetPassword(db, token, next, now + 1000)).toMatchObject({
      ok: true,
      userId: user.id,
    });
    expect("error" in (await login(db, creds, now + 2000))).toBe(true); // old password is gone
    expect("token" in (await login(db, { ...creds, password: next }, now + 2000))).toBe(true);
    expect(await userForToken(db, session, now + 2000)).toBeNull(); // old sessions end
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.emailVerifiedAt).toBe(now + 1000); // they read the email, so it is confirmed
  });

  it("works once, and only for an hour", async () => {
    const token = await issueReset(db, user, now);
    expect(await resetPassword(db, token, next, now + 1)).toMatchObject({ ok: true });
    expect(await resetPassword(db, token, "yet another long one", now + 2)).toEqual({
      ok: false,
      error: "invalid_token",
    });

    const late = await issueReset(db, user, now + 10);
    expect(await resetPassword(db, late, next, now + 10 + RESET_TTL_MS + 1)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect(RESET_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("refuses a weak password without spending the link", async () => {
    const token = await issueReset(db, user, now);
    expect(await resetPassword(db, token, "short", now + 1)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await resetPassword(db, token, next, now + 2)).toMatchObject({ ok: true });
  });

  it("is not fooled by a confirmation link, or by a made-up one", async () => {
    const confirm = await issueVerification(db, user, now);
    expect(await resetPassword(db, confirm, next, now + 1)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    const reset = await issueReset(db, user, now);
    expect(await confirmVerification(db, reset, now + 1)).toEqual({ ok: false });
    expect(await resetPassword(db, "made-up", next, now + 1)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect(await resetPassword(db, "", next, now + 1)).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });

  it("a new request replaces the old link and leaves a confirmation link alone", async () => {
    const confirm = await issueVerification(db, user, now);
    const first = await issueReset(db, user, now);
    const second = await issueReset(db, user, now + 5);
    expect(await resetPassword(db, first, next, now + 6)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect(await confirmVerification(db, confirm, now + 7)).toMatchObject({ ok: true });
    expect(await resetPassword(db, second, next, now + 8)).toMatchObject({ ok: true });
  });

  it("stores only a hash, and clears the user's other links afterwards", async () => {
    const token = await issueReset(db, user, now);
    const [row] = await db.select().from(emailTokens);
    expect(row?.tokenHash).not.toContain(token);
    expect(row?.purpose).toBe("reset");
    await resetPassword(db, token, next, now + 1);
    expect(await db.select().from(emailTokens)).toEqual([]);
  });

  it("is refused when the address changed since the link was sent", async () => {
    const token = await issueReset(db, user, now);
    await db.update(users).set({ email: "new@example.com" }).where(eq(users.id, user.id));
    expect(await resetPassword(db, token, next, now + 1)).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });

  it("gives a GitHub-only account a password, which then signs in", async () => {
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, user.id));
    const token = await issueReset(db, user, now);
    expect(await resetPassword(db, token, next, now + 1)).toMatchObject({ ok: true });
    expect("token" in (await login(db, { ...creds, password: next }, now + 2))).toBe(true);
  });

  it("also ends sessions that were in other browsers", async () => {
    const other = await login(db, creds, now + 1);
    if ("error" in other) throw new Error(other.error);
    const token = await issueReset(db, user, now + 2);
    await resetPassword(db, token, next, now + 3);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual([]);
  });
});

describe("resetMail", () => {
  it("links to the reset page, not the API, and says what to do if it wasn't you", () => {
    const mail = resetMail("https://mdstudio.example", "tok", "ada@example.com");
    expect(mail.to).toBe("ada@example.com");
    expect(mail.text).toContain("https://mdstudio.example/reset-password?token=tok");
    expect(mail.text).toMatch(/didn't ask|ignore/i);
    expect(mail.subject).toMatch(/reset/i);
  });
});
