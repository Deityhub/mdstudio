import { inlineDiagrams, renderDiagram, type DiagramRenderer } from "./diagrams";
import { katexCssForExport, ensureMath, hasMathSyntax } from "./math";
import { renderMarkdown, standaloneHtml, supports, type Profile } from "./markdown";

/** Rendered HTML for export or clipboard: math is KaTeX markup, Mermaid blocks are inline SVG. */
export async function renderExportBody(
  md: string,
  profile: Profile,
  images: Record<string, string>,
  render: DiagramRenderer = renderDiagram,
): Promise<{ html: string; math: boolean }> {
  if (supports("math", profile) && hasMathSyntax(md)) await ensureMath();
  let html = renderMarkdown(md, profile, images);
  if (supports("mermaid", profile) && html.includes("language-mermaid"))
    html = await inlineDiagrams(html, render);
  return { html, math: html.includes('class="katex') };
}

/** A self-contained .html file; the KaTeX stylesheet and fonts are embedded only when math is present. */
export async function standaloneDocument(
  title: string,
  md: string,
  profile: Profile,
  images: Record<string, string>,
  options: { render?: DiagramRenderer; fetchAsset?: (url: string) => Promise<Response> } = {},
): Promise<string> {
  const { html, math } = await renderExportBody(md, profile, images, options.render);
  const css = math ? await katexCssForExport(options.fetchAsset) : "";
  return standaloneHtml(title, html, css);
}
