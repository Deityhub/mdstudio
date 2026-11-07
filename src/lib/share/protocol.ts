// What the browser and the server agree on for share links (see src/server/share).

/** How long a new link lasts when the writer does not choose, and the longest it may last. */
export const DEFAULT_SHARE_DAYS = 4;
export const MAX_SHARE_DAYS = 7;

/** One published link, as the owner sees it. `id` is the draft's own (local) id. */
export type ShareInfo = {
  id: string;
  slug: string;
  publishedAt: number;
  expiresAt: number;
  /** SHA-256 (hex) of the published text, to tell whether the draft has moved on since. */
  hash: string;
};

/** The public address of a link. */
export const shareUrl = (origin: string, slug: string) => `${origin.replace(/\/$/, "")}/s/${slug}`;
