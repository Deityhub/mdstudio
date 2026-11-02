import { beforeAll, describe, it, expect } from "vitest";
import { ensureMath } from "./math";
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
    expect(renderMarkdown(`"quoted" -- dash`)).toContain(
      "&#x22;quoted&#x22; -- dash".replace(/&#x22;/g, '"'),
    );
  });

  it("strips scripts and event handlers", () => {
    const html = renderMarkdown(
      '<img src="x" onerror="alert(1)">\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))',
    );
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
    const out = embedImages("![cat](./images/cat.png) ![web](https://x.com/a.png)", {
      "cat.png": "data:image/png;base64,AAA",
    });
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
  it("allows ==highlight== for Obsidian", () =>
    expect(rules("a ==b== c", "obsidian")).not.toContain("highlight"));
  it("flags wiki links", () => expect(rules("see [[Page]]")).toContain("wiki-link"));
  it("flags local images", () => expect(rules("![a](./a.png)")).toContain("local-image"));
  it("flags trailing-space breaks", () => expect(rules("one  \ntwo")).toContain("trailing-break"));
  it("flags mixed bullets", () => expect(rules("- a\n* b")).toContain("mixed-bullets"));
  it("flags GFM tables in strict mode", () =>
    expect(rules("| a | b |\n| --- | --- |", "commonmark")).toContain("gfm-table"));
  it("ignores syntax inside code blocks", () =>
    expect(rules("```md\na ==b==\n```")).not.toContain("highlight"));
});

describe("portability checker locations", () => {
  const find = (md: string, rule: string, p: Parameters<typeof checkPortability>[1] = "github") =>
    checkPortability(md, p).filter((i) => i.rule === rule);

  it("points mixed-bullets at the first line that breaks the pattern", () => {
    const issues = find("intro\n\n- a\n- b\n\ntext\n\n* c\n", "mixed-bullets");
    expect(issues.map((i) => i.line)).toEqual([8]);
  });

  it("flags local file links but not web, mail or anchor links", () => {
    const md = [
      "[a](./a.md)",
      "[b](../b.md)",
      "[c](/docs/c)",
      "[d](file:///tmp/d.md)",
      "[e](https://x.com)",
      "[f](mailto:a@b.co)",
      "[g](#section)",
      "[h](tel:+123)",
      "[i]: ./ref.md",
    ].join("\n\n");
    const lines = find(md, "local-link").map((i) => i.line);
    expect(lines).toEqual([1, 3, 5, 7, 17]);
  });

  it("flags images without alt text on the line they appear", () => {
    const md =
      "![](https://x.com/a.png)\n\n![A cat](https://x.com/b.png)\n\n![ ](https://x.com/c.png)";
    expect(find(md, "missing-alt").map((i) => i.line)).toEqual([1, 5]);
  });

  it("does not report links inside code", () =>
    expect(find("`[a](./a.md)`\n\n```\n[a](./a.md)\n```", "local-link")).toEqual([]));

  it("flags an unclosed block tag at the line it was opened", () => {
    const issues = find("text\n\n<div>\n\nmore text\n", "unclosed-html");
    expect(issues.map((i) => i.line)).toEqual([3]);
    expect(issues[0]?.message).toContain("<div>");
  });

  it("flags an unclosed inline tag and a stray closing tag", () => {
    expect(find("a <b>bold and more", "unclosed-html").map((i) => i.line)).toEqual([1]);
    expect(find("a </span> b", "unclosed-html").map((i) => i.line)).toEqual([1]);
  });

  it("accepts balanced, void and self-closing HTML", () => {
    const md = '<div>\n\ntext\n\n</div>\n\nline<br>break and <img src="x"> and <b>ok</b> <hr/>';
    expect(find(md, "unclosed-html")).toEqual([]);
  });
});

describe("alerts", () => {
  const md = "> [!NOTE]\n> Useful info";
  it("renders GitHub alerts as styled alerts for GitHub and Obsidian", () => {
    for (const profile of ["github", "obsidian"] as const) {
      const html = renderMarkdown(md, profile);
      expect(html).toContain('class="md-alert md-alert-note"');
      expect(html).toContain('<p class="md-alert-title">Note</p>');
      expect(html).toContain("Useful info");
      expect(html).not.toContain("[!NOTE]");
    }
  });
  it("leaves them as plain quotes where the platform does not render them", () => {
    for (const profile of ["commonmark", "devto"] as const) {
      const html = renderMarkdown(md, profile);
      expect(html).not.toContain("md-alert");
      expect(html).toContain("[!NOTE]");
    }
  });
  it("needs the marker alone on the first line for GitHub, but Obsidian allows a title", () => {
    expect(renderMarkdown("> [!NOTE] inline text", "github")).not.toContain("md-alert");
    const html = renderMarkdown("> [!tip] Custom title\n> body", "obsidian");
    expect(html).toContain("md-alert-tip");
    expect(html).toContain('<p class="md-alert-title">Custom title</p>');
  });
  it("keeps content after the marker and leaves ordinary quotes alone", () => {
    expect(renderMarkdown("> [!WARNING]\n> one\n>\n> two", "github")).toContain("two");
    expect(renderMarkdown("> just a quote", "github")).not.toContain("md-alert");
  });
  it("cannot be spoofed with raw HTML classes", () =>
    expect(
      renderMarkdown('<blockquote class="md-alert md-alert-note">x</blockquote>', "github"),
    ).not.toContain("md-alert"));
  it("is flagged by the checker outside GitHub and Obsidian", () => {
    const rule = (p: Parameters<typeof checkPortability>[1]) =>
      checkPortability(md, p).map((i) => i.rule);
    expect(rule("commonmark")).toContain("alert");
    expect(rule("devto")).toContain("alert");
    expect(rule("github")).not.toContain("alert");
    expect(rule("obsidian")).not.toContain("alert");
  });
});

