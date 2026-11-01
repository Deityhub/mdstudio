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
