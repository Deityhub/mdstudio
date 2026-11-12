// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  COMPACT_AFTER_UPDATES,
  FLUSH_AFTER_MS,
  MAX_AWARENESS_BYTES,
  MAX_FRAME_BYTES,
  MSG_SYNC,
  ROOM_CLOSE,
  TEXT_KEY,
  colorFor,
} from "@/lib/collab/protocol";
import { createRoom, type Room } from "./room";
import { type CollabStore, memoryStore } from "./store";
import { Network, awarenessFrame, frame, readAwareness, step1Frame, updateFrame } from "./testing";

let now: number;
let store: ReturnType<typeof memoryStore>;
let room: Room;
const make = (over: Partial<Parameters<typeof createRoom>[0]> = {}) =>
  createRoom({ store: store as CollabStore, now: () => now, ...over });

beforeEach(async () => {
  now = 1_700_000_000_000;
  store = memoryStore();
  room = make();
  await room.open();
});

const seeded = async (text = "# Notes\n\nStart") => {
  await room.seed(text);
  return new Network(room);
};
const states = (data: Uint8Array) => readAwareness(data);

describe("seeding", () => {
  it("is done once, from the plain text, and every editor then starts from it", async () => {
    expect(room.exists()).toBe(false);
    expect(await room.seed("# Notes\n\nStart")).toBe(true);
    expect(await room.seed("something else")).toBe(false);
    expect(room.text()).toBe("# Notes\n\nStart");
    const net = new Network(room);
    const a = await net.add("a");
    const b = await net.add("b");
    expect(a.text.toString()).toBe("# Notes\n\nStart");
    expect(b.text.toString()).toBe("# Notes\n\nStart");
  });

  it("counts an empty draft as seeded, so it is not seeded again from stale text", async () => {
    expect(await room.seed("")).toBe(true);
    expect(room.exists()).toBe(true);
    expect(await room.seed("late text")).toBe(false);
    expect(room.text()).toBe("");
  });

  it("names each start of a room, so a device holding an older room's state can tell", async () => {
    expect(room.epoch()).toBeNull();
    await room.seed("one");
    const first = room.epoch();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    await room.destroy();
    await room.seed("one");
    expect(room.epoch()).not.toBe(first);
    // it survives a restart from storage
    const again = createRoom({ store, now: () => now });
    await again.open();
    expect(again.epoch()).toBe(room.epoch());
  });

  it("is forgotten by destroy", async () => {
    await room.seed("x");
    await room.destroy();
    expect(room.exists()).toBe(false);
    expect(store.stored).toEqual({ snapshot: null, updates: [] });
  });
});

describe("editing together", () => {
  it("passes one person's edit to the others, and not back to them", async () => {
    const net = await seeded("Hello");
    const a = await net.add("a");
    const b = await net.add("b");
    a.insert(5, " world");
    expect(b.text.toString()).toBe("Hello world");
    expect(room.text()).toBe("Hello world");
    b.insert(0, ">> ");
    expect(a.text.toString()).toBe(">> Hello world");
  });

  it("lets two people type in the same place at once without losing either", async () => {
    const net = await seeded("");
    const a = await net.add("a");
    const b = await net.add("b");
    a.goOffline();
    b.goOffline();
    a.insert(0, "from A. ");
    b.insert(0, "from B. ");
    a.goOnline();
    b.goOnline();
    expect(a.text.toString()).toBe(b.text.toString());
    expect(room.text()).toBe(a.text.toString());
    expect(room.text()).toContain("from A. ");
    expect(room.text()).toContain("from B. ");
  });

  it("merges what a person wrote offline when they come back", async () => {
    const net = await seeded("one\ntwo\nthree");
    const a = await net.add("a");
    const b = await net.add("b");
    b.goOffline();
    a.insert(0, "A: ");
    b.insert(b.text.length, "\nB wrote this offline");
    b.delete(0, 3); // "one" is gone for B
    expect(room.text()).toBe("A: one\ntwo\nthree");
    b.goOnline();
    expect(a.text.toString()).toBe(b.text.toString());
    expect(room.text()).toBe(a.text.toString());
    expect(room.text()).toContain("B wrote this offline");
    expect(room.text()).toContain("A: ");
  });

  it("lets a person who joins late get everything", async () => {
    const net = await seeded("Hello");
    const a = await net.add("a");
    a.insert(5, "!!!");
    const late = await net.add("late");
    expect(late.text.toString()).toBe("Hello!!!");
  });

  it("brings a reconnecting person up to date with only what they missed", async () => {
    const net = await seeded("Hello");
    const a = await net.add("a");
    const b = await net.add("b");
    b.goOffline();
    a.insert(5, " there");
    a.insert(11, "!");
    expect(b.text.toString()).toBe("Hello");
    b.goOnline();
    expect(b.text.toString()).toBe("Hello there!");
  });

  it("ignores edits from someone who may only read, who still sees everyone else's", async () => {
    const net = await seeded("Hello");
    const writer = await net.add("w");
    const reader = await net.add("r", { canWrite: false });
    reader.insert(5, " (vandal)");
    expect(room.text()).toBe("Hello");
    expect(writer.text.toString()).toBe("Hello");
    writer.insert(5, " world");
    expect(reader.text.toString()).toContain("world");
  });
});

