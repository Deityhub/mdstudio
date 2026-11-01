/**
 * Pure Markdown editing commands (toolbar and shortcuts).
 *
 * Every command takes the document text plus the selection and returns the text changes and the
 * selection to restore, or null when the command would do nothing. Nothing here touches
 * CodeMirror, so it is fast to test and reusable by any editing surface.
 */

import { fenceAt } from "./blocks";

export type Snapshot = { text: string; from: number; to: number };
export type Change = { from: number; to: number; insert: string };
/** `changes` are ascending, non-overlapping and expressed in original-document positions. */
export type Edit = { changes: Change[]; from: number; to: number };

export type Mark = "bold" | "italic" | "strike" | "code" | "highlight";
export type BlockCommand = "quote" | "bullet" | "ordered" | "task" | "indent" | "outdent";
export type HeadingCommand = `h${0 | 1 | 2 | 3 | 4 | 5 | 6}`;
export type Command = Mark | BlockCommand | HeadingCommand;

export type Context = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  highlight: boolean;
  /** 0 for a paragraph. */
  heading: number;
  quote: boolean;
  list: "bullet" | "ordered" | "task" | null;
  /** Language of the fenced code block around the selection ("" when it has none), else null. */
  codeLang: string | null;
};

export function applyEdit(text: string, edit: Edit): string {
  let out = text;
  for (const c of [...edit.changes].reverse())
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
}

/** Maps an original position through the changes. `assoc > 0` places it after text inserted at that exact position. */
export function mapPos(changes: Change[], pos: number, assoc: 1 | -1): number {
  let shift = 0;
  for (const c of changes) {
    if (c.to < pos || (c.to === pos && c.from < c.to)) shift += c.insert.length - (c.to - c.from);
    else if (c.from === c.to && c.from === pos) {
      if (assoc > 0) shift += c.insert.length;
    } else if (c.from < pos && pos < c.to) shift += c.from - pos;
  }
  return pos + shift;
}

/* ------------------------------ inline marks ------------------------------ */

const MARKERS: Record<Mark, string[]> = {
  bold: ["**", "__"],
  italic: ["_", "*"],
  strike: ["~~"],
  code: ["`"],
  highlight: ["=="],
};

/** Finds `mark ... mark` spans on one line. No lookbehind: older Safari would fail to parse it. */
const SPAN_RE: Record<
  Mark,
  { re: string; open: (m: RegExpExecArray) => number; len: (m: RegExpExecArray) => number }
> = {
  bold: { re: "(\\*\\*|__)(\\S|\\S.*?\\S)\\1", open: () => 0, len: () => 2 },
  italic: {
    re: "(^|[^*_\\\\])([*_])([^*_\\s]|[^*_\\s].*?[^*_\\s])\\2(?![*_])",
    open: (m) => (m[1] ?? "").length,
    len: () => 1,
  },
  strike: { re: "~~(\\S|\\S.*?\\S)~~", open: () => 0, len: () => 2 },
  highlight: { re: "==(\\S|\\S.*?\\S)==", open: () => 0, len: () => 2 },
  code: { re: "(`+)(?!`)(.+?)\\1(?!`)", open: () => 0, len: (m) => (m[1] ?? "`").length },
};

type Span = { start: number; end: number; n: number };

function spanAt(line: string, col: number, mark: Mark): Span | null {
  const { re, open, len } = SPAN_RE[mark];
  const rx = new RegExp(re, "g");
  for (let m = rx.exec(line); m; m = rx.exec(line)) {
    const start = m.index + open(m);
    const end = m.index + m[0].length;
    if (col >= start && col <= end) return { start, end, n: len(m) };
    if (m[0].length === 0) rx.lastIndex++;
  }
  return null;
}

const runBefore = (t: string, i: number, c: string) => {
  let n = 0;
  while (i - n - 1 >= 0 && t[i - n - 1] === c) n++;
  return n;
};
const runAfter = (t: string, i: number, c: string) => {
  let n = 0;
  while (i + n < t.length && t[i + n] === c) n++;
  return n;
};

/** Marker length n when `before`/`after` runs of `c` form a `mark` pair, else 0. */
function pairLength(mark: Mark, marker: string, before: number, after: number): number {
  const n = marker.length;
  if (mark === "code") return before >= 1 && before === after ? before : 0;
  if (n === 1) return before % 2 === 1 && after % 2 === 1 ? 1 : 0;
  return before >= n && after >= n ? n : 0;
}

/** `n` marker characters sit just inside `leftEnd` and `rightStart` (the content's edges). */
type Marked = { n: number; leftEnd: number; rightStart: number };

