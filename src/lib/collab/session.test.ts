import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "../storage/documentStore";
import { type Kept, keptKey } from "./kept";
import { TEXT_KEY } from "./protocol";
import { TEXT_COPY_MS, openSession } from "./session";
import { Wire } from "./testing";

vi.stubGlobal("location", { protocol: "http:", host: "localhost" });

const memory = () => {
  const map = new Map<string, unknown>();
  const kv: KeyValueStore & { map: Map<string, unknown> } = {
    map,
    get: async <T>(k: string) => map.get(k) as T | undefined,
    set: async (k, v) => void map.set(k, v),
    del: async (k) => void map.delete(k),
    values: async <T>(p: string) =>
      [...map].filter(([k]) => k.startsWith(p)).map(([, v]) => v as T),
  };
  return kv;
};
const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const open = async (
  wire: Wire,
  kv = memory(),
  extra: Partial<Parameters<typeof openSession>[0]> = {},
) => {
  const refreshed: string[] = [];
  const stale: string[] = [];
  const session = await openSession({
    me: { id: "u1", name: "Ada" },
    ownerId: "owner",
    draftId: "d1",
    kv,
    createSocket: wire.create,
    refreshCopy: (url) => refreshed.push(url),
    onStale: (t) => stale.push(t),
    ...extra,
  });
  return { session, kv, refreshed, stale };
};

