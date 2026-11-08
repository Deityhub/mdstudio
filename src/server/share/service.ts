// Public share links, independent of HTTP. A link is the published copy of one cloud draft: it
// keeps its own title and text, which change only when the writer publishes an update, and it
// always expires. It can be open to anyone with the link or only to named, signed-in people, and
// can take comments from signed-in readers. See docs/SYSTEM_SPEC.md, "Share links".
import { and, desc, eq, gt, isNull, like, lte } from "drizzle-orm";
import { documents, sharePeople, shareLinks } from "../../../infra/db/schema";
import {
  DEFAULT_SHARE_DAYS,
  MAX_SHARE_DAYS,
  type ShareAccess,
  type ShareInfo,
} from "@/lib/share/protocol";
import { LOCAL_ID, remoteId } from "@/lib/sync/protocol";
import { canonicalEmail } from "../auth/email";
import type { PublicUser } from "../auth/service";
import { sha256Hex } from "../auth/tokens";
import type { Db } from "../db";

const DAY = 86_400_000;

/** An expired link and its comments stay for the owner this long before they are cleared. */
export const EXPIRED_KEEP_MS = 30 * DAY;

export type ShareConfig = {
  defaultDays: number;
  maxDays: number;
  /** Whether links limited to named people may be made (a feature a paid plan could gate). */
  privateLinks: boolean;
};
export const DEFAULT_SHARE: ShareConfig = {
  defaultDays: DEFAULT_SHARE_DAYS,
  maxDays: MAX_SHARE_DAYS,
  privateLinks: true,
};

type Failure = { ok: false; error: "not_found" | "invalid" | "unavailable" };
type Row = typeof shareLinks.$inferSelect;

const slug = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
};

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
    access: row.access === "people" ? "people" : "public",
    comments: row.comments === 1,
  };
}

const findShare = async (db: Db, documentId: string) =>
  (await db.select().from(shareLinks).where(eq(shareLinks.documentId, documentId)))[0];

/** The caller's link for one of their drafts, live or not (an expired one is kept for a while). */
export async function findOwnShare(db: Db, userId: string, localId: string) {
  if (!LOCAL_ID.test(localId)) return undefined;
  return findShare(db, remoteId(userId, localId));
}

/** The caller's live cloud draft behind a local id, or null. */
export async function cloudDraft(db: Db, userId: string, localId: string) {
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

export type ShareSettings = { access?: ShareAccess; comments?: boolean };

const validSettings = ({ access, comments }: ShareSettings) =>
  (access === undefined || access === "public" || access === "people") &&
  (comments === undefined || typeof comments === "boolean");

/**
 * Publishes a cloud draft: the first time it makes the link (a fresh address, `days` from now,
 * the default when not given); after that it copies the draft's current text into the link and
 * keeps the address and expiry, unless `days` is given or the link has already expired, in which
 * case it gets a new expiry (and, if it had expired, a new address). `settings` (who may open it,
 * whether readers may comment) apply when a link is made or renewed, so a private one is never
 * public first; a live link's settings only change through `updateShare`.
 */
export async function publishShare(
  db: Db,
  userId: string,
  localId: string,
  days: number | undefined,
  config: ShareConfig,
  now = Date.now(),
  settings: ShareSettings = {},
): Promise<{ ok: true; share: ShareInfo; created: boolean } | Failure> {
  if (days !== undefined && !wholeDays(days, config)) return { ok: false, error: "invalid" };
  if (!validSettings(settings)) return { ok: false, error: "invalid" };
  if (settings.access === "people" && !config.privateLinks)
    return { ok: false, error: "unavailable" };
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
    return {
      ok: true,
      share: await toInfo({ ...existing, ...fields, expiresAt }, userId),
      created: false,
    };
  }
  // an old one that ran out keeps its settings and comments but gets a new address, so the dead
  // one stays dead
  const chosen = {
    ...(settings.access !== undefined && { access: settings.access }),
    ...(settings.comments !== undefined && { comments: settings.comments ? 1 : 0 }),
  };
  const renewal = {
    ...fields,
    ...chosen,
    slug: slug(),
    createdAt: now,
    expiresAt: now + (days ?? config.defaultDays) * DAY,
  };
  if (existing) {
    await db.update(shareLinks).set(renewal).where(eq(shareLinks.id, existing.id));
    return { ok: true, share: await toInfo({ ...existing, ...renewal }, userId), created: true };
  }
  const row: Row = {
    id: crypto.randomUUID(),
    documentId: draft.id,
    revisionId: null,
    isPublic: 1,
    viewCount: 0,
    access: "public",
    comments: 0,
    ...renewal,
  };
  await db.insert(shareLinks).values(row);
  return { ok: true, share: await toInfo(row, userId), created: true };
}

