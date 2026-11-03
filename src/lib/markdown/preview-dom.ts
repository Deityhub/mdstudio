// data-active marks the block the editor cursor is in (see Studio); it comes and goes without a re-render
const LINE_ATTRS = / data-(?:sl|el)="\d+"| data-active=""/g;

/** Copies the source-line attributes from `from` (and every block inside it) onto `to`, which has the same shape. */
function copyLines(from: Node, to: Node) {
  if (!(from instanceof Element) || !(to instanceof Element)) return;
  const a = [from, ...from.querySelectorAll("[data-sl]")];
  const b = [to, ...to.querySelectorAll("[data-sl]")];
  a.forEach((el, i) => {
    const target = b[i];
    for (const name of ["data-sl", "data-el"]) {
      const v = el.getAttribute(name);
      if (target && v !== null && target.getAttribute(name) !== v) target.setAttribute(name, v);
    }
  });
}

/**
 * Updates the preview by replacing only the blocks that changed, so everything else stays the same
 * live DOM: images don't reload, rendered diagrams and math don't blink, text selection and scroll
 * position survive. The HTML is the sanitized string from renderMarkdown; it is only ever parsed
 * inert (a <template>) and then moved into place.
 */
export function patchHtml(container: HTMLElement, html: string): void {
  const template = container.ownerDocument.createElement("template");
  template.innerHTML = html;
  const next = [...template.content.childNodes];
  const current = [...container.childNodes];
  // The source-line numbers are left out of the comparison: adding a line above moves every
  // block's numbers but not its content, and that must not replace (and so reload) the block.
  const key = (n: Node) =>
    n instanceof Element ? n.outerHTML.replace(LINE_ATTRS, "") : (n.textContent ?? "");

  let head = 0;
  while (head < next.length && head < current.length && key(next[head]!) === key(current[head]!))
    head++;
  let tail = 0;
  while (
    tail < next.length - head &&
    tail < current.length - head &&
    key(next[next.length - 1 - tail]!) === key(current[current.length - 1 - tail]!)
  )
    tail++;

  // the untouched blocks keep their live nodes, with their line numbers brought up to date
  for (let i = 0; i < head; i++) copyLines(next[i]!, current[i]!);
  for (let t = 1; t <= tail; t++) copyLines(next[next.length - t]!, current[current.length - t]!);

  // only the changed middle is replaced
  const after = current[current.length - tail] ?? null;
  for (const n of current.slice(head, current.length - tail)) n.remove();
  for (const n of next.slice(head, next.length - tail)) container.insertBefore(n, after);
}
