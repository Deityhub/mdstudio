import { describe, expect, it } from "vitest";
import {
  applyOverrides,
  BUILTIN_RULES,
  DEFAULT_CONFIG,
  exportConfig,
  importConfig,
  parseConfig,
  type CheckConfig,
} from "./config";

const clone = (c: CheckConfig): CheckConfig => structuredClone(c);

describe("defaults", () => {
  it("leaves every built-in rule on, every standard off and no custom rules", () => {
    expect(DEFAULT_CONFIG.custom).toEqual([]);
    expect(DEFAULT_CONFIG.builtin).toEqual({});
    expect(Object.values(DEFAULT_CONFIG.standards).every((s) => !s.enabled)).toBe(true);
  });
  it("lists each built-in rule once, with a label and a default severity", () => {
    const ids = BUILTIN_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining(["raw-html", "missing-alt", "wiki-link", "gfm-table"]),
    );
    expect(
      BUILTIN_RULES.every((r) => r.label && ["error", "warning", "info"].includes(r.severity)),
    ).toBe(true);
  });
});

describe("parseConfig", () => {
  it("accepts what exportConfig writes", () => {
    const c = clone(DEFAULT_CONFIG);
    c.builtin["wiki-link"] = { enabled: false };
    c.standards["title-length"] = { enabled: true, severity: "error", max: 70 };
    c.custom.push({
      id: "todo",
      name: "TODO markers",
      pattern: "TODO",
      regex: false,
      caseSensitive: true,
      wholeWord: true,
      message: "Finish this before publishing",
      severity: "warning",
      enabled: true,
    });
    expect(parseConfig(JSON.parse(exportConfig(c)))).toEqual(c);
  });
  it("falls back to the defaults for anything that is not a valid config", () => {
    for (const bad of [null, 5, "x", [], { version: 2 }, { version: 1, standards: 4 }])
      expect(parseConfig(bad)).toEqual(DEFAULT_CONFIG);
  });
  it("fills in what a smaller file leaves out", () =>
    expect(
      parseConfig({ version: 1, builtin: { "raw-html": { enabled: false } } }).standards,
    ).toEqual(DEFAULT_CONFIG.standards));
});

describe("importConfig", () => {
  it("reads a file made by exportConfig", () => {
    const r = importConfig(exportConfig(DEFAULT_CONFIG));
    expect(r).toEqual({ config: DEFAULT_CONFIG });
  });
  it("says what is wrong instead of throwing", () => {
    expect(importConfig("not json")).toEqual({ error: expect.stringMatching(/JSON/i) });
    expect(importConfig('{"version":1,"builtin":{"raw-html":{"enabled":"yes"}}}')).toEqual({
      error: expect.stringMatching(/rules/i),
    });
    expect(importConfig("x".repeat(300_000))).toEqual({ error: expect.stringMatching(/large/i) });
  });
  it("rejects too many or oversized custom rules", () => {
    const rule = (i: number) => ({
      id: `r${i}`,
      name: "n",
      pattern: "x",
      regex: false,
      caseSensitive: false,
      wholeWord: false,
      message: "m",
      severity: "info",
      enabled: true,
    });
    const many = { version: 1, custom: Array.from({ length: 51 }, (_, i) => rule(i)) };
    expect(importConfig(JSON.stringify(many))).toEqual({ error: expect.any(String) });
    const long = { version: 1, custom: [{ ...rule(1), pattern: "x".repeat(201) }] };
    expect(importConfig(JSON.stringify(long))).toEqual({ error: expect.any(String) });
  });
});

describe("applyOverrides (a draft's front matter)", () => {
  it("returns the config unchanged, and no notes, without overrides", () => {
    expect(applyOverrides(DEFAULT_CONFIG, undefined)).toEqual({
      config: DEFAULT_CONFIG,
      notes: [],
    });
  });
  it("switches built-in rules off, on, or to another severity", () => {
    const { config, notes } = applyOverrides(DEFAULT_CONFIG, {
      "wiki-link": false,
      "raw-html": "error",
      "gfm-table": true,
    });
    expect(config.builtin).toEqual({
      "wiki-link": { enabled: false },
      "raw-html": { severity: "error" },
      "gfm-table": { enabled: true },
    });
    expect(notes).toEqual([]);
  });
  it("turns a standard on with new limits, or off", () => {
    const base = clone(DEFAULT_CONFIG);
    base.standards["description-length"].enabled = true;
    const { config } = applyOverrides(base, {
      "title-length": { max: 80 },
      "description-length": false,
      "word-count": "info",
    });
    expect(config.standards["title-length"]).toMatchObject({ enabled: true, max: 80 });
    expect(config.standards["description-length"].enabled).toBe(false);
    expect(config.standards["word-count"]).toMatchObject({ enabled: true, severity: "info" });
  });
  it("switches a custom rule off by its id", () => {
    const base = clone(DEFAULT_CONFIG);
    base.custom.push({
      id: "todo",
      name: "t",
      pattern: "TODO",
      regex: false,
      caseSensitive: false,
      wholeWord: false,
      message: "m",
      severity: "warning",
      enabled: true,
    });
    expect(applyOverrides(base, { todo: false }).config.custom[0]?.enabled).toBe(false);
  });
  it("never changes the config it was given", () => {
    const base = clone(DEFAULT_CONFIG);
    applyOverrides(base, { "wiki-link": false, "title-length": { max: 5 } });
    expect(base).toEqual(DEFAULT_CONFIG);
  });
  it("ignores what it does not understand and says so", () => {
    const { config, notes } = applyOverrides(DEFAULT_CONFIG, {
      nonsense: false,
      "raw-html": "loud",
      "title-length": { max: "wide" },
    });
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatch(/nonsense/);
  });
  it("explains a value that is not a list of settings", () =>
    expect(applyOverrides(DEFAULT_CONFIG, "off").notes).toEqual([expect.stringMatching(/checks/)]));
});
