import { describe, expect, it } from "vitest";
import { type SearchEntry, groupResults, matchLine, rankEntries } from "./rank";

const entry = (title: string, extra: Partial<SearchEntry> = {}): SearchEntry => ({
  id: title,
  group: "Commands",
  title,
  run: () => {},
  ...extra,
});

describe("rankEntries", () => {
  const entries = [
    entry("Download all drafts (.zip)", { keywords: "export archive backup" }),
    entry("Download .md", { keywords: "export markdown file" }),
    entry("Insert table"),
    entry("Theme: Dark", { keywords: "appearance night" }),
  ];
  const titles = (q: string) => rankEntries(q, entries).map((e) => e.title);

  it("needs every word, from the title or the keywords, in any case", () => {
    expect(titles("DOWNLOAD zip")).toEqual(["Download all drafts (.zip)"]);
    expect(titles("export markdown")).toEqual(["Download .md"]);
    expect(titles("dark night")).toEqual(["Theme: Dark"]);
    expect(titles("table zip")).toEqual([]);
  });
  it("puts a title that starts with the words before one that only contains them", () => {
    const list = [
      entry("Copy rendered HTML"),
      entry("HTML export"),
      entry("Show HTML", { keywords: "x" }),
    ];
    expect(rankEntries("html", list).map((e) => e.title)).toEqual([
      "HTML export",
      "Copy rendered HTML",
      "Show HTML",
    ]);
  });
  it("ranks a title match above a keyword-only match", () => {
    expect(titles("export")).toEqual(["Download all drafts (.zip)", "Download .md"]);
    const list = [entry("Backup", { keywords: "zip" }), entry("Zip it")];
    expect(rankEntries("zip", list).map((e) => e.title)).toEqual(["Zip it", "Backup"]);
  });
  it("returns nothing for an empty query", () => expect(titles("   ")).toEqual([]));
});

describe("matchLine", () => {
  const text = "---\ntitle: X\n---\n# Intro\n\nSome words here.\nThe rocket launches at dawn.\n";
  it("finds the 1-based line with the most of the words, outside the front matter", () => {
    expect(matchLine(text, ["rocket", "dawn"])).toEqual({
      line: 7,
      text: "The rocket launches at dawn.",
    });
    expect(matchLine(text, ["title"])).toBeNull();
    expect(matchLine(text, ["missing"])).toBeNull();
  });
  it("shortens a long line around the match", () => {
    const long = `${"a ".repeat(100)}needle${" b".repeat(100)}`;
    const m = matchLine(long, ["needle"])!;
    expect(m.text.length).toBeLessThan(120);
    expect(m.text).toContain("needle");
    expect(m.text.startsWith("…")).toBe(true);
  });
});

describe("groupResults", () => {
  it("keeps the groups in a fixed order and caps each one", () => {
    const list = [
      entry("c1"),
      entry("d1", { group: "Drafts" }),
      ...Array.from({ length: 12 }, (_, i) => entry(`s${i}`, { group: "Settings" })),
    ];
    const groups = groupResults(list, 5);
    expect(groups.map((g) => g.group)).toEqual(["Drafts", "Commands", "Settings"]);
    expect(groups[2]!.items).toHaveLength(5);
  });
});
