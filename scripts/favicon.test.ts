// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ico = readFileSync("public/favicon.ico");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const entries = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
  const at = 6 + i * 16;
  return {
    width: ico[at]! || 256,
    height: ico[at + 1]! || 256,
    size: ico.readUInt32LE(at + 8),
    offset: ico.readUInt32LE(at + 12),
  };
});

describe("public/favicon.ico", () => {
  it("is a valid icon file", () => {
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // type: icon
    expect(entries.length).toBeGreaterThan(0);
  });

  it("holds the sizes browsers and crawlers ask for: 16, 32 and 48", () => {
    expect(entries.map((e) => e.width).sort((a, b) => a - b)).toEqual([16, 32, 48]);
    for (const e of entries) expect(e.height).toBe(e.width);
  });

  it("stores each size as a PNG of exactly that size, within the file", () => {
    for (const e of entries) {
      expect(e.offset + e.size).toBeLessThanOrEqual(ico.length);
      expect([...ico.subarray(e.offset, e.offset + 8)]).toEqual(PNG);
      // IHDR: width and height are the first two 32-bit values after the signature and chunk header
      expect(ico.readUInt32BE(e.offset + 16)).toBe(e.width);
      expect(ico.readUInt32BE(e.offset + 20)).toBe(e.height);
    }
  });

  it("is small: it is requested by every crawler", () => expect(ico.length).toBeLessThan(15_000));
});
