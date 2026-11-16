// Ranking for the search palette: every word typed must be in an entry's title or keywords; a
// title that starts with them beats one that contains them, which beats keywords alone. Pure, so
// the palette, its tests and any page share one behaviour.

export const GROUPS = ["Drafts", "In drafts", "Headings", "Commands", "Settings", "Pages"] as const;
export type Group = (typeof GROUPS)[number];

export type SearchEntry = {
  id: string;
  group: Group;
  title: string;
  /** A second line: where it is, or the matching words of a draft. */
  hint?: string;
  /** Other words it should be found by (not shown). */
  keywords?: string;
  run: () => void;
};

// The front matter block, as markdown.ts finds it; matched here so the palette does not load the
// Markdown engine on pages that have no editor.
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export const termsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

function score(terms: string[], e: SearchEntry): number | null {
  const title = e.title.toLowerCase();
  const rest = `${e.keywords ?? ""} ${e.hint ?? ""}`.toLowerCase();
  let total = 0;
  for (const t of terms) {
    if (title.startsWith(t)) total += 3;
    else if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) total += 2;
    else if (title.includes(t)) total += 1.5;
    else if (rest.includes(t)) total += 1;
    else return null;
  }
  return total;
}

/** The entries that match every word, best first (ties keep their order). */
export function rankEntries(query: string, entries: SearchEntry[]): SearchEntry[] {
  const terms = termsOf(query);
  if (!terms.length) return [];
  return entries
    .map((e, i) => ({ e, i, s: score(terms, e) }))
    .filter((r): r is { e: SearchEntry; i: number; s: number } => r.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.e);
}

const LINE_CHARS = 100;

/** The line of a draft's text with the most of the words (1-based, front matter skipped). */
export function matchLine(content: string, terms: string[]): { line: number; text: string } | null {
  const head = content.match(FRONT_MATTER)?.[0] ?? "";
  const body = content.slice(head.length);
  const offset = head.split("\n").length - 1;
  let best: { line: number; text: string; hits: number; at: number } | null = null;
  body.split(/\r?\n/).forEach((raw, i) => {
    const lower = raw.toLowerCase();
    const at = terms.map((t) => lower.indexOf(t)).filter((n) => n >= 0);
    if (at.length && (!best || at.length > best.hits))
      best = { line: offset + i + 1, text: raw, hits: at.length, at: Math.min(...at) };
  });
  if (!best) return null;
  const { line, text: raw, at } = best as { line: number; text: string; at: number };
  const text = raw.trim();
  if (text.length <= LINE_CHARS) return { line, text };
  const lead = raw.length - raw.trimStart().length;
  const start = Math.max(0, Math.min(at - lead - 30, text.length - LINE_CHARS));
  const end = start + LINE_CHARS;
  return {
    line,
    text: `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
  };
}

/** Results in the fixed group order, at most `perGroup` each. */
export function groupResults(entries: SearchEntry[], perGroup = 6) {
  return GROUPS.map((group) => ({
    group,
    items: entries.filter((e) => e.group === group).slice(0, perGroup),
  })).filter((g) => g.items.length);
}
