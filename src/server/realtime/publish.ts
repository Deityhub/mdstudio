// Telling the sockets on a topic that something happened. Called by the handlers that change
// things, after the change is saved. It never throws and never makes the caller wait on Workers:
// real-time is an improvement on polling, so a broken hub must not break a save.
import { type RealtimeEvent, isClientId } from "@/lib/realtime/protocol";
import type { ServerDoc } from "@/lib/sync/protocol";
import { getBinding, getWaitUntil, onWorkers } from "../env";
import { docEvents } from "./events";
import { nodeHub } from "./hub";

export const userTopic = (userId: string) => `user:${userId}`;
export const shareTopic = (shareId: string) => `share:${shareId}`;

type Namespace = {
  idFromName: (name: string) => unknown;
  get: (id: unknown) => { fetch: (url: string, init: RequestInit) => Promise<unknown> };
};

/** `exclude` is the tab (client id) whose own change this is, which already has it. */
export async function publish(
  request: Request,
  topic: string,
  event: RealtimeEvent,
  opts: { exclude?: string } = {},
): Promise<void> {
  try {
    if (!onWorkers(request)) {
      nodeHub.publish(topic, event, opts);
      return;
    }
    const namespace = getBinding(request, "REALTIME") as Namespace | undefined;
    if (!namespace) return;
    const body = JSON.stringify({ event, ...(opts.exclude && { exclude: opts.exclude }) });
    const send = Promise.resolve(
      namespace
        .get(namespace.idFromName(topic))
        .fetch("https://realtime/publish", { method: "POST", body }),
    ).catch((error: unknown) => console.error("realtime publish failed", error));
    const waitUntil = getWaitUntil(request);
    if (waitUntil) waitUntil(send);
    else await send;
  } catch (error) {
    console.error("realtime publish failed", error);
  }
}

/**
 * After a push: tells the account's other tabs and devices which drafts changed. The tab that
 * pushed names itself in `x-client-id` and is left out, since it already has them.
 */
export async function publishDocs(request: Request, userId: string, docs: ServerDoc[]) {
  const client = request.headers.get("x-client-id");
  const opts = isClientId(client) ? { exclude: client } : {};
  for (const event of docEvents(docs)) await publish(request, userTopic(userId), event, opts);
}

/**
 * An account's sessions ended (sign-out, password reset, suspension, deletion): its open sockets are
 * told and closed, so a signed-out tab stops hearing about the account at once.
 */
export const endSessions = (
  request: Request,
  userId: string,
  reason: "signed_out" | "suspended" | "deleted",
) => publish(request, userTopic(userId), { t: "bye", reason });
