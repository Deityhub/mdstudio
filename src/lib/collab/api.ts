import { HttpError, call } from "@/lib/sync/api";
import type { SharedItem } from "./shared";

export type Editor = { id: string; email: string; createdAt: number };
export type CollabState = {
  live: boolean;
  editors: Editor[];
  /** The address the invited open the draft by, while it is live. */
  link: string | null;
  /** People one draft may have, the owner counted, and live drafts the account may have. */
  people: number;
  docs: number;
  /** False when live editing is closed on this server or for this account. */
  available: boolean;
};

export type CollabErrorCode =
  "not_found" | "invalid" | "too_many" | "forbidden" | "limit_reached" | "closed" | "failed";

/** What went wrong with a request, in terms the dialog can explain. */
export class CollabError extends Error {
  constructor(readonly code: CollabErrorCode) {
    super(`Live editing request failed (${code})`);
  }
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// An ended session and an unconfirmed email pass through as their own errors (see sync/api.ts).
async function send<T>(path: string, init?: RequestInit) {
  try {
    return await call<T>(path, init);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (error.status === 404) throw new CollabError("not_found");
    if (error.status === 400) throw new CollabError("invalid");
    if (error.status === 429) throw new CollabError("too_many");
    if (error.status === 403)
      throw new CollabError(error.code === "limit_reached" ? "limit_reached" : "closed");
    if (error.status === 409) throw new CollabError("not_found");
    if (error.status === 503) throw new CollabError("closed");
    throw new CollabError("failed");
  }
}

const enc = encodeURIComponent;

export const collabApi = {
  /** Drafts others invited this account to edit. */
  shared: async () => (await send<{ drafts: SharedItem[] }>("/api/collab")).drafts,
  /** Where a draft's address (/c/<link>) leads for the signed-in person. */
  open: (link: string) =>
    send<Pick<SharedItem, "ownerId" | "id" | "title" | "ownerName">>(
      `/api/collab/link/${enc(link)}`,
    ),
  state: (id: string) => send<CollabState>(`/api/collab/${enc(id)}`),
  /** Switches a cloud draft to live editing. */
  start: (id: string) =>
    send<{ live: true; editors: Editor[] }>(`/api/collab/${enc(id)}`, json("POST")),
  /** Back to ordinary sync; everyone invited is let go and the room's last text is kept. */
  stop: (id: string) => send<{ ok: true }>(`/api/collab/${enc(id)}`, json("DELETE")),
  /** `emailed` says whether an invitation went out; the answer never says if they have an account. */
  invite: (id: string, email: string) =>
    send<{ editors: Editor[]; emailed: boolean }>(
      `/api/collab/${enc(id)}/editors`,
      json("POST", { email }),
    ),
  remove: (id: string, editorId: string) =>
    send<{ ok: true }>(`/api/collab/${enc(id)}/editors/${enc(editorId)}`, json("DELETE")),
  /** An invited person stops editing a draft someone else owns. */
  leave: (ownerId: string, id: string) =>
    send<{ ok: true }>(`/api/collab/doc/${enc(ownerId)}/${enc(id)}`, json("DELETE")),
};
