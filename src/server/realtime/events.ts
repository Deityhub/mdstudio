// What to tell other devices after a push saved some drafts: each changed draft in full, unless
// there are many or one is too big for the channel, where one `sync` hint makes them pull
// everything instead.
import { MAX_EVENT_BYTES, type RealtimeEvent } from "@/lib/realtime/protocol";
import type { ServerDoc } from "@/lib/sync/protocol";

const MAX_DOC_EVENTS = 10;

export function docEvents(docs: ServerDoc[]): RealtimeEvent[] {
  const events: RealtimeEvent[] = docs.map((doc) => ({ t: "doc", doc }));
  const tooMuch =
    docs.length > MAX_DOC_EVENTS || events.some((e) => JSON.stringify(e).length > MAX_EVENT_BYTES);
  return tooMuch ? [{ t: "sync" }] : events;
}
