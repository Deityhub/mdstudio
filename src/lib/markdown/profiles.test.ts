import { describe, expect, it } from "vitest";
import { PROFILES, parseProfile } from "./profiles";

describe("profiles", () => {
  it("are named by their rules, not by a platform", () =>
    expect(PROFILES.map((p) => p.label)).toEqual([
      "GFM extended",
      "Strict CommonMark",
      "GFM without HTML",
      "Wiki notes",
    ]));
});

describe("parseProfile", () => {
  it("accepts a current id", () => expect(parseProfile("gfm-no-html")).toBe("gfm-no-html"));
  it("maps the ids saved before the rename", () => {
    expect(parseProfile("github")).toBe("gfm-extended");
    expect(parseProfile("devto")).toBe("gfm-no-html");
    expect(parseProfile("obsidian")).toBe("wiki-notes");
    expect(parseProfile("commonmark")).toBe("commonmark");
  });
  it("is null for nothing or an unknown value", () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile("nope")).toBeNull();
  });
});
