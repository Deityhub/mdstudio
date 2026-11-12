import { describe, expect, it } from "vitest";
import { MAX_EVENT_BYTES } from "@/lib/realtime/protocol";
import type { ServerDoc } from "@/lib/sync/protocol";
import { docEvents } from "./events";

const doc = (id: string, content = "# T"): ServerDoc => ({
  id: `u:${id}`,
  version: 2,
  title: "T",
  name: null,
  folder: null,
  content,
  createdAt: 1,
  updatedAt: 2,
  editedAt: 2,
  deleted: false,
});

describe("docEvents", () => {
  it("sends each changed draft as its own event", () => {
    expect(docEvents([doc("a"), doc("b")])).toEqual([
      { t: "doc", doc: doc("a") },
      { t: "doc", doc: doc("b") },
    ]);
  });

  it("sends nothing when nothing changed", () => expect(docEvents([])).toEqual([]));

  it("sends one hint instead of anything when a draft is too big to push", () => {
    const big = doc("big", "x".repeat(MAX_EVENT_BYTES));
    expect(docEvents([big])).toEqual([{ t: "sync" }]);
    expect(docEvents([doc("a"), big])).toEqual([{ t: "sync" }]); // the pull brings both
  });

  it("sends one hint for a large batch rather than many events", () => {
    const many = Array.from({ length: 11 }, (_, i) => doc(`d${i}`));
    expect(docEvents(many)).toEqual([{ t: "sync" }]);
    expect(docEvents(many.slice(0, 10))).toHaveLength(10);
  });
});
