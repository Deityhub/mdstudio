// A browser's connection to a draft's room: one Yjs document on one WebSocket, with the cursors of
// the people in it. It sends this browser's edits in small batches, brings back what it missed when
// the socket returns (the handshake exchanges only the difference, so edits made offline merge with
// whatever happened meanwhile), and reconnects by itself. It never builds the text from anything:
// the room is seeded on the server and this document only ever receives it.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { CLOSE } from "../realtime/protocol";
import { getTabId } from "../realtime/tab";
import { MSG_AWARENESS, MSG_SYNC } from "./protocol";

export type SocketLike = {
  binaryType: string;
  send(data: string | Uint8Array): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
};

/** connecting: no word from the room yet; live: in the room; offline: retrying; ended: not allowed any more. */
export type Status = "connecting" | "live" | "offline" | "ended";
export type Peer = { id: number; name: string; color: string; avatar: string | null };

type Options = {
  /** `doc:<ownerId>:<draftId>`. */
  topic: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** The room this device's kept state came from, when it has some. */
  epoch?: string | null;
  createSocket?: (url: string) => SocketLike;
  onStatus?: (status: Status) => void;
  /** The room's state has arrived (once per connection), and which room it is. */
  onSynced?: (epoch: string | null) => void;
  /** The room is not the one the kept state came from (the draft was stopped and started again). */
  onStale?: () => void;
  onPeers?: (peers: Peer[]) => void;
  /** The session ended or ran out: look at the account again before trying more. */
  onEnded?: (code: number) => Promise<unknown> | unknown;
};

/** Edits wait this long for company, and never longer than the second figure, before they are sent. */
export const BATCH_MS = 150;
export const MAX_BATCH_MS = 500;
/** Cursor moves are sent at most four times a second. */
export const AWARENESS_MS = 250;
const MIN_WAIT = 1000;
const MAX_WAIT = 60_000;
const PING_EVERY = 25_000;
const PONG_WITHIN = 10_000;

