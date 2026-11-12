// The provider against the real room: a fake socket carries its frames to `createRoom` and the
// room's answers back, so what is tested is the whole conversation, not a mock of it.
import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE } from "../realtime/protocol";
import { TEXT_KEY } from "./protocol";
import { BATCH_MS, RESYNC_MS, type Peer, type Status, createProvider } from "./provider";
import { Wire } from "./testing";

vi.stubGlobal("location", { protocol: "http:", host: "localhost" });

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function browser(wire: Wire, opts: { doc?: Y.Doc; epoch?: string | null } = {}) {
  const doc = opts.doc ?? new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const log = {
    statuses: [] as Status[],
    synced: [] as (string | null)[],
    stale: 0,
    peers: [] as Peer[][],
  };
  const provider = createProvider({
    topic: "doc:owner:d1",
    doc,
    awareness,
    epoch: opts.epoch ?? null,
    createSocket: wire.create,
    onStatus: (s) => log.statuses.push(s),
    onSynced: (e) => log.synced.push(e),
    onStale: () => log.stale++,
    onPeers: (p) => log.peers.push(p),
  });
  return { doc, text: doc.getText(TEXT_KEY), awareness, provider, log };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createProvider", () => {
  it("joins a seeded room and receives its text, then reports it synced with the room's name", async () => {
    const wire = new Wire();
    await wire.room.seed("# Notes\n\nStart");
    const a = browser(wire);
    a.provider.start();
    await flush();
    expect(a.text.toString()).toBe("# Notes\n\nStart");
    expect(a.log.statuses).toEqual(["connecting", "live"]);
    expect(a.log.synced).toEqual([wire.room.epoch()]);
  });

  it("sends edits in one batch after a short wait, and the room and others get them", async () => {
    const wire = new Wire();
    await wire.room.seed("Hello");
    const a = browser(wire);
    const b = browser(wire);
    a.provider.start();
    b.provider.start();
    await flush();
    const frames = vi.spyOn(wire.room, "receive");
    a.text.insert(5, " there");
    a.text.insert(11, "!");
    a.text.insert(0, ">");
    expect(frames).not.toHaveBeenCalled(); // still waiting for company
    await tick(BATCH_MS + 1);
    expect(frames).toHaveBeenCalledTimes(1);
    expect(wire.room.text()).toBe(">Hello there!");
    expect(b.text.toString()).toBe(">Hello there!");
  });

  it("catches up on a frame the room's connection never delivered, by asking again", async () => {
    const wire = new Wire();
    await wire.room.seed("Hello");
    const a = browser(wire);
    const b = browser(wire);
    a.provider.start();
    b.provider.start();
    await flush();
    wire.sockets[1]!.deaf = true; // what the room sends to b is lost
    a.text.insert(5, " there");
    await tick(BATCH_MS + 1);
    expect(b.text.toString()).toBe("Hello"); // b is quietly behind
    wire.sockets[1]!.deaf = false;
    await tick(RESYNC_MS + 100);
    expect(b.text.toString()).toBe("Hello there");
  });

  it("is back within seconds after the room asked it to slow down, not a minute", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    const a = browser(wire);
    a.provider.start();
    await flush();
    wire.sockets[0]!.closeFromServer(1008);
    await tick(9000);
    expect(a.provider.status).toBe("live");
  });

  it("sends even a steady stream of edits within the longest wait", async () => {
    const wire = new Wire();
    await wire.room.seed("");
    const a = browser(wire);
    a.provider.start();
    await flush();
    for (let i = 0; i < 10; i++) {
      a.text.insert(a.text.length, "x");
      await tick(30); // never quiet for the batch wait
    }
    expect(wire.room.text().length).toBeGreaterThanOrEqual(5);
  });

  it("keeps edits made offline and merges them with the room's changes when it returns", async () => {
    const wire = new Wire();
    await wire.room.seed("one two three");
    const a = browser(wire);
    const b = browser(wire);
    a.provider.start();
    b.provider.start();
    await flush();
    wire.down = true;
    for (const s of wire.sockets) s.closeFromServer(1006);
    await flush();
    expect(a.log.statuses.at(-1)).toBe("offline");
    a.text.insert(0, "A: "); // offline
    b.text.insert(b.text.length, " B"); // also offline
    wire.down = false;
    await tick(70_000);
    expect(a.text.toString()).toBe(b.text.toString());
    expect(a.text.toString()).toBe(wire.room.text());
    expect(a.text.toString()).toContain("A: one two three");
    expect(a.text.toString()).toContain(" B");
  });

  it("shows the other people's names and drops them when they go", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    const a = browser(wire);
    const b = browser(wire);
    a.provider.start();
    b.provider.start();
    await flush();
    await tick(300);
    expect(a.log.peers.at(-1)).toEqual([
      expect.objectContaining({ name: "Ada", id: b.doc.clientID }),
    ]);
    b.provider.stop();
    await flush();
    expect(a.log.peers.at(-1)).toEqual([]);
  });

  it("clears the others' cursors when its own connection drops", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    const a = browser(wire);
    const b = browser(wire);
    a.provider.start();
    b.provider.start();
    await flush();
    await tick(300);
    wire.down = true;
    wire.sockets[0]!.closeFromServer(1006);
    await flush();
    expect(a.log.peers.at(-1)).toEqual([]);
  });

  it("stops for good when the draft is no longer shared with this person", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    const a = browser(wire);
    a.provider.start();
    await flush();
    wire.sockets[0]!.closeFromServer(CLOSE.gone);
    await tick(120_000);
    expect(a.provider.status).toBe("ended");
    expect(wire.sockets).toHaveLength(1);
  });

  it("retries with a growing wait, and at once when nudged", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    wire.down = true;
    const a = browser(wire);
    a.provider.start();
    await flush();
    await tick(1100);
    await tick(2200);
    expect(wire.sockets.length).toBeGreaterThanOrEqual(3);
    const before = wire.sockets.length;
    wire.down = false;
    a.provider.nudge();
    await flush();
    expect(wire.sockets.length).toBe(before + 1);
    expect(a.provider.status).toBe("live");
  });

  it("refuses to merge state from an earlier room into a new one, and sends nothing", async () => {
    const wire = new Wire();
    await wire.room.seed("new room");
    const old = new Y.Doc();
    old.getText(TEXT_KEY).insert(0, "old room");
    const a = browser(wire, { doc: old, epoch: "an-older-room" });
    a.provider.start();
    await flush();
    expect(a.log.stale).toBe(1);
    expect(wire.room.text()).toBe("new room");
    expect(a.log.synced).toEqual([]);
    await tick(120_000);
    expect(wire.sockets).toHaveLength(1);
  });

  it("accepts state from the same room", async () => {
    const wire = new Wire();
    await wire.room.seed("seed");
    const first = browser(wire);
    first.provider.start();
    await flush();
    first.provider.stop();
    const kept = new Y.Doc();
    Y.applyUpdate(kept, Y.encodeStateAsUpdate(first.doc));
    kept.getText(TEXT_KEY).insert(4, " + offline");
    const again = browser(wire, { doc: kept, epoch: wire.room.epoch() });
    again.provider.start();
    await flush();
    await tick(BATCH_MS + 1);
    expect(again.log.stale).toBe(0);
    expect(wire.room.text()).toBe("seed + offline");
  });

  it("pings, and treats silence as a dead connection", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    const a = browser(wire);
    a.provider.start();
    await flush();
    await tick(25_100);
    expect(wire.sockets[0]!.texts).toContain("ping");
    // the next ping gets no answer
    wire.sockets[0]!.send = () => undefined;
    await tick(25_000 + 10_100);
    expect(a.log.statuses).toContain("offline");
    expect(wire.sockets.length).toBe(2); // and it came back by itself
  });

  it("sends nothing more after it is stopped", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    const a = browser(wire);
    a.provider.start();
    await flush();
    a.provider.stop();
    a.text.insert(0, "late");
    await tick(1000);
    expect(wire.room.text()).toBe("x");
  });
});
