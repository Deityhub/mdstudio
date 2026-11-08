// Marks the words a comment is about inside the rendered page. A comment keeps the words the reader
// selected (see anchor.ts), so the same words are looked up again in the block and wrapped in
// <mark>. Text inside diagrams and math is skipped, since its markup is not the words on the page.

const SKIP = "svg, .katex";

/** Marks the first place `snippet` appears in `block`; false when it is not there. */
export function highlightSnippet(block: Element, snippet: string, id: string): boolean {
  const want = snippet.replace(/\s+/g, " ").trim();
  if (!want) return false;
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode())
    if (!n.parentElement?.closest(SKIP)) nodes.push(n as Text);

  // the text on one line, with where each of its characters came from
  let text = "";
  const from: { node: number; offset: number }[] = [];
  let space = false;
  nodes.forEach((node, i) => {
    for (let o = 0; o < node.data.length; o++) {
      const ws = /\s/.test(node.data[o]!);
      if (ws && space) continue;
      text += ws ? " " : node.data[o];
      from.push({ node: i, offset: o });
      space = ws;
    }
  });
  const at = text.indexOf(want);
  if (at < 0) return false;
  const start = from[at]!;
  const end = from[at + want.length - 1]!;

  for (let i = end.node; i >= start.node; i--) {
    const node = nodes[i]!;
    const s = i === start.node ? start.offset : 0;
    const e = i === end.node ? end.offset + 1 : node.data.length;
    if (!node.data.slice(s, e).trim()) continue;
    const range = document.createRange();
    range.setStart(node, s);
    range.setEnd(node, e);
    const mark = document.createElement("mark");
    mark.className = "share-hl";
    mark.dataset["comment"] = id;
    range.surroundContents(mark);
  }
  return true;
}

/** Takes every mark away and joins the text back together. */
export function clearHighlights(root: Element) {
  for (const mark of Array.from(root.querySelectorAll("mark[data-comment]")))
    mark.replaceWith(...Array.from(mark.childNodes));
  root.normalize();
}