const socketUrl = (topic: string) =>
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/realtime?` +
  new URLSearchParams({ topic, client: getTabId() });

const frame = (type: number, write: (e: encoding.Encoder) => void) => {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, type);
  write(e);
  return encoding.toUint8Array(e);
};

export function createProvider(opts: Options) {
  const { doc, awareness } = opts;
  const open = opts.createSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  // The awareness object renews and expires states on a timer, which would send a frame every few
  // seconds for nothing: the room tells everyone when a person leaves, so the timer is not needed.
  clearInterval(
    (awareness as unknown as { _checkInterval: ReturnType<typeof setInterval> })._checkInterval,
  );

  let socket: SocketLike | null = null;
  let running = false;
  let ready = false;
  let status: Status = "offline";
  let epoch = opts.epoch ?? null;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  let pong: ReturnType<typeof setTimeout> | undefined;
  let batch: ReturnType<typeof setTimeout> | undefined;
  let queued: Uint8Array[] = [];
  let firstQueued = 0;
  let cursorTimer: ReturnType<typeof setTimeout> | undefined;
  let cursorSentAt = 0;

  const setStatus = (next: Status) => {
    if (status === next) return;
    status = next;
    opts.onStatus?.(next);
  };
  const send = (data: Uint8Array) => {
    if (ready && socket) socket.send(data);
  };

  // ---- what this browser writes --------------------------------------------------------------

  const flushEdits = () => {
    clearTimeout(batch);
    batch = undefined;
    if (!queued.length) return;
    const update = queued.length === 1 ? queued[0]! : Y.mergeUpdates(queued);
    queued = [];
    firstQueued = 0;
    send(frame(MSG_SYNC, (e) => syncProtocol.writeUpdate(e, update)));
  };
  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    // what came from the room is not sent back; while there is no connection the handshake sends it
    if (origin === provider || !ready) return;
    queued.push(update);
    const now = Date.now();
    firstQueued ||= now;
    clearTimeout(batch);
    batch = setTimeout(
      flushEdits,
      Math.min(BATCH_MS, Math.max(0, firstQueued + MAX_BATCH_MS - now)),
    );
  };
  doc.on("update", onDocUpdate);

  const sendCursor = () => {
    cursorTimer = undefined;
    cursorSentAt = Date.now();
    send(
      frame(MSG_AWARENESS, (e) =>
        encoding.writeUint8Array(
          e,
          awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]),
        ),
      ),
    );
  };
  const onAwarenessUpdate = (
    change: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === provider || !ready) return;
    if (![...change.added, ...change.updated, ...change.removed].includes(doc.clientID)) return;
    if (cursorTimer) return;
    cursorTimer = setTimeout(sendCursor, Math.max(0, cursorSentAt + AWARENESS_MS - Date.now()));
  };
  awareness.on("update", onAwarenessUpdate);

  const emitPeers = () => {
    const peers: Peer[] = [];
    for (const [id, state] of awareness.getStates()) {
      const user = (state as { user?: { name?: unknown; color?: unknown; avatar?: unknown } }).user;
      if (id === doc.clientID || !user || typeof user.name !== "string") continue;
      peers.push({
        id,
        name: user.name,
        color: typeof user.color === "string" ? user.color : "#888888",
        avatar: typeof user.avatar === "string" ? user.avatar : null,
      });
    }
    opts.onPeers?.(peers);
  };
  awareness.on("change", emitPeers);

  // ---- the connection ------------------------------------------------------------------------

  function release() {
    clearInterval(ping);
    clearTimeout(pong);
    clearTimeout(batch);
    clearTimeout(cursorTimer);
    ping = pong = batch = cursorTimer = undefined;
    queued = [];
    firstQueued = 0;
    ready = false;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = null;
      socket = null;
    }
    // people who were in the room are not known to be there any more
    const others = [...awareness.getStates().keys()].filter((id) => id !== doc.clientID);
    if (others.length) awarenessProtocol.removeAwarenessStates(awareness, others, provider);
  }

  /** The wait before the next try: 1 s, 2 s, 4 s ... up to a minute, with a little randomness. */
  const backoff = () => Math.min(MAX_WAIT, MIN_WAIT * 2 ** attempt++) * (0.5 + Math.random() / 2);
  const schedule = (wait: number) => {
    if (!running) return;
    clearTimeout(retry);
    retry = setTimeout(connect, wait);
  };

  async function lost(code: number | null) {
    release();
    if (!running) return;
    if (code === CLOSE.gone) {
      running = false;
      setStatus("ended");
      return;
    }
    setStatus("offline");
    if (code === CLOSE.sessionEnded || code === CLOSE.expired) {
      await opts.onEnded?.(code);
      schedule(MIN_WAIT);
    } else if (code === CLOSE.full || code === CLOSE.badMessage || code === 1008 || code === 1009)
      schedule(MAX_WAIT);
    else schedule(backoff());
  }

  function onReady(theirs: unknown) {
    const room = typeof theirs === "string" ? theirs : null;
    if (epoch && room && epoch !== room) {
      // an earlier room's state must never be merged into a later one: nothing is sent
      running = false;
      const s = socket;
      release();
      s?.close();
      setStatus("offline");
      opts.onStale?.();
      return;
    }
    epoch = epoch ?? room;
    attempt = 0;
    ready = true;
    setStatus("live");
    // ask for what is missing; the room asks back for what it is missing (this is how offline edits arrive)
    send(frame(MSG_SYNC, (e) => syncProtocol.writeSyncStep1(e, doc)));
    awareness.setLocalState(awareness.getLocalState() ?? {});
    sendCursor();
  }

  function onMessage(data: unknown) {
    clearTimeout(pong);
    pong = undefined;
    if (typeof data === "string") {
      if (data === "pong") return;
      try {
        const m = JSON.parse(data) as { t?: unknown; epoch?: unknown };
        if (m.t === "ready") onReady(m.epoch);
      } catch {
        // not ours
      }
      return;
    }
    if (!(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) return;
    const d = decoding.createDecoder(
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    const type = decoding.readVarUint(d);
    if (type === MSG_SYNC) {
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, MSG_SYNC);
      const kind = syncProtocol.readSyncMessage(d, reply, doc, provider);
      if (encoding.length(reply) > 1) send(encoding.toUint8Array(reply));
      if (kind === syncProtocol.messageYjsSyncStep2) opts.onSynced?.(epoch);
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readTailAsUint8Array(d), provider);
    }
  }

  function connect() {
    retry = undefined;
    if (!running || socket) return;
    setStatus("connecting");
    const s = open(socketUrl(opts.topic));
    s.binaryType = "arraybuffer";
    socket = s;
    s.onopen = () => {
      ping = setInterval(() => {
        s.send("ping");
        clearTimeout(pong);
        // nothing came back: the connection is dead even if the browser has not noticed
        pong = setTimeout(() => {
          s.close();
          void lost(null);
        }, PONG_WITHIN);
      }, PING_EVERY);
    };
    s.onmessage = (event) => onMessage(event.data);
    s.onclose = (event) => void lost(event.code); // an error is always followed by this
  }

  const provider = {
    start() {
      if (running) return;
      running = true;
      attempt = 0;
      connect();
    },
    /** The network is back, or the tab is: try now instead of waiting. */
    nudge() {
      if (!running || socket) return;
      clearTimeout(retry);
      attempt = 0;
      connect();
    },
    stop() {
      running = false;
      clearTimeout(retry);
      if (ready) {
        flushEdits();
        awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], provider);
      }
      const s = socket;
      release();
      s?.close();
      setStatus("offline");
    },
    destroy() {
      provider.stop();
      doc.off("update", onDocUpdate);
      awareness.off("update", onAwarenessUpdate);
      awareness.off("change", emitPeers);
    },
    get status() {
      return status;
    },
  };
  return provider;
}
export type Provider = ReturnType<typeof createProvider>;
