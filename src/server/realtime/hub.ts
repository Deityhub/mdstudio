// The hub for a server that is one process (self-hosted): topics and their sockets in memory. On
// Cloudflare the same job is done by a Durable Object (infra/realtime), with the same rules.
import { CLOSE, type RealtimeEvent } from "@/lib/realtime/protocol";
import { type Attachment, fanout, hasRoom } from "./rules";

export type Peer = { send: (data: string) => void; close: (code: number, reason?: string) => void };
type Entry = { peer: Peer; attachment: Attachment };

export function createHub(now: () => number = Date.now) {
  const topics = new Map<string, Set<Entry>>();

  const drop = (topic: string, entry: Entry) => {
    const set = topics.get(topic);
    set?.delete(entry);
    if (set && set.size === 0) topics.delete(topic);
  };

  return {
    /** Adds a socket, unless the topic is full. `disconnect` removes it again. */
    connect(
      topic: string,
      peer: Peer,
      attachment: Attachment,
    ): { ok: true; disconnect: () => void } | { ok: false } {
      const set = topics.get(topic) ?? new Set<Entry>();
      if (!hasRoom(topic, set.size)) return { ok: false };
      const entry = { peer, attachment };
      set.add(entry);
      topics.set(topic, set);
      return { ok: true, disconnect: () => drop(topic, entry) };
    },

    /** Sends an event to a topic's sockets; returns how many got it. A `bye` closes them all. */
    publish(topic: string, event: RealtimeEvent, opts: { exclude?: string } = {}) {
      const { send, expired } = fanout([...(topics.get(topic) ?? [])], {
        exclude: opts.exclude,
        now: now(),
      });
      for (const entry of expired) {
        entry.peer.close(CLOSE.expired, "expired");
        drop(topic, entry);
      }
      const data = JSON.stringify(event);
      let sent = 0;
      for (const entry of send) {
        try {
          entry.peer.send(data);
          sent += 1;
        } catch {
          drop(topic, entry); // a socket that cannot be written to is gone
        }
      }
      if (event.t === "bye")
        for (const entry of [...(topics.get(topic) ?? [])]) {
          entry.peer.close(CLOSE.sessionEnded, event.reason);
          drop(topic, entry);
        }
      return sent;
    },

    count: (topic: string) => topics.get(topic)?.size ?? 0,
  };
}

/** The one hub of this process. */
export const nodeHub = createHub();
