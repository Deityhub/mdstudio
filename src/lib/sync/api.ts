import type { SyncApi } from "./engine";
import type { PullPage, PushResult } from "./protocol";

/** The session ended (24 hours idle or the 5 day cap): the studio goes back to signed out. */
export class AuthExpiredError extends Error {}

/** The account's email is not confirmed (or no longer is): the cloud is closed to it. */
export class UnverifiedError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (!res.ok) throw new Error(`Sync request failed (${res.status})`);
  return (await res.json()) as T;
}

export const httpApi: SyncApi = {
  async push(docs) {
    const { results } = await call<{ results: PushResult[] }>("/api/sync/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ docs }),
    });
    return results;
  },
  pull: (since) => call<PullPage>(`/api/sync/pull?since=${since}`),
};
