import { HttpError, call } from "@/lib/sync/api";
import type { ShareInfo } from "./protocol";

export type SharedLink = ShareInfo & { url: string };
export type ShareList = { shares: SharedLink[]; defaultDays: number; maxDays: number };

export type ShareErrorCode = "not_found" | "invalid" | "too_many" | "failed";

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
    throw new ShareError("failed");
  }
}

export const shareApi = {
  list: () => send<ShareList>("/api/share", undefined),
  /** Publishes the draft's current cloud text; `days` sets a new expiry, else the link keeps its own. */
  publish: (id: string, days?: number) =>
    send<{ share: SharedLink; created: boolean }>(
      "/api/share",
      json("POST", days === undefined ? { id } : { id, days }),
    ),
  extend: (id: string, days: number) =>
    send<{ share: SharedLink }>(`/api/share/${encodeURIComponent(id)}`, json("PATCH", { days })),
  revoke: (id: string) =>
    send<{ ok: true }>(`/api/share/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
