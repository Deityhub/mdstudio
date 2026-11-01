import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import { visit } from "unist-util-visit";
import YAML from "yaml";
import type { Root as MdRoot, Parent as MdParent } from "mdast";
import type { Root as HastRoot, Element } from "hast";

export type Profile = "commonmark" | "github" | "devto" | "obsidian";

export const PROFILES: { id: Profile; label: string; hint: string }[] = [
  { id: "github", label: "GitHub (GFM)", hint: "Tables, task lists, footnotes" },
  { id: "commonmark", label: "Strict CommonMark", hint: "Works everywhere" },
  { id: "devto", label: "dev.to / Hashnode", hint: "GFM, no raw HTML" },
  { id: "obsidian", label: "Obsidian", hint: "GFM + highlights, wiki-links" },
];

const usesGfm = (p: Profile) => p !== "commonmark";

/* ---------------- front matter ---------------- */

export type FrontMatter = Record<string, unknown>;

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontMatter(md: string): {
  data: FrontMatter | null;
  body: string;
  raw: string;
} {
  const m = md.match(FM_RE);
  if (!m) return { data: null, body: md, raw: "" };
  try {
    const data = YAML.parse(m[1] ?? "");
    return {
      data: data && typeof data === "object" ? data : {},
      body: md.slice(m[0].length),
      raw: m[0],
    };
  } catch {
    return { data: null, body: md, raw: "" };
  }
}

export function joinFrontMatter(data: FrontMatter | null, body: string): string {
  const clean = Object.fromEntries(
    Object.entries(data ?? {}).filter(
      ([, v]) => v !== "" && v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0),
    ),
  );
  if (Object.keys(clean).length === 0) return body;
  return `---\n${YAML.stringify(clean).trimEnd()}\n---\n\n${body.replace(/^\n+/, "")}`;
}

/* ---------------- rendering ---------------- */

const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.["src"] ?? []), "data"],
  },
};

export function basename(path: string) {
  return decodeURIComponent(path.split(/[\\/]/).pop() ?? path);
}

function rehypeResolveImages(images: Record<string, string>) {
  return () => (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = String(node.properties?.["src"] ?? "");
      if (!src || /^(https?:|data:)/i.test(src)) return;
      const hit = images[basename(src)];
      if (hit) node.properties["src"] = hit;
    });
  };
}

const ALERT_TITLES: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

/**
 * GitHub alerts (`> [!NOTE]`) and Obsidian callouts, for the two profiles whose platforms render
 * them. Runs after sanitizing, so the classes it adds cannot be injected through raw HTML.
 * GitHub needs the marker alone on the first line; Obsidian also allows a custom title after it.
 */
function rehypeAlerts(profile: Profile) {
  return () => (tree: HastRoot) => {
    if (profile !== "github" && profile !== "obsidian") return;
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "blockquote") return;
      const first = node.children.find((c): c is Element => c.type === "element");
      const text = first?.tagName === "p" ? first.children[0] : undefined;
      if (!first || !text || text.type !== "text") return;
      const m = /^\[!(note|tip|important|warning|caution)\]([^\n]*)\n?/i.exec(text.value);
      if (!m) return;
      const title = (m[2] ?? "").trim();
      if (title && profile !== "obsidian") return;
      const kind = (m[1] ?? "").toLowerCase();
      text.value = text.value.slice(m[0].length);
      if (!text.value) first.children.shift();
      if (!first.children.length) node.children = node.children.filter((c) => c !== first);
      node.properties = { ...node.properties, className: ["md-alert", `md-alert-${kind}`] };
      node.children.unshift({
        type: "element",
        tagName: "p",
        properties: { className: ["md-alert-title"] },
        children: [{ type: "text", value: title || (ALERT_TITLES[kind] ?? kind) }],
      });
    });
  };
}

export function renderMarkdown(
  md: string,
  profile: Profile = "github",
  images: Record<string, string> = {},
): string {
  const p = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);
  if (usesGfm(profile)) p.use(remarkGfm);
  const file = p
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(rehypeAlerts(profile))
    .use(rehypeResolveImages(images))
    .use(rehypeHighlight, { detect: false, ignoreMissing: true } as never)
    .use(rehypeStringify)
    .processSync(md);
  return String(file);
}

function parse(md: string, profile: Profile): MdRoot {
  const p = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);
  if (usesGfm(profile)) p.use(remarkGfm);
  return p.parse(md) as MdRoot;
}

/* ---------------- portability checker ---------------- */

export type Severity = "error" | "warning" | "info";
export type Issue = { line: number; rule: string; message: string; severity: Severity };

function fencedLines(lines: string[]): Set<number> {
  const set = new Set<number>();
  let fence: string | null = null;
  lines.forEach((l, i) => {
    const m = l.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      set.add(i);
      if (m?.[1] && m[1][0] === fence[0] && m[1].length >= fence.length && l.trim() === m[1])
        fence = null;
    } else if (m) {
      fence = m[1] ?? null;
      set.add(i);
    }
  });
  return set;
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;

