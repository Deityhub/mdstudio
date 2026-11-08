// Reviewers' comments on a published copy. A comment is tied to the copy it was written on and to
// a block of it (its source line and the start of its text), so after the writer publishes an
// update it can be shown as outdated instead of pointing at the wrong place. Only plain text is
// stored or shown, and authors appear by display name, never by address.
import { and, asc, count, eq, sql } from "drizzle-orm";
import { shareComments, shareLinks, users } from "../../../infra/db/schema";
import { MAX_COMMENT_LENGTH, MAX_SHARE_COMMENTS, type ShareComment } from "@/lib/share/protocol";
import type { PublicUser } from "../auth/service";
import type { Db } from "../db";
import { findOwnShare, viewShare } from "./service";

const MAX_LINE = 1_000_000;
const SNIPPET = 120;

type Joined = { c: typeof shareComments.$inferSelect; name: string | null };

const toComment = (r: Joined, viewerId: string | null, publishedAt: number): ShareComment => ({
  id: r.c.id,
  parentId: r.c.parentId,
  author: r.name?.trim() || "Reviewer",
  mine: viewerId !== null && r.c.userId === viewerId,
  line: r.c.line,
  snippet: r.c.snippet,
  body: r.c.body,
  outdated: r.c.version < publishedAt,
  resolved: r.c.resolvedAt !== null,
  createdAt: r.c.createdAt,
});

const forShare = (db: Db, shareId: string) =>
  db
    .select({ c: shareComments, name: users.displayName })
    .from(shareComments)
    .innerJoin(users, eq(users.id, shareComments.userId))
    .where(eq(shareComments.shareId, shareId))
    .orderBy(asc(shareComments.createdAt), sql`${shareComments}.rowid`);

export type CommentInput = { body: string; line: number; snippet?: string; parentId?: string };

export async function addComment(
  db: Db,
  viewer: PublicUser,
  address: string,
  input: CommentInput,
  now = Date.now(),
): Promise<
  | { ok: true; comment: ShareComment }
  | { ok: false; error: "not_found" | "forbidden" | "invalid" | "limit_reached" }
> {
  const seen = await viewShare(db, address, viewer, now);
  if (seen.status !== "ok") return { ok: false, error: "not_found" };
  if (!seen.canComment) return { ok: false, error: "forbidden" };

  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body || body.length > MAX_COMMENT_LENGTH) return { ok: false, error: "invalid" };
  if (!Number.isInteger(input.line) || input.line < 1 || input.line > MAX_LINE)
    return { ok: false, error: "invalid" };
  if (input.parentId !== undefined) {
    const [parent] = await db
      .select({ parentId: shareComments.parentId })
      .from(shareComments)
      .where(
        and(eq(shareComments.id, String(input.parentId)), eq(shareComments.shareId, seen.share.id)),
      );
    if (!parent || parent.parentId !== null) return { ok: false, error: "invalid" }; // replies go one level deep
  }
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(shareComments)
    .where(eq(shareComments.shareId, seen.share.id));
  if (n >= MAX_SHARE_COMMENTS) return { ok: false, error: "limit_reached" };

  const row = {
    id: crypto.randomUUID(),
    shareId: seen.share.id,
    userId: viewer.id,
    parentId: input.parentId ?? null,
    version: seen.share.publishedAt,
    line: input.line,
    snippet: (input.snippet ?? "").trim().slice(0, SNIPPET),
    body,
    createdAt: now,
    resolvedAt: null,
  };
  await db.insert(shareComments).values(row);
  return {
    ok: true,
    comment: toComment({ c: row, name: viewer.displayName }, viewer.id, seen.share.publishedAt),
  };
}

/** The comments on a link, for a signed-in reader who may open it. */
export async function listComments(
  db: Db,
  viewer: PublicUser | null,
  address: string,
  now = Date.now(),
): Promise<{ ok: true; comments: ShareComment[] } | { ok: false; error: "sign_in" | "not_found" }> {
  if (!viewer) return { ok: false, error: "sign_in" };
  const seen = await viewShare(db, address, viewer, now);
  if (seen.status !== "ok" || !seen.share.comments) return { ok: false, error: "not_found" };
  const rows = await forShare(db, seen.share.id);
  return { ok: true, comments: rows.map((r) => toComment(r, viewer.id, seen.share.publishedAt)) };
}

/** A reader takes back their own comment, and its replies go with it. */
export async function deleteComment(
  db: Db,
  viewer: PublicUser,
  address: string,
  commentId: string,
  now = Date.now(),
) {
  const seen = await viewShare(db, address, viewer, now);
  if (seen.status !== "ok") return false;
  const gone = await db
    .delete(shareComments)
    .where(
      and(
        eq(shareComments.id, commentId),
        eq(shareComments.shareId, seen.share.id),
        eq(shareComments.userId, viewer.id),
      ),
    )
    .returning({ id: shareComments.id });
  if (!gone.length) return false;
  await db.delete(shareComments).where(eq(shareComments.parentId, commentId));
  return true;
}

// ---- the owner's side: every comment on their link, even after it has expired (for a while) ----

/** All the comments on one of the caller's links; null when they have no such link. */
export async function ownerComments(
  db: Db,
  userId: string,
  localId: string,
): Promise<ShareComment[] | null> {
  const share = await findOwnShare(db, userId, localId);
  if (!share) return null;
  return (await forShare(db, share.id)).map((r) => toComment(r, null, share.publishedAt));
}

export async function ownerDeleteComment(
  db: Db,
  userId: string,
  localId: string,
  commentId: string,
) {
  const share = await findOwnShare(db, userId, localId);
  if (!share) return false;
  const gone = await db
    .delete(shareComments)
    .where(and(eq(shareComments.id, commentId), eq(shareComments.shareId, share.id)))
    .returning({ id: shareComments.id });
  if (!gone.length) return false;
  await db.delete(shareComments).where(eq(shareComments.parentId, commentId));
  return true;
}

export async function ownerResolveComment(
  db: Db,
  userId: string,
  localId: string,
  commentId: string,
  resolved: boolean,
  now = Date.now(),
) {
  const share = await findOwnShare(db, userId, localId);
  if (!share) return false;
  const done = await db
    .update(shareComments)
    .set({ resolvedAt: resolved ? now : null })
    .where(and(eq(shareComments.id, commentId), eq(shareComments.shareId, share.id)))
    .returning({ id: shareComments.id });
  return done.length > 0;
}

/** Where a new comment's notification goes: the link's title and its owner. */
export async function commentTarget(db: Db, address: string) {
  const [row] = await db
    .select({ id: shareLinks.id, title: shareLinks.title, documentId: shareLinks.documentId })
    .from(shareLinks)
    .where(eq(shareLinks.slug, address));
  return row;
}
