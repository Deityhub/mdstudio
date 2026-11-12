// The hosted room: what a Durable Object does for one draft. The class in infra/realtime/index.mjs
// is a thin shell around this one, which takes the runtime's pieces as parameters so it is tested
// without workerd. Sockets use the Hibernation API: an idle room is evicted from memory while its
// connections stay open, then rebuilt from storage when a message or the alarm wakes it.
import { CLOSE } from "../../lib/realtime/protocol";
import { type Effects, type Room, createRoom } from "./room";
import type { CollabStore } from "./store";
import { replyCloseCode } from "../realtime/rules";

/** The part of a Workers WebSocket this uses. */
export type DoSocket = {
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
};

/** The part of the Durable Object state this uses. */
export type DoState = {
  acceptWebSocket(ws: DoSocket): void;
  getWebSockets(): DoSocket[];
  blockConcurrencyWhile(work: () => Promise<void>): Promise<void>;
  storage: {
    sql: { exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] } };
    transactionSync<T>(work: () => T): T;
    getAlarm(): Promise<number | null>;
    setAlarm(at: number): Promise<void>;
  };
};

export type Platform = {
  /** A pair of connected sockets, as `new WebSocketPair()` gives. */
  pair(): { client: unknown; server: DoSocket };
  /** The 101 answer that hands the client end of a pair to the browser. */
  upgrade(client: unknown): Response;
};

/** What is remembered for each connection (a socket's attachment, at most 16 KB). */
type Attachment = {
  peerId: string;
  userId: string;
  name: string;
  avatar: string | null;
  canWrite: boolean;
  people: number;
  expiresAt: number;
};

/** The room's view of a connection, from what its socket remembers. */
const peerOf = (att: Attachment) => ({
  id: att.peerId,
  userId: att.userId,
  name: att.name,
  avatar: att.avatar,
  canWrite: att.canWrite,
});

const SNAPSHOT_CHUNK = 1024 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status });

/** A room's state in the Durable Object's own SQLite: a snapshot in chunks of at most 1 MB, and a log. */
export function sqlStore(storage: DoState["storage"]): CollabStore {
  const { sql } = storage;
  sql.exec("CREATE TABLE IF NOT EXISTS snapshot (seq INTEGER PRIMARY KEY, data BLOB NOT NULL)");
  sql.exec(
    "CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB NOT NULL)",
  );
  const bytes = (row: Record<string, unknown>) => new Uint8Array(row["data"] as ArrayBuffer);
  return {
    async load() {
      const chunks = sql.exec("SELECT data FROM snapshot ORDER BY seq").toArray().map(bytes);
      const snapshot = chunks.length
        ? chunks.length === 1
          ? chunks[0]!
          : chunks.reduce((all, c) => {
              const joined = new Uint8Array(all.length + c.length);
              joined.set(all);
              joined.set(c, all.length);
              return joined;
            }, new Uint8Array(0))
        : null;
      const updates = sql.exec("SELECT data FROM updates ORDER BY id").toArray().map(bytes);
      return { snapshot, updates };
    },
    async append(update) {
      sql.exec("INSERT INTO updates (data) VALUES (?)", update);
    },
    async compact(snapshot) {
      storage.transactionSync(() => {
        sql.exec("DELETE FROM snapshot");
        for (let at = 0, seq = 0; at < snapshot.length; at += SNAPSHOT_CHUNK, seq++)
          sql.exec(
            "INSERT INTO snapshot (seq, data) VALUES (?, ?)",
            seq,
            snapshot.slice(at, at + SNAPSHOT_CHUNK),
          );
        sql.exec("DELETE FROM updates");
      });
    },
    async clear() {
      storage.transactionSync(() => {
        sql.exec("DELETE FROM snapshot");
        sql.exec("DELETE FROM updates");
      });
    },
  };
}

export class CollabRoomLogic {
  private readonly room: Room;

  constructor(
    private readonly ctx: DoState,
    private readonly platform: Platform,
    private readonly now: () => number = Date.now,
  ) {
    this.room = createRoom({ store: sqlStore(ctx.storage), now });
    // after a wake the room is rebuilt from storage, and every connection that stayed open asks again
    void ctx.blockConcurrencyWhile(async () => {
      await this.room.open();
      for (const ws of ctx.getWebSockets()) {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (!att) continue;
        if (!this.room.exists()) {
          ws.close(CLOSE.gone, "ended");
          continue;
        }
        const joined = this.room.join(peerOf(att), { maxPeers: att.people * 4 });
        if (!joined.ok) ws.close(CLOSE.full, "full");
        else this.deliver(joined.effects);
      }
    });
  }

  /** The socket of a connection, found by the id its attachment holds. */
  private socketOf(peerId: string) {
    return this.ctx
      .getWebSockets()
      .find((ws) => (ws.deserializeAttachment() as Attachment | null)?.peerId === peerId);
  }

