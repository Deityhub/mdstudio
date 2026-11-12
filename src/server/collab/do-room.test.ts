// @vitest-environment node
import Database from "better-sqlite3";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { MSG_SYNC, TEXT_KEY } from "@/lib/collab/protocol";
import { CLOSE } from "@/lib/realtime/protocol";
import { CollabRoomLogic, type DoSocket, type DoState, sqlStore } from "./do-room";
import { step1Frame, updateFrame } from "./testing";

/** What workerd does to a socket, as far as these tests need: it refuses close codes that may not be sent. */
class FakeSocket implements DoSocket {
  sent: (string | Uint8Array)[] = [];
  closed: { code: number; reason?: string } | null = null;
  private attachment: unknown = null;
  send(data: string | ArrayBuffer | Uint8Array) {
    this.sent.push(typeof data === "string" ? data : new Uint8Array(data as ArrayBuffer));
  }
  close(code: number, reason?: string) {
    if ([1004, 1005, 1006, 1015].includes(code))
      throw new Error(`Invalid WebSocket close code: ${code}.`);
    this.closed = { code, ...(reason ? { reason } : {}) };
  }
  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return this.attachment;
  }
}

function world() {
  const sqlite = new Database(":memory:");
  const sockets: FakeSocket[] = [];
  let alarm: number | null = null;
  const pending: Promise<void>[] = [];
  const ctx: DoState = {
    acceptWebSocket: (ws) => void sockets.push(ws as FakeSocket),
    getWebSockets: () => sockets.filter((s) => !s.closed),
    blockConcurrencyWhile: (work) => {
      const p = work();
      pending.push(p);
      return p;
    },
    storage: {
      sql: {
        exec(query, ...bindings) {
          const stmt = sqlite.prepare(query);
          const args = bindings.map((b) => (b instanceof Uint8Array ? Buffer.from(b) : b));
          if (!stmt.reader) {
            stmt.run(...args);
            return { toArray: () => [] };
          }
          const rows = stmt.all(...args) as Record<string, unknown>[];
          return {
            toArray: () =>
              rows.map((r) =>
                r["data"] instanceof Buffer ? { ...r, data: new Uint8Array(r["data"]).buffer } : r,
              ),
          };
        },
      },
      transactionSync: (work) => sqlite.transaction(work)(),
      getAlarm: async () => alarm,
      setAlarm: async (at) => void (alarm = at),
    },
  };
  const platform = {
    pair: () => ({ client: {}, server: new FakeSocket() }),
    upgrade: (client: unknown) => Object.assign(new Response(null), { webSocket: client }),
  };
  let now = 1_700_000_000_000;
  const make = async () => {
    const logic = new CollabRoomLogic(ctx, platform, () => now);
    await Promise.all(pending.splice(0));
    return logic;
  };
  return {
    sqlite,
    sockets,
    ctx,
    make,
    alarm: () => alarm,
    clock: {
      get now() {
        return now;
      },
      set now(v: number) {
        now = v;
      },
    },
  };
}

const upgrade = (over: Record<string, string> = {}) =>
  new Request("https://room/", {
    headers: {
      upgrade: "websocket",
      "x-rt-user": "u1",
      "x-rt-client": "tab-abcdefgh",
      "x-rt-expires": String(1_700_000_000_000 + 15 * 60_000),
      "x-rt-people": "3",
      "x-rt-name": "Ada",
      ...over,
    },
  });
const post = (path: string, body: unknown = {}) =>
  new Request(`https://room${path}`, { method: "POST", body: JSON.stringify(body) });

