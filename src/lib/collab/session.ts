// One open live draft in this browser: its Yjs document, the connection, the copy kept in IndexedDB,
// and the CodeMirror extension that binds the editor to it. Loaded on demand (dynamic import), so
// people who never edit with others never download Yjs.
import type { Extension } from "@codemirror/state";
import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import { keymap } from "@codemirror/view";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type { KeyValueStore } from "../storage/documentStore";
import { minimalChange } from "./diff";
import { threadHighlights } from "./highlights";
import { ACCEPT_ORIGIN, type Author, exportThreads } from "./thread-rules";
import { createThreads } from "./threads";
import { forgetKept, keptKey } from "./kept";
import { createPersistence } from "./persistence";
import { TEXT_KEY } from "./protocol";
import { type Peer, type SocketLike, type Status, createProvider } from "./provider";

export type SessionState = {
  status: Status;
  peers: Peer[];
  /** The draft's text is in this document, from the room or from what this browser kept: it may be edited. */
  ready: boolean;
  /** The room keeps refusing this person; true until a connection works again. */
  refused: boolean;
};

/** The plain-text copy on the server is asked to refresh this long after the last edit made here. */
export const TEXT_COPY_MS = 30_000;

export type SessionOptions = {
  /** Who is writing, for the comments and suggestions this browser makes. */
  me: Author;
  ownerId: string;
  draftId: string;
  kv: KeyValueStore;
  /** Asks the server to refresh its plain-text copy of the draft (it ignores the answer). */
  refreshCopy?: (url: string) => void;
  createSocket?: (url: string) => SocketLike;
  /** The room is not the one this browser's kept state came from: the text it held is handed over to be saved. */
  onStale: (text: string) => void;
  onEnded?: (code: number) => Promise<unknown> | unknown;
  /** The room keeps refusing this person (see the provider): find out what became of the draft. */
  onRefused?: () => Promise<unknown> | void;
};

const defaultRefresh = (url: string) =>
  void fetch(url, { method: "POST", keepalive: true, credentials: "same-origin" }).catch(
    () => undefined,
  );

export async function openSession(opts: SessionOptions) {
  const { ownerId, draftId, kv } = opts;
  const doc = new Y.Doc();
  const ytext = doc.getText(TEXT_KEY);
  const awareness = new awarenessProtocol.Awareness(doc);
  const persistence = createPersistence(kv, keptKey(ownerId, draftId), doc);
  const kept = await persistence.load();

  let state: SessionState = { status: "connecting", peers: [], ready: !!kept, refused: false };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };

  const refreshCopy = opts.refreshCopy ?? defaultRefresh;
  const copyUrl = `/api/collab/doc/${ownerId}/${draftId}/flush`;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let copyOwed = false;
  const askForCopy = () => {
    clearTimeout(copyTimer);
    copyTimer = undefined;
    if (!copyOwed || !state.ready) return;
    copyOwed = false;
    refreshCopy(copyUrl);
  };
  doc.on("update", (_u: Uint8Array, origin: unknown) => {
    // only what this browser typed: everyone else's browser asks for theirs
    if (origin === provider || origin === "kept") return;
    copyOwed = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(askForCopy, TEXT_COPY_MS);
  });

  const provider = createProvider({
    topic: `doc:${ownerId}:${draftId}`,
    doc,
    awareness,
    epoch: kept?.epoch ?? null,
    ...(opts.createSocket ? { createSocket: opts.createSocket } : {}),
    onStatus: (status) => set({ status, ...(status === "live" && { refused: false }) }),
    onRefused: () => {
      // said until the access check is back (a few seconds at most); if the draft is still shared
      // the footer goes back to saying offline, which is then the whole truth
      set({ refused: true });
      const waited = new Promise((r) => setTimeout(r, 4000));
      void Promise.race([Promise.resolve(opts.onRefused?.()).catch(() => undefined), waited]).then(
        () => set({ refused: false }),
      );
    },
    onPeers: (peers) => set({ peers }),
    onSynced: (epoch) => {
      persistence.start(epoch);
      if (!state.ready) set({ ready: true });
    },
    onStale: () => {
      const text = ytext.toString();
      destroy();
      void forgetKept(kv, ownerId, draftId).then(() => opts.onStale(text));
    },
    ...(opts.onEnded ? { onEnded: opts.onEnded } : {}),
  });
  // a document that was kept is written again as it changes; one still waiting for its room is not
  if (kept) persistence.start(kept.epoch);

  const threads = createThreads(doc, ytext, opts.me);
  // an accepted suggestion is an edit by the person who accepts it, so their Undo takes it back
  const undoManager = new Y.UndoManager(ytext, { trackedOrigins: new Set([ACCEPT_ORIGIN]) });
  let picked: (id: string) => void = () => undefined;
  const extension: Extension = [
    threadHighlights(threads, (id) => picked(id)),
    yCollab(ytext, awareness, { undoManager }),
    keymap.of(yUndoManagerKeymap),
  ];

  const hide = () => {
    if (document.visibilityState === "hidden") {
      void persistence.flush();
      askForCopy();
    }
  };
  const onPageHide = () => {
    void persistence.flush();
    askForCopy();
  };
  const onOnline = () => provider.nudge();
  document.addEventListener("visibilitychange", hide);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("online", onOnline);

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener("visibilitychange", hide);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("online", onOnline);
    askForCopy();
    clearTimeout(copyTimer);
    provider.destroy();
    void persistence.flush().then(() => persistence.stop());
    undoManager.destroy();
    awareness.destroy();
    listeners.clear();
  }

  provider.start();

  return {
    ownerId,
    draftId,
    ytext,
    awareness,
    /** Comments and suggestions on the words of the draft. */
    threads,
    /** The open comments and suggestions as Markdown, for when live editing stops. */
    exportNotes: () => exportThreads(threads.list()),
    /** What to do when a marked word is clicked (open its thread). */
    onPickThread(fn: (id: string) => void) {
      picked = fn;
    },
    /** Goes into the editor's extensions in place of its own history. */
    extension,
    text: () => ytext.toString(),
    /**
     * Makes the shared text this one, as the smallest edit (restoring a version, the front matter
     * form, an AI edit): other people's edits around it are kept.
     */
    replaceText(next: string) {
      const change = minimalChange(ytext.toString(), next);
      if (!change) return;
      doc.transact(() => {
        if (change.to > change.from) ytext.delete(change.from, change.to - change.from);
        if (change.insert) ytext.insert(change.from, change.insert);
      });
    },
    undo: () => void undoManager.undo(),
    redo: () => void undoManager.redo(),
    get state() {
      return state;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Calls back with the text after every change, from anyone. */
    observe(fn: (text: string) => void) {
      const handler = () => fn(ytext.toString());
      ytext.observe(handler);
      return () => ytext.unobserve(handler);
    },
    destroy,
  };
}
export type Session = Awaited<ReturnType<typeof openSession>>;