describe("presence", () => {
  const cursor = { anchor: { type: null, tname: null, item: null }, head: null };

  it("shows each person's cursor to the others, with the name the server knows, not the one claimed", async () => {
    const net = await seeded("x");
    const a = await net.add("a", { userId: "user-a", name: "Ada" });
    const b = await net.add("b", { userId: "user-b", name: "Bea" });
    let seen: [number, number, unknown][] = [];
    const receive = b.receive.bind(b);
    b.receive = (data) => {
      if (data[0] === 1) seen = states(data);
      receive(data);
    };
    net.toRoom(
      a,
      awarenessFrame(a.doc.clientID, 1, { user: { name: "Admin", color: "#000" }, cursor }),
    );
    expect(seen).toHaveLength(1);
    const state = seen[0]![2] as { user: { name: string; color: string }; cursor: unknown };
    expect(state.user.name).toBe("Ada");
    expect(state.user.color).toBe(colorFor("user-a"));
    expect(state.cursor).toEqual(cursor);
  });

  it("does not send it back to the sender, and tells a person who joins later", async () => {
    const net = await seeded("x");
    const a = await net.add("a", { name: "Ada" });
    const result = net.room.receive("a", awarenessFrame(a.doc.clientID, 1, { user: {}, cursor }));
    expect(result.broadcast[0]?.except).toBe("a");
    const joined = net.room.join({ id: "late", userId: "late", name: "Late" });
    if (!joined.ok) throw new Error("refused");
    const awareness = joined.effects.send.map((s) => s.data).filter((d) => d[0] === 1);
    expect(awareness).toHaveLength(1);
    expect(states(awareness[0]!)[0]![0]).toBe(a.doc.clientID);
  });

  it("drops a person's cursor for everyone when they leave", async () => {
    const net = await seeded("x");
    const a = await net.add("a");
    net.room.receive("a", awarenessFrame(a.doc.clientID, 1, { user: {}, cursor }));
    const left = net.room.leave("a");
    const entries = states(left.broadcast[0]!.data);
    expect(entries).toEqual([[a.doc.clientID, 2, null]]);
  });

  it("keeps only a cursor and the person's identity, and refuses what is too big", async () => {
    const net = await seeded("x");
    const a = await net.add("a", { name: "Ada" });
    const big = awarenessFrame(a.doc.clientID, 1, {
      cursor,
      junk: "x".repeat(MAX_AWARENESS_BYTES),
    });
    const result = net.room.receive("a", big);
    expect(result.close?.code).toBe(ROOM_CLOSE.tooBig);
    const ok = net.room.receive(
      "a",
      awarenessFrame(a.doc.clientID, 2, { cursor, junk: "small", user: { name: "x" } }),
    );
    const state = states(ok.broadcast[0]!.data)[0]![2] as Record<string, unknown>;
    expect(Object.keys(state).sort()).toEqual(["cursor", "user"]);
  });

  it("will not let a person speak for someone else's cursor, or for more than three of their own", async () => {
    const net = await seeded("x");
    const a = await net.add("a");
    const b = await net.add("b");
    net.room.receive("b", awarenessFrame(b.doc.clientID, 1, { cursor })); // b has spoken for its own
    const stolen = net.room.receive("a", awarenessFrame(b.doc.clientID, 5, { cursor }));
    expect(stolen.broadcast).toEqual([]);
    for (const id of [101, 102, 103])
      expect(net.room.receive("a", awarenessFrame(id, 1, { cursor })).broadcast).toHaveLength(1);
    expect(net.room.receive("a", awarenessFrame(104, 1, { cursor })).broadcast).toEqual([]);
    expect(a.doc.clientID).not.toBe(b.doc.clientID);
  });

  it("ignores a stale cursor update that arrives after a newer one", async () => {
    const net = await seeded("x");
    const a = await net.add("a");
    net.room.receive("a", awarenessFrame(a.doc.clientID, 5, { cursor }));
    expect(net.room.receive("a", awarenessFrame(a.doc.clientID, 4, { cursor })).broadcast).toEqual(
      [],
    );
  });
});