/** A browser on one socket: a Yjs document answering what the room sends. */
async function open(
  which: CollabRoomLogic | (() => CollabRoomLogic),
  w: ReturnType<typeof world>,
  over: Record<string, string> = {},
) {
  const logic = () => (typeof which === "function" ? which() : which);
  const before = w.sockets.length;
  const res = await logic().fetch(upgrade(over));
  const socket = w.sockets[before]!;
  const doc = new Y.Doc();
  const text = doc.getText(TEXT_KEY);
  let read = 0;
  const pump = async () => {
    // reads what the room sent and answers it, until nothing is left to answer
    while (read < socket.sent.length) {
      const data = socket.sent[read++]!;
      if (typeof data === "string") continue;
      const d = decoding.createDecoder(data);
      if (decoding.readVarUint(d) !== MSG_SYNC) continue;
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, MSG_SYNC);
      syncProtocol.readSyncMessage(d, reply, doc, "server");
      if (encoding.length(reply) > 1)
        await logic().webSocketMessage(socket, toBuffer(encoding.toUint8Array(reply)));
    }
  };
  const toBuffer = (u: Uint8Array) =>
    u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  doc.on("update", async (u: Uint8Array, origin: unknown) => {
    if (origin !== "server") await logic().webSocketMessage(socket, toBuffer(updateFrame(u)));
  });
  const hello = async () => {
    await logic().webSocketMessage(socket, toBuffer(step1Frame(doc)));
    await pump();
  };
  return { res, socket, doc, text, pump, hello };
}

let w: ReturnType<typeof world>;
beforeEach(() => void (w = world()));

