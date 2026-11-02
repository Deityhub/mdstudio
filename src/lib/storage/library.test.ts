import { describe, expect, it } from "vitest";
import {
  allTags,
  docTags,
  filterDocs,
  groupByFolder,
  normalizeFolder,
  resolveFolder,
  searchSnippet,
  type LibraryDoc,
} from "./library";

const doc = (id: string, content: string, extra: Partial<LibraryDoc> = {}): LibraryDoc => ({
  id,
  title: id,
  content,
  updatedAt: 0,
  ...extra,
});

describe("docTags", () => {
  it("reads a front matter list, trims, lowercases and de-duplicates", () =>
    expect(docTags("---\ntags: [Rust, ' web ', rust]\n---\nbody")).toEqual(["rust", "web"]));
  it("accepts a comma separated string", () =>
    expect(docTags("---\ntags: a, b\n---\n")).toEqual(["a", "b"]));
  it("is empty without front matter, with no tags, or with junk values", () => {
    expect(docTags("# hi")).toEqual([]);
    expect(docTags("---\ntitle: x\n---\n")).toEqual([]);
    expect(docTags("---\ntags: [1, {a: 1}, '']\n---\n")).toEqual(["1"]);
  });
});

describe("allTags", () => {
  it("counts tags across drafts, most used first then alphabetical", () => {
    const docs = [
      doc("a", "---\ntags: [x, y]\n---\n"),
      doc("b", "---\ntags: [y, z]\n---\n"),
      doc("c", "---\ntags: [y]\n---\n"),
    ];
    expect(allTags(docs)).toEqual([
      { tag: "y", count: 3 },
      { tag: "x", count: 1 },
      { tag: "z", count: 1 },
    ]);
  });
});

describe("normalizeFolder", () => {
  it("trims, collapses spaces and caps the length", () => {
    expect(normalizeFolder("  Blog   posts ")).toBe("Blog posts");
    expect(normalizeFolder("x".repeat(80))).toHaveLength(40);
  });
  it("treats blank as no folder", () => {
    expect(normalizeFolder("   ")).toBeUndefined();
    expect(normalizeFolder(undefined)).toBeUndefined();
  });
});

describe("resolveFolder", () => {
  it("reuses the spelling of an existing folder", () =>
    expect(resolveFolder(" blog ", ["Blog", "Notes"])).toBe("Blog"));
  it("keeps a new name as typed, and blank as none", () => {
    expect(resolveFolder("Drafts", ["Blog"])).toBe("Drafts");
    expect(resolveFolder("  ", ["Blog"])).toBeUndefined();
  });
});

describe("groupByFolder", () => {
  it("lists folders A to Z (case-insensitive) with their drafts in order, unfiled drafts last", () => {
    const docs = [
      doc("1", "", { folder: "b" }),
      doc("2", ""),
      doc("3", "", { folder: "A" }),
      doc("4", "", { folder: "b" }),
    ];
    expect(groupByFolder(docs, []).map((g) => [g.folder, g.docs.map((d) => d.id)])).toEqual([
      ["A", ["3"]],
      ["b", ["1", "4"]],
      [null, ["2"]],
    ]);
  });
  it("includes empty folders, and merges names case-insensitively with the drafts' own", () => {
    const docs = [doc("1", "", { folder: "blog" })];
    expect(groupByFolder(docs, ["Empty", "Blog"]).map((g) => [g.folder, g.docs.length])).toEqual([
      ["Blog", 1],
      ["Empty", 0],
    ]);
  });
  it("has no unfiled group when every draft is filed, and nothing for no drafts or folders", () => {
    expect(groupByFolder([doc("1", "", { folder: "x" })], []).map((g) => g.folder)).toEqual(["x"]);
    expect(groupByFolder([], [])).toEqual([]);
  });
});

describe("filterDocs", () => {
  const docs = [
    doc("alpha", "Rust is fast.\nSecond line about memory.", {
      title: "Alpha",
      updatedAt: 3,
    }),
    doc("beta", "---\ntags: [web]\n---\nA post on the web and rust.", { title: "Beta" }),
    doc("gamma", "nothing relevant", { title: "Gamma" }),
  ];
  it("returns everything for an empty query and no tags", () =>
    expect(filterDocs(docs, "  ", []).map((r) => r.doc.id)).toEqual(["alpha", "beta", "gamma"]));
  it("matches every word, case-insensitively, in the title or the text", () => {
    expect(filterDocs(docs, "RUST web", []).map((r) => r.doc.id)).toEqual(["beta"]);
    expect(filterDocs(docs, "alpha", []).map((r) => r.doc.id)).toEqual(["alpha"]);
    expect(filterDocs(docs, "zzz", [])).toEqual([]);
  });
  it("filters by tags, narrowing with each one", () => {
    expect(filterDocs(docs, "", ["web"]).map((r) => r.doc.id)).toEqual(["beta"]);
    expect(filterDocs(docs, "", ["web", "other"])).toEqual([]);
  });
  it("combines a query and tags, and gives a snippet only for a query", () => {
    const [hit] = filterDocs(docs, "rust", ["web"]);
    expect(hit?.doc.id).toBe("beta");
    expect(hit?.snippet).toContain("rust");
    expect(filterDocs(docs, "", [])[0]?.snippet).toBeUndefined();
  });
});

describe("searchSnippet", () => {
  it("shows the first matching line around the match", () => {
    expect(searchSnippet("one\nthe needle here\nthree", ["needle"])).toBe("the needle here");
  });
  it("shortens a long line with ellipses around the match", () => {
    const line = `${"a ".repeat(60)}needle${" b".repeat(60)}`;
    const s = searchSnippet(line, ["needle"]);
    expect(s.length).toBeLessThanOrEqual(90);
    expect(s).toContain("needle");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });
  it("skips front matter and falls back to nothing when only the title matched", () => {
    expect(searchSnippet("---\ntitle: needle\n---\nbody", ["needle"])).toBe("");
  });
});
