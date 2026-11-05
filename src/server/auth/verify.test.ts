// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import { emailTokens, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import { signup, userForToken } from "./service";
import {
  TOKEN_TTL_MS,
  confirmVerification,
  hasLiveVerification,
  issueVerification,
  verificationMail,
} from "./verify";

let db: Db;
let user: { id: string; email: string };
let sessionToken: string;
const now = 1_700_000_000_000;
const creds = { email: "ada@example.com", password: "a long enough password" };
const verifiedAt = async () =>
  (await db.select().from(users).where(eq(users.id, user.id)))[0]?.emailVerifiedAt;

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  const r = await signup(db, creds, now, { verifyByEmail: true });
  if ("error" in r) throw new Error(r.error);
  user = r.user;
  sessionToken = r.token;
});

describe("who starts verified", () => {
  it("is unverified when verification is on, verified when this server sends no mail", async () => {
    expect((await userForToken(db, sessionToken, now))?.user.emailVerified).toBe(false);
    const open = createNodeDb(":memory:") as unknown as Db;
    const r = await signup(open, creds, now, { verifyByEmail: false });
    if ("error" in r) throw new Error(r.error);
    expect(r.user.emailVerified).toBe(true);
  });
});

describe("issueVerification and confirmVerification", () => {
  it("confirms once, then the account reads as verified", async () => {
    const token = await issueVerification(db, user, now);
    expect(await confirmVerification(db, token, now + 1000)).toEqual({ ok: true, userId: user.id });
    expect(await verifiedAt()).toBe(now + 1000);
    expect((await userForToken(db, sessionToken, now + 1000))?.user.emailVerified).toBe(true);
    expect(await confirmVerification(db, token, now + 2000)).toEqual({ ok: false }); // single use
  });

  it("expires after a day, and a newer link replaces the older one", async () => {
    const old = await issueVerification(db, user, now);
    const fresh = await issueVerification(db, user, now + 10);
    expect(await confirmVerification(db, old, now + 20)).toEqual({ ok: false });
    expect(await confirmVerification(db, fresh, now + 10 + TOKEN_TTL_MS + 1)).toEqual({
      ok: false,
    });
    const last = await issueVerification(db, user, now + 5000);
    expect(await confirmVerification(db, last, now + 5000 + TOKEN_TTL_MS - 1)).toMatchObject({
      ok: true,
    });
  });

  it("refuses a token that is not one of ours", async () => {
    expect(await confirmVerification(db, "nope", now)).toEqual({ ok: false });
    expect(await confirmVerification(db, "", now)).toEqual({ ok: false });
  });

  it("stores only a hash of the token", async () => {
    const token = await issueVerification(db, user, now);
    const [row] = await db.select().from(emailTokens);
    expect(row?.tokenHash).not.toContain(token);
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hasLiveVerification", () => {
  it("is false until a link was sent, true while it can still be used, false once spent or expired", async () => {
    expect(await hasLiveVerification(db, user.id, now)).toBe(false); // signing up sends nothing
    const token = await issueVerification(db, user, now);
    expect(await hasLiveVerification(db, user.id, now + 1)).toBe(true);
    expect(await hasLiveVerification(db, user.id, now + TOKEN_TTL_MS + 1)).toBe(false);
    await confirmVerification(db, token, now + 2);
    expect(await hasLiveVerification(db, user.id, now + 3)).toBe(false);
  });
});

describe("verificationMail", () => {
  it("links to the site and is addressed to the account", () => {
    const mail = verificationMail("https://mdstudio.example", "tok123", "ada@example.com");
    expect(mail.to).toBe("ada@example.com");
    expect(mail.text).toContain("https://mdstudio.example/api/auth/verify?token=tok123");
    expect(mail.subject).toMatch(/confirm|verify/i);
  });
});