describe("math", () => {
  beforeAll(async () => {
    await ensureMath();
  });
  const html = (md: string, p: Parameters<typeof renderMarkdown>[1] = "github") =>
    renderMarkdown(md, p);

  it("renders inline and display math with KaTeX for GitHub and Obsidian", () => {
    for (const profile of ["github", "obsidian"] as const) {
      expect(html("Euler: $e^{i\\pi}+1=0$.", profile)).toContain('class="katex"');
      expect(html("$$\nx^2\n$$", profile)).toContain("katex-display");
      expect(html("```math\nx^2\n```", profile)).toContain("katex-display");
    }
  });
  it("leaves the source alone where the platform does not render math", () => {
    for (const profile of ["commonmark", "devto"] as const) {
      const out = html("Euler: $e^{i\\pi}$.", profile);
      expect(out).not.toContain("katex");
      expect(out).toContain("$e^{i");
    }
  });
  it("does not mistake currency for math", () => {
    expect(html("It costs $5 and $10 today.")).not.toContain("katex");
    expect(html("It costs $5 and $10 today.")).toContain("$5 and $10");
    expect(html("From $5-$10.")).not.toContain("katex");
    expect(html("a $ b $ c")).not.toContain("katex");
    expect(html("escaped \\$5 and \\$6")).not.toContain("katex");
  });
  it("keeps KaTeX from producing links or scripts", () => {
    const out = html("$\\href{javascript:alert(1)}{click}$");
    expect(out).not.toMatch(/href=|<a /i);
    expect(html("$a$\n\n<script>alert(1)</script>")).not.toContain("<script");
  });
  it("shows invalid math as an error instead of throwing", () => {
    expect(() => html("$\\frac{1$")).not.toThrow();
    expect(html("$\\frac{1$")).toContain("katex-error");
  });
  it("is flagged by the checker outside the profiles that render it, ignoring code and currency", () => {
    const rule = (md: string, p: Parameters<typeof checkPortability>[1]) =>
      checkPortability(md, p).some((i) => i.rule === "math");
    for (const p of ["commonmark", "devto"] as const) {
      expect(rule("so $x^2$ here", p)).toBe(true);
      expect(rule("$$\nx\n$$", p)).toBe(true);
      expect(rule("costs $5 and $10", p)).toBe(false);
      expect(rule("code `$x$` here", p)).toBe(false);
      expect(rule("```\n$x$\n```", p)).toBe(false);
    }
    expect(rule("so $x^2$ here", "github")).toBe(false);
    expect(rule("so $x^2$ here", "obsidian")).toBe(false);
  });
});

describe("highlights", () => {
  const html = (md: string, p: Parameters<typeof renderMarkdown>[1] = "obsidian") =>
    renderMarkdown(md, p);

  it("renders ==text== as <mark> for Obsidian", () => {
    expect(html("a ==b== c")).toContain("a <mark>b</mark> c");
    expect(html("==one== and ==two==")).toBe("<p><mark>one</mark> and <mark>two</mark></p>");
    expect(html("# Title with ==mark==")).toContain("<mark>mark</mark>");
    expect(html("- item ==x==")).toContain("<mark>x</mark>");
  });
  it("leaves the text alone for platforms that don't render it", () => {
    for (const p of ["github", "commonmark", "devto"] as const) {
      expect(html("a ==b== c", p)).toContain("==b==");
      expect(html("a ==b== c", p)).not.toContain("<mark");
    }
  });
  it("ignores code and things that are not highlights", () => {
    expect(html("`==x==`")).not.toContain("<mark");
    expect(html("```\n==x==\n```")).not.toContain("<mark");
    expect(html("a == b ==")).not.toContain("<mark");
    expect(html("==unclosed")).not.toContain("<mark");
    expect(html("a ==\n== b")).not.toContain("<mark");
  });
  it("does not let raw HTML through", () =>
    expect(html("<mark>x</mark> and ==y==")).toBe("<p>x and <mark>y</mark></p>"));
});

describe("paste conversion", () => {
  it("converts HTML to Markdown", () => {
    expect(
      htmlToMarkdown("<h2>Hi</h2><p><strong>bold</strong> <a href='https://a.b'>x</a></p>"),
    ).toBe("## Hi\n\n*bold* [x](https://a.b)".replace("*bold*", "**bold**"));
  });
});
