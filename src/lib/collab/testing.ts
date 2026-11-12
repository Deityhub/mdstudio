// A fake network for the browser side of live editing: a socket whose other end is the real room,
// so a test covers the whole conversation and not a mock of it.
import { type Effects, createRoom } from "@/server/collab/room";
import { memoryStore } from "@/server/collab/store";
import { CLOSE } from "../realtime/protocol";
import type { SocketLike } from "./provider";

/** A socket whose other end is a room. `down` makes it refuse to open, as a dead network does. */
export class Wire {
  room = createRoom({ store: memoryStore() });
  sockets: FakeSocket[] = [];
  down = false;
  n = 0;
  constructor(
    private user = "u1",
    private name = "Ada",
  ) {}
  create = (): SocketLike => {
    const s = new FakeSocket(this, `peer${++this.n}`);
    this.sockets.push(s);
    return s;
  };
  deliver(fx: Effects, from?: string) {
    for (const m of fx.send) this.find(m.to)?.toBrowser(m.data);
    for (const b of fx.broadcast)
      for (const s of this.sockets)
        if (s.id !== (b.except ?? from) && s.joined) s.toBrowser(b.data);
    if (fx.close) this.find(from!)?.closeFromServer(fx.close.code);
  }
  find(id: string) {
    return this.sockets.find((s) => s.id === id);
  }
}
export class FakeSocket implements SocketLike {
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  joined = false;
  closed = false;
  texts: string[] = [];
  constructor(
    private wire: Wire,
    readonly id: string,
  ) {
    queueMicrotask(() => {
      if (this.wire.down) return this.closeFromServer(1006);
      this.onopen?.();
      const joined = this.wire.room.join({ id, userId: wire["user"], name: wire["name"] });
      if (!joined.ok) return this.closeFromServer(CLOSE.full);
      this.joined = true;
      this.toBrowser(JSON.stringify({ t: "ready", epoch: this.wire.room.epoch() }));
      this.wire.deliver(joined.effects, id);
    });
  }
  toBrowser(data: string | Uint8Array) {
    this.onmessage?.({ data: typeof data === "string" ? data : data.slice().buffer });
  }
  send(data: string | Uint8Array) {
    if (typeof data === "string") {
      this.texts.push(data);
      if (data === "ping") this.toBrowser("pong");
      return;
    }
    this.wire.deliver(this.wire.room.receive(this.id, data), this.id);
  }
  closeFromServer(code: number) {
    if (this.closed) return;
    this.closed = true;
    if (this.joined) this.wire.deliver(this.wire.room.leave(this.id));
    this.joined = false;
    this.onclose?.({ code });
  }
  close(code = 1000) {
    this.closeFromServer(code);
  }
}
