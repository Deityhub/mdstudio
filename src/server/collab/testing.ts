// Simulated editors for the room's tests: each has its own Yjs document, an outbox of what it has
// not sent yet (it may be "offline"), and applies what the room sends back, as a browser would.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { MSG_AWARENESS, MSG_SYNC, TEXT_KEY } from "@/lib/collab/protocol";
import type { Effects, Room } from "./room";

export const frame = (write: (e: encoding.Encoder) => void, type = MSG_SYNC) => {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, type);
  write(e);
  return encoding.toUint8Array(e);
};
export const step1Frame = (doc: Y.Doc) => frame((e) => syncProtocol.writeSyncStep1(e, doc));
export const updateFrame = (update: Uint8Array) =>
  frame((e) => syncProtocol.writeUpdate(e, update));

/** An awareness frame with one entry, the way a browser's awareness encodes it. */
export const awarenessFrame = (clientId: number, clock: number, state: unknown) =>
  frame((e) => {
    encoding.writeVarUint(e, 1);
    encoding.writeVarUint(e, clientId);
    encoding.writeVarUint(e, clock);
    encoding.writeVarString(e, JSON.stringify(state));
  }, MSG_AWARENESS);

/** What an awareness frame says, as `[clientId, clock, state]` entries. */
export function readAwareness(data: Uint8Array) {
  const d = decoding.createDecoder(data);
  if (decoding.readVarUint(d) !== MSG_AWARENESS) throw new Error("not awareness");
  const out: [number, number, unknown][] = [];
  for (let n = decoding.readVarUint(d); n > 0; n--)
    out.push([
      decoding.readVarUint(d),
      decoding.readVarUint(d),
      JSON.parse(decoding.readVarString(d)),
    ]);
  return out;
}

export class Editor {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText(TEXT_KEY);
  online = true;

  constructor(
    readonly id: string,
    private readonly net: Network,
  ) {
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this) return; // what came from the room is not sent back
      if (this.online) net.toRoom(this, updateFrame(update)); // offline, it is simply kept
    });
  }

  /** An edit made here, at once, wherever the room is. */
  insert(at: number, s: string) {
    this.doc.transact(() => this.text.insert(Math.min(at, this.text.length), s));
  }
  delete(at: number, n: number) {
    this.doc.transact(() => this.text.delete(Math.min(at, this.text.length), n));
  }

  /** Called with what the room sends. */
  receive(data: Uint8Array) {
    if (!this.online) return; // a dropped connection hears nothing; reconnecting asks for it all
    const d = decoding.createDecoder(data);
    if (decoding.readVarUint(d) !== MSG_SYNC) return;
    const reply = encoding.createEncoder();
    encoding.writeVarUint(reply, MSG_SYNC);
    syncProtocol.readSyncMessage(d, reply, this.doc, this);
    if (encoding.length(reply) > 1) this.net.toRoom(this, encoding.toUint8Array(reply));
  }

  goOffline() {
    this.online = false;
  }

  /** Reconnects: a new connection, so the room and the editor each ask what they are missing. */
  goOnline() {
    this.online = true;
    this.net.rejoin(this);
  }
}

/** The wire between editors and one room: delivers frames and applies the effects it answers with. */
export class Network {
  readonly editors = new Map<string, Editor>();
  closed: { id: string; code: number }[] = [];
  constructor(public room: Room) {}

  async add(id: string, over: { userId?: string; name?: string; canWrite?: boolean } = {}) {
    const editor = new Editor(id, this);
    this.editors.set(id, editor);
    const joined = this.room.join({
      id,
      userId: over.userId ?? id,
      name: over.name ?? id,
      ...(over.canWrite === undefined ? {} : { canWrite: over.canWrite }),
    });
    if (!joined.ok) throw new Error(`room refused ${id}: ${joined.reason}`);
    this.apply(joined.effects, id);
    // the editor says hello too, as y-websocket's provider does
    this.toRoom(editor, step1Frame(editor.doc));
    return editor;
  }

  /** A dropped connection coming back: the old one is gone, and the handshake starts again. */
  rejoin(editor: Editor) {
    this.apply(this.room.leave(editor.id), editor.id);
    const joined = this.room.join({ id: editor.id, userId: editor.id, name: editor.id });
    if (!joined.ok) throw new Error(`room refused ${editor.id}: ${joined.reason}`);
    this.apply(joined.effects, editor.id);
    this.toRoom(editor, step1Frame(editor.doc));
  }

  /** The room was restarted (a Durable Object after hibernating): every editor joins it again. */
  restart(room: Room) {
    this.room = room;
    for (const [id, editor] of this.editors) {
      const joined = room.join({ id, userId: id, name: id });
      if (!joined.ok) throw new Error(`room refused ${id}: ${joined.reason}`);
      this.apply(joined.effects, id);
      if (editor.online) this.toRoom(editor, step1Frame(editor.doc));
    }
  }

  toRoom(editor: Editor, data: Uint8Array) {
    this.apply(this.room.receive(editor.id, data), editor.id);
  }

  apply(effects: Effects, from: string) {
    for (const s of effects.send) this.editors.get(s.to)?.receive(s.data);
    for (const b of effects.broadcast)
      for (const [id, e] of this.editors) if (id !== (b.except ?? "")) e.receive(b.data);
    if (effects.close) this.closed.push({ id: from, code: effects.close.code });
  }

  leave(id: string) {
    this.apply(this.room.leave(id), id);
    this.editors.delete(id);
  }
}
