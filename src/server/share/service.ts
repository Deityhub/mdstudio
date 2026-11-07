// Public share links, independent of HTTP. A link is the published copy of one cloud draft: it
// keeps its own title and text, which change only when the writer publishes an update, and it
// always expires. See docs/SYSTEM_SPEC.md, "Share links".
import { and, desc, eq, gt, isNull, like, lte } from "drizzle-orm";
import { documents, shareLinks } from "../../../infra/db/schema";
import { DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS, type ShareInfo } from "@/lib/share/protocol";
import { remoteId } from "@/lib/sync/protocol";
import { sha256Hex } from "../auth/tokens";
import type { Db } from "../db";

const DAY = 86_400_000;

export type ShareConfig = { defaultDays: number; maxDays: number };
export const DEFAULT_SHARE: ShareConfig = {
  defaultDays: DEFAULT_SHARE_DAYS,
  maxDays: MAX_SHARE_DAYS,
};

type Failure = { ok: false; error: "not_found" | "invalid" };
type Row = typeof shareLinks.$inferSelect;

const slug = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
};

/** A draft id from the client: only ever turned into an id inside the caller's own namespace. */
const LOCAL_ID = /^[A-Za-z0-9_-]{1,64}$/;

const wholeDays = (days: number, config: ShareConfig) =>
  Number.isInteger(days) && days >= 1 && days <= config.maxDays;

const live = (expiresAt: number | null, now: number) => expiresAt !== null && expiresAt > now;

async function toInfo(row: Row, userId: string): Promise<ShareInfo> {
  return {
    id: row.documentId.slice(userId.length + 1),
    slug: row.slug,
    publishedAt: row.publishedAt,
    expiresAt: row.expiresAt ?? 0,
    hash: await sha256Hex(row.content),
  };
}

const findShare = async (db: Db, documentId: string) =>
  (await db.select().from(shareLinks).where(eq(shareLinks.documentId, documentId)))[0];

/** The caller's live cloud draft behind a local id, or null. */
async function cloudDraft(db: Db, userId: string, localId: string) {
  if (!LOCAL_ID.test(localId)) return null;
  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, remoteId(userId, localId)),
        eq(documents.userId, userId),
        isNull(documents.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Publishes a cloud draft: the first time it makes the link (a fresh address, `days` from now,
 * the default when not given); after that it copies the draft's current text into the link and
 * keeps the address and expiry, unless `days` is given or the link has already expired, in which
 * case it gets a new expiry (and, if it had expired, a new address).
 */
export async function publishShare(
  db: Db,
  userId: string,
  localId: string,
  days: number | undefined,
  config: ShareConfig,
  now = Date.now(),
): Promise<{ ok: true; share: ShareInfo; created: boolean } | Failure> {
  if (days !== undefined && !wholeDays(days, config)) return { ok: false, error: "invalid" };
  const draft = await cloudDraft(db, userId, localId);
  if (!draft) return { ok: false, error: "not_found" };

  const existing = await findShare(db, draft.id);
  const fields = { title: draft.title, content: draft.content, publishedAt: now, updatedAt: now };
  if (existing && live(existing.expiresAt, now)) {
    const expiresAt = days === undefined ? existing.expiresAt : now + days * DAY;
    await db
      .update(shareLinks)
      .set({ ...fields, expiresAt })
      .where(eq(shareLinks.id, existing.id));
    const row = { ...existing, ...fields, expiresAt };
    return { ok: true, share: await toInfo(row, userId), created: false };
  }
  // new, or the old one ran out: a new address, so the dead one stays dead
  if (existing) await db.delete(shareLinks).where(eq(shareLinks.id, existing.id));
  const row: Row = {
    id: crypto.randomUUID(),
    documentId: draft.id,
    revisionId: null,
    slug: slug(),
    isPublic: 1,
    viewCount: 0,
    createdAt: now,
    expiresAt: now + (days ?? config.defaultDays) * DAY,
    ...fields,
  };
  await db.insert(shareLinks).values(row);
  return { ok: true, share: await toInfo(row, userId), created: true };
}

/** Sets the expiry to `days` from now, longer or shorter, on a link that is still live. */
export async function extendShare(
  db: Db,
  userId: string,
  localId: string,
  days: number,
  config: ShareConfig,
  now = Date.now(),
): Promise<{ ok: true; share: ShareInfo } | Failure> {
  if (!wholeDays(days, config)) return { ok: false, error: "invalid" };
  if (!LOCAL_ID.test(localId)) return { ok: false, error: "not_found" };
  const existing = await findShare(db, remoteId(userId, localId));
  if (!existing || !live(existing.expiresAt, now)) return { ok: false, error: "not_found" };
  const expiresAt = now + days * DAY;
  await db.update(shareLinks).set({ expiresAt }).where(eq(shareLinks.id, existing.id));
  return { ok: true, share: await toInfo({ ...existing, expiresAt }, userId) };
}

/** Takes a link down. False when there was nothing of the caller's to take down. */
export async function revokeShare(db: Db, userId: string, localId: string) {
  if (!LOCAL_ID.test(localId)) return false;
  const gone = await db
    .delete(shareLinks)
    .where(eq(shareLinks.documentId, remoteId(userId, localId)))
    .returning({ id: shareLinks.id });
  return gone.length > 0;
}

/** The caller's live links. Their expired ones are cleared on the way. */
export async function listShares(db: Db, userId: string, now = Date.now()): Promise<ShareInfo[]> {
  const mine = like(shareLinks.documentId, `${remoteId(userId, "")}%`);
  await db.delete(shareLinks).where(and(mine, lte(shareLinks.expiresAt, now)));
  const rows = await db
    .select()
    .from(shareLinks)
    .where(and(mine, gt(shareLinks.expiresAt, now)))
    .orderBy(desc(shareLinks.updatedAt));
  return Promise.all(rows.map((r) => toInfo(r, userId)));
}

/** What the public page shows, or null when there is no such link or it has expired. */
export async function getPublicShare(db: Db, address: string, now = Date.now()) {
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.slug, address), gt(shareLinks.expiresAt, now)));
  return row
    ? {
        title: row.title,
        content: row.content,
        publishedAt: row.publishedAt,
        expiresAt: row.expiresAt as number,
      }
    : null;
}

/** For the sitemap: live links, most recently published first. */
export const sitemapShares = (db: Db, now: number, limit: number) =>
  db
    .select({ slug: shareLinks.slug, updatedAt: shareLinks.updatedAt })
    .from(shareLinks)
    .where(gt(shareLinks.expiresAt, now))
    .orderBy(desc(shareLinks.updatedAt))
    .limit(limit);

/** A draft that is deleted, or leaves the cloud, takes its link with it. */
export const removeShareOf = (db: Db, documentId: string) =>
  db.delete(shareLinks).where(eq(shareLinks.documentId, documentId));