/** Anything that is not an anchor, protocol-relative or web/mail/phone URL points at a local file. */
const isLocalUrl = (url: string) =>
  url !== "" &&
  !url.startsWith("#") &&
  !url.startsWith("//") &&
  !/^(https?|mailto|tel|sms|ftp):/i.test(url);

/**
 * Pairs raw HTML open/close tags per parent node (block HTML may open at the root and close
 * several paragraphs later; inline HTML pairs inside its paragraph).
 */
function unclosedHtml(tree: MdRoot, report: (line: number, message: string) => void) {
  const walk = (parent: MdParent) => {
    const open: { name: string; line: number }[] = [];
    for (const child of parent.children) {
      if (child.type === "html") {
        const baseLine = child.position?.start.line ?? 1;
        for (const m of child.value.matchAll(TAG_RE)) {
          const [, closing, rawName = "", selfClosing] = m;
          const name = rawName.toLowerCase();
          if (VOID_TAGS.has(name) || selfClosing) continue;
          const line = baseLine + (child.value.slice(0, m.index).match(/\n/g)?.length ?? 0);
          if (!closing) {
            open.push({ name, line });
            continue;
          }
          const at = open.map((o) => o.name).lastIndexOf(name);
          if (at < 0) report(line, `Closing </${name}> has no matching opening tag.`);
          else {
            // tags opened after the match were never closed
            for (const o of open.splice(at).slice(1))
              report(o.line, `<${o.name}> is never closed.`);
          }
        }
      } else if ("children" in child) walk(child as MdParent);
    }
    for (const o of open) report(o.line, `<${o.name}> is never closed.`);
  };
  walk(tree);
}

export function checkPortability(md: string, profile: Profile = "github"): Issue[] {
  const issues: Issue[] = [];
  const lines = md.split(/\r?\n/);
  const inCode = fencedLines(lines);
  const add = (line: number, rule: string, message: string, severity: Severity = "warning") =>
    issues.push({ line, rule, message, severity });

  // AST-based checks
  const tree = parse(md, profile);
  visit(tree, (node) => {
    const line = node.position?.start.line ?? 1;
    if (node.type === "html") {
      const v = (node as { value: string }).value.trim();
      if (!/^<!--[\s\S]*-->$/.test(v))
        add(
          line,
          "raw-html",
          "Raw HTML is stripped or rendered differently on many platforms.",
          profile === "devto" ? "error" : "warning",
        );
    }
    if (node.type === "image") {
      const { url, alt } = node as { url: string; alt?: string | null };
      if (!alt?.trim())
        add(
          line,
          "missing-alt",
          "Image has no alt text. Screen readers and search engines skip it.",
        );
      if (url.startsWith("data:"))
        add(
          line,
          "data-image",
          "Embedded (base64) image: some platforms like GitHub won't display it.",
          "info",
        );
      else if (!/^https?:\/\//i.test(url))
        add(
          line,
          "local-image",
          "Local image path won't load elsewhere. Use the self-contained export or a hosted URL.",
        );
    }
    if (node.type === "blockquote" && profile !== "github" && profile !== "obsidian") {
      const para = (
        node as { children: { type: string; children?: { type: string; value?: string }[] }[] }
      ).children[0];
      const text = para?.type === "paragraph" ? para.children?.[0] : undefined;
      if (
        text?.type === "text" &&
        /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(text.value ?? "")
      )
        add(
          line,
          "alert",
          "GitHub-style alerts show as a plain quote outside GitHub and Obsidian.",
        );
    }
    if (node.type === "link" || node.type === "definition") {
      const url = (node as { url: string }).url;
      if (isLocalUrl(url))
        add(
          line,
          "local-link",
          `Link to a local file (${url}) will break outside this folder. Use a full URL.`,
        );
    }
    if (node.type === "code") {
      const lang = (node as { lang?: string | null }).lang;
      if (
        (node as { position?: unknown }).position &&
        lang === "mermaid" &&
        profile !== "github" &&
        profile !== "obsidian"
      )
        add(line, "mermaid", "Mermaid diagrams only render on GitHub, GitLab and Obsidian.");
    }
  });

  unclosedHtml(tree, (line, message) => add(line, "unclosed-html", message));

  const markers = new Set<string>();
  let firstMarker: string | undefined;
  let mixedAt = 0;
  lines.forEach((l, i) => {
    const n = i + 1;
    if (inCode.has(i)) {
      const m = l.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      // opening fence without language
      if (m && !inCode.has(i - 1))
        add(n, "fence-lang", "Code block has no language, so it won't be highlighted.", "info");
      return;
    }
    if (profile !== "obsidian" && /==[^=\s][^=]*==/.test(l))
      add(n, "highlight", "==highlight== isn't standard Markdown.");
    if (profile !== "obsidian" && /\[\[[^\]]+\]\]/.test(l))
      add(n, "wiki-link", "[[Wiki links]] only work in Obsidian-style tools.");
    if (profile !== "obsidian" && /^\s*\$\$/.test(l))
      add(n, "math", "Math blocks ($$) aren't supported on every platform.");
    if (/^\s*:::/.test(l)) add(n, "container", "Custom ::: containers are not standard Markdown.");
    if (/\S {2,}$/.test(l) && lines[i + 1]?.trim())
      add(
        n,
        "trailing-break",
        "Trailing spaces for line breaks are invisible and often trimmed. Use a backslash (\\) instead.",
      );
    const lm = l.match(/^\s*([-*+])\s+\S/);
    if (lm?.[1] && !/^\s*[-*_](\s*[-*_]){2,}\s*$/.test(l)) {
      markers.add(lm[1]);
      firstMarker ??= lm[1];
      if (lm[1] !== firstMarker && !mixedAt) mixedAt = n;
    }
    if (profile === "commonmark") {
      if (/^\s*\|?.*\|.*\|?\s*$/.test(l) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? ""))
        add(n, "gfm-table", "Tables are a GFM extension, not strict CommonMark.");
      if (/^\s*[-*+]\s+\[[ xX]\]/.test(l)) add(n, "gfm-task", "Task lists are a GFM extension.");
      if (/~~[^~]+~~/.test(l)) add(n, "gfm-strike", "Strikethrough is a GFM extension.");
    }
  });
  if (markers.size > 1)
    add(
      mixedAt,
      "mixed-bullets",
      `Mixed bullet markers (${[...markers].join(" ")}) can split lists. Normalizing on export fixes this.`,
      "info",
    );

  return issues.sort((a, b) => a.line - b.line);
}

