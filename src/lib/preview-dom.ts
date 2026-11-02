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
  const key = (n: Node) => (n instanceof Element ? n.outerHTML : (n.textContent ?? ""));

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

  // only the changed middle is replaced; the untouched head and tail keep their live nodes
  const after = current[current.length - tail] ?? null;
  for (const n of current.slice(head, current.length - tail)) n.remove();
  for (const n of next.slice(head, next.length - tail)) container.insertBefore(n, after);
}
