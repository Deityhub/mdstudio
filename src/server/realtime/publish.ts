// Telling the sockets on a topic that something happened. Called by the handlers that change
// things, after the change is saved. It never throws and never makes the caller wait on Workers:
// real-time is an improvement on polling, so a broken hub must not break a save.
import type { RealtimeEvent } from "@/lib/realtime/protocol";
import { getBinding, onWorkers } from "../env";
import { nodeHub } from "./hub";

export const userTopic = (userId: string) => `user:${userId}`;
export const shareTopic = (shareId: string) => `share:${shareId}`;

type Namespace = {
  idFromName: (name: string) => unknown;
  get: (id: unknown) => { fetch: (url: string, init: RequestInit) => Promise<unknown> };
};
type WithContext = Request & {
  runtime?: { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } };
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
    const waitUntil = (request as WithContext).runtime?.cloudflare?.context?.waitUntil;
    if (waitUntil) waitUntil.call((request as WithContext).runtime!.cloudflare!.context, send);
    else await send;
  } catch (error) {
    console.error("realtime publish failed", error);
  }
}
