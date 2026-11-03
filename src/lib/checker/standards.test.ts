import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type Standards } from "./config";
import { runStandards } from "./standards";

function std(over: { [K in keyof Standards]?: Partial<Standards[K]> }): Standards {
  const base = structuredClone(DEFAULT_CONFIG.standards) as Record<string, object>;
  for (const [k, v] of Object.entries(over)) base[k] = { ...base[k], enabled: true, ...v };
  return base as unknown as Standards;
}
const run = (md: string, over: Parameters<typeof std>[0]) =>
  runStandards(md, std(over)).map((i) => [i.line, i.rule, i.severity]);

describe("nothing runs unless it is turned on", () => {
  it("is silent with the defaults", () =>
    expect(runStandards("# a\n\n# b", DEFAULT_CONFIG.standards)).toEqual([]));
});

describe("title-length", () => {
  const fm = (t: string) => `---\ntitle: ${t}\n---\n\nbody`;
  it("flags a title over the maximum, on the title's own line", () =>
    expect(run(fm("x".repeat(65)), { "title-length": { max: 60 } })).toEqual([
      [2, "title-length", "warning"],
    ]));
  it("flags a title under the minimum", () =>
    expect(run(fm("Hi"), { "title-length": { min: 10, max: 60 } })).toEqual([
      [2, "title-length", "warning"],
    ]));
  it("accepts one in range, and uses the first heading when there is no front matter", () => {
    expect(run(fm("A fine title"), { "title-length": { min: 5, max: 60 } })).toEqual([]);
    expect(run("body\n\n# " + "x".repeat(70), { "title-length": { max: 60 } })).toEqual([
      [3, "title-length", "warning"],
    ]);
  });
  it("says nothing when there is no title (required-fields is for that)", () =>
    expect(run("just text", { "title-length": { max: 5 } })).toEqual([]));
  it("uses the severity it was given", () =>
    expect(run(fm("x".repeat(70)), { "title-length": { max: 60, severity: "error" } })[0]![2]).toBe(
      "error",
    ));
});

describe("description-length", () => {
  const fm = (d: string) => `---\ntitle: T\ndescription: ${d}\n---\n`;
  it("checks the front matter description against its range", () => {
    expect(run(fm("short"), { "description-length": { min: 50, max: 160 } })).toEqual([
      [3, "description-length", "warning"],
    ]);
    expect(run(fm("x".repeat(200)), { "description-length": { min: 50, max: 160 } })).toHaveLength(
      1,
    );
    expect(run(fm("x".repeat(100)), { "description-length": { min: 50, max: 160 } })).toEqual([]);
  });
  it("leaves a missing description to required-fields", () =>
    expect(run("---\ntitle: T\n---\n", { "description-length": { min: 50 } })).toEqual([]));
});

describe("required-fields", () => {
  it("reports each missing or empty field", () => {
    const md = "---\ntitle: T\ndescription: ''\n---\n";
    expect(run(md, { "required-fields": { fields: ["title", "description", "tags"] } })).toEqual([
      [1, "required-fields", "warning"],
      [1, "required-fields", "warning"],
    ]);
  });
  it("names the field in the message", () => {
    const [i] = runStandards("text", std({ "required-fields": { fields: ["slug"] } }));
    expect(i!.message).toMatch(/slug/);
  });
  it("accepts a document with all of them, including a list for tags", () =>
    expect(
      run("---\ntitle: T\ntags: [a]\n---\n", { "required-fields": { fields: ["title", "tags"] } }),
    ).toEqual([]));
});

describe("heading-structure", () => {
  it("flags a second top-level heading", () =>
    expect(run("# One\n\ntext\n\n# Two", { "heading-structure": {} })).toEqual([
      [5, "heading-structure", "warning"],
    ]));
  it("flags a skipped level", () =>
    expect(run("# One\n\n### Three", { "heading-structure": {} })).toEqual([
      [3, "heading-structure", "warning"],
    ]));
  it("accepts a tidy outline and ignores hashes in code", () =>
    expect(
      run("# One\n\n## Two\n\n```\n# not a heading\n```\n\n### Three", { "heading-structure": {} }),
    ).toEqual([]));
  it("each check can be turned off", () => {
    expect(run("# A\n\n# B", { "heading-structure": { singleH1: false } })).toEqual([]);
    expect(run("# A\n\n### C", { "heading-structure": { noSkips: false } })).toEqual([]);
  });
});

describe("word-count", () => {
  const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
  it("flags too few and too many words, as the editor counts them", () => {
    expect(run(words(10), { "word-count": { min: 50 } })).toEqual([[1, "word-count", "warning"]]);
    expect(run(words(120), { "word-count": { max: 100 } })).toEqual([[1, "word-count", "warning"]]);
    expect(run(words(60), { "word-count": { min: 50, max: 100 } })).toEqual([]);
  });
  it("does not count front matter or code", () =>
    expect(
      run("---\ntitle: a b c d e f\n---\n\n```\nx y z w v u\n```\nok", {
        "word-count": { min: 3 },
      }),
    ).toHaveLength(1));
});

describe("tag-count", () => {
  it("counts tags written as a list or as a comma separated string", () => {
    expect(run("---\ntags: [a, b, c]\n---\n", { "tag-count": { max: 2 } })).toEqual([
      [2, "tag-count", "warning"],
    ]);
    expect(run("---\ntags: a, b, c\n---\n", { "tag-count": { max: 2 } })).toEqual([
      [2, "tag-count", "warning"],
    ]);
    expect(run("---\ntags: [a]\n---\n", { "tag-count": { max: 2 } })).toEqual([]);
  });
});

it("marks every issue as coming from a standard", () =>
  expect(
    runStandards(
      "---\ntitle: " + "x".repeat(99) + "\n---\n",
      std({ "title-length": { max: 5 } }),
    )[0]!.group,
  ).toBe("standard"));
