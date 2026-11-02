/**
 * Maps between blocks in the preview and lines in the editor, using the `data-sl` / `data-el`
 * attributes that `renderMarkdown(..., { sourceLines: true })` puts on each block.
 */

const LINES = "[data-sl]";
const num = (el: Element, name: string) => Number(el.getAttribute(name));

/** The preview block that holds `line` (1-based), the innermost when blocks are nested, or null. */
export function blockAtLine(container: Element, line: number): Element | null {
  let best: Element | null = null;
  let bestSize = Infinity;
  for (const el of container.querySelectorAll(LINES)) {
    const from = num(el, "data-sl");
    const to = num(el, "data-el");
    if (line < from || line > to) continue;
    // an inner block covers fewer lines; on a tie the later one in the document is the inner one
    if (to - from <= bestSize) {
      best = el;
      bestSize = to - from;
    }
  }
  return best;
}

/** The first source line of the innermost block around `target`, or null outside any block. */
export function lineOfTarget(target: Element | null, container: Element): number | null {
  const block = target?.closest(LINES);
  if (!block || block === container || !container.contains(block)) return null;
  return num(block, "data-sl");
}

/**
 * Where each innermost block sits in the preview, in pixels from the top of its scroll container.
 * Only blocks with no other block inside them are used, so none overlap.
 */
export function previewBlocks(
  root: Element,
  scroller: Element,
): { from: number; to: number; top: number; bottom: number }[] {
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const out = [];
  for (const el of root.querySelectorAll(LINES)) {
    if (el.querySelector(LINES)) continue;
    const r = el.getBoundingClientRect();
    out.push({
      from: num(el, "data-sl"),
      to: num(el, "data-el"),
      top: r.top - base,
      bottom: r.bottom - base,
    });
  }
  return out;
}
