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
  /** Who may open it, and whether signed-in readers may comment. */
  access: ShareAccess;
  comments: boolean;
};

export type ShareAccess = "public" | "people";

/** Most people one private link can be shared with. */
export const MAX_SHARE_PEOPLE = 10;
/** Most comments one link holds, and the longest one. */
export const MAX_SHARE_COMMENTS = 100;
export const MAX_COMMENT_LENGTH = 2000;

/** A comment as a reader sees it: the author is a display name, never an address. */
export type ShareComment = {
  id: string;
  parentId: string | null;
  author: string;
  mine: boolean;
  line: number;
  snippet: string;
  body: string;
  /** Written on an older published copy than the current one. */
  outdated: boolean;
  resolved: boolean;
  createdAt: number;
};

/** The public address of a link. */
export const shareUrl = (origin: string, slug: string) => `${origin.replace(/\/$/, "")}/s/${slug}`;
