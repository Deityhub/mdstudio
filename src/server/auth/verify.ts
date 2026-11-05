// Confirming an email address with a one-time link (see tokens.ts for how links work).
import { and, eq, gt } from "drizzle-orm";
import { emailTokens, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import type { Mail } from "../mail";
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

export const verificationMail = (origin: string, token: string, to: string): Mail => ({
  to,
  subject: "Confirm your email for mdstudio",
  text: [
    "Confirm your email address to store drafts in your mdstudio cloud:",
    "",
    `${origin}/api/auth/verify?token=${token}`,
    "",
    "The link works once and expires in 24 hours. If you didn't create an account, ignore this message.",
  ].join("\n"),
});
