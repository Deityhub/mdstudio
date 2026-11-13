// Two real CodeMirror editors bound to the shared text through the real room, edited at random at
// the same time, with the network holding frames back: afterwards both editors must show exactly the
// shared text, and the same one.
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStore } from "../storage/documentStore";
import { openSession } from "./session";
import { Wire } from "./testing";

vi.stubGlobal("location", { protocol: "http:", host: "localhost" });
// CodeMirror measures text; jsdom cannot
Range.prototype.getClientRects = () =>
  ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as never;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const kv = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => m.get(k) as T | undefined,
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    values: async () => [],
  };
};
const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function editor(wire: Wire) {
  const session = await openSession({
    me: { id: "u", name: "U" },
    ownerId: "o",
    draftId: "d",
    kv: kv(),
    createSocket: wire.create,
    refreshCopy: () => undefined,
    onStale: () => undefined,
  });
  await vi.advanceTimersByTimeAsync(0);
  const view = new EditorView({
    state: EditorState.create({ doc: session.text(), extensions: [session.extension] }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  return { session, view };
}

describe("two editors on one line", () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`end with the shared text, seed ${seed}`, async () => {
      const wire = new Wire();
      await wire.room.seed("One line of text here");
      const a = await editor(wire);
      const b = await editor(wire);
      const rand = rng(seed);
      const type = (e: typeof a) => {
        const { state } = e.view;
        const len = state.doc.length;
        const pos = Math.floor(rand() * (len + 1));
        const roll = rand();
        if (roll < 0.65)
          e.view.dispatch({
            changes: { from: pos, insert: "abcxyz"[Math.floor(rand() * 6)]! },
            selection: { anchor: pos + 1 },
          });
        else if (roll < 0.85 && len > 0) {
          const from = Math.min(pos, len - 1);
          e.view.dispatch({
            changes: { from, to: Math.min(len, from + 1 + Math.floor(rand() * 3)) },
          });
        } else e.view.dispatch({ changes: { from: pos, insert: "\n" } });
      };
      for (let step = 0; step < 200; step++) {
        type(rand() < 0.5 ? a : b);
        if (rand() < 0.5) type(a);
        await vi.advanceTimersByTimeAsync(Math.floor(rand() * 120));
      }
      await vi.advanceTimersByTimeAsync(3000);
      const shared = wire.room.text();
      expect(a.session.text()).toBe(shared);
      expect(b.session.text()).toBe(shared);
      expect(a.view.state.doc.toString()).toBe(shared);
      expect(b.view.state.doc.toString()).toBe(shared);
    });
  }
});

describe("two people typing forward at the same spot", () => {
  // Each types at their own caret, like a keyboard does, with the network holding frames back.
  for (const seed of [11, 12, 13, 14, 15]) {
    it(`keep their own words together, seed ${seed}`, async () => {
      const wire = new Wire();
      await wire.room.seed("One line of text here");
      const a = await editor(wire);
      const b = await editor(wire);
      const rand = rng(seed);
      const at = 8; // the same place in the line
      for (const e of [a, b]) e.view.dispatch({ selection: { anchor: at } });
      const typeAt = (e: typeof a, ch: string) => {
        const head = e.view.state.selection.main.head;
        e.view.dispatch({
          changes: { from: head, insert: ch },
          selection: { anchor: head + 1 },
        });
      };
      for (let i = 0; i < 30; i++) {
        typeAt(a, "A");
        typeAt(b, "B");
        await vi.advanceTimersByTimeAsync(20 + Math.floor(rand() * 80));
      }
      await vi.advanceTimersByTimeAsync(3000);
      const shared = wire.room.text();
      expect(a.view.state.doc.toString()).toBe(shared);
      expect(b.view.state.doc.toString()).toBe(shared);
      expect(shared.replace(/[^AB]/g, "")).toMatch(/^(A{30}B{30}|B{30}A{30})$/);
    });
  }
});
