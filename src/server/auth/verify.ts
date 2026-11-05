// Confirming an email address with a one-time link (see tokens.ts for how links work).
import { and, eq, gt } from "drizzle-orm";
import { emailTokens, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import type { Mail, Mailer } from "../mail";
import { renderMail } from "../mail/template";
import { findToken, issueToken } from "./tokens";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export const issueVerification = (db: Db, user: { id: string; email: string }, now = Date.now()) =>
  issueToken(db, user, "verify", TOKEN_TTL_MS, now);

/** True while a link has been sent that has not been used or expired, so asking again can wait. */
export async function hasLiveVerification(db: Db, userId: string, now = Date.now()) {
  const [row] = await db
    .select({ id: emailTokens.id })
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.userId, userId),
        eq(emailTokens.purpose, "verify"),
        gt(emailTokens.expiresAt, now),
      ),
    );
  return !!row;
}

export async function confirmVerification(
  db: Db,
  token: string,
  now = Date.now(),
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const row = await findToken(db, token, "verify", now);
  if (!row) return { ok: false };
  // The link is only good for the address it was sent to.
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  await db.delete(emailTokens).where(eq(emailTokens.id, row.id));
  if (!user || user.email !== row.email) return { ok: false };
  await db.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, user.id));
  return { ok: true, userId: user.id };
}

/**
 * Issues a link and emails it. When the send fails the link is removed again, so nothing says
 * "already sent" for an email that never went out and the next request tries a second time.
 */
export async function sendVerification(
  db: Db,
  mailer: Mailer,
  origin: string,
  user: { id: string; email: string },
  now = Date.now(),
) {
  const token = await issueVerification(db, user, now);
  try {
    await mailer(verificationMail(origin, token, user.email));
  } catch (error) {
    await db.delete(emailTokens).where(eq(emailTokens.userId, user.id));
    throw error;
  }
}

export const verificationMail = (origin: string, token: string, to: string): Mail =>
  renderMail({
    to,
    subject: "Confirm your email for mdstudio",
    preheader: "One click to start storing drafts in your mdstudio cloud.",
    heading: "Confirm your email",
    intro: ["Confirm your email address to store drafts in your mdstudio cloud."],
    action: { label: "Confirm email", url: `${origin}/api/auth/verify?token=${token}` },
    outro: [
      "The link works once and expires in 24 hours. If you didn't create an account, ignore this message.",
    ],
  });
