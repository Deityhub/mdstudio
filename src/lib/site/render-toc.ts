// Kept apart from guides-content so the pages that only list guides do not load the Markdown engine.
import { getOutline, renderMarkdown } from "@/lib/markdown/markdown";
import { headingIds, withHeadingIds } from "./guides-content";

/** A page of text (a guide, a legal page) rendered with anchors on its sections, and their list. */
export function renderWithToc(md: string) {
  const sections = getOutline(md).filter((h) => h.depth === 2);
  const ids = headingIds(sections.map((s) => s.text));
  return {
    html: withHeadingIds(renderMarkdown(md, "gfm-extended"), ids),
    toc: sections.map((s, i) => ({ text: s.text, id: ids[i]! })),
  };
}
