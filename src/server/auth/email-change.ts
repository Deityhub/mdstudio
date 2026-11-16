// Changing the address an account signs in with. The link goes to the NEW address and works once
// for a day; until it is opened nothing changes, so a mistyped address cannot lock anyone out.
// Asking needs the current password, so a stolen session alone cannot move the account to another
// inbox (an account with no password sets one first). Opening it makes the new address the
// account's, counts it as confirmed (the person just read mail sent to it) and ends the other
// sessions. Invitations to the old address follow the person to the new one.
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import {
  documentEditors,
  emailTokens,
  sessions,
  sharePeople,
  users,
} from "../../../infra/db/schema";
import type { Db } from "../db";
import type { Mail } from "../mail";
import { renderMail } from "../mail/template";
import { canonicalEmail } from "./email";
import { verifyPassword } from "./password";
import { findToken, issueToken, sha256Hex } from "./tokens";

export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

const Address = z.string().trim().toLowerCase().email().max(254);

export async function requestEmailChange(
  db: Db,
  userId: string,
  input: { email: string; current?: string },
  now = Date.now(),
): Promise<
  | { ok: true; token: string; to: string }
  | {
      ok: false;
      error: "wrong_password" | "password_required" | "invalid" | "same_email" | "email_taken";
    }
> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) return { ok: false, error: "invalid" };
  if (!row.passwordHash) return { ok: false, error: "password_required" };
  if (!input.current || !(await verifyPassword(input.current, row.passwordHash)))
    return { ok: false, error: "wrong_password" };

  const parsed = Address.safeParse(input.email);
  const key = parsed.success ? canonicalEmail(parsed.data) : null;
  if (!parsed.success || !key) return { ok: false, error: "invalid" };
  if (key === (row.emailKey ?? canonicalEmail(row.email)))
    return { ok: false, error: "same_email" };
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.emailKey, key));
  if (taken) return { ok: false, error: "email_taken" };

  const token = await issueToken(
    db,
    { id: userId, email: parsed.data },
    "email_change",
    EMAIL_CHANGE_TTL_MS,
    now,
  );
  return { ok: true, token, to: parsed.data };
}

/** `keepToken` is the session of the browser that opened the link, when it is this account's. */
export async function confirmEmailChange(
  db: Db,
  token: string,
  now = Date.now(),
  keepToken?: string,
): Promise<
  | { ok: true; userId: string; oldEmail: string; newEmail: string }
  | { ok: false; error: "invalid_token" | "email_taken" }
> {
  const link = await findToken(db, token, "email_change", now);
  if (!link) return { ok: false, error: "invalid_token" };
  const [user] = await db.select().from(users).where(eq(users.id, link.userId));
  if (!user) return { ok: false, error: "invalid_token" };
  const newEmail = link.email;
  const key = canonicalEmail(newEmail);
  if (!key) return { ok: false, error: "invalid_token" };
  const oldKey = user.emailKey ?? canonicalEmail(user.email);

  try {
    // the unique index on the key decides if someone else took the address since the link was sent
    await db
      .update(users)
      .set({ email: newEmail, emailKey: key, emailVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, user.id));
  } catch {
    return { ok: false, error: "email_taken" };
  }
  if (oldKey) await moveInvitations(db, oldKey, newEmail, key);
  await db.delete(emailTokens).where(eq(emailTokens.userId, user.id));
  await db
    .delete(sessions)
    .where(
      keepToken
        ? and(eq(sessions.userId, user.id), ne(sessions.tokenHash, await sha256Hex(keepToken)))
        : eq(sessions.userId, user.id),
    );
  return { ok: true, userId: user.id, oldEmail: user.email, newEmail };
}

/** Invitations (to edit, to a private link) held under the old inbox now name the new one. */
async function moveInvitations(db: Db, oldKey: string, email: string, key: string) {
  const editors = await db
    .select()
    .from(documentEditors)
    .where(eq(documentEditors.emailKey, oldKey));
  if (editors.length) {
    const has = await db
      .select({ documentId: documentEditors.documentId })
      .from(documentEditors)
      .where(eq(documentEditors.emailKey, key));
    const duplicate = new Set(has.map((h) => h.documentId));
    const drop = editors.filter((e) => duplicate.has(e.documentId)).map((e) => e.id);
    if (drop.length) await db.delete(documentEditors).where(inArray(documentEditors.id, drop));
    await db
      .update(documentEditors)
      .set({ email, emailKey: key })
      .where(eq(documentEditors.emailKey, oldKey));
  }
  const people = await db.select().from(sharePeople).where(eq(sharePeople.emailKey, oldKey));
  if (people.length) {
    const has = await db
      .select({ shareId: sharePeople.shareId })
      .from(sharePeople)
      .where(eq(sharePeople.emailKey, key));
    const duplicate = new Set(has.map((h) => h.shareId));
    const drop = people.filter((p) => duplicate.has(p.shareId)).map((p) => p.id);
    if (drop.length) await db.delete(sharePeople).where(inArray(sharePeople.id, drop));
    await db
      .update(sharePeople)
      .set({ email, emailKey: key })
      .where(eq(sharePeople.emailKey, oldKey));
  }
}

export const emailChangeMail = (origin: string, token: string, to: string): Mail =>
  renderMail({
    to,
    subject: "Confirm your new email for mdstudio",
    preheader: "Use this address to sign in to mdstudio.",
    heading: "Confirm your new email",
    intro: [
      "Someone asked to use this address for an mdstudio account. Until you confirm, the account keeps its current address.",
    ],
    action: { label: "Confirm new email", url: `${origin}/api/auth/email/confirm?token=${token}` },
    outro: [
      "The link works once and expires in 24 hours. If you didn't ask for this, ignore this message: nothing changes.",
    ],
  });

/** To the address the account had, once it no longer does. */
export const emailChangedNotice = (origin: string, to: string, newEmail: string): Mail =>
  renderMail({
    to,
    subject: "Your mdstudio email was changed",
    preheader: `This account now signs in with ${newEmail}.`,
    heading: "Your email was changed",
    intro: [
      `The mdstudio account that used this address now signs in with ${newEmail}. Your other devices were signed out.`,
      "If you did this, there is nothing more to do. If you didn't, sign in with the new address and change your password, or ask whoever runs this server for help.",
    ],
    action: { label: "Open mdstudio", url: `${origin}/settings?tab=account` },
    outro: ["You are getting this because this address used to belong to the account."],
  });
