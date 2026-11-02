/**
 * Scroll sync between the editor and the preview by source line, not by percentage. A percentage
 * drifts because the two panes grow at different rates (a code block is many editor lines and a
 * few preview pixels), so the same line ends up at different heights. Here the preview's blocks
 * (which know their source lines, see source-lines.ts) give a map from line to height and back.
 */

/** A preview block: the source lines it covers (1-based, inclusive) and where it sits (px). */
export type Block = { from: number; to: number; top: number; bottom: number };

/** Matching lists: at `lines[i]` the preview is at `ys[i]`. Both never decrease. */
export type Anchors = { lines: number[]; ys: number[] };

export function buildAnchors(blocks: Block[]): Anchors | null {
  const sorted = [...blocks].sort((a, b) => a.from - b.from || a.top - b.top);
  const lines: number[] = [];
  const ys: number[] = [];
  let lastTo = 0;
  const push = (line: number, y: number) => {
    lines.push(Math.max(line, lines[lines.length - 1] ?? 1));
    ys.push(Math.max(y, ys[ys.length - 1] ?? 0));
  };
  for (const b of sorted) {
    if (b.from <= lastTo) continue; // inside a block already taken
    if (!lines.length && b.from > 1) push(1, b.top); // front matter and the like sit above the first block
    push(b.from, b.top);
    push(b.to + 1, Math.max(b.bottom, b.top));
    lastTo = b.to;
  }
  return lines.length ? { lines, ys } : null;
}

/** How far down the preview (px) a source line is; the line may have a fraction (part way through it). */
export function lineToY({ lines, ys }: Anchors, line: number): number {
  if (line <= lines[0]!) return ys[0]!;
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i]!;
    const b = lines[i + 1]!;
    if (line >= b || a === b) continue;
    return ys[i]! + ((line - a) / (b - a)) * (ys[i + 1]! - ys[i]!);
  }
  return ys[ys.length - 1]!;
}

/** The source line (with a fraction) at a height in the preview. */
export function yToLine({ lines, ys }: Anchors, y: number): number {
  if (y <= ys[0]!) return lines[0]!;
  for (let i = 0; i < ys.length - 1; i++) {
    const a = ys[i]!;
    const b = ys[i + 1]!;
    if (y >= b || a === b) continue;
    return lines[i]! + ((y - a) / (b - a)) * (lines[i + 1]! - lines[i]!);
  }
  return lines[lines.length - 1]!;
}
