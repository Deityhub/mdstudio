import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_DESCRIPTION, shareDate, shareDescription, shareTitle } from "./page";

describe("shareTitle", () => {
  it("uses the published title, and the text's own title when it is blank", () => {
    expect(shareTitle("Launch notes", "# Something else")).toBe("Launch notes");
    expect(shareTitle("  ", "# From the text\n\nbody")).toBe("From the text");
    expect(shareTitle("", "")).toBe("Untitled");
  });
});

describe("shareDescription", () => {
  it("prefers the front matter description", () => {
    const md = "---\ntitle: T\ndescription: A short summary.\n---\n\n# T\n\nThe first paragraph.";
    expect(shareDescription(md)).toBe("A short summary.");
  });

  it("otherwise takes the first paragraph as plain text", () => {
    const md =
      "# Title\n\nSome **bold** words with a [link](https://x.example) and `code`.\n\nSecond.";
    expect(shareDescription(md)).toBe("Some bold words with a link and code.");
  });

  it("skips headings, lists, quotes, code, tables and images to find prose", () => {
    const md = [
      "# Title",
      "- item",
      "> quote",
      "```ts",
      "const a = 1;",
      "```",
      "| a | b |",
      "![alt](x.png)",
      "",
      "Real text starts here.",
    ].join("\n");
    expect(shareDescription(md)).toBe("Real text starts here.");
  });

  it("cuts long text at a word, with an ellipsis, within 160 characters", () => {
    const md = `# T\n\n${"word ".repeat(80)}`;
    const d = shareDescription(md);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/\s…$/);
  });

  it("falls back to a general line when there is no prose", () => {
    expect(shareDescription("")).toBe(DEFAULT_SHARE_DESCRIPTION);
    expect(shareDescription("# Only a heading")).toBe(DEFAULT_SHARE_DESCRIPTION);
  });

  it("never returns markup", () => {
    const d = shareDescription("# T\n\n<script>alert(1)</script> Hello <b>there</b>");
    expect(d).not.toMatch(/[<>]/);
  });
});

describe("shareDate", () => {
  it("is the same date on the server and in any browser, whatever the time zone", () => {
    expect(shareDate(Date.UTC(2026, 10, 9, 23, 59))).toBe("November 9, 2026");
    expect(shareDate(Date.UTC(2026, 0, 1, 0, 0))).toBe("January 1, 2026");
  });
});
