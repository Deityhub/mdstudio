import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export type GuideMeta = {
  slug: string;
  title: string;
  description: string;
  /** Where it sits in the lists; lower comes first. Guides without one follow, newest first. */
  order?: number;
  /** When it first went out and when it last changed, as UTC moments (2026-11-02T09:00:00Z). */
  published: string;
  updated: string;
};

/**
 * The guides' metadata, read from the front matter of content/guides/*.md, in list order. Plain
 * Node, so the build, the tests and the end-to-end runner all read the same files.
 */
export function readGuideCatalogue(dir = "content/guides"): GuideMeta[] {
  const guides = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(dir, file), "utf8"))?.[1];
      const data = (front ? YAML.parse(front) : null) as Record<string, unknown> | null;
      const text = (k: string) => (typeof data?.[k] === "string" ? (data[k] as string) : "");
      return {
        slug: text("slug") || file.replace(/\.md$/, ""),
        title: text("title"),
        description: text("description"),
        ...(typeof data?.["order"] === "number" && { order: data["order"] }),
        published: text("published"),
        updated: text("updated"),
      } satisfies GuideMeta;
    });
  return guides.sort(
    (a, b) =>
      b.published.localeCompare(a.published) ||
      (a.order ?? Infinity) - (b.order ?? Infinity) ||
      a.slug.localeCompare(b.slug),
  );
}
