import { describe, expect, it } from "vitest";
import type { Issue } from "../markdown/markdown";
import { canFix, fixInstruction, fixTarget } from "./fix";

const issue = (rule: string, line: number, extra: Partial<Issue> = {}): Issue => ({
  rule,
  line,
  message: "A problem.",
  severity: "warning",
  ...extra,
});

describe("which checks the AI can help with", () => {
  it("offers help for rewrites of syntax, alt text and the writer's own rules", () => {
    for (const rule of ["raw-html", "math", "alert", "highlight", "wiki-link", "missing-alt"])
      expect(canFix(issue(rule, 1))).toBe(true);
    expect(canFix(issue("anything", 1, { group: "custom" }))).toBe(true);
    expect(canFix(issue("anything", 1, { group: "standard" }))).toBe(true);
  });
  it("leaves out what only the writer can decide or a rule already fixes", () => {
    for (const rule of ["local-image", "data-image", "local-link", "mermaid", "checks-config"])
      expect(canFix(issue(rule, 1))).toBe(false);
  });
});

describe("the text sent for one issue", () => {
  const md = "Intro\n\nLine <b>one</b>\nline two\n\nTail";
  it("is the paragraph around the issue, with its place in the document", () => {
    const t = fixTarget(md, issue("raw-html", 3))!;
    expect(t.text).toBe("Line <b>one</b>\nline two");
    expect(md.slice(t.from, t.to)).toBe(t.text);
  });
  it("takes the last block when the text has no final newline", () => {
    const t = fixTarget(md, issue("raw-html", 6))!;
    expect(t.text).toBe("Tail");
    expect(md.slice(t.from, t.to)).toBe("Tail");
  });
  it("takes a whole code block, blank lines and all", () => {
    const code = "x\n\n```html\n<b>a</b>\n\n<i>b</i>\n```\n\ny";
    const t = fixTarget(code, issue("raw-html", 4))!;
    expect(t.text).toBe("```html\n<b>a</b>\n\n<i>b</i>\n```");
  });
  it("takes the whole front matter for a line inside it", () => {
    const fm = "---\ntitle: T\ntags: []\n---\n\nBody";
    const t = fixTarget(fm, issue("x", 3, { group: "custom" }))!;
    expect(t.text).toBe("---\ntitle: T\ntags: []\n---");
  });
  it("sends only a window of a very long block", () => {
    const long = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n");
    const t = fixTarget(long, issue("raw-html", 150))!;
    const lines = t.text.split("\n");
    expect(lines.length).toBeLessThanOrEqual(41);
    expect(lines).toContain("line 150");
    expect(long.slice(t.from, t.to)).toBe(t.text);
  });
  it("finds nothing for a line that is not there or is blank", () => {
    expect(fixTarget(md, issue("raw-html", 99))).toBeNull();
    expect(fixTarget(md, issue("raw-html", 2))).toBeNull();
  });
});

describe("what the AI is asked to do", () => {
  it("names the problem and the target, and asks for the smallest change", () => {
    const text = fixInstruction(
      issue("raw-html", 1, { message: "Raw HTML is stripped." }),
      "commonmark",
    );
    expect(text).toContain("Raw HTML is stripped.");
    expect(text).toContain("Strict CommonMark");
    expect(text).toMatch(/as little as possible/i);
  });
  it("asks for alt text from the name and the surrounding words, not from guessing the picture", () => {
    const text = fixInstruction(issue("missing-alt", 1), "gfm-extended");
    expect(text).toMatch(/alt text/i);
    expect(text).toMatch(/file name/i);
    expect(text).toMatch(/do not describe what you cannot know/i);
  });
});
