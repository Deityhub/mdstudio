/**
 * Mermaid diagrams. Mermaid is large, so it is loaded only when a document has a diagram, and it
 * runs with `securityLevel: "strict"` (it sanitizes the SVG it produces). Diagrams exist in the
 * preview and in exports only; the Markdown text is never changed.
 *
 * Re-rendering stays smooth because the preview never shows a diagram's source while typing:
 * a known diagram is swapped in immediately, and while a changed one renders, the previous
 * diagram stays on screen (marked stale) until the new one is ready.
 */

export type DiagramResult = { svg: string } | { error: string };
export type DiagramRenderer = (source: string) => DiagramResult | Promise<DiagramResult>;

const SELECTOR = "pre > code.language-mermaid";
const CACHE_LIMIT = 50;

type Mermaid = typeof import("mermaid").default;
let mermaid: Promise<Mermaid> | null = null;
let counter = 0;
const cache = new Map<string, DiagramResult>();
const inflight = new Map<string, Promise<DiagramResult>>();
/** What was last shown at each position in the document (a diagram or an error), kept on screen while a changed one renders. */
const lastShown: DiagramResult[] = [];

function loadMermaid() {
  mermaid ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    });
    return m.default;
  });
  return mermaid;
}

/** Mermaid errors are multi-line; the first line says where, the last says what was expected. */
export function describeDiagramError(error: unknown): string {
  const lines = (error instanceof Error ? error.message : String(error))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const text =
    lines.length > 1 ? `${lines[0]} ${lines[lines.length - 1]}` : (lines[0] ?? "Invalid diagram");
  return text.slice(0, 240);
}

export function rememberDiagram(source: string, result: DiagramResult) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(source, result);
}

/** For tests. */
export function resetDiagramState() {
  cache.clear();
  inflight.clear();
  lastShown.length = 0;
}

/** Returns a cached result synchronously, so an unchanged diagram never flickers while typing. */
export const renderDiagram: DiagramRenderer = (source) => {
  const hit = cache.get(source);
  if (hit) return hit;
  const running = inflight.get(source);
  if (running) return running;
  const job = (async (): Promise<DiagramResult> => {
    const id = `mmd-${counter++}`;
    let result: DiagramResult;
    try {
      const m = await loadMermaid();
      await m.parse(source); // throws a readable message for invalid input
      result = { svg: (await m.render(id, source)).svg };
    } catch (error) {
      result = { error: describeDiagramError(error) };
    } finally {
      document.getElementById(`d${id}`)?.remove(); // Mermaid can leave a scratch node behind
    }
    rememberDiagram(source, result);
    inflight.delete(source);
    return result;
  })();
  inflight.set(source, job);
  return job;
};

/* ------------------------------ markup ------------------------------ */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const figureHtml = (svg: string) =>
  `<div class="md-mermaid" role="img" aria-label="Diagram">${svg}</div>`;

const staleHtml = (svg: string, source: string) =>
  `<div class="md-mermaid md-mermaid-stale" role="img" aria-label="Diagram" aria-busy="true" data-source="${esc(source)}">${svg}</div>`;

/** `pending` marks an error carried over from the previous render, to be replaced once the new one is known. */
const failedHtml = (source: string, error: string, pending = false) =>
  `<div class="md-mermaid-failed${pending ? " md-mermaid-pending" : ""}" data-source="${esc(source)}">` +
  `<pre><code class="language-mermaid">${esc(source)}</code></pre>` +
  `<p class="md-mermaid-error" role="alert">Diagram error: ${esc(error)}</p></div>`;

/** Parses markup the same way the preview patcher does, so equal markup gives equal nodes. */
const nodeFrom = (doc: Document, html: string) => {
  const t = doc.createElement("template");
  t.innerHTML = html;
  return t.content.firstElementChild!;
};

/**
 * Before the preview is patched: put known diagrams straight into the HTML, and a stale copy of
 * the previous diagram where a changed one is still rendering. Only a brand-new diagram starts
 * out as its code block.
 */
export function withCachedDiagrams(html: string): string {
  if (!html.includes("language-mermaid")) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  let position = 0;
  for (const code of doc.querySelectorAll(SELECTOR)) {
    const pre = code.parentElement!;
    const source = code.textContent ?? "";
    const known = cache.get(source);
    const previous = lastShown[position];
    if (known) {
      lastShown[position] = known;
      pre.replaceWith(
        nodeFrom(doc, "svg" in known ? figureHtml(known.svg) : failedHtml(source, known.error)),
      );
    } else if (previous) {
      pre.replaceWith(
        nodeFrom(
          doc,
          "svg" in previous
            ? staleHtml(previous.svg, source)
            : failedHtml(source, previous.error, true),
        ),
      );
    }
    position++;
  }
  return doc.body.innerHTML;
}

/**
 * After the preview is patched: render whatever is still pending (new diagrams as code blocks,
 * changed ones as stale figures or pending errors) and swap the result in. A failed diagram becomes its code plus
 * the error, and is left alone until its source changes.
 */
export async function hydrateDiagrams(root: HTMLElement, render: DiagramRenderer = renderDiagram) {
  const doc = root.ownerDocument;
  const units = [
    ...root.querySelectorAll<HTMLElement>(`${SELECTOR}, .md-mermaid, .md-mermaid-failed`),
  ]
    .filter((el) => !(el.matches("code") && el.closest(".md-mermaid-failed")))
    .map((el) => (el.matches("code") ? el.parentElement! : el));

  for (let position = 0; position < units.length; position++) {
    const unit = units[position]!;
    const carriesSource =
      unit.classList.contains("md-mermaid-stale") || unit.classList.contains("md-mermaid-pending");
    const isCode = unit.tagName === "PRE";
    if (!carriesSource && !isCode) continue; // settled: a finished diagram or a settled failure
    const source = carriesSource ? (unit.dataset["source"] ?? "") : (unit.textContent ?? "");
    const pending = render(source);
    // no await when the answer is already known, so cached diagrams are swapped in immediately
    const result = pending instanceof Promise ? await pending : pending;
    if (!unit.isConnected) continue; // the preview was patched while we waited
    lastShown[position] = result;
    unit.replaceWith(
      nodeFrom(doc, "svg" in result ? figureHtml(result.svg) : failedHtml(source, result.error)),
    );
  }
}

/** Export: the same replacement on an HTML string. Invalid diagrams stay as code blocks. */
export async function inlineDiagrams(html: string, render: DiagramRenderer = renderDiagram) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const code of doc.querySelectorAll<HTMLElement>(SELECTOR)) {
    const result = await render(code.textContent ?? "");
    if ("svg" in result) code.parentElement!.replaceWith(nodeFrom(doc, figureHtml(result.svg)));
  }
  return doc.body.innerHTML;
}
