/** Pure GFM table commands. Same contract as `editing.ts`. */
import { cellText, splitCells, tableAt, type Align, type TableBlock } from "./blocks";
import type { Edit, Snapshot } from "./editing";
import { insertBlock } from "./editing-insert";

export type TableCommand =
  | "row-above"
  | "row-below"
  | "delete-row"
  | "col-left"
  | "col-right"
  | "delete-col"
  | "align-none"
  | "align-left"
  | "align-center"
  | "align-right"
  | "format";

type Model = { header: string[]; aligns: Align[]; rows: string[][] };

const MIN_WIDTH = 3;

function pad(text: string, width: number, align: Align) {
  const gap = width - text.length;
  if (align === "right") return { text: " ".repeat(gap) + text, left: gap };
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return { text: " ".repeat(left) + text + " ".repeat(gap - left), left };
  }
  return { text: text + " ".repeat(gap), left: 0 };
}

function delimiter(width: number, align: Align) {
  if (align === "left") return ":" + "-".repeat(width - 1);
  if (align === "right") return "-".repeat(width - 1) + ":";
  if (align === "center") return ":" + "-".repeat(width - 2) + ":";
  return "-".repeat(width);
}

/** Aligned table text, plus where each cell's content starts (for placing the caret). */
function render({ header, aligns, rows }: Model) {
  const widths = header.map((h, c) =>
    Math.max(MIN_WIDTH, h.length, ...rows.map((r) => (r[c] ?? "").length)),
  );
  const starts: number[][] = [];
  const line = (cells: string[]) => {
    let at = 2;
    const rowStarts: number[] = [];
    const parts = cells.map((cell, c) => {
      const { text, left } = pad(cell, widths[c]!, aligns[c] ?? "none");
      rowStarts.push(at + (cell ? left : 0));
      at += widths[c]! + 3;
      return text;
    });
    starts.push(rowStarts);
    return `| ${parts.join(" | ")} |`;
  };
  const out: string[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (l: string) => {
    offsets.push(pos);
    out.push(l);
    pos += l.length + 1;
  };
  push(line(header));
  const delim = `| ${widths.map((w, c) => delimiter(w, aligns[c] ?? "none")).join(" | ")} |`;
  push(delim);
  // header start row is starts[0]; the delimiter has no cells to place a caret in
  for (const r of rows) push(line(r));
  return {
    text: out.join("\n"),
    cellStart: (row: number, col: number) => offsets[row === 0 ? 0 : row + 1]! + starts[row]![col]!,
  };
}

function rebuild(t: TableBlock, model: Model, row: number, col: number, inner = 0): Edit {
  const { text, cellStart } = render(model);
  const at = t.from + cellStart(row, col) + inner;
  return { changes: [{ from: t.from, to: t.to, insert: text }], from: at, to: at };
}

const clone = (t: TableBlock): Model => ({
  header: [...t.header],
  aligns: t.header.map((_, c) => t.aligns[c] ?? "none"),
  rows: t.rows.map((r) => [...r]),
});

export function tableCommand(snap: Snapshot, cmd: TableCommand): Edit | null {
  const t = tableAt(snap.text, snap.from);
  if (!t) return null;
  const m = clone(t);
  const blank = () => m.header.map(() => "");
  let { row, col } = t;
  let inner = 0;
  switch (cmd) {
    case "format":
      inner = t.inner;
      break;
    case "row-below":
      m.rows.splice(row, 0, blank());
      row += 1;
      break;
    case "row-above":
      if (row === 0) return null;
      m.rows.splice(row - 1, 0, blank());
      break;
    case "delete-row":
      if (row === 0) return null;
      m.rows.splice(row - 1, 1);
      row = Math.min(row, m.rows.length);
      break;
    case "col-left":
    case "col-right": {
      const at = cmd === "col-left" ? col : col + 1;
      m.header.splice(at, 0, "");
      m.aligns.splice(at, 0, "none");
      m.rows.forEach((r) => r.splice(at, 0, ""));
      col = at;
      break;
    }
    case "delete-col":
      if (m.header.length === 1) return null;
      m.header.splice(col, 1);
      m.aligns.splice(col, 1);
      m.rows.forEach((r) => r.splice(col, 1));
      col = Math.min(col, m.header.length - 1);
      break;
    default:
      m.aligns[col] = cmd.slice("align-".length) as Align;
      inner = t.inner;
  }
  return rebuild(t, m, row, col, inner);
}

/** Tab / Shift-Tab: the next or previous cell's content. Tab in the last cell adds a row. */
export function tableMove(snap: Snapshot, dir: 1 | -1): Edit | null {
  const t = tableAt(snap.text, snap.from);
  if (!t) return null;
  const cells: { row: number; col: number; from: number; to: number }[] = [];
  t.lines.forEach((l, i) => {
    if (i === 1) return;
    splitCells(l.text)
      .slice(0, t.header.length)
      .forEach((seg, col) => {
        const raw = l.text.slice(seg.start, seg.end);
        const lead = raw.length - raw.trimStart().length;
        const content = cellText(l.text, seg);
        // an empty cell gets a caret just inside it, after one space
        const start = content ? seg.start + lead : Math.min(seg.start + 1, seg.end);
        cells.push({
          row: i === 0 ? 0 : i - 1,
          col,
          from: l.from + start,
          to: l.from + start + content.length,
        });
      });
  });
  const at = cells.findIndex((c) => c.row === t.row && c.col === t.col);
  const next = at + dir;
  if (next < 0) return null;
  if (next >= cells.length) {
    const m = clone(t);
    m.rows.push(m.header.map(() => ""));
    return rebuild(t, m, t.rows.length + 1, 0);
  }
  const c = cells[next]!;
  return { changes: [], from: c.from, to: c.to };
}

export function insertTable(snap: Snapshot, bodyRows: number, cols: number): Edit {
  const r = Math.max(1, Math.min(50, Math.floor(bodyRows) || 1));
  const c = Math.max(1, Math.min(12, Math.floor(cols) || 1));
  const model: Model = {
    header: Array.from({ length: c }, (_, i) => `Column ${i + 1}`),
    aligns: Array.from({ length: c }, () => "none" as Align),
    rows: Array.from({ length: r }, () => Array.from({ length: c }, () => "")),
  };
  const { text } = render(model);
  return insertBlock(snap, text, { from: 2, to: 2 + model.header[0]!.length });
}

export const isInTable = (snap: Snapshot) => tableAt(snap.text, snap.from) !== null;
