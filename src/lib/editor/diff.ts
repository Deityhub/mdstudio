export type DiffSide = { n: number; text: string };
export type DiffRow =
  | { type: "same"; left: DiffSide; right: DiffSide }
  | { type: "change"; left: DiffSide; right: DiffSide }
  | { type: "del"; left: DiffSide }
  | { type: "add"; right: DiffSide };

/** Above this many cells the line-by-line table is skipped and the changed middle is shown whole. */
const MAX_CELLS = 2_000_000;

type Op = { t: "same" | "del" | "add"; a?: number; b?: number };

/** Edit script for the lines between the shared head and tail, via a longest-common-subsequence table. */
function script(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const ops: Op[] = [];
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    for (let i = 0; i < n; i++) ops.push({ t: "del", a: i });
    for (let j = 0; j < m; j++) ops.push({ t: "add", b: j });
    return ops;
  }
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1]! + 1
          : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) ops.push({ t: "same", a: i++, b: j++ });
    else if (j >= m || (i < n && lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!))
      ops.push({ t: "del", a: i++ });
    else ops.push({ t: "add", b: j++ });
  }
  return ops;
}

/** Side-by-side rows for two texts. A removed line directly followed by an added one is one `change`. */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;

  const side = (lines: string[], i: number): DiffSide => ({ n: i + 1, text: lines[i] ?? "" });
  const rows: DiffRow[] = [];
  for (let i = 0; i < head; i++) rows.push({ type: "same", left: side(a, i), right: side(b, i) });

  const ops = script(a.slice(head, a.length - tail), b.slice(head, b.length - tail));
  for (let k = 0; k < ops.length;) {
    const op = ops[k]!;
    if (op.t === "same") {
      rows.push({
        type: "same",
        left: side(a, head + op.a!),
        right: side(b, head + op.b!),
      });
      k++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    while (ops[k]?.t === "del") dels.push(head + ops[k++]!.a!);
    while (ops[k]?.t === "add") adds.push(head + ops[k++]!.b!);
    for (let p = 0; p < Math.max(dels.length, adds.length); p++) {
      const d = dels[p];
      const ad = adds[p];
      if (d !== undefined && ad !== undefined)
        rows.push({ type: "change", left: side(a, d), right: side(b, ad) });
      else if (d !== undefined) rows.push({ type: "del", left: side(a, d) });
      else if (ad !== undefined) rows.push({ type: "add", right: side(b, ad) });
    }
  }

  for (let t = tail; t > 0; t--)
    rows.push({
      type: "same",
      left: side(a, a.length - t),
      right: side(b, b.length - t),
    });
  return rows;
}

/** Lines added and removed; a `change` counts as one of each. */
export function diffStats(rows: DiffRow[]) {
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    if (r.type === "add" || r.type === "change") added++;
    if (r.type === "del" || r.type === "change") removed++;
  }
  return { added, removed };
}
