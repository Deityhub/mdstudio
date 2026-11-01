import { describe, expect, it } from "vitest";
import { renderExportBody, standaloneDocument } from "./export";

const css = ".katex{font:1em KaTeX_Main}";
const fetchAsset = async (url: string) =>
  new Response(url.endsWith(".css") ? css : new Uint8Array([1, 2, 3]));
const svg = async () => ({ svg: "<svg><title>d</title></svg>" });

describe("export", () => {
  it("renders math to HTML and reports it so the stylesheet can travel with it", async () => {
    const { html, math } = await renderExportBody("Euler $e^{i\\pi}=-1$", "github", {}, svg);
    expect(html).toContain('class="katex"');
    expect(math).toBe(true);
  });

  it("does not claim math for profiles that don't render it", async () => {
    const { html, math } = await renderExportBody("Euler $x^2$", "commonmark", {}, svg);
    expect(html).not.toContain("katex");
    expect(math).toBe(false);
  });

  it("inlines Mermaid diagrams for profiles that render them", async () => {
    const md = "```mermaid\ngraph TD\nA-->B\n```";
    expect((await renderExportBody(md, "github", {}, svg)).html).toContain("md-mermaid");
    expect((await renderExportBody(md, "commonmark", {}, svg)).html).toContain("language-mermaid");
  });

  it("embeds the KaTeX stylesheet only when the document has math", async () => {
    const withMath = await standaloneDocument(
      "T",
      "$x^2$",
      "github",
      {},
      { render: svg, fetchAsset },
    );
    expect(withMath).toContain(css);
    const without = await standaloneDocument(
      "T",
      "plain",
      "github",
      {},
      { render: svg, fetchAsset },
    );
    expect(without).not.toContain(css);
    expect(without).toContain("<!doctype html>");
  });
});
