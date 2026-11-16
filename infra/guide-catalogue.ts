import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export type GuideMeta = {
  slug: string;
  title: string;
  description: string;
  /** Breaks a tie between guides published at the same moment; lower comes first. */
  order?: number;
  /** When it first went out and when it last changed, as UTC moments (2026-11-02T09:00:00Z). */
  published: string;
  updated: string;
  /** Minutes to read it, at about 200 words a minute and never less than one. */
  minutes: number;
};

/**
 * The guides' metadata, read from the front matter of content/guides/*.md, newest first. Plain
 * Node, so the build, the tests and the end-to-end runner all read the same files.
 */
export function readGuideCatalogue(dir = "content/guides"): GuideMeta[] {
  const guides = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(dir, file), "utf8");
      const matter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
      const front = matter?.[1];
      const words = raw
        .slice(matter?.[0].length ?? 0)
        .split(/\s+/)
        .filter(Boolean).length;
      const data = (front ? YAML.parse(front) : null) as Record<string, unknown> | null;
      const text = (k: string) => (typeof data?.[k] === "string" ? (data[k] as string) : "");
      return {
        slug: text("slug") || file.replace(/\.md$/, ""),
        title: text("title"),
        description: text("description"),
        ...(typeof data?.["order"] === "number" && { order: data["order"] }),
        published: text("published"),
        updated: text("updated"),
        minutes: Math.max(1, Math.ceil(words / 200)),
      } satisfies GuideMeta;
    });
  return guides.sort(
    (a, b) =>
      b.published.localeCompare(a.published) ||
      (a.order ?? Infinity) - (b.order ?? Infinity) ||
      a.slug.localeCompare(b.slug),
  );
}