describe("a live draft's session", () => {
  it("is not ready until the room's text has arrived, then keeps it", async () => {
    const wire = new Wire();
    await wire.room.seed("# Notes");
    wire.down = true; // the first visit, with no network yet
    const { session, kv } = await open(wire);
    await settle();
    expect(session.state.ready).toBe(false);
    expect(kv.map.has(keptKey("owner", "d1"))).toBe(false);
    wire.down = false;
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(session.state.ready).toBe(true);
    expect(session.state.status).toBe("live");
    expect(session.text()).toBe("# Notes");
    await settle();
    expect((kv.map.get(keptKey("owner", "d1")) as Kept).epoch).toBe(wire.room.epoch());
  });

  it("is ready at once from what the browser kept, even with no network", async () => {
    const wire = new Wire();
    await wire.room.seed("first");
    const a = await open(wire);
    await settle();
    a.session.ytext.insert(5, " + more");
    await settle(3000);
    a.session.destroy();
    await settle();

    wire.down = true;
    const b = await open(wire, a.kv);
    expect(b.session.state.ready).toBe(true);
    expect(b.session.text()).toBe("first + more");
    expect(b.session.state.status).not.toBe("live");
  });

  it("calls back with the whole text after any change, from anyone", async () => {
    const wire = new Wire();
    await wire.room.seed("hi");
    const a = await open(wire);
    const b = await open(wire);
    const seen: string[] = [];
    a.session.observe((t) => seen.push(t));
    await settle();
    b.session.ytext.insert(2, "?");
    await settle(300);
    expect(seen.at(-1)).toBe("hi?");
  });

  it("takes a whole new text as a small edit, so what others typed around it is kept", async () => {
    const wire = new Wire();
    await wire.room.seed("# Title\n\nintro\n\noutro");
    const a = await open(wire);
    const b = await open(wire);
    await settle();
    b.session.ytext.insert(b.session.text().length, " (added by b)");
    a.session.replaceText("# New title\n\nintro\n\noutro"); // a's view did not have b's edit yet
    await settle(1000);
    expect(b.session.text()).toBe("# New title\n\nintro\n\noutro (added by b)");
    expect(a.session.text()).toBe(b.session.text());
  });

  it("asks what became of the draft when the room keeps refusing, and says so only meanwhile", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    wire.down = true;
    let finish: () => void = () => undefined;
    const asked: number[] = [];
    const { session } = await open(wire, memory(), {
      onRefused: () => {
        asked.push(1);
        return new Promise<void>((r) => (finish = r));
      },
    });
    await settle(1200);
    expect(asked).toHaveLength(1);
    expect(session.state.refused).toBe(true);
    finish(); // the draft is still shared with this person
    await settle(0);
    expect(session.state.refused).toBe(false);
    expect(asked).toHaveLength(1);
  });

  it("does not wait forever for the access check", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    wire.down = true;
    const { session } = await open(wire, memory(), {
      onRefused: () => new Promise(() => undefined),
    });
    await settle(1200);
    expect(session.state.refused).toBe(true);
    await settle(4100);
    expect(session.state.refused).toBe(false);
  });

  it("carries a comment from one person to the other, anchored to the same words", async () => {
    const wire = new Wire();
    await wire.room.seed("Ship on Friday.");
    const a = await open(wire);
    const b = await open(wire, memory(), { me: { id: "u2", name: "Bea" } });
    await settle();
    const from = a.session.text().indexOf("Friday");
    const r = a.session.threads.add({ kind: "comment", from, to: from + 6, body: "Which Friday?" });
    expect(r.ok).toBe(true);
    await settle(1000);
    const [t] = b.session.threads.list();
    expect(t).toMatchObject({ body: "Which Friday?", author: { name: "Ada" }, text: "Friday" });
    // an accepted suggestion is the accepter's own edit: their Undo takes it back
    const s = b.session.threads.add({
      kind: "suggestion",
      from,
      to: from + 6,
      body: "",
      proposed: "Monday",
    });
    if (!s.ok) throw new Error();
    b.session.threads.accept(s.id);
    await settle(1000);
    expect(a.session.text()).toBe("Ship on Monday.");
    b.session.undo();
    await settle(1000);
    expect(a.session.text()).toBe("Ship on Friday.");
  });

  it("takes a whole-text change back with Undo, and brings it again with Redo, keeping what others typed", async () => {
    const wire = new Wire();
    await wire.room.seed("# Title\n\nintro\n\noutro");
    const a = await open(wire);
    const b = await open(wire, memory(), { me: { id: "u2", name: "Bea" } });
    await settle();
    a.session.replaceText("# New title\n\nintro\n\noutro"); // a restored version, say
    b.session.ytext.insert(b.session.text().length, " (by b)");
    await settle(1000);
    expect(a.session.text()).toBe("# New title\n\nintro\n\noutro (by b)");
    a.session.undo();
    await settle(1000);
    expect(a.session.text()).toBe("# Title\n\nintro\n\noutro (by b)"); // only a's change went
    expect(b.session.text()).toBe(a.session.text());
    a.session.redo();
    await settle(1000);
    expect(b.session.text()).toBe("# New title\n\nintro\n\noutro (by b)");
  });

  it("does not take another person's whole-text change back with this person's Undo", async () => {
    const wire = new Wire();
    await wire.room.seed("one");
    const a = await open(wire);
    const b = await open(wire, memory(), { me: { id: "u2", name: "Bea" } });
    await settle();
    b.session.replaceText("two");
    await settle(1000);
    a.session.undo(); // a has nothing of their own to undo
    await settle(1000);
    expect(a.session.text()).toBe("two");
  });

  it("asks the server to refresh its text copy after this browser's edits go quiet, once", async () => {
    const wire = new Wire();
    await wire.room.seed("x");
    const { session, refreshed } = await open(wire);
    await settle();
    expect(refreshed).toEqual([]); // reading is not editing
    session.ytext.insert(1, "y");
    await settle(TEXT_COPY_MS - 100);
    expect(refreshed).toEqual([]);
    await settle(200);
    expect(refreshed).toEqual(["/api/collab/doc/owner/d1/flush"]);
    await settle(TEXT_COPY_MS * 2);
    expect(refreshed).toHaveLength(1);
  });

  it("hands over the text and forgets the kept state when the room is a different one", async () => {
    const wire = new Wire();
    await wire.room.seed("room one");
    const a = await open(wire);
    await settle();
    await settle(3000);
    a.session.destroy();
    await settle();
    // the draft was stopped and started again: a new room
    await wire.room.destroy();
    await wire.room.seed("room two");
    const b = await open(wire, a.kv);
    await settle();
    expect(b.stale).toEqual(["room one"]);
    expect(a.kv.map.has(keptKey("owner", "d1"))).toBe(false);
    expect(wire.room.text()).toBe("room two");
  });

  it("two browsers typing at once end with the same text", async () => {
    const wire = new Wire("u1", "Ada");
    await wire.room.seed("shared");
    const a = await open(wire);
    const b = await open(wire);
    await settle();
    a.session.ytext.insert(0, "A ");
    b.session.ytext.insert(6, " B");
    await settle(1000);
    expect(a.session.text()).toBe(b.session.text());
    expect(a.session.text()).toBe("A shared B");
    expect(a.session.state.peers).toHaveLength(1);
  });
});
