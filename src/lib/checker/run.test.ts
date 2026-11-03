import { describe, expect, it } from "vitest";
import { checkPortability } from "../markdown/markdown";
import { DEFAULT_CONFIG, type CheckConfig } from "./config";
import { runChecks } from "./run";

const cfg = (edit: (c: CheckConfig) => void): CheckConfig => {
  const c = structuredClone(DEFAULT_CONFIG);
  edit(c);
  return c;
};
const MD = "see [[Page]]\n\nand <div>html</div>\n\nTODO later";

describe("runChecks with the default settings", () => {
  it("gives exactly what the portability checker gives", () =>
    expect(runChecks(MD, "github", DEFAULT_CONFIG).issues).toEqual(checkPortability(MD, "github")));
});

describe("built-in rules", () => {
  it("drops a rule that is switched off", () => {
    const { issues } = runChecks(
      MD,
      "github",
      cfg((c) => (c.builtin["wiki-link"] = { enabled: false })),
    );
    expect(issues.map((i) => i.rule)).not.toContain("wiki-link");
    expect(issues.map((i) => i.rule)).toContain("raw-html");
  });
  it("changes a rule's severity", () => {
    const { issues } = runChecks(
      MD,
      "github",
      cfg((c) => (c.builtin["raw-html"] = { severity: "info" })),
    );
    expect(issues.find((i) => i.rule === "raw-html")?.severity).toBe("info");
  });
});

describe("the three kinds together", () => {
  const config = cfg((c) => {
    c.standards["word-count"] = { enabled: true, severity: "info", min: 100 };
    c.custom.push({
      id: "todo",
      name: "TODO",
      pattern: "TODO",
      regex: false,
      caseSensitive: false,
      wholeWord: true,
      message: "Finish: {match}",
      severity: "error",
      enabled: true,
    });
  });
  it("merges them by line, and says which is which", () => {
    const { issues } = runChecks(MD, "github", config);
    expect(issues.map((i) => [i.line, i.rule, i.group])).toEqual([
      [1, "wiki-link", undefined],
      [1, "word-count", "standard"],
      [3, "raw-html", undefined],
      [3, "raw-html", undefined], // the opening and the closing tag
      [5, "todo", "custom"],
    ]);
  });
});

describe("a draft's own settings in its front matter", () => {
  const doc = (checks: string) => `---\ntitle: T\nchecks:\n${checks}\n---\n\nsee [[Page]] TODO`;
  const config = cfg((c) =>
    c.custom.push({
      id: "todo",
      name: "t",
      pattern: "TODO",
      regex: false,
      caseSensitive: false,
      wholeWord: false,
      message: "m",
      severity: "warning",
      enabled: true,
    }),
  );
  it("applies them on top of the browser's settings", () => {
    const { issues } = runChecks(doc("  wiki-link: false\n  todo: error"), "github", config);
    expect(issues.map((i) => [i.rule, i.severity])).toEqual([["todo", "error"]]);
  });
  it("turns a standard on for this draft only", () => {
    const { issues } = runChecks(doc("  title-length: { max: 0 }"), "github", config);
    expect(issues.map((i) => i.rule)).toContain("title-length");
  });
  it("reports a setting it doesn't understand as a note on the checks line", () => {
    const { issues } = runChecks(doc("  nonsense: false"), "github", config);
    const note = issues.find((i) => i.rule === "checks-config");
    expect(note).toMatchObject({ line: 3, severity: "info" });
    expect(note?.message).toMatch(/nonsense/);
  });
  it("leaves the config alone for other drafts", () => {
    runChecks(doc("  wiki-link: false"), "github", config);
    expect(config.builtin).toEqual({});
  });
});