  private deliver(fx: Effects) {
    for (const s of fx.send) this.socketOf(s.to)?.send(s.data);
    if (fx.broadcast.length)
      for (const ws of this.ctx.getWebSockets()) {
        const id = (ws.deserializeAttachment() as Attachment | null)?.peerId;
        if (!id) continue;
        for (const b of fx.broadcast) if (id !== b.except) ws.send(b.data);
      }
  }

  /** Writes what is waiting a few seconds after the first change, with one alarm (no timers: they would keep it awake). */
  private async planWrite() {
    const at = this.room.nextFlushAt();
    if (at === null) return;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || existing > at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    await this.room.flush();
    await this.planWrite();
  }

  private endConnection(ws: DoSocket, att: Attachment, code: number, reason: string) {
    this.deliver(this.room.leave(att.peerId));
    ws.serializeAttachment(null); // so nothing finds it again while it closes
    ws.close(code, reason);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/seed") {
      const { text } = (await request.json()) as { text?: unknown };
      if (typeof text !== "string") return json({ error: "invalid" }, 400);
      const seeded = await this.room.seed(text);
      await this.planWrite();
      return json({ seeded });
    }
    if (request.method === "GET" && url.pathname === "/text")
      return this.room.exists()
        ? json({ text: this.room.text() })
        : json({ error: "no_room" }, 404);
    if (request.method === "POST" && url.pathname === "/destroy") {
      for (const ws of this.ctx.getWebSockets()) {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (att) this.endConnection(ws, att, CLOSE.gone, "ended");
      }
      await this.room.destroy();
      return json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/kick") {
      const { userId } = (await request.json()) as { userId?: unknown };
      for (const ws of this.ctx.getWebSockets()) {
        const att = ws.deserializeAttachment() as Attachment | null;
        if (att && att.userId === userId) this.endConnection(ws, att, CLOSE.gone, "removed");
      }
      await this.room.flush({ compact: this.room.peerCount() === 0 });
      return json({ ok: true });
    }
    if (request.headers.get("upgrade") !== "websocket")
      return new Response("expected a WebSocket", { status: 426 });
    return this.connect(request);
  }

  private async connect(request: Request): Promise<Response> {
    const h = (name: string) => request.headers.get(name);
    const userId = h("x-rt-user");
    const clientId = h("x-rt-client");
    const expiresAt = Number(h("x-rt-expires"));
    const people = Number(h("x-rt-people"));
    if (!userId || !clientId || !Number.isFinite(expiresAt) || !Number.isInteger(people)) {
      // only the app Worker reaches this object, so this is a bug there
      console.error("collab room: an upgrade arrived without who is asking");
      return new Response("missing details", { status: 400 });
    }
    // never set up (or forgotten): the app starts it from the draft's text and asks again
    if (!this.room.exists()) return new Response("needs a seed", { status: 409 });
    const att: Attachment = {
      peerId: `${clientId}.${crypto.randomUUID().slice(0, 8)}`,
      userId,
      name: decodeURIComponent(h("x-rt-name") ?? "") || "Someone",
      avatar: decodeURIComponent(h("x-rt-avatar") ?? "") || null,
      canWrite: h("x-rt-write") !== "0",
      people,
      expiresAt,
    };
    const { client, server } = this.platform.pair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(att);
    const joined = this.room.join(peerOf(att), { maxPeers: people * 4 });
    if (!joined.ok) {
      // said through the socket, as the other hubs do, so the browser can tell "full" from a failure
      server.serializeAttachment(null);
      server.close(CLOSE.full, "full");
    } else {
      server.send(JSON.stringify({ t: "ready" }));
      this.deliver(joined.effects);
    }
    return this.platform.upgrade(client);
  }

  async webSocketMessage(ws: DoSocket, message: string | ArrayBuffer) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    // a keep-alive is answered by the runtime; any other text is not ours to read
    if (typeof message === "string") return void ws.close(CLOSE.badMessage, "bad message");
    if (att.expiresAt <= this.now()) return this.endConnection(ws, att, CLOSE.expired, "expired");
    const fx = this.room.receive(att.peerId, new Uint8Array(message));
    this.deliver(fx);
    if (fx.close) this.endConnection(ws, att, fx.close.code, fx.close.reason);
    if (fx.reload) this.deliver(await this.room.reload());
    await this.planWrite();
  }

  async webSocketClose(ws: DoSocket, code: number) {
    const att = ws.deserializeAttachment() as Attachment | null;
    // without this the close handshake is never finished
    try {
      ws.close(replyCloseCode(code));
    } catch {
      // already closed
    }
    if (!att) return;
    this.deliver(this.room.leave(att.peerId));
    // the last person left: write it all down, folded, so an idle room costs nothing to wake
    if (this.room.peerCount() === 0) await this.room.flush({ compact: true });
  }

  webSocketError(ws: DoSocket) {
    return this.webSocketClose(ws, 1011);
  }
}