describe("limits", () => {
  it("refuses a connection beyond the room's size, or a third from the same person", async () => {
    room = make({ maxPeers: 3, maxPerUser: 2 });
    await room.open();
    for (const id of ["a1", "a2"])
      expect(room.join({ id, userId: "ada", name: "Ada" }).ok).toBe(true);
    expect(room.join({ id: "a3", userId: "ada", name: "Ada" })).toEqual({
      ok: false,
      reason: "full",
    });
    expect(room.join({ id: "b1", userId: "bea", name: "Bea" }).ok).toBe(true);
    expect(room.join({ id: "c1", userId: "cy", name: "Cy" })).toEqual({
      ok: false,
      reason: "full",
    });
    room.leave("a1");
    expect(room.join({ id: "c1", userId: "cy", name: "Cy" }).ok).toBe(true);
  });

  it("closes a connection that sends a frame that is too big", async () => {
    const net = await seeded("x");
    await net.add("a");
    const result = net.room.receive("a", new Uint8Array(MAX_FRAME_BYTES + 1));
    expect(result.close?.code).toBe(ROOM_CLOSE.tooBig);
  });

  it("closes a connection that sends too fast, and lets it start again a second later", async () => {
    const net = await seeded("x");
    const a = await net.add("a");
    let closed: number | undefined;
    for (let i = 0; i < 40 && closed === undefined; i++)
      closed = net.room.receive("a", step1Frame(a.doc)).close?.code;
    expect(closed).toBe(ROOM_CLOSE.policy);
    now += 1000;
    expect(net.room.receive("a", step1Frame(a.doc)).close).toBeUndefined();
  });

  it("stops taking updates once the room is full of text", async () => {
    const net = await seeded("");
    const a = await net.add("a");
    const chunk = () =>
      Array.from({ length: 200_000 }, () =>
        String.fromCharCode(97 + Math.floor(Math.random() * 26)),
      ).join("");
    let closed: number | undefined;
    for (let i = 0; i < 30 && closed === undefined; i++) {
      now += 2000; // stay under the rate limit
      const doc = a.doc;
      const before = Y.encodeStateVector(doc);
      doc.getText(TEXT_KEY).insert(0, chunk());
      const update = Y.encodeStateAsUpdate(doc, before);
      closed = net.room.receive("a", updateFrame(update)).close?.code;
    }
    expect(closed).toBe(ROOM_CLOSE.tooBig);
  });

  it("stops holding updates that wait for something that never comes", async () => {
    const net = await seeded("x");
    await net.add("a");
    const doc = new Y.Doc();
    const ytext = doc.getText(TEXT_KEY);
    ytext.insert(0, "never sent");
    let closed: number | undefined;
    for (let i = 0; i < 6 && closed === undefined; i++) {
      now += 2000;
      const before = Y.encodeStateVector(doc);
      ytext.insert(ytext.length, "y".repeat(200_000)); // each depends on the one before, which was never sent
      closed = room.receive("a", updateFrame(Y.encodeStateAsUpdate(doc, before))).close?.code;
    }
    expect(closed).toBe(ROOM_CLOSE.malformed);
    expect(room.text()).toBe("x");
  });

  it("asks everyone to start over after a reload", async () => {
    const net = await seeded("Hello");
    await net.add("a");
    await net.add("b");
    const fx = await room.reload();
    expect(fx.send.map((s) => s.to).sort()).toEqual(["a", "b"]);
    expect(fx.send[0]!.data[0]).toBe(MSG_SYNC);
  });

  it("survives garbage: closes the sender, keeps the text, and can reload from storage", async () => {
    const net = await seeded("Keep me");
    const a = await net.add("a");
    a.insert(7, " and this");
    for (const garbage of [
      new Uint8Array([MSG_SYNC, 2, 255, 255, 255, 255]),
      new Uint8Array([MSG_SYNC, 9, 1, 2, 3]),
      new Uint8Array([7, 1, 2, 3]),
      new Uint8Array([MSG_SYNC]),
    ]) {
      const result = room.receive("a", garbage);
      expect(result.close?.code, String(garbage)).toBe(ROOM_CLOSE.malformed);
    }
    expect(room.text()).toBe("Keep me and this");
    await room.reload(); // unflushed edits are kept: reload writes them first
    expect(room.text()).toBe("Keep me and this");
    a.insert(0, "-");
    expect(room.text()).toBe("-Keep me and this");
  });
});

