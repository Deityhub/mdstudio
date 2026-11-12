// One live-editing room: the shared Yjs document of one draft and who is in it. It is plain logic
// with no runtime in it: input is a binary frame from a connection, output is what to send and who
// to close, so the Durable Object (hosted) and the in-process hub (self-hosted) are thin adapters
// and everything here is tested without either. See docs/SYSTEM_SPEC.md, "Live editing".
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import {
  COMPACT_AFTER_BYTES,
  COMPACT_AFTER_UPDATES,
  FLUSH_AFTER_MS,
  MAX_AWARENESS_BYTES,
  MAX_FRAME_BYTES,
  MAX_PENDING_BYTES,
  MAX_STATE_BYTES,
  MSG_AWARENESS,
  MSG_SYNC,
  RATE_BYTES_PER_SECOND,
  RATE_FRAMES_PER_SECOND,
  ROOM_CLOSE,
  TEXT_KEY,
  colorFor,
} from "../../lib/collab/protocol";
import type { CollabStore } from "./store";

export type PeerInfo = {
  /** This connection (a tab). */
  id: string;
  /** The account behind it. */
  userId: string;
  name: string;
  avatar?: string | null;
  /** False for someone who may watch but not change the text. */
  canWrite?: boolean;
};

/** What the adapter does after a call: frames to send, frames for everyone else, a connection to end. */
export type Effects = {
  send: { to: string; data: Uint8Array }[];
  broadcast: { data: Uint8Array; except?: string }[];
  close?: { code: number; reason: string };
  /** The room's in-memory document may be damaged: call `reload()`, then resync everyone. */
  reload?: boolean;
};
const none = (): Effects => ({ send: [], broadcast: [] });

type Peer = {
  info: PeerInfo;
  /** The awareness ids (cursors) this connection speaks for. */
  owned: Set<number>;
  windowStart: number;
  frames: number;
  bytes: number;
};
type Presence = { clock: number; state: Record<string, unknown>; peer: string };

const MAX_OWNED_IDS = 3;
const MAX_AWARENESS_ENTRIES = 8;
const LOAD = Symbol("load");

export type Room = ReturnType<typeof createRoom>;

