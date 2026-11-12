// Choosing what lives in the cloud, and leaving: these change the sync metadata and local drafts,
// never the network. The next sync round does the uploading and deleting.
import type { MdDocument, createDocumentStore } from "../storage/documentStore";
import { type SyncMeta } from "./meta";

type Store = ReturnType<typeof createDocumentStore>;

/** Marks drafts for the cloud. A draft whose cloud copy was removed earlier is revived. */
export async function linkDrafts(meta: SyncMeta, ids: string[]) {
  for (const id of ids) {
    const m = await meta.get(id);
    if (m && !m.deleted && !m.unlink) continue;
    // After a removal the cloud keeps a tombstone at `version`; naming it lets the draft come back.
    await meta.set({ id, version: m?.version ?? 0, hash: "" });
  }
}

/** Takes a draft out of the cloud; it stays on this device and the next round deletes the copy. */
export async function unlinkDraft(meta: SyncMeta, id: string) {
  const m = await meta.get(id);
  if (m && !m.deleted) await meta.set({ ...m, unlink: true });
}

export type SignOutCheck = {
  /** Cloud drafts with changes the cloud does not have yet. */
  unsynced: string[];
  /** Cloud drafts with images, which only exist in this browser until hosted images ship. */
  withImages: string[];
};

export async function checkSignOut(
  store: Store,
  meta: SyncMeta,
  hashOf: (d: MdDocument) => Promise<string>,
) {
  const check: SignOutCheck = { unsynced: [], withImages: [] };
  for (const m of await meta.linked()) {
    const d = await store.get(m.id);
    if (!d) continue;
    // a draft edited live is kept by the room, not by this device's last upload
    if (!m.collab && (await hashOf(d)) !== m.hash) check.unsynced.push(m.id);
    if (Object.keys(d.images).length) check.withImages.push(m.id);
  }
  return check;
}

/**
 * Leaves the account on this browser. Cloud drafts are removed from the device (they live in the
 * cloud), except those in `keep`, which stay as ordinary local drafts. Sync memory for the account
 * is cleared, so the next sign-in downloads the cloud drafts again.
 */
export async function leaveAccount(
  store: Store,
  meta: SyncMeta,
  opts: {
    keep?: Set<string>;
    onGone?: (id: string) => Promise<unknown>;
    /** A kept draft that was being edited live is an ordinary local draft now: what was kept of its room goes. */
    onLeaveLive?: (id: string) => Promise<unknown>;
  } = {},
) {
  for (const m of await meta.list()) {
    if (!m.deleted && !opts.keep?.has(m.id) && (await store.get(m.id))) {
      await store.remove(m.id, { quiet: true });
      await opts.onGone?.(m.id);
    } else if (m.collab) await opts.onLeaveLive?.(m.id);
    await meta.remove(m.id);
  }
  await meta.setCursor(0);
}
