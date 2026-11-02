/** Structural scanning shared by the editing commands and the cursor context. */

export type Fence = {
  /** The fence characters, e.g. "```". */
  fence: string;
  /** First word of the info string ("" when absent). */
  lang: string;
  openFrom: number;
  /** Offset right after the fence characters (where the info string starts). */
  infoFrom: number;
  openTo: number;
  closeFrom: number | null;
  closeTo: number | null;
  /** End of the block: the closing line, or the end of the document when unclosed. */
  end: number;
};

export function fencedBlocks(text: string): Fence[] {
  const out: Fence[] = [];
  let open: Omit<Fence, "closeFrom" | "closeTo" | "end"> | null = null;
  let pos = 0;
  for (const line of text.split("\n")) {
    const from = pos;
    const to = pos + line.length;
    pos = to + 1;
    if (!open) {
      const m = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
      const fence = m?.[2];
      // a backtick fence cannot have backticks in its info string (that is inline code)
      if (m && fence && !(fence[0] === "`" && (m[3] ?? "").includes("`")))
        open = {
          fence,
          lang: (m[3] ?? "").trim().split(/\s+/)[0] ?? "",
          openFrom: from,
          infoFrom: from + (m[1] ?? "").length + fence.length,
          openTo: to,
        };
    } else {
      const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      const fence = m?.[1];
      if (fence && fence[0] === open.fence[0] && fence.length >= open.fence.length) {
        out.push({ ...open, closeFrom: from, closeTo: to, end: to });
        open = null;
      }
    }
  }
  if (open) out.push({ ...open, closeFrom: null, closeTo: null, end: text.length });
  return out;
}

/** The fenced block that contains the whole selection, if any. */
export function fenceAt(text: string, from: number, to: number): Fence | null {
  return fencedBlocks(text).find((f) => from >= f.openFrom && to <= f.end) ?? null;
}

/* ------------------------------ whole lines ------------------------------ */

/** Whole lines touched by a selection (a selection ending at a line start excludes that line). */
export function wholeLines(text: string, from: number, to: number) {
  const end = to > from && text[to - 1] === "\n" ? to - 1 : to;
  const blockFrom = text.lastIndexOf("\n", from - 1) + 1;
  const nl = text.indexOf("\n", end);
  const blockTo = nl === -1 ? text.length : nl;
  return { blockFrom, blockTo, lines: text.slice(blockFrom, blockTo).split("\n") };
}

/* ------------------------------ GitHub alerts ------------------------------ */

export const ALERT_KINDS = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const ALERT_HEADER = /^ {0,3}>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;

export type QuoteBlock = {
  from: number;
  to: number;
  /** First line of the quote and its end offset. */
  headerTo: number;
  /** Alert kind when the first line is an alert marker, else null (plain quote). */
  kind: AlertKind | null;
  lineCount: number;
};

/** The blockquote (consecutive `>` lines) that contains `pos`, with its alert kind if any. */
export function quoteBlockAt(text: string, pos: number): QuoteBlock | null {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const l of lines) {
    starts.push(offset);
    offset += l.length + 1;
  }
  let caret = 0;
  while (caret + 1 < starts.length && starts[caret + 1]! <= pos) caret++;
  const isQuote = (i: number) => /^ {0,3}>/.test(lines[i] ?? "");
  if (!isQuote(caret)) return null;
  let a = caret;
  while (a > 0 && isQuote(a - 1)) a--;
  let b = caret;
  while (b + 1 < lines.length && isQuote(b + 1)) b++;
  const kind = ALERT_HEADER.exec(lines[a]!)?.[1]?.toUpperCase() as AlertKind | undefined;
  return {
    from: starts[a]!,
    to: starts[b]! + lines[b]!.length,
    headerTo: starts[a]! + lines[a]!.length,
    kind: kind ?? null,
    lineCount: b - a + 1,
  };
}

/* ------------------------------ GFM tables ------------------------------ */

export type Align = "none" | "left" | "center" | "right";

