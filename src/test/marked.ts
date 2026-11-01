import { applyEdit, type Edit, type Snapshot } from "@/lib/editing";

/** Test notation: `⟦a⟧` is a selection and `¦` is a caret. */
export function parse(marked: string): Snapshot {
  const open = marked.indexOf("⟦");
  if (open >= 0) {
    const close = marked.indexOf("⟧");
    const text = marked.replace("⟦", "").replace("⟧", "");
    return { text, from: open, to: close - 1 };
  }
  const caret = marked.indexOf("¦");
  return { text: marked.replace("¦", ""), from: caret, to: caret };
}

export function show(text: string, from: number, to: number) {
  return from === to
    ? text.slice(0, from) + "¦" + text.slice(from)
    : text.slice(0, from) + "⟦" + text.slice(from, to) + "⟧" + text.slice(to);
}

/** Applies an edit to a marked-up state and returns the marked-up result (null for a no-op). */
export function applied(marked: string, edit: (snap: Snapshot) => Edit | null): string | null {
  const snap = parse(marked);
  const result = edit(snap);
  return result ? show(applyEdit(snap.text, result), result.from, result.to) : null;
}
