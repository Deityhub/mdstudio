// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createNodeDb } from "../../../infra/db/node";
import {
  documentEditors,
  documents,
  emailTokens,
  sharePeople,
  shareLinks,
  users,
} from "../../../infra/db/schema";
import type { Db } from "../db";
import {
  confirmEmailChange,
  emailChangeMail,
  emailChangedNotice,
  requestEmailChange,
} from "./email-change";
import { login, signup, userForToken } from "./service";
import { confirmVerification, issueVerification } from "./verify";

let db: Db;
let user: { id: string; email: string };
const now = 1_700_000_000_000;
const password = "the first long password";
const ask = (input: { email: string; current?: string }, at = now) =>
  requestEmailChange(db, user.id, input, at);

beforeEach(async () => {
  db = createNodeDb(":memory:") as unknown as Db;
  const r = await signup(db, { email: "ada@example.com", password }, now, { verifyByEmail: true });
  if ("error" in r) throw new Error(r.error);
  user = r.user;
});

describe("requestEmailChange", () => {
  it("needs the current password, and an account with none must set one first", async () => {
    expect(await ask({ email: "ada@new.example" })).toEqual({
      ok: false,
      error: "wrong_password",
    });
    expect(await ask({ email: "ada@new.example", current: "not it, not at all" })).toEqual({
      ok: false,
      error: "wrong_password",
    });
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, user.id));
    expect(await ask({ email: "ada@new.example", current: password })).toEqual({
      ok: false,
      error: "password_required",
    });
  });
  it("turns away a bad address, the same inbox, and an address another account has", async () => {
    expect(await ask({ email: "nope", current: password })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await ask({ email: "ADA+news@example.com", current: password })).toEqual({
      ok: false,
      error: "same_email",
    });
    await signup(db, { email: "bob@example.com", password }, now, { verifyByEmail: true });
    expect(await ask({ email: "Bob@Example.com", current: password })).toEqual({
      ok: false,
      error: "email_taken",
    });
  });
  it("issues a link for the new address and changes nothing yet", async () => {
    const r = await ask({ email: " Ada@New.example ", current: password });
    expect(r).toMatchObject({ ok: true, to: "ada@new.example" });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.email).toBe("ada@example.com");
    expect(await login(db, { email: "ada@example.com", password }, now)).toHaveProperty("token");
    expect(await login(db, { email: "ada@new.example", password }, now)).toEqual({
      error: "invalid_credentials",
    });
  });
  it("replaces an earlier pending link", async () => {
    const first = await ask({ email: "one@new.example", current: password });
    const second = await ask({ email: "two@new.example", current: password });
    if (!first.ok || !second.ok) throw new Error("expected links");
    expect(await confirmEmailChange(db, first.token, now + 1)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect(await confirmEmailChange(db, second.token, now + 1)).toMatchObject({ ok: true });
  });
});

