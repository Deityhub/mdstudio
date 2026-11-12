// What this browser keeps of a live draft between visits: the document's whole state, in IndexedDB,
// so a reload, a closed tab or no network at all loses nothing, and edits made offline are still
// there to merge when the room is reachable. It is written a couple of seconds after typing stops
// (never more than ten seconds late) and when the page is hidden. The state is kept together with the
// name of the room it came from: state of an earlier room must never be merged into a later one.
import * as Y from "yjs";
import type { KeyValueStore } from "../storage/documentStore";
import type { Kept } from "./kept";

export const DEBOUNCE_MS = 2000;
export const MAX_DELAY_MS = 10_000;

export function createPersistence(kv: KeyValueStore, key: string, doc: Y.Doc) {
  let epoch: string | null = null;
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstDirty = 0;
  let writing: Promise<unknown> = Promise.resolve();

  const write = () => {
    clearTimeout(timer);
    timer = undefined;
    firstDirty = 0;
    const kept: Kept = { state: Y.encodeStateAsUpdate(doc), epoch, at: Date.now() };
    writing = writing.then(() => kv.set(key, kept));
    return writing;
  };
  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    if (!active || origin === "kept") return;
    const now = Date.now();
    firstDirty ||= now;
    clearTimeout(timer);
    timer = setTimeout(write, Math.min(DEBOUNCE_MS, Math.max(0, firstDirty + MAX_DELAY_MS - now)));
  };
  doc.on("update", onUpdate);

  return {
    /** Puts the kept state into the document, and says what was kept (nothing: undefined). */
    async load(): Promise<Kept | undefined> {
      const kept = await kv.get<Kept>(key);
      if (!kept?.state) return undefined;
      Y.applyUpdate(doc, kept.state, "kept");
      return kept;
    },
    /**
     * Starts keeping the document. Called once the room's state is in it (or it was loaded), never
     * before: a document that has not met its room is not worth keeping.
     */
    start(room: string | null) {
      epoch = room;
      if (active) return;
      active = true;
      void write();
    },
    /** Writes what is waiting now (the page is being hidden). */
    flush: () => (timer || firstDirty ? write() : writing),
    stop() {
      active = false;
      clearTimeout(timer);
      timer = undefined;
      doc.off("update", onUpdate);
    },
  };
}
