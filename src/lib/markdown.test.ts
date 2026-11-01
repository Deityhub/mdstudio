import { describe, it, expect } from "vitest";
import {
  renderMarkdown,
  checkPortability,
  finalizeText,
  embedImages,
  splitFrontMatter,
  joinFrontMatter,
  htmlToMarkdown,
  normalizeMarkdown,
} from "./markdown";

describe("portable rendering", () => {
  it("does not turn single newlines into <br>", () => {
    const html = renderMarkdown("line one\nline two");
    expect(html).not.toContain("<br");
  });

  it("does not apply smart quotes", () => {
    expect(renderMarkdown(`"quoted" -- dash`)).toContain("&#x22;quoted&#x22; -- dash".replace(/&#x22;/g, '"'));
  });

  it("strips scripts and event handlers", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))');
    expect(html).not.toMatch(/onerror|<script|javascript:/i);
  });

  it("only renders tables when GFM is on", () => {
    const md = "| a | b |\n| - | - |\n| 1 | 2 |";
    expect(renderMarkdown(md, "github")).toContain("<table>");
    expect(renderMarkdown(md, "commonmark")).not.toContain("<table>");
  });
});

describe("export bytes", () => {
  it("round-trips unchanged when normalize is off", () => {
    const md = "# Title\n\nSome *text* here.\n\n- a\n* b\n";
    expect(finalizeText(md)).toBe(md);
  });

  it("uses LF endings, no BOM and one final newline", () => {
    expect(finalizeText("\uFEFFa\r\nb\n\n\n")).toBe("a\nb\n");
  });

  it("normalizes bullets to dashes", () => {
    expect(normalizeMarkdown("* a\n* b")).toBe("- a\n- b\n");
  });

  it("embeds local images as base64 for self-contained export", () => {
    const out = embedImages("![cat](./images/cat.png) ![web](https://x.com/a.png)", { "cat.png": "data:image/png;base64,AAA" });
    expect(out).toBe("![cat](data:image/png;base64,AAA) ![web](https://x.com/a.png)");
  });
});

describe("front matter", () => {
  it("round-trips", () => {
    const md = joinFrontMatter({ title: "Hello", tags: ["a", "b"] }, "Body\n");
    const { data, body } = splitFrontMatter(md);
    expect(data).toEqual({ title: "Hello", tags: ["a", "b"] });
    expect(body.trim()).toBe("Body");
  });
});

describe("portability checker", () => {
  const rules = (md: string, p: Parameters<typeof checkPortability>[1] = "github") =>
    checkPortability(md, p).map((i) => i.rule);

  it("flags raw HTML", () => expect(rules("<div>hi</div>")).toContain("raw-html"));
  it("flags ==highlight==", () => expect(rules("a ==b== c")).toContain("highlight"));
  it("allows ==highlight== for Obsidian", () => expect(rules("a ==b== c", "obsidian")).not.toContain("highlight"));
  it("flags wiki links", () => expect(rules("see [[Page]]")).toContain("wiki-link"));
  it("flags local images", () => expect(rules("![a](./a.png)")).toContain("local-image"));
  it("flags trailing-space breaks", () => expect(rules("one  \ntwo")).toContain("trailing-break"));
  it("flags mixed bullets", () => expect(rules("- a\n* b")).toContain("mixed-bullets"));
  it("flags GFM tables in strict mode", () => expect(rules("| a | b |\n| --- | --- |", "commonmark")).toContain("gfm-table"));
  it("ignores syntax inside code blocks", () => expect(rules("```md\na ==b==\n```")).not.toContain("highlight"));
});

describe("paste conversion", () => {
  it("converts HTML to Markdown", () => {
    expect(htmlToMarkdown("<h2>Hi</h2><p><strong>bold</strong> <a href='https://a.b'>x</a></p>")).toBe(
      "## Hi\n\n*bold* [x](https://a.b)".replace("*bold*", "**bold**"),
    );
  });
});
