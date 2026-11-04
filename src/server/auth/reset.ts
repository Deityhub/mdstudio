// Choosing a new password with a link sent by email. The link goes to a page (not straight to the
// API), lasts an hour and works once. Resetting ends every session and counts as confirming the
// address, because the person just proved they can read mail sent to it.
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { emailTokens, sessions, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import type { Mail } from "../mail";
import { canonicalEmail } from "./email";
import { hashPassword } from "./password";
import { findToken, issueToken } from "./tokens";

export const RESET_TTL_MS = 60 * 60 * 1000;

const Password = z.string().min(10).max(200);

/** The account an address belongs to, under any spelling of it, or null. */
export async function findForReset(db: Db, raw: string) {
  const email = raw.trim().toLowerCase();
  const key = canonicalEmail(email);
  if (!key) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(or(eq(users.emailKey, key), eq(users.email, email)));
  return row ?? null;
}

export const issueReset = (db: Db, user: { id: string; email: string }, now = Date.now()) =>
  issueToken(db, user, "reset", RESET_TTL_MS, now);

export async function resetPassword(
  db: Db,
  token: string,
  password: string,
  now = Date.now(),
): Promise<
  { ok: true; userId: string; email: string } | { ok: false; error: "invalid_token" | "invalid" }
> {
  const row = await findToken(db, token, "reset", now);
  if (!row) return { ok: false, error: "invalid_token" };
  // A weak password is turned away before the link is used up, so they can try again.
  const parsed = Password.safeParse(password);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user || user.email !== row.email) return { ok: false, error: "invalid_token" };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data),
      emailVerifiedAt: user.emailVerifiedAt ?? now,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await db.delete(emailTokens).where(eq(emailTokens.userId, user.id));
  return { ok: true, userId: user.id, email: user.email };
}

export const resetMail = (origin: string, token: string, to: string): Mail => ({
  to,
  subject: "Reset your mdstudio password",
  text: [
    "Someone asked to reset the password for this mdstudio account. To choose a new one, open:",
    "",
    `${origin}/reset-password?token=${token}`,
    "",
    "The link works once and expires in an hour. If you didn't ask for this, ignore this message:",
    "your password has not changed.",
  ].join("\n"),
});
