/**
 * Pure commands that insert Markdown constructs (links, images, footnotes, rules, code blocks).
 * Same contract as `editing.ts`: text and selection in, changes and the selection to restore out.
 */
import { ALERT_KINDS, fenceAt, quoteBlockAt, wholeLines, type AlertKind } from "./blocks";

export { ALERT_KINDS, type AlertKind };
import { mapPos, type Change, type Edit, type Snapshot } from "./editing";

export const CODE_LANGUAGES: { id: string; label: string }[] = [
  { id: "bash", label: "Bash" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "css", label: "CSS" },
  { id: "diff", label: "Diff" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "go", label: "Go" },
  { id: "graphql", label: "GraphQL" },
  { id: "html", label: "HTML" },
  { id: "java", label: "Java" },
  { id: "js", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "jsx", label: "JSX" },
  { id: "kotlin", label: "Kotlin" },
  { id: "markdown", label: "Markdown" },
  { id: "php", label: "PHP" },
  { id: "python", label: "Python" },
  { id: "ruby", label: "Ruby" },
  { id: "rust", label: "Rust" },
  { id: "sql", label: "SQL" },
  { id: "swift", label: "Swift" },
  { id: "toml", label: "TOML" },
  { id: "ts", label: "TypeScript" },
  { id: "tsx", label: "TSX" },
  { id: "yaml", label: "YAML" },
];

/* ------------------------------ shared helpers ------------------------------ */

/**
 * Inserts a block after the selection, separated from its neighbours by blank lines (a rule
 * directly under text would otherwise turn that text into a setext heading).
 * `select` places the selection inside the block; by default the caret goes after it.
 */
export function insertBlock(
  { text, to }: Snapshot,
  block: string,
  select?: { from: number; to: number },
): Edit {
  const before = text.slice(0, to);
  const after = text.slice(to);
  const lead =
    before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail =
    after === "" ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const start = to + lead.length;
  return {
    changes: [{ from: to, to, insert: lead + block + trail }],
    from: select ? start + select.from : start + block.length + trail.length,
    to: select ? start + select.to : start + block.length + trail.length,
  };
}

const escapeBrackets = (s: string) => s.replace(/[[\]]/g, "\\$&");

function formatDestination(url: string) {
  const u = url.trim();
  return /[\s()<>]/.test(u) ? `<${u.replace(/</g, "%3C").replace(/>/g, "%3E")}>` : u;
}

const formatTitle = (title?: string) =>
  title?.trim() ? ` "${title.trim().replace(/["\\]/g, "\\$&")}"` : "";

/* ------------------------------ links and images ------------------------------ */

export type LinkValues = { url: string; text?: string; title?: string };
export type FoundLink = { from: number; to: number; text: string; url: string; title: string };

