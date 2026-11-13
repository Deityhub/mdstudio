// Where a live draft's kept state lives in the browser. Apart from persistence.ts so the sync code can
// forget it without importing Yjs, which only people editing with others should ever download.
import type { KeyValueStore } from "../storage/documentStore";

export type Kept = { state: Uint8Array; epoch: string | null; at: number };

export const keptKey = (ownerId: string, draftId: string) => `ydoc:${ownerId}:${draftId}`;

/** Forgets a draft's kept state: it is no longer live, or it left this device. */
export const forgetKept = (kv: KeyValueStore, ownerId: string, draftId: string) =>
  kv.del(keptKey(ownerId, draftId));
