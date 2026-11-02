import { describe, expect, it } from "vitest";
import { buildAnchors, lineToY, yToLine, type Block } from "./scroll-map";

// A heading on line 1, a paragraph on lines 3-4, a 4 line code block on lines 6-9
// (in the preview it is short), and a last paragraph on line 11.
const blocks: Block[] = [
  { from: 1, to: 1, top: 0, bottom: 60 },
  { from: 3, to: 4, top: 80, bottom: 140 },
  { from: 6, to: 9, top: 160, bottom: 200 },
  { from: 11, to: 11, top: 220, bottom: 250 },
];
const a = buildAnchors(blocks)!;

describe("lineToY", () => {
  it("puts a block's first line at its top and the line after its end at its bottom", () => {
    expect(lineToY(a, 1)).toBe(0);
    expect(lineToY(a, 3)).toBe(80);
    expect(lineToY(a, 5)).toBeGreaterThanOrEqual(140);
    expect(lineToY(a, 6)).toBe(160);
    expect(lineToY(a, 10)).toBeGreaterThanOrEqual(200);
    expect(lineToY(a, 11)).toBe(220);
  });
  it("moves smoothly inside a block, however its height compares with its line count", () => {
    expect(lineToY(a, 3.5)).toBeCloseTo(80 + (60 / 2) * 0.5, 5);
    expect(lineToY(a, 7)).toBeCloseTo(160 + 10, 5); // 1 of 4 lines of a 40px block
    expect(lineToY(a, 8)).toBeCloseTo(160 + 20, 5);
  });
  it("never goes backwards as the line grows", () => {
    let last = -1;
    for (let l = 1; l <= 12; l += 0.25) {
      const y = lineToY(a, l);
      expect(y).toBeGreaterThanOrEqual(last);
      last = y;
    }
  });
  it("clamps outside the document", () => {
    expect(lineToY(a, 0)).toBe(0);
    expect(lineToY(a, 99)).toBe(250);
  });
});

describe("yToLine", () => {
  it("is the inverse of lineToY inside blocks", () => {
    for (const line of [1, 1.5, 3, 3.5, 4, 6, 7.25, 9, 11, 11.5]) {
      expect(yToLine(a, lineToY(a, line))).toBeCloseTo(line, 5);
    }
  });
  it("places the gap between blocks on the lines in between", () => {
    const y = 150; // between the paragraph (ends 140) and the code block (starts 160)
    const line = yToLine(a, y);
    expect(line).toBeGreaterThanOrEqual(5);
    expect(line).toBeLessThanOrEqual(6);
  });
  it("clamps above the first block and below the last", () => {
    expect(yToLine(a, -10)).toBe(1);
    expect(yToLine(a, 9999)).toBe(12);
  });
});

describe("buildAnchors", () => {
  it("is null when there is nothing to anchor to", () => expect(buildAnchors([])).toBeNull());
  it("works when front matter pushes the first block down the line numbers", () => {
    const fm = buildAnchors([{ from: 5, to: 5, top: 30, bottom: 90 }])!;
    expect(lineToY(fm, 1)).toBe(30);
    expect(lineToY(fm, 5)).toBe(30);
    expect(yToLine(fm, 0)).toBe(1);
  });
  it("ignores a block that overlaps an earlier one, and unsorted input", () => {
    const messy = buildAnchors([
      { from: 3, to: 4, top: 80, bottom: 140 },
      { from: 1, to: 1, top: 0, bottom: 60 },
      { from: 3, to: 3, top: 80, bottom: 100 },
    ])!;
    expect(lineToY(messy, 3)).toBe(80);
    expect(lineToY(messy, 5)).toBe(140);
  });
  it("copes with a block of no height", () => {
    const flat = buildAnchors([
      { from: 1, to: 1, top: 0, bottom: 0 },
      { from: 3, to: 3, top: 20, bottom: 50 },
    ])!;
    expect(Number.isFinite(lineToY(flat, 2))).toBe(true);
    expect(Number.isFinite(yToLine(flat, 10))).toBe(true);
  });
});
