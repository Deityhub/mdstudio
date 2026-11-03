import { describe, expect, it } from "vitest";
import { type CustomRule } from "./config";
import { runCustomRules, validateCustomRule } from "./custom";

const rule = (over: Partial<CustomRule> = {}): CustomRule => ({
  id: "r",
  name: "Rule",
  pattern: "TODO",
  regex: false,
  caseSensitive: false,
  wholeWord: false,
  message: "Found {match}",
  severity: "warning",
  enabled: true,
  ...over,
});
const lines = (md: string, r: Partial<CustomRule> = {}) =>
  runCustomRules(md, [rule(r)]).map((i) => i.line);

describe("plain text rules", () => {
  it("finds the text on each line it is on, once per line", () => {
    expect(lines("a TODO\nclean\nTODO and todo")).toEqual([1, 3]);
  });
  it("ignores case unless asked not to", () => {
    expect(lines("todo")).toEqual([1]);
    expect(lines("todo", { caseSensitive: true })).toEqual([]);
    expect(lines("TODO", { caseSensitive: true })).toEqual([1]);
  });
  it("can match whole words only", () => {
    expect(lines("todos and todo-list", { wholeWord: true })).toEqual([1]);
    expect(lines("autotodo", { wholeWord: true })).toEqual([]);
  });
  it("treats special characters as text", () => {
    expect(lines("a (b) c", { pattern: "(b)" })).toEqual([1]);
    expect(lines("1+1", { pattern: "1+1" })).toEqual([1]);
  });
});

describe("regular expression rules", () => {
  it("matches the pattern", () => {
    const r = { regex: true, pattern: "\\b(TODO|FIXME)\\b", caseSensitive: true };
    expect(lines("a FIXME\nTODOs\nTODO", r)).toEqual([1, 3]);
  });
  it("is case-insensitive unless asked not to", () => {
    expect(lines("Click Here", { regex: true, pattern: "click here" })).toEqual([1]);
    expect(
      lines("Click Here", { regex: true, pattern: "click here", caseSensitive: true }),
    ).toEqual([]);
  });
  it("ignores a rule whose pattern is not valid, without failing the rest", () => {
    const issues = runCustomRules("TODO", [
      rule({ regex: true, pattern: "(" }),
      rule({ id: "ok" }),
    ]);
    expect(issues.map((i) => i.rule)).toEqual(["ok"]);
  });
});

describe("where it looks", () => {
  it("skips code blocks and front matter", () => {
    const md = "---\ntitle: TODO\n---\n\nreal TODO\n\n```\nTODO in code\n```\n";
    expect(lines(md)).toEqual([5]);
  });
  it("skips disabled rules", () => expect(lines("TODO", { enabled: false })).toEqual([]));
});

describe("the issue it reports", () => {
  it("carries the rule id, severity, group, and the message with {match} filled in", () => {
    const [i] = runCustomRules("fix a Todo now", [rule({ id: "todo", severity: "error" })]);
    expect(i).toEqual({
      line: 1,
      rule: "todo",
      severity: "error",
      group: "custom",
      message: "Found Todo",
    });
  });
  it("shortens a long match in the message", () => {
    const [i] = runCustomRules("x".repeat(200), [
      rule({ regex: true, pattern: "x+", message: "{match}" }),
    ]);
    expect(i!.message.length).toBeLessThanOrEqual(41);
  });
});

describe("limits, so a rule can't stall typing", () => {
  it("only looks at the start of a very long line", () => {
    expect(lines("a".repeat(5000) + " TODO")).toEqual([]);
    expect(lines("a".repeat(500) + " TODO")).toEqual([1]);
  });
  it("reports a rule at most 50 times", () => {
    const md = Array.from({ length: 80 }, () => "TODO").join("\n");
    expect(lines(md)).toHaveLength(50);
  });
});

describe("validateCustomRule", () => {
  it("accepts good rules", () => {
    expect(validateCustomRule(rule())).toBeNull();
    expect(validateCustomRule(rule({ regex: true, pattern: "\\d{3}-\\d{4}" }))).toBeNull();
  });
  it("explains a pattern that is not a valid expression", () =>
    expect(validateCustomRule(rule({ regex: true, pattern: "(" }))).toMatch(/pattern/i));
  it("refuses patterns that can run for a very long time", () => {
    expect(validateCustomRule(rule({ regex: true, pattern: "(a+)+$" }))).toMatch(/repeat/i);
    expect(validateCustomRule(rule({ regex: true, pattern: "(.*)*x" }))).toMatch(/repeat/i);
  });
  it("needs a pattern, a name and a message", () => {
    expect(validateCustomRule(rule({ pattern: "" }))).toMatch(/pattern/i);
    expect(validateCustomRule(rule({ name: " " }))).toMatch(/name/i);
    expect(validateCustomRule(rule({ message: "" }))).toMatch(/message/i);
  });
});
