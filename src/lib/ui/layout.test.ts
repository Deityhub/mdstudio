import { describe, expect, it } from "vitest";
import { clampLibraryWidth, LIBRARY_WIDTH } from "./layout";

describe("clampLibraryWidth", () => {
  it("keeps a width inside the limits", () => expect(clampLibraryWidth(320)).toBe(320));
  it("clamps to the minimum and maximum", () => {
    expect(clampLibraryWidth(10)).toBe(LIBRARY_WIDTH.min);
    expect(clampLibraryWidth(5000)).toBe(LIBRARY_WIDTH.max);
  });
  it("rounds to whole pixels", () => expect(clampLibraryWidth(300.6)).toBe(301));
  it("falls back to the default for missing or junk values", () => {
    for (const bad of [null, undefined, "", "abc", NaN, Infinity])
      expect(clampLibraryWidth(bad)).toBe(LIBRARY_WIDTH.default);
  });
  it("reads a stored string", () => expect(clampLibraryWidth("350")).toBe(350));
});
