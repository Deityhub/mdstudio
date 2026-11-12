// @vitest-environment node
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { MSG_SYNC, TEXT_KEY } from "@/lib/collab/protocol";
import { CLOSE } from "@/lib/realtime/protocol";
import { createNodeDb } from "../../../infra/db/node";
import { collabSnapshots, collabUpdates } from "../../../infra/db/schema";
import type { Db } from "../db";
import { type NodeCollabHost, nodeCollab } from "./node-host";
import { step1Frame, updateFrame } from "./testing";

let db: Db;
let host: NodeCollabHost;
const DOC = "o:d1";

beforeEach(() => {
  vi.useFakeTimers();
  db = createNodeDb(":memory:") as unknown as Db;
  host = nodeCollab(db, { fresh: true });
});
afterEach(() => vi.useRealTimers());

const conn = (over: Record<string, unknown> = {}) => ({
  docId: DOC,
  userId: "u1",
  clientId: `tab-${Math.random().toString(36).slice(2, 10)}`,
  name: "Ada",
  avatar: null,
  canWrite: true,
  people: 3,
  expiresAt: Date.now() + 15 * 60_000,
  ...over,
});

/** A browser: a Yjs document that talks to the host's socket hooks like a provider does. */
async function client(over: Record<string, unknown> = {}) {
  const doc = new Y.Doc();
  const text = doc.getText(TEXT_KEY);
  const hooks = host.hooks(conn(over));
  const log = { texts: [] as string[], closed: [] as [number, string][] };
  const peer = {
    send(data: unknown) {
      if (typeof data === "string") return void log.texts.push(data);
      const d = decoding.createDecoder(data as Uint8Array);
      if (decoding.readVarUint(d) !== MSG_SYNC) return;
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, MSG_SYNC);
      syncProtocol.readSyncMessage(d, reply, doc, "server");
      if (encoding.length(reply) > 1) void send(encoding.toUint8Array(reply));
    },
    close(code: number, reason: string) {
      log.closed.push([code, reason]);
    },
  };
  const send = (bytes: Uint8Array) => hooks.message(peer, { uint8Array: () => bytes });
  doc.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== "server") void send(updateFrame(u));
  });
  await hooks.open(peer);
  await send(step1Frame(doc));
  await vi.advanceTimersByTimeAsync(0);
  return { doc, text, hooks, peer, log, send, leave: () => hooks.close(peer) };
}

describe("a room in this process", () => {
  it("is started once from the draft's text, and everyone who joins gets it", async () => {
    await host.ensureSeeded(DOC, async () => "# Notes");
    await host.ensureSeeded(DOC, async () => "something else"); // already set up
    const a = await client();
    const b = await client({ userId: "u2", name: "Bea" });
    expect(a.text.toString()).toBe("# Notes");
    expect(b.text.toString()).toBe("# Notes");
    expect(a.log.texts.some((t) => /^\{"t":"ready","epoch":"[0-9a-f-]{36}"\}$/.test(t))).toBe(true);
  });

  it("carries edits between people, and answers a ping", async () => {
    await host.ensureSeeded(DOC, async () => "Hello");
    const a = await client();
    const b = await client({ userId: "u2" });
    a.text.insert(5, " world");
    await vi.advanceTimersByTimeAsync(0);
    expect(b.text.toString()).toBe("Hello world");
    await a.hooks.message(a.peer, { uint8Array: () => new TextEncoder().encode("ping") });
    expect(a.log.texts).toContain("pong");
    expect(await host.text(DOC)).toBe("Hello world");
  });

  it("keeps the text between visits: written after a few seconds and folded when the last person leaves", async () => {
    await host.ensureSeeded(DOC, async () => "Hello");
    const a = await client();
    a.text.insert(5, "!!");
    await vi.advanceTimersByTimeAsync(6000);
    expect((await db.select().from(collabUpdates)).length).toBeGreaterThan(0);
    await a.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(await db.select().from(collabUpdates)).toEqual([]);
    expect((await db.select().from(collabSnapshots)).length).toBe(1);
    // a new process: the same text, from the database
    const again = nodeCollab(db, { fresh: true });
    expect(await again.text(DOC)).toBe("Hello!!");
  });

  it("says there is no text for a draft that was never set up", async () => {
    expect(await host.text("o:never")).toBeNull();
  });

  it("removes one person's connections, and ends the room for everyone when it is destroyed", async () => {
    await host.ensureSeeded(DOC, async () => "x");
    const a = await client({ userId: "u1" });
    const b = await client({ userId: "u2" });
    await host.kick(DOC, "u2");
    expect(b.log.closed[0]?.[0]).toBe(CLOSE.gone);
    expect(a.log.closed).toEqual([]);
    await host.destroy(DOC);
    expect(a.log.closed[0]?.[0]).toBe(CLOSE.gone);
    expect(await host.text(DOC)).toBeNull();
    expect(await db.select().from(collabSnapshots)).toEqual([]);
  });

  it("ends a connection when its time is up", async () => {
    await host.ensureSeeded(DOC, async () => "x");
    const a = await client({ expiresAt: Date.now() + 60_000 });
    await vi.advanceTimersByTimeAsync(60_001);
    expect(a.log.closed[0]?.[0]).toBe(CLOSE.expired);
  });

  it("turns away the connection beyond what the owner's limit allows", async () => {
    await host.ensureSeeded(DOC, async () => "x");
    const peers = [];
    for (let i = 0; i < 4; i++) peers.push(await client({ people: 1, userId: `u${i}` }));
    const extra = await client({ people: 1, userId: "u9" });
    expect(extra.log.closed[0]?.[0]).toBe(CLOSE.full);
    expect(peers.every((p) => p.log.closed.length === 0)).toBe(true);
  });

  it("keeps delivering to everyone else when one connection's socket throws on send", async () => {
    await host.ensureSeeded(DOC, async () => "Hello");
    const a = await client();
    const b = await client({ userId: "u2", name: "Bea" });
    const c = await client({ userId: "u3", name: "Cy" });
    b.peer.send = () => {
      throw new TypeError("Can't call WebSocket send() after close().");
    };
    a.text.insert(5, " there");
    await vi.advanceTimersByTimeAsync(0);
    expect(c.text.toString()).toBe("Hello there");
  });

  it("closes a connection that sends something that is not a message", async () => {
    await host.ensureSeeded(DOC, async () => "x");
    const a = await client();
    await a.send(new TextEncoder().encode("hello there"));
    expect(a.log.closed[0]?.[0]).toBe(1007);
  });
});