export type ShareChange = { days?: number; access?: ShareAccess; comments?: boolean };

/**
 * Changes a live link: the expiry (that many days from now, longer or shorter), who may open it,
 * and whether readers may comment. At least one must be given.
 */
export async function updateShare(
  db: Db,
  userId: string,
  localId: string,
  change: ShareChange,
  config: ShareConfig,
  now = Date.now(),
): Promise<{ ok: true; share: ShareInfo } | Failure> {
  const { days, access, comments } = change;
  if (days === undefined && access === undefined && comments === undefined)
    return { ok: false, error: "invalid" };
  if (days !== undefined && !wholeDays(days, config)) return { ok: false, error: "invalid" };
  if (access !== undefined && access !== "public" && access !== "people")
    return { ok: false, error: "invalid" };
  if (comments !== undefined && typeof comments !== "boolean")
    return { ok: false, error: "invalid" };
  const existing = await findOwnShare(db, userId, localId);
  if (!existing || !live(existing.expiresAt, now)) return { ok: false, error: "not_found" };
  if (access === "people" && !config.privateLinks) return { ok: false, error: "unavailable" };
  const set = {
    ...(days !== undefined && { expiresAt: now + days * DAY }),
    ...(access !== undefined && { access }),
    ...(comments !== undefined && { comments: comments ? 1 : 0 }),
  };
  await db.update(shareLinks).set(set).where(eq(shareLinks.id, existing.id));
  return { ok: true, share: await toInfo({ ...existing, ...set }, userId) };
}

/** Sets the expiry that many days from now, on a link that is still live. */
export const extendShare = (
  db: Db,
  userId: string,
  localId: string,
  days: number,
  config: ShareConfig,
  now = Date.now(),
) => updateShare(db, userId, localId, { days }, config, now);

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
  await db.delete(shareLinks).where(and(mine, lte(shareLinks.expiresAt, now - EXPIRED_KEEP_MS)));
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
    .where(
      and(
        eq(shareLinks.slug, address),
        eq(shareLinks.access, "public"),
        gt(shareLinks.expiresAt, now),
      ),
    );
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
    .where(and(eq(shareLinks.access, "public"), gt(shareLinks.expiresAt, now)))
    .orderBy(desc(shareLinks.updatedAt))
    .limit(limit);

/** A draft that is deleted, or leaves the cloud, takes its link with it. */
export const removeShareOf = (db: Db, documentId: string) =>
  db.delete(shareLinks).where(eq(shareLinks.documentId, documentId));

export type ViewedShare =
  | {
      status: "ok";
      share: {
        id: string;
        title: string;
        content: string;
        publishedAt: number;
        expiresAt: number;
        access: ShareAccess;
        comments: boolean;
      };
      isOwner: boolean;
      /** The reader is signed in with a confirmed address and the owner allows comments. */
      canComment: boolean;
    }
  | { status: "sign_in" }
  | { status: "not_found" };

/**
 * What the share page may show a reader (`viewer` is null when signed out). A public link opens for
 * anyone. A private one asks a signed-out reader to sign in, and for anyone signed in who is not
 * the owner or an invited, confirmed address it is simply not found, so nothing is revealed.
 */
export async function viewShare(
  db: Db,
  address: string,
  viewer: PublicUser | null,
  now = Date.now(),
): Promise<ViewedShare> {
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.slug, address), gt(shareLinks.expiresAt, now)));
  if (!row) return { status: "not_found" };
  const isOwner = !!viewer && row.documentId.startsWith(remoteId(viewer.id, ""));
  if (row.access === "people" && !isOwner) {
    if (!viewer) return { status: "sign_in" };
    const key = viewer.emailVerified ? canonicalEmail(viewer.email) : null;
    const invited = key
      ? (
          await db
            .select({ id: sharePeople.id })
            .from(sharePeople)
            .where(and(eq(sharePeople.shareId, row.id), eq(sharePeople.emailKey, key)))
        )[0]
      : undefined;
    if (!invited) return { status: "not_found" };
  }
  return {
    status: "ok",
    isOwner,
    canComment: row.comments === 1 && !!viewer && viewer.emailVerified,
    share: {
      id: row.id,
      title: row.title,
      content: row.content,
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt as number,
      access: row.access === "people" ? "people" : "public",
      comments: row.comments === 1,
    },
  };
}
