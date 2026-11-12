// What sync remembers per account about each draft it keeps in the cloud: the server version it
// last saw and the hash of the synced fields at that moment. A draft whose current hash differs has
// unsynced edits. A draft with no entry is not in the cloud and is never uploaded.
import type { KeyValueStore } from "../storage/documentStore";

export type DocMeta = {
  id: string;
  userId: string;
  /** 0 means chosen for the cloud but not uploaded yet. */
  version: number;
  hash: string;
  /** The cloud copy is gone (deleted, or removed on purpose); a local draft may remain. */
  deleted?: boolean;
  /** Asked to leave the cloud: the next round deletes the cloud copy and keeps the local draft. */
  unlink?: boolean;
  /**
   * The draft is being edited live with other people: its text is the room's. This device neither
   * pushes it nor takes the cloud's copy of it; `hash` stays what it was when the draft went live.
   */
  collab?: boolean;
};

export function createSyncMeta(kv: KeyValueStore, userId: string) {
  const cursorKey = `sync:${userId}:cursor`;
  const docKey = (id: string) => `sync:${userId}:doc:${id}`;
  return {
    userId,
    async cursor() {
      return (await kv.get<number>(cursorKey)) ?? 0;
    },
    setCursor: (value: number) => kv.set(cursorKey, value),
    get: (id: string) => kv.get<DocMeta>(docKey(id)),
    set: (m: Omit<DocMeta, "userId">) => kv.set(docKey(m.id), { ...m, userId }),
    remove: (id: string) => kv.del(docKey(id)),
    list: () => kv.values<DocMeta>(`sync:${userId}:doc:`),
    /** Drafts in the cloud right now (not deleted, not on their way out). */
    async linked() {
      return (await this.list()).filter((m) => !m.deleted && !m.unlink);
    },
  };
}
export type SyncMeta = ReturnType<typeof createSyncMeta>;

/** Which account, if any, keeps each draft in the cloud, across every account used in this browser. */
export async function cloudOwners(kv: KeyValueStore): Promise<Map<string, Set<string>>> {
  const owners = new Map<string, Set<string>>();
  for (const m of await kv.values<DocMeta>("sync:")) {
    if (typeof m !== "object" || !m || !("userId" in m) || m.deleted) continue;
    (owners.get(m.id) ?? owners.set(m.id, new Set()).get(m.id)!).add(m.userId);
  }
  return owners;
}

/**
 * A draft kept in the cloud by one account belongs to that account: it is hidden while anyone else
 * (or nobody) is signed in. Drafts not in the cloud are visible to everyone using the browser.
 */
export const isVisible = (owners: Map<string, Set<string>>, id: string, userId?: string) => {
  const who = owners.get(id);
  return !who || who.size === 0 || (!!userId && who.has(userId));
};
