// Loading and presenting guide text. The Markdown is imported lazily, one file at a time.
import { splitFrontMatter } from "@/lib/markdown/markdown";
import type { Guide } from "./guides";

const files = import.meta.glob("../../../content/guides/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export async function loadGuideMarkdown(slug: string): Promise<string | null> {
  const load = files[`../../../content/guides/${slug}.md`];
  return load ? splitFrontMatter(await load()).body : null;
}

export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

/** Unique anchor ids for a list of headings, in order ("what", "what-2", ...). */
export function headingIds(texts: string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((t) => {
    const base = headingId(t);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

/** Adds `id`s to the plain `<h2>` tags of rendered HTML, in document order. */
export function withHeadingIds(html: string, ids: string[]): string {
  let i = 0;
  return html.replace(/<h2>/g, () => (ids[i] ? `<h2 id="${ids[i++]}">` : "<h2>"));
}

export const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });

const UTC = "UTC" as const;

/** A UTC moment as a date ("November 2, 2026"), or with its time ("November 2, 2026 at 9:05 AM UTC"). */
export const formatStamp = (iso: string, time = false) =>
  new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(time && { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
    timeZone: UTC,
  });

/** How two moments differ: not at all, only in the time of day, or by the date. */
export function stampsDiffer(a: string, b: string): "none" | "time" | "date" {
  if (new Date(a).getTime() === new Date(b).getTime()) return "none";
  return a.slice(0, 10) === b.slice(0, 10) ? "time" : "date";
}

export const relatedGuides = (all: Guide[], current: string, count = 3) =>
  all.filter((g) => g.slug !== current).slice(0, count);
