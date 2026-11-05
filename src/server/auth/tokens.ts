// One-time links sent by email. Only a hash of the token is stored, a newer link of the same kind
// replaces the older one, and a link is good once, until it expires, and only for the address it
// was sent to. What a link is for (`purpose`) keeps a confirmation link from resetting a password
// and the other way round.
import { and, eq, gt } from "drizzle-orm";
import { emailTokens } from "../../../infra/db/schema";
import type { Db } from "../db";

export type Purpose = "verify" | "reset";

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issueToken(
  db: Db,
  user: { id: string; email: string },
  purpose: Purpose,
  ttlMs: number,
  now: number,
) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await db
    .delete(emailTokens)
    .where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, purpose)));
  await db.insert(emailTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: await sha256Hex(token),
    email: user.email,
    purpose,
    expiresAt: now + ttlMs,
    createdAt: now,
  });
  return token;
}

/** The live link for this token and purpose, without using it up. */
export async function findToken(db: Db, token: string, purpose: Purpose, now: number) {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, await sha256Hex(token)),
        eq(emailTokens.purpose, purpose),
        gt(emailTokens.expiresAt, now),
      ),
    );
  return row ?? null;
}