/* ---------------- outline & stats ---------------- */

export type Heading = { depth: number; text: string; line: number };

export function getOutline(md: string): Heading[] {
  const out: Heading[] = [];
  visit(parse(md, "github"), "heading", (node) => {
    let text = "";
    visit(node, (c) => {
      if ("value" in c && typeof c.value === "string" && c.type !== "html") text += c.value;
    });
    out.push({
      depth: node.depth,
      text: text.trim() || "(untitled)",
      line: node.position?.start.line ?? 1,
    });
  });
  return out;
}

export function getStats(md: string) {
  const body = splitFrontMatter(md).body.replace(/```[\s\S]*?```/g, " ");
  const words = (body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
  return { words, chars: md.length, minutes: Math.max(1, Math.round(words / 230)) };
}

export function deriveTitle(md: string): string {
  const { data, body } = splitFrontMatter(md);
  const t = data?.["title"];
  if (typeof t === "string" && t.trim()) return t.trim();
  const h = body.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m);
  return h?.[1] ? h[1].replace(/[*_`~[\]]/g, "").trim() : "Untitled";
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

/* ---------------- export ---------------- */

/** Byte-level cleanup that never changes meaning: LF endings, no BOM, single final newline. */
export function finalizeText(md: string) {
  return (
    md
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .replace(/\s*$/, "") + "\n"
  );
}

export function normalizeMarkdown(md: string, profile: Profile = "github"): string {
  const p = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);
  if (usesGfm(profile)) p.use(remarkGfm);
  const out = p
    .use(remarkStringify, {
      bullet: "-",
      fences: true,
      rule: "-",
      emphasis: "_",
      strong: "*",
      listItemIndent: "one",
    })
    .processSync(md);
  return finalizeText(String(out));
}

/** Replace local image references with embedded data URIs from the document's image store. */
export function embedImages(md: string, images: Record<string, string>): string {
  return md.replace(
    /(!\[[^\]]*\]\()(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\))/g,
    (all, pre, url, post) => {
      const clean = url.replace(/^<|>$/g, "");
      if (/^(https?:|data:)/i.test(clean)) return all;
      const hit = images[basename(clean)];
      return hit ? `${pre}${hit}${post}` : all;
    },
  );
}

export function htmlToMarkdown(html: string): string {
  const out = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: "-",
      fences: true,
      emphasis: "_",
      strong: "*",
      listItemIndent: "one",
    })
    .processSync(html);
  return String(out).trim();
}

export function standaloneHtml(title: string, bodyHtml: string) {
  const esc = title.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc}</title>
<style>body{max-width:720px;margin:40px auto;padding:0 20px;font:16px/1.65 system-ui,sans-serif;color:#1f2328}
pre{background:#f6f8fa;padding:14px;border-radius:6px;overflow:auto}code{font-family:ui-monospace,monospace;font-size:.9em}
:not(pre)>code{background:#eff1f3;padding:.15em .35em;border-radius:4px}img{max-width:100%}
table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:6px 12px}
blockquote{margin:0;padding:0 1em;color:#59636e;border-left:.25em solid #d0d7de}
.md-alert{--c:#0969da;color:inherit;border-left-color:var(--c);padding:.25em 1em}.md-alert-title{margin:0 0 .25em;font-weight:600;color:var(--c)}
.md-alert-tip{--c:#1a7f37}.md-alert-important{--c:#8250df}.md-alert-warning{--c:#9a6700}.md-alert-caution{--c:#cf222e}</style>
</head><body>
${bodyHtml}
</body></html>
`;
}