/**
 * Measures marker runs across the segment boundary, so a segment may hold only half of a pair
 * (selecting across lines inside `**bold**` yields `one**` and `**two`).
 */
function markedSegment(text: string, seg: { from: number; to: number }, mark: Mark): Marked | null {
  const slice = text.slice(seg.from, seg.to);
  for (const marker of MARKERS[mark]) {
    const c = marker[0]!;
    let lead = 0;
    while (lead < slice.length && slice[lead] === c) lead++;
    let trail = 0;
    while (trail < slice.length - lead && slice[slice.length - 1 - trail] === c) trail++;
    if (lead + trail >= slice.length && lead + trail > 0) continue;
    const before = runBefore(text, seg.from, c) + lead;
    const after = runAfter(text, seg.to, c) + trail;
    const n = pairLength(mark, marker, before, after);
    if (n) return { n, leftEnd: seg.from + lead, rightStart: seg.to - trail };
  }
  return null;
}

function lineBounds(text: string, pos: number) {
  const from = text.lastIndexOf("\n", pos - 1) + 1;
  const nl = text.indexOf("\n", pos);
  return { from, to: nl === -1 ? text.length : nl };
}

/** Non-empty, whitespace-trimmed segments, one per selected line. */
function segments(text: string, from: number, to: number) {
  const out: { from: number; to: number }[] = [];
  let pos = from;
  while (pos <= to) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 || nl > to ? to : nl;
    let a = pos;
    let b = end;
    while (a < b && /\s/.test(text[a]!)) a++;
    while (b > a && /\s/.test(text[b - 1]!)) b--;
    if (a < b) out.push({ from: a, to: b });
    if (nl === -1 || nl >= to) break;
    pos = nl + 1;
  }
  return out;
}

function wordAt(text: string, pos: number) {
  const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
  let a = pos;
  let b = pos;
  while (a > 0 && isWord(text[a - 1])) a--;
  while (b < text.length && isWord(text[b])) b++;
  return a < b ? { from: a, to: b } : null;
}

function wrapPair(text: string, seg: { from: number; to: number }, mark: Mark) {
  if (mark !== "code") {
    const m = MARKERS[mark][0]!;
    return { open: m, close: m };
  }
  const content = text.slice(seg.from, seg.to);
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  const pad = content.startsWith("`") || content.endsWith("`") ? " " : "";
  return { open: fence + pad, close: pad + fence };
}

function toggleMark({ text, from, to }: Snapshot, mark: Mark): Edit | null {
  if (from === to) {
    const line = lineBounds(text, from);
    const span = spanAt(text.slice(line.from, line.to), from - line.from, mark);
    if (span) {
      const s = line.from + span.start;
      const e = line.from + span.end;
      const changes = [
        { from: s, to: s + span.n, insert: "" },
        { from: e - span.n, to: e, insert: "" },
      ];
      const caret = mapPos(changes, from, 1);
      return { changes, from: caret, to: caret };
    }
    const word = wordAt(text, from);
    if (!word) {
      const { open, close } = wrapPair(text, { from, to }, mark);
      const changes = [{ from, to, insert: `${open}text${close}` }];
      return { changes, from: from + open.length, to: from + open.length + 4 };
    }
    const { open, close } = wrapPair(text, word, mark);
    const changes = [
      { from: word.from, to: word.from, insert: open },
      { from: word.to, to: word.to, insert: close },
    ];
    const caret = mapPos(changes, from, from === word.to && from !== word.from ? -1 : 1);
    return { changes, from: caret, to: caret };
  }

  const segs = segments(text, from, to);
  if (!segs.length) return null;
  const marked = segs.map((s) => markedSegment(text, s, mark));
  const unwrap = marked.every(Boolean);
  const changes: Change[] = [];
  const anchors: { from: number; to: number }[] = [];
  segs.forEach((s, i) => {
    const m = marked[i];
    if (unwrap && m) {
      changes.push(
        { from: m.leftEnd - m.n, to: m.leftEnd, insert: "" },
        { from: m.rightStart, to: m.rightStart + m.n, insert: "" },
      );
      anchors.push({ from: m.leftEnd, to: m.rightStart });
    } else if (!m) {
      const { open, close } = wrapPair(text, s, mark);
      changes.push(
        { from: s.from, to: s.from, insert: open },
        { from: s.to, to: s.to, insert: close },
      );
      anchors.push({ from: s.from, to: s.to });
    } else anchors.push({ from: s.from, to: s.to });
  });
  changes.sort((a, b) => a.from - b.from || a.to - b.to);
  return {
    changes,
    from: mapPos(changes, anchors[0]!.from, 1),
    to: mapPos(changes, anchors[anchors.length - 1]!.to, -1),
  };
}