describe("confirmEmailChange", () => {
  async function pending(email = "ada@new.example", at = now) {
    const r = await ask({ email, current: password }, at);
    if (!r.ok) throw new Error(r.error);
    return r.token;
  }

  it("switches the address, confirms it, and signs in with the new one only", async () => {
    const token = await pending();
    expect(await confirmEmailChange(db, token, now + 1000)).toEqual({
      ok: true,
      userId: user.id,
      oldEmail: "ada@example.com",
      newEmail: "ada@new.example",
    });
    expect(await login(db, { email: "ada@new.example", password }, now)).toHaveProperty("token");
    expect(await login(db, { email: "ada@example.com", password }, now)).toEqual({
      error: "invalid_credentials",
    });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({ email: "ada@new.example", emailKey: "ada@new.example" });
    expect(row?.emailVerifiedAt).toBe(now + 1000);
  });
  it("works once, and not after a day", async () => {
    const token = await pending();
    expect(await confirmEmailChange(db, token, now + 1000)).toMatchObject({ ok: true });
    expect(await confirmEmailChange(db, token, now + 2000)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    const late = await pending("ada@later.example", now);
    expect(await confirmEmailChange(db, late, now + 25 * 60 * 60 * 1000)).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });
  it("is refused when someone took the address meanwhile, and keeps the old one", async () => {
    const token = await pending();
    await signup(db, { email: "ada@new.example", password }, now, { verifyByEmail: true });
    expect(await confirmEmailChange(db, token, now + 1000)).toEqual({
      ok: false,
      error: "email_taken",
    });
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.email).toBe("ada@example.com");
  });
  it("does not mix up with the confirmation and reset links", async () => {
    const token = await pending();
    const verify = await issueVerification(db, user, now);
    expect(await confirmEmailChange(db, verify, now + 1)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect(await confirmVerification(db, token, now + 1)).toEqual({ ok: false });
    expect(await confirmEmailChange(db, token, now + 1)).toMatchObject({ ok: true });
  });
  it("keeps invitations to the old address working under the new one", async () => {
    const owner = await signup(db, { email: "owner@example.com", password }, now, {
      verifyByEmail: true,
    });
    if ("error" in owner) throw new Error(owner.error);
    const doc = (id: string) => ({
      id,
      userId: owner.user.id,
      contentHash: "h",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(documents).values([doc("d1"), doc("d2")]);
    await db.insert(documentEditors).values([
      {
        id: "e1",
        documentId: "d1",
        email: "ada@example.com",
        emailKey: "ada@example.com",
        invitedBy: owner.user.id,
        createdAt: now,
      },
      // also invited under the new address: the two collapse into one
      {
        id: "e2",
        documentId: "d2",
        email: "ada@example.com",
        emailKey: "ada@example.com",
        invitedBy: owner.user.id,
        createdAt: now,
      },
      {
        id: "e3",
        documentId: "d2",
        email: "ada@new.example",
        emailKey: "ada@new.example",
        invitedBy: owner.user.id,
        createdAt: now,
      },
    ]);
    await db.insert(shareLinks).values({ id: "s1", documentId: "d1", slug: "abc", createdAt: now });
    await db.insert(sharePeople).values({
      id: "p1",
      shareId: "s1",
      email: "ada@example.com",
      emailKey: "ada@example.com",
      createdAt: now,
    });

    await confirmEmailChange(db, await pending(), now + 1000);

    const editors = await db.select().from(documentEditors);
    expect(editors.map((e) => [e.documentId, e.emailKey]).sort()).toEqual([
      ["d1", "ada@new.example"],
      ["d2", "ada@new.example"],
    ]);
    expect(editors.find((e) => e.documentId === "d1")?.email).toBe("ada@new.example");
    expect((await db.select().from(sharePeople))[0]).toMatchObject({
      email: "ada@new.example",
      emailKey: "ada@new.example",
    });
  });
  it("ends the account's sessions except the ones asked to stay", async () => {
    const other = await login(db, { email: "ada@example.com", password }, now);
    if ("error" in other) throw new Error(other.error);
    const keep = await login(db, { email: "ada@example.com", password }, now);
    if ("error" in keep) throw new Error(keep.error);
    await confirmEmailChange(db, await pending(), now + 1000, keep.token);
    expect(await userForToken(db, keep.token, now + 2000)).toMatchObject({
      user: { email: "ada@new.example" },
    });
    expect(await userForToken(db, other.token, now + 2000)).toBeNull();
  });
});

describe("the emails", () => {
  it("send the link to the new address and the notice to the old one", () => {
    const link = emailChangeMail("https://x.test", "tok", "ada@new.example");
    expect(link.to).toBe("ada@new.example");
    expect(link.text).toContain("https://x.test/api/auth/email/confirm?token=tok");
    const note = emailChangedNotice("https://x.test", "ada@example.com", "ada@new.example");
    expect(note.to).toBe("ada@example.com");
    expect(note.text).toContain("ada@new.example");
  });
});
