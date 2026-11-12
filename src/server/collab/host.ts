// The app's way to reach a draft's room: to start it, read its text, end it, or remove one person.
// Hosted, a room is a Durable Object reached through a binding; self-hosted it is in this process
// (node-host.ts). This file has no Yjs in it, so the app Worker can import it.
import { getBinding, onWorkers } from "../env";
import type { Db } from "../db";

export type CollabHost = {
  /** Starts the room from the draft's text if it was never set up. True when it was started now. */
  seed(docId: string, text: string): Promise<boolean>;
  /** The room's text, or null when there is no room. */
  text(docId: string): Promise<string | null>;
  /** Forgets the room and ends every connection to it. */
  destroy(docId: string): Promise<void>;
  /** Ends one person's connections to the room. */
  kick(docId: string, userId: string): Promise<void>;
};

type Namespace = {
  idFromName: (name: string) => unknown;
  get: (id: unknown) => { fetch: (url: string, init?: RequestInit) => Promise<Response> };
};

/** A room name: one Durable Object per draft. */
export const roomName = (docId: string) => `doc:${docId}`;

export function workersHost(namespace: Namespace): CollabHost {
  const call = (docId: string, path: string, init?: RequestInit) =>
    namespace.get(namespace.idFromName(roomName(docId))).fetch(`https://room${path}`, init);
  const post = (docId: string, path: string, body: unknown) =>
    call(docId, path, { method: "POST", body: JSON.stringify(body) });
  return {
    async seed(docId, text) {
      const res = await post(docId, "/seed", { text });
      return res.ok && ((await res.json()) as { seeded?: boolean }).seeded === true;
    },
    async text(docId) {
      const res = await call(docId, "/text");
      return res.ok ? ((await res.json()) as { text: string }).text : null;
    },
    async destroy(docId) {
      await post(docId, "/destroy", {});
    },
    async kick(docId, userId) {
      await post(docId, "/kick", { userId });
    },
  };
}

/** The host for this request: the Durable Object on Workers, this process on Node, none when live editing is not available. */
export async function getCollabHost(request: Request, db: Db): Promise<CollabHost | null> {
  if (onWorkers(request)) {
    const namespace = getBinding(request, "COLLAB") as Namespace | undefined;
    return namespace ? workersHost(namespace) : null;
  }
  return (await import("@/server/node-collab")).nodeCollab(db);
}