/* ------------------------------ block commands ------------------------------ */

type Parsed = { quote: string; indent: string; marker: string; content: string };
type Kind = { type: "none" | "bullet" | "task" | "ordered" } | { type: "heading"; level: number };

const LINE_RE =
  /^((?:>[ ]?)*)([ \t]*)(#{1,6}(?:[ \t]+|$)|[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d{1,9}[.)][ \t]+)?(.*)$/;

function parseLine(line: string): Parsed {
  const m = LINE_RE.exec(line)!;
  return { quote: m[1] ?? "", indent: m[2] ?? "", marker: m[3] ?? "", content: m[4] ?? "" };
}

const prefixOf = (p: Parsed) => p.quote + p.indent + p.marker;
const build = (p: Parsed) => prefixOf(p) + p.content;

function kindOf(marker: string): Kind {
  if (!marker) return { type: "none" };
  if (marker.startsWith("#")) return { type: "heading", level: /^#+/.exec(marker)![0].length };
  if (/\[[ xX]\]/.test(marker)) return { type: "task" };
  if (/^\d/.test(marker)) return { type: "ordered" };
  return { type: "bullet" };
}

const isList = (k: Kind) => k.type === "bullet" || k.type === "task" || k.type === "ordered";

/** Whole lines touched by the selection (a selection ending at a line start excludes that line). */
function lineBlock({ text, from, to }: Snapshot) {
  const end = to > from && text[to - 1] === "\n" ? to - 1 : to;
  const blockFrom = text.lastIndexOf("\n", from - 1) + 1;
  const nl = text.indexOf("\n", end);
  const blockTo = nl === -1 ? text.length : nl;
  return { blockFrom, blockTo, lines: text.slice(blockFrom, blockTo).split("\n") };
}

type LineResult = { before: Parsed; after: Parsed };

function finishLines(
  snap: Snapshot,
  block: ReturnType<typeof lineBlock>,
  results: LineResult[],
  mode: "prefix" | "shift",
): Edit | null {
  const newLines = results.map((r) => build(r.after));
  if (newLines.every((l, i) => l === block.lines[i])) return null;
  const starts: { old: number; next: number }[] = [];
  let o = block.blockFrom;
  let n = block.blockFrom;
  results.forEach((r, i) => {
    starts.push({ old: o, next: n });
    o += block.lines[i]!.length + 1;
    n += newLines[i]!.length + 1;
  });
  const totalDelta = newLines.join("\n").length - (block.blockTo - block.blockFrom);
  const map = (pos: number) => {
    if (pos < block.blockFrom) return pos;
    if (pos > block.blockTo) return pos + totalDelta;
    let i = starts.length - 1;
    while (i > 0 && starts[i]!.old > pos) i--;
    const r = results[i]!;
    const offset = pos - starts[i]!.old;
    const oldP = prefixOf(r.before).length;
    const newP = prefixOf(r.after).length;
    const next =
      mode === "shift"
        ? Math.max(0, offset + newP - oldP)
        : offset <= oldP
          ? newP
          : offset - oldP + newP;
    return starts[i]!.next + next;
  };
  return {
    changes: [{ from: block.blockFrom, to: block.blockTo, insert: newLines.join("\n") }],
    from: map(snap.from),
    to: map(snap.to),
  };
}

/** In a multi-line selection blank lines are left alone; a lone blank line still gets the marker. */
function targets(lines: string[]) {
  return lines.map((l) => lines.length === 1 || l.trim() !== "");
}

function setHeading(snap: Snapshot, level: number): Edit | null {
  const block = lineBlock(snap);
  const use = targets(block.lines);
  const parsed = block.lines.map(parseLine);
  const same = parsed
    .filter((_, i) => use[i])
    .every((p) => {
      const k = kindOf(p.marker);
      return k.type === "heading" && k.level === level;
    });
  const results = parsed.map((before, i): LineResult => {
    if (!use[i]) return { before, after: before };
    const marker = level === 0 || same ? "" : "#".repeat(level) + " ";
    return { before, after: { ...before, indent: "", marker } };
  });
  return finishLines(snap, block, results, "prefix");
}

function toggleBlock(snap: Snapshot, cmd: "quote" | "bullet" | "ordered" | "task"): Edit | null {
  const block = lineBlock(snap);
  const use = targets(block.lines);
  const parsed = block.lines.map(parseLine);
  const active = parsed.filter((_, i) => use[i]);
  if (cmd === "quote") {
    const off = active.every((p) => p.quote !== "");
    const results = parsed.map((before, i): LineResult => {
      if (!use[i]) return { before, after: before };
      const quote = off ? before.quote.replace(/^>[ ]?/, "") : "> " + before.quote;
      return { before, after: { ...before, quote } };
    });
    return finishLines(snap, block, results, "prefix");
  }
  const off = active.every((p) => kindOf(p.marker).type === cmd);
  const counters = new Map<number, number>();
  const results = parsed.map((before, i): LineResult => {
    if (!use[i]) return { before, after: before };
    if (off) return { before, after: { ...before, indent: "", marker: "" } };
    const wasTask = kindOf(before.marker).type === "task";
    let marker = "- ";
    if (cmd === "task") marker = wasTask ? before.marker : "- [ ] ";
    if (cmd === "ordered") {
      const level = before.indent.length;
      for (const k of [...counters.keys()]) if (k > level) counters.delete(k);
      const next = (counters.get(level) ?? 0) + 1;
      counters.set(level, next);
      marker = `${next}. `;
    }
    return { before, after: { ...before, marker } };
  });
  return finishLines(snap, block, results, "prefix");
}

function shiftIndent(snap: Snapshot, dir: 1 | -1): Edit | null {
  const block = lineBlock(snap);
  const all = snap.text.split("\n");
  const firstIndex = snap.text.slice(0, block.blockFrom).split("\n").length - 1;
  const parsed = block.lines.map(parseLine);
  const first = parsed[0]!;
  if (!isList(kindOf(first.marker))) return null;
  const oldIndent = first.indent.length;
  let wanted = 0;
  for (let j = firstIndex - 1; j >= 0; j--) {
    const p = parseLine(all[j]!);
    if (!isList(kindOf(p.marker))) continue;
    if (dir === 1 && p.indent.length <= oldIndent) {
      wanted = p.indent.length + p.marker.length;
      break;
    }
    if (dir === -1 && p.indent.length < oldIndent) {
      wanted = p.indent.length;
      break;
    }
    if (dir === 1 && j === 0) wanted = oldIndent;
  }
  if (dir === 1 && wanted <= oldIndent) return null;
  const delta = wanted - oldIndent;
  if (delta === 0) return null;
  const results = parsed.map((before): LineResult => {
    if (!isList(kindOf(before.marker))) return { before, after: before };
    return {
      before,
      after: { ...before, indent: " ".repeat(Math.max(0, before.indent.length + delta)) },
    };
  });
  return finishLines(snap, block, results, "shift");
}

/* ------------------------------ public API ------------------------------ */

export function runCommand(snap: Snapshot, cmd: Command): Edit | null {
  if (
    cmd === "bold" ||
    cmd === "italic" ||
    cmd === "strike" ||
    cmd === "code" ||
    cmd === "highlight"
  )
    return toggleMark(snap, cmd);
  if (cmd === "indent") return shiftIndent(snap, 1);
  if (cmd === "outdent") return shiftIndent(snap, -1);
  if (cmd.startsWith("h")) return setHeading(snap, Number(cmd.slice(1)));
  return toggleBlock(snap, cmd as "quote" | "bullet" | "ordered" | "task");
}

/** True when the caret is on a list item (Tab/Shift-Tab then nest instead of inserting spaces). */
export function isListLine(snap: Snapshot): boolean {
  const { from, to } = lineBounds(snap.text, snap.from);
  return isList(kindOf(parseLine(snap.text.slice(from, to)).marker));
}

export function getContext(snap: Snapshot): Context {
  const { text, from, to } = snap;
  const line = lineBounds(text, from);
  const parsed = parseLine(text.slice(line.from, line.to));
  const kind = kindOf(parsed.marker);
  const active = (mark: Mark) => {
    if (from === to) return !!spanAt(text.slice(line.from, line.to), from - line.from, mark);
    const segs = segments(text, from, to);
    return segs.length > 0 && segs.every((s) => markedSegment(text, s, mark));
  };
  return {
    bold: active("bold"),
    italic: active("italic"),
    strike: active("strike"),
    code: active("code"),
    highlight: active("highlight"),
    heading: kind.type === "heading" ? kind.level : 0,
    quote: parsed.quote !== "",
    list: isList(kind) ? (kind.type as "bullet" | "ordered" | "task") : null,
    codeLang: fenceAt(text, from, to)?.lang ?? null,
  };
}