export function createRoom(opts: {
  store: CollabStore;
  now?: () => number;
  /** Connections in the room, and from one person (tabs and devices). */
  maxPeers?: number;
  maxPerUser?: number;
}) {
  const { store } = opts;
  const now = opts.now ?? Date.now;
  const maxPeers = opts.maxPeers ?? 12;
  const maxPerUser = opts.maxPerUser ?? 3;

  let doc: Y.Doc;
  let loaded = false;
  /** Whether anything has ever been stored: seeded rooms exist, even when the text is empty. */
  let existing = false;
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let dirtySince: number | null = null;
  let snapshotBytes = 0;
  let logRows = 0;
  let logBytes = 0;
  /** Collects the frames an update causes while a call is applying it. */
  let collecting: Effects | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const peers = new Map<string, Peer>();
  const presence = new Map<number, Presence>();

  function mount() {
    doc = new Y.Doc(); // garbage collection stays on: deleted text is dropped, only its length stays
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === LOAD) return;
      pending.push(update);
      pendingBytes += update.length;
      dirtySince ??= now();
      collecting?.broadcast.push({
        data: syncFrame((e) => syncProtocol.writeUpdate(e, update)),
        ...(typeof origin === "string" ? { except: origin } : {}),
      });
    });
  }
  mount();

  const text = () => doc.getText(TEXT_KEY);
  const stateBytes = () => snapshotBytes + logBytes + pendingBytes;

  async function open() {
    if (loaded) return;
    const stored = await store.load();
    if (stored.snapshot) Y.applyUpdate(doc, stored.snapshot, LOAD);
    for (const update of stored.updates) Y.applyUpdate(doc, update, LOAD);
    existing = stored.snapshot !== null || stored.updates.length > 0;
    snapshotBytes = stored.snapshot?.length ?? 0;
    logRows = stored.updates.length;
    logBytes = stored.updates.reduce((n, u) => n + u.length, 0);
    loaded = true;
  }

  const serial = <T>(work: () => Promise<T>) => {
    const next = queue.then(work);
    queue = next.catch(() => undefined);
    return next;
  };

  /** Writes what is waiting as one row, and folds the log into a snapshot when it has grown. */
  function flush({ compact = false }: { compact?: boolean } = {}) {
    return serial(async () => {
      if (pending.length) {
        const merged = pending.length === 1 ? pending[0]! : Y.mergeUpdates(pending);
        pending = [];
        pendingBytes = 0;
        dirtySince = null;
        await store.append(merged);
        logRows += 1;
        logBytes += merged.length;
        existing = true;
      }
      const grown = logRows >= COMPACT_AFTER_UPDATES || logBytes >= COMPACT_AFTER_BYTES;
      if (existing && (grown || (compact && logRows > 0))) {
        const snapshot = Y.encodeStateAsUpdate(doc);
        await store.compact(snapshot);
        snapshotBytes = snapshot.length;
        logRows = 0;
        logBytes = 0;
      }
    });
  }

  function syncFrame(write: (e: encoding.Encoder) => void) {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_SYNC);
    write(e);
    return encoding.toUint8Array(e);
  }
  function awarenessFrame(entries: { id: number; clock: number; state: unknown }[]) {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MSG_AWARENESS);
    encoding.writeVarUint(e, entries.length);
    for (const { id, clock, state } of entries) {
      encoding.writeVarUint(e, id);
      encoding.writeVarUint(e, clock);
      encoding.writeVarString(e, JSON.stringify(state));
    }
    return encoding.toUint8Array(e);
  }

  const refuse = (code: number, reason: string, extra: Partial<Effects> = {}): Effects => ({
    ...none(),
    close: { code, reason },
    ...extra,
  });

  /** The cursor a person may show: their selection and the identity the server knows for them. */
  function clean(peer: Peer, state: unknown): Record<string, unknown> {
    const given = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
    const cursor = given["cursor"];
    const color = colorFor(peer.info.userId);
    return {
      user: {
        name: peer.info.name.slice(0, 60),
        color,
        colorLight: `${color}33`,
        ...(peer.info.avatar ? { avatar: peer.info.avatar } : {}),
      },
      ...(cursor && typeof cursor === "object" ? { cursor } : {}),
    };
  }

  function receiveAwareness(peer: Peer, data: Uint8Array, decoder: decoding.Decoder): Effects {
    if (data.length > MAX_AWARENESS_BYTES) return refuse(ROOM_CLOSE.tooBig, "awareness too large");
    const count = decoding.readVarUint(decoder);
    if (count > MAX_AWARENESS_ENTRIES) throw new Error("too many awareness entries");
    const accepted: { id: number; clock: number; state: unknown }[] = [];
    for (let i = 0; i < count; i++) {
      const id = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const raw: unknown = JSON.parse(decoding.readVarString(decoder));
      const known = presence.get(id);
      if (known && known.peer !== peer.info.id) continue; // someone else's cursor
      if (!peer.owned.has(id) && peer.owned.size >= MAX_OWNED_IDS) continue;
      if (known && clock <= known.clock) continue; // older than what is already known
      if (raw === null) {
        if (!known) continue;
        presence.delete(id);
        peer.owned.delete(id);
        accepted.push({ id, clock, state: null });
      } else {
        const state = clean(peer, raw);
        presence.set(id, { clock, state, peer: peer.info.id });
        peer.owned.add(id);
        accepted.push({ id, clock, state });
      }
    }
    const fx = none();
    if (accepted.length)
      fx.broadcast.push({ data: awarenessFrame(accepted), except: peer.info.id });
    return fx;
  }

  function receiveSync(peer: Peer, data: Uint8Array, decoder: decoding.Decoder): Effects {
    const kind = decoding.peekVarUint(decoder);
    const writes = kind !== 0; // sync step 1 only asks; step 2 and update change the text
    if (writes && peer.info.canWrite === false) return none();
    if (writes && stateBytes() + data.length > MAX_STATE_BYTES)
      return refuse(ROOM_CLOSE.tooBig, "document too large");
    const fx = none();
    decoding.readVarUint(decoder);
    if (kind === 0) {
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, MSG_SYNC);
      syncProtocol.readSyncStep1(decoder, reply, doc); // writes step 2: what the asker lacks
      fx.send.push({ to: peer.info.id, data: encoding.toUint8Array(reply) });
      return fx;
    }
    if (kind !== 1 && kind !== 2) throw new Error(`unknown sync message ${kind}`);
    const update = decoding.readVarUint8Array(decoder);
    // Yjs logs and ignores an update it cannot read, so it is read here first: a bad one ends the connection
    Y.encodeStateVectorFromUpdate(update);
    collecting = fx;
    try {
      Y.applyUpdate(doc, update, peer.info.id);
    } finally {
      collecting = null;
    }
    // an update that needs structs nobody has sent would wait in memory without end
    const waiting = doc.store.pendingStructs;
    if (waiting && waiting.update.length > MAX_PENDING_BYTES) throw new Error("too much pending");
    return fx;
  }

  return {
    open,
    flush,

    /** Reloads the document from storage, after anything that may have damaged it. */
    async reload(): Promise<Effects> {
      await flush();
      await serial(async () => {
        doc.destroy();
        mount();
        loaded = false;
        await open();
      });
      // everyone asks again what they are missing
      const fx = none();
      for (const id of peers.keys())
        fx.send.push({ to: id, data: syncFrame((e) => syncProtocol.writeSyncStep1(e, doc)) });
      return fx;
    },

    /** Whether the room has ever been set up (even from an empty draft). */
    exists: () => existing,
    text: () => text().toString(),
    peerCount: () => peers.size,
    dirty: () => pending.length > 0,
    /** When the adapter should call `flush`: a few seconds after the first change that is not written. */
    nextFlushAt: () => (dirtySince === null ? null : dirtySince + FLUSH_AFTER_MS),

    /**
     * Starts the room from the draft's plain text, once, on the server. Editors never build the
     * document from text themselves: merging two documents built from the same text would double it.
     */
    async seed(initial: string) {
      await open();
      if (existing || text().length > 0) return false;
      doc.transact(() => {
        if (initial) text().insert(0, initial);
        doc.getMap("meta").set("seeded", 1); // so an empty draft still leaves something stored
      }, "server");
      await flush();
      return true;
    },

    /** Forgets the room: its stored state and its document. */
    async destroy() {
      await serial(async () => {
        await store.clear();
        doc.destroy();
        mount();
        pending = [];
        pendingBytes = 0;
        dirtySince = null;
        snapshotBytes = logRows = logBytes = 0;
        existing = false;
        loaded = true;
        presence.clear();
      });
    },

    /** Adds a connection, and says what it should be told first: the room asks what it is missing. */
    join(
      info: PeerInfo,
      /** A smaller room than the default, from the owner's limits. */
      caps: { maxPeers?: number } = {},
    ): { ok: true; effects: Effects } | { ok: false; reason: "full" } {
      const sameUser = [...peers.values()].filter((p) => p.info.userId === info.userId).length;
      if (peers.size >= Math.min(maxPeers, caps.maxPeers ?? maxPeers) || sameUser >= maxPerUser)
        return { ok: false, reason: "full" };
      peers.set(info.id, {
        info,
        owned: new Set(),
        windowStart: now(),
        frames: 0,
        bytes: 0,
      });
      const fx = none();
      fx.send.push({
        to: info.id,
        data: syncFrame((e) => syncProtocol.writeSyncStep1(e, doc)),
      });
      if (presence.size)
        fx.send.push({
          to: info.id,
          data: awarenessFrame(
            [...presence].map(([id, p]) => ({ id, clock: p.clock, state: p.state })),
          ),
        });
      return { ok: true, effects: fx };
    },

    /** Takes a connection's frame; never throws, whatever the bytes are. */
    receive(peerId: string, data: Uint8Array): Effects {
      const peer = peers.get(peerId);
      if (!peer) return none();
      if (data.length > MAX_FRAME_BYTES) return refuse(ROOM_CLOSE.tooBig, "frame too large");
      const t = now();
      if (t - peer.windowStart >= 1000) {
        peer.windowStart = t;
        peer.frames = 0;
        peer.bytes = 0;
      }
      peer.frames += 1;
      peer.bytes += data.length;
      if (peer.frames > RATE_FRAMES_PER_SECOND || peer.bytes > RATE_BYTES_PER_SECOND)
        return refuse(ROOM_CLOSE.policy, "too many messages");
      try {
        const decoder = decoding.createDecoder(data);
        const type = decoding.readVarUint(decoder);
        if (type === MSG_SYNC) return receiveSync(peer, data, decoder);
        if (type === MSG_AWARENESS) return receiveAwareness(peer, data, decoder);
        throw new Error(`unknown message type ${type}`);
      } catch {
        // a frame that does not decode (or does not apply) may have left the document half changed
        return refuse(ROOM_CLOSE.malformed, "malformed message", { reload: true });
      }
    },

    /** Removes a connection and its cursors, and says so to the rest. */
    leave(peerId: string): Effects {
      const peer = peers.get(peerId);
      peers.delete(peerId);
      const fx = none();
      if (!peer) return fx;
      const gone = [...peer.owned].flatMap((id) => {
        const known = presence.get(id);
        presence.delete(id);
        return known ? [{ id, clock: known.clock + 1, state: null }] : [];
      });
      if (gone.length) fx.broadcast.push({ data: awarenessFrame(gone) });
      return fx;
    },
  };
}
