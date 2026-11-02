/**
 * KaTeX support. The renderer is loaded on demand: the editor never pays for it until a document
 * actually contains math. The markdown pipeline (markdown.ts) stays synchronous by using the
 * plugin once `ensureMath()` has resolved.
 */
import type { Root as MdRoot } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

type KatexPlugin = typeof import("rehype-katex").default;

let katexPlugin: KatexPlugin | null = null;
let loading: Promise<void> | null = null;

/** Cheap check used to decide whether to load KaTeX; errs on the side of loading. */
export const hasMathSyntax = (md: string) =>
  md.includes("$") || /^\s*(`{3,}|~{3,})\s*math\b/m.test(md);

export const isMathLoaded = () => katexPlugin !== null;
export const getKatexPlugin = () => katexPlugin;

/**
 * Math in untrusted documents: `trust: false` disables \href, \url, \includegraphics and friends,
 * and invalid input renders as an error span instead of throwing.
 */
export const KATEX_OPTIONS = {
  throwOnError: false,
  errorColor: "var(--destructive)",
  trust: false,
  strict: "ignore",
} as const;

function addStylesheet() {
  if (typeof document === "undefined" || document.getElementById("katex-css")) return;
  const link = document.createElement("link");
  link.id = "katex-css";
  link.rel = "stylesheet";
  link.href = "/katex/katex.min.css";
  document.head.append(link);
}

// KaTeX is loaded in the browser only; the server build drops the import (see diagrams.ts).
const importKatex = import.meta.env.SSR
  ? () => Promise.reject(new Error("Math renders in the browser only"))
  : () => import("rehype-katex");

export function ensureMath(): Promise<void> {
  loading ??= importKatex()
    .then((m) => {
      katexPlugin = m.default;
      addStylesheet();
    })
    .catch((error) => {
      loading = null; // allow a retry, e.g. after a dropped connection
      throw error;
    });
  return loading;
}

/**
 * `$5 and $10` is prose, not math. Like GitHub, only keep inline math whose content does not
 * start or end with whitespace and whose closing `$` is not followed by a digit; anything else
 * goes back to being the text it was written as.
 */
export const remarkMathGuard: Plugin<[], MdRoot> = () => (tree, file) => {
  const source = String(file.value);
  visit(tree, (node, index, parent) => {
    if ((node.type as string) !== "inlineMath" || !parent || index === undefined) return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const raw = source.slice(start, end);
    const dollars = /^\$+/.exec(raw)?.[0].length ?? 1;
    const inner = raw.slice(dollars, raw.length - dollars);
    if (/^\s|\s$/.test(inner) || /\d/.test(source[end] ?? "")) {
      parent.children[index] = { type: "text", value: raw };
    }
  });
};

/* ------------------------------ export ------------------------------ */

const toBase64 = (bytes: Uint8Array) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};

/** Embeds the woff2 fonts as data URIs (dropping the woff/ttf fallbacks) so an exported file is self-contained. */
export async function inlineKatexCss(
  css: string,
  readFont: (name: string) => Promise<string>,
): Promise<string> {
  const names = [...new Set([...css.matchAll(/url\(fonts\/([^)]+\.woff2)\)/g)].map((m) => m[1]!))];
  const data = new Map(await Promise.all(names.map(async (n) => [n, await readFont(n)] as const)));
  return css
    .replace(
      /,url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,
      "",
    )
    .replace(
      /url\(fonts\/([^)]+\.woff2)\)/g,
      (_, n: string) => `url(data:font/woff2;base64,${data.get(n)})`,
    );
}

export async function katexCssForExport(
  fetchAsset: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<string> {
  const css = await (await fetchAsset("/katex/katex.min.css")).text();
  return inlineKatexCss(css, async (name) =>
    toBase64(new Uint8Array(await (await fetchAsset(`/katex/fonts/${name}`)).arrayBuffer())),
  );
}