describe("keeping it", () => {
  it("writes edits as one row after a few seconds, not one per keystroke", async () => {
    const net = await seeded("x");
    const a = await net.add("a");
    await room.flush();
    const rows = store.stored.updates.length;
    expect(room.nextFlushAt()).toBeNull();
    a.insert(1, "a");
    a.insert(2, "b");
    a.insert(3, "c");
    expect(room.dirty()).toBe(true);
    expect(room.nextFlushAt()).toBe(now + FLUSH_AFTER_MS);
    await room.flush();
    expect(store.stored.updates.length).toBe(rows + 1);
    expect(room.dirty()).toBe(false);
    expect(room.nextFlushAt()).toBeNull();
  });

  it("comes back from storage with the same text, and a new editor can join it", async () => {
    const net = await seeded("Hello");
    const a = await net.add("a");
    a.insert(5, " world");
    await room.flush();
    const again = make();
    await again.open();
    expect(again.text()).toBe("Hello world");
    expect(again.exists()).toBe(true);
    const net2 = new Network(again);
    const b = await net2.add("b");
    expect(b.text.toString()).toBe("Hello world");
  });

  it("folds the log into a snapshot after enough writes, and loses nothing", async () => {
    const net = await seeded("");
    const a = await net.add("a");
    for (let i = 0; i < COMPACT_AFTER_UPDATES + 5; i++) {
      now += 100; // typing, not a flood
      a.insert(a.text.length, `line ${i}\n`);
      await room.flush();
    }
    expect(store.stored.snapshot).not.toBeNull();
    expect(store.stored.updates.length).toBeLessThan(COMPACT_AFTER_UPDATES);
    const again = make();
    await again.open();
    expect(again.text()).toBe(room.text());
  });

  it("can be folded on request, as when the last person leaves", async () => {
    const net = await seeded("Hello");
    const a = await net.add("a");
    a.insert(5, "!");
    await room.flush({ compact: true });
    expect(store.stored.updates).toEqual([]);
    const again = make();
    await again.open();
    expect(again.text()).toBe("Hello!");
  });
});