const LINK_RE =
  /\[((?:[^[\]\\\n]|\\.)*)\]\((<[^<>\n]*>|[^\s()<>]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)/g;

/** The inline link under the caret (images are skipped), so the dialog can edit it. */
export function findLinkAt({ text, from, to }: Snapshot): FoundLink | null {
  const lineFrom = text.lastIndexOf("\n", from - 1) + 1;
  const nl = text.indexOf("\n", from);
  const line = text.slice(lineFrom, nl === -1 ? text.length : nl);
  const rx = new RegExp(LINK_RE.source, "g");
  for (let m = rx.exec(line); m; m = rx.exec(line)) {
    const start = lineFrom + m.index;
    const end = start + m[0].length;
    if (text[start - 1] === "!") continue;
    if (from >= start && to <= end) {
      const dest = m[2] ?? "";
      return {
        from: start,
        to: end,
        text: m[1] ?? "",
        url: dest.startsWith("<") ? dest.slice(1, -1) : dest,
        title: (m[3] ?? "").replace(/\\(["\\])/g, "$1"),
      };
    }
  }
  return null;
}

export function insertLink(
  snap: Snapshot,
  values: LinkValues,
  replace?: { from: number; to: number },
): Edit {
  const range = replace ?? { from: snap.from, to: snap.to };
  const selected = replace || range.from === range.to ? "" : snap.text.slice(range.from, range.to);
  const label = values.text?.trim()
    ? escapeBrackets(values.text.trim())
    : selected || values.url.trim();
  const insert = `[${label}](${formatDestination(values.url)}${formatTitle(values.title)})`;
  const end = range.from + insert.length;
  return { changes: [{ from: range.from, to: range.to, insert }], from: end, to: end };
}

export type ImageValues = { alt: string; url: string; title?: string };

/** Null without alt text: images must be described. */
export function insertImage(snap: Snapshot, values: ImageValues): Edit | null {
  const alt = values.alt.trim();
  if (!alt || !values.url.trim()) return null;
  const insert = `![${escapeBrackets(alt)}](${formatDestination(values.url)}${formatTitle(values.title)})`;
  const end = snap.from + insert.length;
  return { changes: [{ from: snap.from, to: snap.to, insert }], from: end, to: end };
}

/* ------------------------------ footnote and rule ------------------------------ */

/** Adds `[^n]` at the caret and a `[^n]: ` definition at the end, with the caret in the definition. */
export function insertFootnote({ text, to }: Snapshot): Edit {
  const labels = [...text.matchAll(/^\[\^([^\]\s]+)\]:/gm)].map((m) => m[1] ?? "");
  const next = Math.max(0, ...labels.filter((l) => /^\d+$/.test(l)).map(Number)) + 1;
  const ref = `[^${next}]`;
  const def = `[^${next}]: `;
  const trimEnd = text.replace(/\s+$/, "").length;
  const lastLine = text.slice(0, trimEnd).split("\n").pop() ?? "";
  const sep = trimEnd === 0 ? "" : /^\[\^[^\]\s]+\]:/.test(lastLine) ? "\n" : "\n\n";
  const tail = sep + def;
  if (to >= trimEnd) {
    const at = trimEnd;
    const caret = at + ref.length + tail.length;
    return { changes: [{ from: at, to: text.length, insert: ref + tail }], from: caret, to: caret };
  }
  const caret = trimEnd + ref.length + tail.length;
  return {
    changes: [
      { from: to, to, insert: ref },
      { from: trimEnd, to: text.length, insert: tail },
    ],
    from: caret,
    to: caret,
  };
}

export const insertRule = (snap: Snapshot): Edit => insertBlock(snap, "---");

/* ------------------------------ code blocks ------------------------------ */

/**
 * Inside a fenced block: same language removes the fence, another language switches it.
 * Outside: fences the selected lines (or the caret's line), or inserts an empty block on a blank line.
 */
export function codeBlock(snap: Snapshot, lang: string): Edit | null {
  const { text, from, to } = snap;
  const fence = fenceAt(text, from, to);
  if (fence) {
    const changes: Change[] =
      fence.lang === lang
        ? fence.closeFrom === null
          ? [{ from: fence.openFrom, to: fence.openTo + 1, insert: "" }]
          : fence.closeFrom === fence.openTo + 1
            ? [{ from: fence.openFrom, to: fence.closeTo!, insert: "" }]
            : [
                { from: fence.openFrom, to: fence.openTo + 1, insert: "" },
                { from: fence.closeFrom - 1, to: fence.closeTo!, insert: "" },
              ]
        : [{ from: fence.infoFrom, to: fence.openTo, insert: lang }];
    return { changes, from: mapPos(changes, from, 1), to: mapPos(changes, to, -1) };
  }
  const { blockFrom, blockTo, lines } = wholeLines(text, from, to);
  const content = lines.join("\n");
  if (content.trim() === "") {
    const f = "```";
    return insertBlock(snap, `${f}${lang}\n\n${f}`, {
      from: f.length + lang.length + 1,
      to: f.length + lang.length + 1,
    });
  }
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((r) => r.length));
  const f = "`".repeat(Math.max(3, longest + 1));
  const open = `${f}${lang}\n`;
  const shift = blockFrom + open.length - blockFrom;
  return {
    changes: [{ from: blockFrom, to: blockTo, insert: `${open}${content}\n${f}` }],
    from: from + shift,
    to: to + shift,
  };
}

/* ------------------------------ GitHub alerts ------------------------------ */

/**
 * `> [!KIND]` blockquote. Inside an alert: another kind switches it, the same kind removes the
 * marker (leaving a plain quote). In a plain quote it adds the marker. Elsewhere it quotes the
 * selected lines (or the caret's line), or inserts an empty alert on a blank line.
 */
export function insertAlert(snap: Snapshot, kind: AlertKind): Edit {
  const { text, from, to } = snap;
  const quote = quoteBlockAt(text, from);
  if (quote) {
    const first = quote.from;
    const header = `> [!${kind}]`;
    const changes: Change[] =
      quote.kind === kind
        ? quote.lineCount === 1
          ? [{ from: first, to: quote.headerTo, insert: "> " }]
          : [{ from: first, to: quote.headerTo + 1, insert: "" }]
        : quote.kind
          ? [{ from: first, to: quote.headerTo, insert: header }]
          : [{ from: first, to: first, insert: header + "\n" }];
    return { changes, from: mapPos(changes, from, 1), to: mapPos(changes, to, -1) };
  }
  const { blockFrom, blockTo, lines } = wholeLines(text, from, to);
  if (lines.join("").trim() === "") {
    const body = `> [!${kind}]\n> `;
    return insertBlock(snap, body, { from: body.length, to: body.length });
  }
  const header = `> [!${kind}]\n`;
  const quoted = lines.map((l) => (l.trim() ? `> ${l}` : ">"));
  // every line gains a prefix, so a position moves by the prefixes up to and including its line
  const map = (pos: number) => {
    let at = blockFrom;
    let shift = header.length;
    for (let i = 0; i < lines.length; i++) {
      shift += quoted[i]!.length - lines[i]!.length;
      if (pos <= at + lines[i]!.length) return pos + shift;
      at += lines[i]!.length + 1;
    }
    return pos + shift;
  };
  return {
    changes: [{ from: blockFrom, to: blockTo, insert: header + quoted.join("\n") }],
    from: map(from),
    to: map(to),
  };
}

/* ------------------------------ math, diagrams, HTML ------------------------------ */

/** `$$` fences around the selected lines (or the caret's line); an empty block on a blank line. */
export function insertMathBlock(snap: Snapshot): Edit {
  const { text, from, to } = snap;
  const { blockFrom, blockTo, lines } = wholeLines(text, from, to);
  const content = lines.join("\n");
  if (content.trim() === "") return insertBlock(snap, "$$\n\n$$", { from: 3, to: 3 });
  const shift = "$$\n".length;
  return {
    changes: [{ from: blockFrom, to: blockTo, insert: `$$\n${content}\n$$` }],
    from: from + shift,
    to: to + shift,
  };
}

export const MERMAID_TEMPLATES: { id: string; label: string; code: string }[] = [
  {
    id: "flowchart",
    label: "Flowchart",
    code: "graph TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Do it]\n  B -->|No| D[Skip it]",
  },
  {
    id: "sequence",
    label: "Sequence diagram",
    code: "sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello\n  B-->>A: Hi",
  },
  {
    id: "class",
    label: "Class diagram",
    code: "classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog",
  },
  {
    id: "state",
    label: "State diagram",
    code: "stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review\n  Review --> Published\n  Published --> [*]",
  },
  {
    id: "er",
    label: "Entity relationship",
    code: "erDiagram\n  USER ||--o{ POST : writes\n  POST {\n    string title\n  }",
  },
  {
    id: "gantt",
    label: "Gantt chart",
    code: "gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Work\n  Write :a1, 2026-01-01, 7d",
  },
  { id: "pie", label: "Pie chart", code: 'pie title Share\n  "A" : 60\n  "B" : 40' },
];

/** A Mermaid code block with the starter code selected, ready to overwrite. */
export function insertMermaid(snap: Snapshot, id: string): Edit | null {
  const template = MERMAID_TEMPLATES.find((t) => t.id === id);
  if (!template) return null;
  const open = "```mermaid\n";
  return insertBlock(snap, `${open}${template.code}\n\`\`\``, {
    from: open.length,
    to: open.length + template.code.length,
  });
}

/** Wraps the selection in `<tag>…</tag>`, or removes the tag when it is already there. */
export function wrapTag({ text, from, to }: Snapshot, tag: string): Edit {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  if (from === to) {
    const insert = `${open}text${close}`;
    return {
      changes: [{ from, to, insert }],
      from: from + open.length,
      to: from + open.length + 4,
    };
  }
  const selected = text.slice(from, to);
  const changes: Change[] =
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length > open.length + close.length
      ? [
          { from, to: from + open.length, insert: "" },
          { from: to - close.length, to, insert: "" },
        ]
      : text.slice(from - open.length, from) === open && text.slice(to, to + close.length) === close
        ? [
            { from: from - open.length, to: from, insert: "" },
            { from: to, to: to + close.length, insert: "" },
          ]
        : [
            { from, to: from, insert: open },
            { from: to, to, insert: close },
          ];
  return { changes, from: mapPos(changes, from, 1), to: mapPos(changes, to, -1) };
}

/** A collapsible `<details>` block with the summary selected. */
export function insertDetails(snap: Snapshot): Edit {
  const lead = "<details>\n<summary>";
  return insertBlock(snap, `${lead}Summary</summary>\n\nContent\n\n</details>`, {
    from: lead.length,
    to: lead.length + "Summary".length,
  });
}
