// Confirming an email address with a one-time link. Only a hash of the token is stored, a newer
// link replaces older ones, and a link works once and only for the address it was sent to.
import { and, eq, gt } from "drizzle-orm";
import { emailTokens, users } from "../../../infra/db/schema";
import type { Db } from "../db";
import type { Mail } from "../mail";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issueVerification(
  db: Db,
  user: { id: string; email: string },
  now = Date.now(),
) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db.delete(emailTokens).where(eq(emailTokens.userId, user.id));
  await db.insert(emailTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: await sha256Hex(token),
    email: user.email,
    expiresAt: now + TOKEN_TTL_MS,
    createdAt: now,
  });
  return token;
}

/** True while a link has been sent that has not been used or expired, so asking again can wait. */
export async function hasLiveVerification(db: Db, userId: string, now = Date.now()) {
  const [row] = await db
    .select({ id: emailTokens.id })
    .from(emailTokens)
    .where(and(eq(emailTokens.userId, userId), gt(emailTokens.expiresAt, now)));
  return !!row;
}

export async function confirmVerification(
  db: Db,
  token: string,
  now = Date.now(),
): Promise<{ ok: true; userId: string } | { ok: false }> {
  if (!token) return { ok: false };
  const tokenHash = await sha256Hex(token);
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, tokenHash), gt(emailTokens.expiresAt, now)));
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
