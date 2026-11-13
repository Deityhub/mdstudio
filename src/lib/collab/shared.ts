// Drafts other people invited this account to edit. They are not the account's own cloud drafts
// (they do not count against its limit and are never uploaded): each is kept on this device as an
// ordinary draft carrying a reference to where it lives, so the library, the preview and export work
// offline. When the invitation ends the draft stays as a plain local copy.
import type { KeyValueStore, MdDocument, createDocumentStore } from "../storage/documentStore";
import { forgetKept } from "./kept";

type Store = ReturnType<typeof createDocumentStore>;

/** A draft as the server lists it for an invited person. */
export type SharedItem = {
  ownerId: string;
  id: string;
  title: string;
  ownerName: string | null;
  updatedAt: number;
};

/** The id this device gives a shared draft: short, stable, and not one of the account's own. */
export const sharedLocalId = (ownerId: string, id: string) =>
  `sh-${ownerId.slice(0, 8)}-${id}`.slice(0, 64);

/** Whether this document belongs to the person using the browser (shared drafts belong to one account). */
export const isMine = (d: MdDocument, userId: string | undefined) =>
  !d.shared || d.shared.userId === userId;

/** The local copy of a shared draft, made if it is not there yet; returns its id. */
export async function openShared(
  store: Store,
  userId: string,
  item: Pick<SharedItem, "ownerId" | "id" | "title" | "ownerName">,
) {
  const id = sharedLocalId(item.ownerId, item.id);
  const existing = await store.get(id);
  const shared = { ownerId: item.ownerId, id: item.id, userId, ownerName: item.ownerName };
  if (existing) {
    if (existing.shared?.userId !== userId || existing.shared.ownerName !== item.ownerName)
      await store.save({ ...existing, shared }, { quiet: true });
    return id;
  }
  const now = Date.now();
  // the text arrives from the room; until then the draft is shown, not editable
  await store.save(
    { id, title: item.title, content: "", images: {}, createdAt: now, updatedAt: now, shared },
    { quiet: true },
  );
  return id;
}

/**
 * Where a draft's address leads for this person, as the id of the draft to open here. The owner is
 * taken to their own draft (never a second, shared copy of it); an invited person gets their local copy.
 */
export async function openTarget(
  store: Store,
  userId: string,
  item: Pick<SharedItem, "ownerId" | "id" | "title" | "ownerName">,
) {
  return item.ownerId === userId ? item.id : openShared(store, userId, item);
}

/** The draft stops being shared: it stays on this device as an ordinary local draft. */
export async function detachShared(store: Store, kv: KeyValueStore, id: string) {
  const d = await store.get(id);
  if (!d?.shared) return null;
  const { ownerId, id: draftId } = d.shared;
  const { shared: _gone, ...plain } = d;
  await store.save(plain, { quiet: true });
  await forgetKept(kv, ownerId, draftId);
  return plain as MdDocument;
}

/**
 * Brings this device's shared drafts in line with what the server says is shared with the account:
 * one that is no longer listed (removed, stopped, deleted, left elsewhere) is detached. Call it only
 * with a list that was really read, never with one that failed to load.
 */
export async function reconcileShared(
  store: Store,
  kv: KeyValueStore,
  userId: string,
  items: SharedItem[],
) {
  const listed = new Set(items.map((i) => sharedLocalId(i.ownerId, i.id)));
  const detached: MdDocument[] = [];
  for (const d of await store.list()) {
    if (d.shared?.userId !== userId) continue;
    if (listed.has(d.id)) continue;
    if (d.shared.ownerId === userId) {
      // a copy of the person's own draft (made before opening it by its link took them to the original)
      await store.remove(d.id, { quiet: true });
      await forgetKept(kv, d.shared.ownerId, d.shared.id);
      continue;
    }
    const plain = await detachShared(store, kv, d.id);
    if (plain) detached.push(plain);
  }
  return detached;
}

/** Leaves a shared draft for good: its local copy and what was kept of its room go. */
export async function removeShared(
  store: Store,
  kv: KeyValueStore,
  id: string,
  /** Lets go of whatever else the device holds for the draft (its saved versions). */
  onGone?: (id: string) => Promise<unknown>,
) {
  const d = await store.get(id);
  if (!d?.shared) return;
  await store.remove(id, { quiet: true });
  await forgetKept(kv, d.shared.ownerId, d.shared.id);
  await onGone?.(id);
}

/** Signing out: this account's shared drafts leave the device, as its cloud drafts do. */
export async function removeSharedFor(
  store: Store,
  kv: KeyValueStore,
  userId: string,
  onGone?: (id: string) => Promise<unknown>,
) {
  for (const d of await store.list())
    if (d.shared?.userId === userId) await removeShared(store, kv, d.id, onGone);
}