describe("a room in a Durable Object", () => {
  it("needs the draft's text first: an upgrade before that is refused for the app to seed and retry", async () => {
    const logic = await w.make();
    expect((await logic.fetch(upgrade())).status).toBe(409);
    expect(w.sockets).toHaveLength(0);
    expect(await (await logic.fetch(post("/seed", { text: "# Notes" }))).json()).toEqual({
      seeded: true,
    });
    expect(await (await logic.fetch(post("/seed", { text: "other" }))).json()).toEqual({
      seeded: false,
    });
    const text = await (await logic.fetch(new Request("https://room/text"))).json();
    expect(text).toEqual({ text: "# Notes" });
  });

  it("sends a connection ready, then the room's text through the sync handshake", async () => {
    const logic = await w.make();
    await logic.fetch(post("/seed", { text: "# Notes" }));
    const a = await open(logic, w);
    expect(a.socket.sent[0]).toBe('{"t":"ready"}');
    await a.hello();
    expect(a.text.toString()).toBe("# Notes");
  });

  it("carries edits between people and writes them down after a few seconds, by an alarm", async () => {
    const logic = await w.make();
    await logic.fetch(post("/seed", { text: "Hello" }));
    const a = await open(logic, w);
    const b = await open(logic, w, { "x-rt-user": "u2", "x-rt-client": "tab-bbbbbbbb" });
    await a.hello();
    await b.hello();
    a.text.insert(5, " there");
    await new Promise((r) => setTimeout(r, 0));
    await b.pump();
    expect(b.text.toString()).toBe("Hello there");
    expect(w.alarm()).toBe(w.clock.now + 5000);
    const rows = () =>
      (w.sqlite.prepare("SELECT COUNT(*) AS n FROM updates").get() as { n: number }).n;
    const before = rows();
    await logic.alarm();
    expect(rows()).toBe(before + 1);
    expect(await (await logic.fetch(new Request("https://room/text"))).json()).toEqual({
      text: "Hello there",
    });
  });

  it("wakes from hibernation with the same text: connections stay, the room is rebuilt from storage, and they ask again", async () => {
    const logic = await w.make();
    let current = logic;
    await logic.fetch(post("/seed", { text: "Hello" }));
    const a = await open(() => current, w);
    const b = await open(() => current, w, { "x-rt-user": "u2", "x-rt-client": "tab-bbbbbbbb" });
    await a.hello();
    await b.hello();
    a.text.insert(5, "!");
    await new Promise((r) => setTimeout(r, 0));
    await logic.alarm();

    const woken = await w.make(); // a new object over the same sockets and storage
    current = woken;
    await a.pump();
    await b.pump();
    b.text.insert(0, ">");
    await new Promise((r) => setTimeout(r, 0));
    await a.pump();
    expect(a.text.toString()).toBe(">Hello!");
    expect(await (await woken.fetch(new Request("https://room/text"))).json()).toEqual({
      text: ">Hello!",
    });
  });

  it("folds everything into a snapshot when the last person leaves", async () => {
    const logic = await w.make();
    await logic.fetch(post("/seed", { text: "Hello" }));
    const a = await open(logic, w);
    await a.hello();
    a.text.insert(5, "!!");
    await new Promise((r) => setTimeout(r, 0));
    await logic.webSocketClose(a.socket, 1006); // an abrupt drop: a code that may not be sent back
    const n = (t: string) =>
      (w.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    expect(n("updates")).toBe(0);
    expect(n("snapshot")).toBeGreaterThan(0);
  });

  it("removes one person's connections, and forgets the room when destroyed", async () => {
    const logic = await w.make();
    await logic.fetch(post("/seed", { text: "x" }));
    const a = await open(logic, w);
    const b = await open(logic, w, { "x-rt-user": "u2", "x-rt-client": "tab-bbbbbbbb" });
    await logic.fetch(post("/kick", { userId: "u2" }));
    expect(b.socket.closed?.code).toBe(CLOSE.gone);
    expect(a.socket.closed).toBeNull();
    await logic.fetch(post("/destroy"));
    expect(a.socket.closed?.code).toBe(CLOSE.gone);
    expect((await logic.fetch(new Request("https://room/text"))).status).toBe(404);
    expect(await (await logic.fetch(post("/seed", { text: "again" }))).json()).toEqual({
      seeded: true,
    });
  });

  it("ends a connection whose time is up, and refuses text it did not ask for", async () => {
    const logic = await w.make();
    await logic.fetch(post("/seed", { text: "x" }));
    const a = await open(logic, w);
    await logic.webSocketMessage(a.socket, "hello");
    expect(a.socket.closed?.code).toBe(CLOSE.badMessage);
    const b = await open(logic, w, { "x-rt-client": "tab-cccccccc" });
    w.clock.now += 16 * 60_000;
    await logic.webSocketMessage(b.socket, new Uint8Array([0, 0]).buffer);
    expect(b.socket.closed?.code).toBe(CLOSE.expired);
  });

  it("turns away what the owner's limit does not allow, and a request that does not say who it is", async () => {
    const logic = await w.make();
    await logic.fetch(post("/seed", { text: "x" }));
    for (let i = 0; i < 4; i++)
      await open(logic, w, {
        "x-rt-people": "1",
        "x-rt-user": `u${i}`,
        "x-rt-client": `tab-${i}${i}${i}${i}${i}${i}${i}${i}`,
      });
    const extra = await open(logic, w, { "x-rt-people": "1", "x-rt-user": "u9" });
    expect(extra.socket.closed?.code).toBe(CLOSE.full);
    expect((await logic.fetch(upgrade({ "x-rt-user": "" }))).status).toBe(400);
    expect((await logic.fetch(new Request("https://room/"))).status).toBe(426);
  });
});

describe("the room's storage", () => {
  it("keeps a snapshot bigger than a megabyte in chunks and reads it back whole", async () => {
    const sqlite = new Database(":memory:");
    const w2 = world();
    const store = sqlStore(w2.ctx.storage);
    const big = new Uint8Array(Buffer.alloc(2_600_000, 7));
    await store.append(new Uint8Array([1, 2, 3]));
    await store.compact(big);
    const loaded = await store.load();
    expect(loaded.updates).toEqual([]);
    expect(Buffer.from(loaded.snapshot!).equals(Buffer.from(big))).toBe(true);
    const chunks = (w2.sqlite.prepare("SELECT COUNT(*) AS n FROM snapshot").get() as { n: number })
      .n;
    expect(chunks).toBe(3);
    sqlite.close();
  });
});
