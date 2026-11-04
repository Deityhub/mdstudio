// Fixed-window counters in the database, so the same limits work on D1 and in Docker. Used for
// sign-ups per address, failed sign-ins per email and address, and verification emails per account.
import { eq, lte, sql } from "drizzle-orm";
import { rateLimits } from "../../../infra/db/schema";
import type { Db } from "../db";

/** Counts one attempt for `key`; `allowed` is false once the limit for the window is passed. */
export async function hit(db: Db, key: string, limit: number, windowMs: number, now = Date.now()) {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetsAt: now + windowMs })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.resetsAt} <= ${now} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetsAt: sql`CASE WHEN ${rateLimits.resetsAt} <= ${now} THEN ${now + windowMs} ELSE ${rateLimits.resetsAt} END`,
      },
    })
    .returning({ count: rateLimits.count, resetsAt: rateLimits.resetsAt });
  // Spent windows are swept now and then, so the table does not grow without end.
  if (Math.random() < 0.02) await db.delete(rateLimits).where(lte(rateLimits.resetsAt, now));
  return {
    allowed: row!.count <= limit,
    retryAfter: Math.max(1, Math.ceil((row!.resetsAt - now) / 1000)),
  };
}

/** Seconds until `key` may try again, or null; looks without counting. Blocked once past `limit`. */
export async function blockedFor(db: Db, key: string, limit: number, now = Date.now()) {
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key));
  if (!row || row.resetsAt <= now || row.count <= limit) return null;
  return Math.max(1, Math.ceil((row.resetsAt - now) / 1000));
}

/** `blockedFor` for failures only: locked out as soon as `maxFailures` have been counted. */
export const lockedOut = (db: Db, key: string, maxFailures: number, now = Date.now()) =>
  blockedFor(db, key, maxFailures - 1, now);

export const clearLimit = (db: Db, key: string) =>
  db
    .delete(rateLimits)
    .where(eq(rateLimits.key, key))
    .then(() => undefined);

/**
 * Who is asking. Cloudflare sets `cf-connecting-ip`; `X-Forwarded-For` is only believed when the
 * operator says a proxy sets it (`TRUST_PROXY`), because any client can send that header.
 */
export function clientIp(request: Request, trustProxy: boolean) {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  if (trustProxy) {
    const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
