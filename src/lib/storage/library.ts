import { splitFrontMatter } from "../markdown/markdown";

/** What the library needs from a draft; `MdDocument` satisfies it. */
export type LibraryDoc = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  folder?: string | undefined;
};

/** Tags come from the draft's own front matter, so the Markdown stays the one source of truth. */
export function docTags(content: string): string[] {
  const raw = splitFrontMatter(content).data?.["tags"];
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const tags = list
    .filter((t): t is string | number => typeof t === "string" || typeof t === "number")
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

// Parsing front matter and lowercasing the text for every draft on every keystroke would add up,
// so each draft's derived facts are kept until its text changes.
const facts = new Map<string, { content: string; lower: string; tags: string[] }>();
function factsOf(d: LibraryDoc) {
  const hit = facts.get(d.id);
  if (hit && hit.content === d.content) return hit;
  const next = { content: d.content, lower: d.content.toLowerCase(), tags: docTags(d.content) };
  facts.set(d.id, next);
  return next;
}

export function allTags(docs: LibraryDoc[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of docs) for (const t of factsOf(d).tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const MAX_FOLDER = 40;

/** A tidy folder name, or undefined for "no folder". */
export function normalizeFolder(name: string | undefined): string | undefined {
  const s = (name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FOLDER).trim();
  return s || undefined;
}

const sameFolder = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

/** The existing folder a typed name refers to (ignoring case), or the name itself. */
export function resolveFolder(name: string | undefined, existing: string[]): string | undefined {
  const clean = normalizeFolder(name);
  return clean && (existing.find((f) => sameFolder(f, clean)) ?? clean);
}

/**
 * Folders A to Z, each with its drafts in the order they came in (empty ones included), then the
 * unfiled drafts as a final group with no folder. `names` are folders kept apart from any draft.
 */
export function groupByFolder<T extends LibraryDoc>(
  docs: T[],
  names: string[],
): { folder: string | null; docs: T[] }[] {
  const folders: string[] = [];
  for (const n of [...names, ...docs.map((d) => d.folder).filter((f): f is string => !!f)])
    if (!folders.some((f) => sameFolder(f, n))) folders.push(n);
  folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const groups: { folder: string | null; docs: T[] }[] = folders.map((folder) => ({
    folder,
    docs: docs.filter((d) => d.folder && sameFolder(d.folder, folder)),
  }));
  const unfiled = docs.filter((d) => !d.folder);
  return unfiled.length ? [...groups, { folder: null, docs: unfiled }] : groups;
}

const SNIPPET_CHARS = 80;

/** The first line of the text (after front matter) that holds a search term, shortened around it. */
export function searchSnippet(content: string, terms: string[]): string {
  for (const line of splitFrontMatter(content).body.split(/\r?\n/)) {
    const lower = line.toLowerCase();
    const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
    if (!at.length) continue;
    const text = line.trim();
    if (text.length <= SNIPPET_CHARS + 10) return text;
    const first = Math.min(...at) - (line.length - line.trimStart().length);
    const start = Math.max(0, Math.min(first - 30, text.length - SNIPPET_CHARS));
    const end = start + SNIPPET_CHARS;
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  }
  return "";
}

/** Drafts whose title or text hold every word of `query` and that carry every selected tag. */
export function filterDocs<T extends LibraryDoc>(
  docs: T[],
  query: string,
  tags: string[],
): { doc: T; snippet?: string }[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: { doc: T; snippet?: string }[] = [];
  for (const doc of docs) {
    const f = factsOf(doc);
    if (!tags.every((t) => f.tags.includes(t))) continue;
    if (terms.length) {
      const title = doc.title.toLowerCase();
      if (!terms.every((t) => title.includes(t) || f.lower.includes(t))) continue;
      out.push({ doc, snippet: searchSnippet(doc.content, terms) });
    } else out.push({ doc });
  }
  return out;
}
