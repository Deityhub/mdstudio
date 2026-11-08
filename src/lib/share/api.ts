import { HttpError, call } from "@/lib/sync/api";
import type { ShareAccess, ShareComment, ShareInfo } from "./protocol";

export type SharedLink = ShareInfo & { url: string };
export type ShareList = {
  shares: SharedLink[];
  defaultDays: number;
  maxDays: number;
  /** Whether links limited to named people may be made on this server for this account. */
  privateLinks?: boolean;
};
export type ShareSettings = { access?: ShareAccess; comments?: boolean };
export type SharePerson = { id: string; email: string };

export type ShareErrorCode =
  "not_found" | "invalid" | "too_many" | "forbidden" | "limit_reached" | "failed";

/** What went wrong with a share request, in terms the dialog can explain. */
export class ShareError extends Error {
  constructor(readonly code: ShareErrorCode) {
    super(`Share request failed (${code})`);
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// An ended session and an unconfirmed email pass through as their own errors (see sync/api.ts).
async function send<T>(path: string, init?: RequestInit) {
  try {
    return await call<T>(path, init);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (error.status === 404) throw new ShareError("not_found");
    if (error.status === 400) throw new ShareError("invalid");
    if (error.status === 429) throw new ShareError("too_many");
    if (error.status === 403) throw new ShareError("forbidden");
    if (error.status === 409) throw new ShareError("limit_reached");
    throw new ShareError("failed");
  }
}

export const shareApi = {
  list: () => send<ShareList>("/api/share", undefined),
  /** Publishes the draft's current cloud text; `days` sets a new expiry, else the link keeps its own. */
  publish: (id: string, days?: number, settings: ShareSettings = {}) =>
    send<{ share: SharedLink; created: boolean }>(
      "/api/share",
      json("POST", { id, ...(days !== undefined && { days }), ...settings }),
    ),
  /** Changes who may open a live link, whether readers may comment, or its length. */
  update: (id: string, change: ShareSettings & { days?: number }) =>
    send<{ share: SharedLink }>(`/api/share/${encodeURIComponent(id)}`, json("PATCH", change)),
  extend: (id: string, days: number) =>
    send<{ share: SharedLink }>(`/api/share/${encodeURIComponent(id)}`, json("PATCH", { days })),
  revoke: (id: string) =>
    send<{ ok: true }>(`/api/share/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export type CommentInput = { body: string; line: number; snippet?: string; parentId?: string };

/** What a reader does with comments on a link they can open (by the link's address). */
export const commentsApi = {
  list: async (slug: string) =>
    (
      await send<{ comments: ShareComment[] }>(
        `/api/s/${encodeURIComponent(slug)}/comments`,
        undefined,
      )
    ).comments,
  add: async (slug: string, input: CommentInput) =>
    (
      await send<{ comment: ShareComment }>(
        `/api/s/${encodeURIComponent(slug)}/comments`,
        json("POST", input),
      )
    ).comment,
  remove: (slug: string, id: string) =>
    send<{ ok: true }>(`/api/s/${encodeURIComponent(slug)}/comments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

/** The people a private link is shared with; `id` is the draft's own id. */
export const peopleApi = {
  list: async (id: string) =>
    (await send<{ people: SharePerson[] }>(`/api/share/${encodeURIComponent(id)}/people`)).people,
  /** `emailed` says whether the invitation went out; the answer never says if they have an account. */
  add: (id: string, email: string) =>
    send<{ people: SharePerson[]; emailed: boolean }>(
      `/api/share/${encodeURIComponent(id)}/people`,
      json("POST", { email }),
    ),
  remove: (id: string, personId: string) =>
    send<{ ok: true }>(
      `/api/share/${encodeURIComponent(id)}/people/${encodeURIComponent(personId)}`,
      { method: "DELETE" },
    ),
};

/** The owner's view of the comments on their own link, by the draft's id, even after it expired. */
export const ownerApi = {
  comments: async (id: string) =>
    (await send<{ comments: ShareComment[] }>(`/api/share/${encodeURIComponent(id)}/comments`))
      .comments,
  resolve: (id: string, commentId: string, resolved: boolean) =>
    send<{ ok: true }>(
      `/api/share/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
      json("PATCH", { resolved }),
    ),
  remove: (id: string, commentId: string) =>
    send<{ ok: true }>(
      `/api/share/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" },
    ),
};
