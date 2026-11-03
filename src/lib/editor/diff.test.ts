import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "./diff";

const types = (a: string, b: string) => diffLines(a, b).map((r) => r.type);

describe("diffLines", () => {
  it("marks identical text as unchanged", () =>
    expect(types("a\nb", "a\nb")).toEqual(["same", "same"]));
  it("finds an added and a removed line", () => {
    expect(types("a\nc", "a\nb\nc")).toEqual(["same", "add", "same"]);
    expect(types("a\nb\nc", "a\nc")).toEqual(["same", "del", "same"]);
  });
  it("pairs a replaced line as one change with both sides", () => {
    const rows = diffLines("a\nold\nc", "a\nnew\nc");
    expect(rows.map((r) => r.type)).toEqual(["same", "change", "same"]);
    expect(rows[1]).toMatchObject({
      left: { n: 2, text: "old" },
      right: { n: 2, text: "new" },
    });
  });
  it("numbers lines on each side independently", () => {
    const rows = diffLines("a\nb", "x\na\nb");
    expect(rows[0]).toMatchObject({ type: "add", right: { n: 1, text: "x" } });
    expect(rows[1]).toMatchObject({ left: { n: 1 }, right: { n: 2 } });
  });
  it("handles empty sides", () => {
    expect(types("", "a")).toEqual(["change"]);
    expect(diffLines("", "")).toHaveLength(1);
  });
  it("treats CRLF and LF the same", () =>
    expect(types("a\r\nb", "a\nb")).toEqual(["same", "same"]));
  it("still returns something for huge unrelated inputs", () => {
    const a = Array.from({ length: 4000 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 4000 }, (_, i) => `b${i}`).join("\n");
    const rows = diffLines(a, b);
    expect(rows.every((r) => r.type !== "same")).toBe(true);
  });
});

describe("diffStats", () => {
  it("counts added and removed lines", () =>
    expect(diffStats(diffLines("a\nb\nc", "a\nx\nc\nd"))).toEqual({ added: 2, removed: 1 }));
  it("is zero for identical text", () =>
    expect(diffStats(diffLines("a", "a"))).toEqual({ added: 0, removed: 0 }));
});
