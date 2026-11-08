// What the share page is given, for one reader. A public link gives everyone the same data (so the
// page may be cached); a private link is read for the signed-in reader and is never cached.
import type { PublicUser } from "../auth/service";
import type { Db } from "../db";
import { viewShare } from "./service";

type Copy = {
  title: string;
  content: string;
  publishedAt: number;
  expiresAt: number;
  comments: boolean;
};

export type PageData =
  | ({ kind: "public" } & Copy)
  | ({ kind: "private"; isOwner: boolean } & Copy)
  | { kind: "sign_in" };

const copy = (share: Copy): Copy => ({
  title: share.title,
  content: share.content,
  publishedAt: share.publishedAt,
  expiresAt: share.expiresAt,
  comments: share.comments,
});

/** The page data for a reader (`viewer` null when signed out), or null when there is nothing to show. */
export async function loadPage(
  db: Db,
  address: string,
  viewer: PublicUser | null,
  now = Date.now(),
): Promise<PageData | null> {
  const anyone = await viewShare(db, address, null, now);
  if (anyone.status === "ok") return { kind: "public", ...copy(anyone.share) };
  if (anyone.status === "not_found") return null;
  // a private link
  if (!viewer) return { kind: "sign_in" };
  const seen = await viewShare(db, address, viewer, now);
  return seen.status === "ok"
    ? { kind: "private", isOwner: seen.isOwner, ...copy(seen.share) }
    : null;
}