/** Cell segments of a row, as offsets within the line. Escaped pipes (`\|`) do not split. */
export function splitCells(line: string): { start: number; end: number }[] {
  const segs: { start: number; end: number }[] = [];
  let start = /^\s*\|/.exec(line)?.[0].length ?? 0;
  for (let i = start; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "|") {
      segs.push({ start, end: i });
      start = i + 1;
    }
  }
  if (line.slice(start).trim() !== "" || segs.length === 0) segs.push({ start, end: line.length });
  return segs;
}

export const cellText = (line: string, seg: { start: number; end: number }) =>
  line.slice(seg.start, seg.end).trim();

function isDelimiterRow(line: string) {
  if (!line.includes("|")) return false;
  const cells = splitCells(line).map((s) => cellText(line, s));
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

const isRowLine = (l: string) => l.trim() !== "" && l.includes("|");

export type TableBlock = {
  /** Offsets of the whole table (header line start to last row end). */
  from: number;
  to: number;
  lines: { text: string; from: number }[];
  header: string[];
  aligns: Align[];
  /** Body rows, normalised to the header's column count (extra cells are ignored by GFM). */
  rows: string[][];
  /** 0 is the header (and the delimiter row); body rows are 1... */
  row: number;
  col: number;
  /** Caret offset inside the cell's trimmed content. */
  inner: number;
};

export function tableAt(text: string, pos: number): TableBlock | null {
  if (fenceAt(text, pos, pos)) return null;
  const all = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const l of all) {
    starts.push(offset);
    offset += l.length + 1;
  }
  let caret = 0;
  while (caret + 1 < starts.length && starts[caret + 1]! <= pos) caret++;
  if (!isRowLine(all[caret]!)) return null;
  let a = caret;
  while (a > 0 && isRowLine(all[a - 1]!)) a--;
  let b = caret;
  while (b + 1 < all.length && isRowLine(all[b + 1]!)) b++;
  let head = -1;
  for (let d = a + 1; d <= b; d++)
    if (isDelimiterRow(all[d]!) && splitCells(all[d - 1]!).length === splitCells(all[d]!).length) {
      head = d - 1;
      break;
    }
  if (head < 0 || caret < head) return null;

  const lines = all.slice(head, b + 1).map((t, i) => ({ text: t, from: starts[head + i]! }));
  const headSegs = splitCells(lines[0]!.text);
  const cols = headSegs.length;
  const header = headSegs.map((s) => cellText(lines[0]!.text, s));
  const aligns = splitCells(lines[1]!.text).map((s): Align => {
    const c = cellText(lines[1]!.text, s);
    return c.startsWith(":") && c.endsWith(":")
      ? "center"
      : c.startsWith(":")
        ? "left"
        : c.endsWith(":")
          ? "right"
          : "none";
  });
  const rows = lines.slice(2).map((l) => {
    const cells = splitCells(l.text)
      .map((s) => cellText(l.text, s))
      .slice(0, cols);
    while (cells.length < cols) cells.push("");
    return cells;
  });

  const lineIdx = caret - head;
  const line = lines[lineIdx]!;
  const segs = splitCells(line.text);
  const offsetInLine = pos - line.from;
  let col = segs.findIndex((s) => offsetInLine <= s.end);
  if (col < 0) col = segs.length - 1;
  col = Math.min(col, cols - 1);
  const seg = segs[col]!;
  const raw = line.text.slice(seg.start, seg.end);
  const contentStart = seg.start + (raw.length - raw.trimStart().length);
  const inner = Math.max(0, Math.min(offsetInLine - contentStart, raw.trim().length));
  return {
    from: lines[0]!.from,
    to: lines[lines.length - 1]!.from + lines[lines.length - 1]!.text.length,
    lines,
    header,
    aligns,
    rows,
    row: lineIdx <= 1 ? 0 : lineIdx - 1,
    col,
    inner,
  };
}

export const isInTable = (text: string, pos: number) => tableAt(text, pos) !== null;
