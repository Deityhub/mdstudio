import { tabId } from "../realtime/tab";
import type { SyncApi } from "./engine";
import type { PullPage, PushResult } from "./protocol";

/** The session ended (24 hours idle or the 5 day cap): the studio goes back to signed out. */
export class AuthExpiredError extends Error {}

/** The account's email is not confirmed (or no longer is): the cloud is closed to it. */
export class UnverifiedError extends Error {}

/** Any other refusal: the HTTP status and the server's `error` code, when it sent one. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`Sync request failed (${status})`);
  }
}

/** A JSON call to the server's account APIs, turning an ended session and an unconfirmed email into errors. */
export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 401) throw new AuthExpiredError("Signed out");
  if (
    res.status === 403 &&
    (
      await res
        .clone()
        .json()
        .catch(() => ({}))
    ).error === "email_unverified"
  )
    throw new UnverifiedError("Email not confirmed");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new HttpError(res.status, typeof body.error === "string" ? body.error : undefined);
  }
  return (await res.json()) as T;
}

export const httpApi: SyncApi = {
  async push(docs) {
    const { results } = await call<{ results: PushResult[] }>("/api/sync/push", {
      method: "POST",
      // the server leaves this tab out of the real-time events its own push causes
      headers: { "content-type": "application/json", "x-client-id": tabId },
      body: JSON.stringify({ docs }),
    });
    return results;
  },
  pull: (since) => call<PullPage>(`/api/sync/pull?since=${since}`),
};
