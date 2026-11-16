import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readFrontMatter } from "./guide-catalogue";

export type LegalMeta = {
  slug: "privacy" | "terms";
  title: string;
  description: string;
  /** Where it comes in the list (privacy first). */
  order: number;
  /** When it first went out and when it last changed, as UTC moments (2026-11-11T16:55:00Z). */
  published: string;
  updated: string;
};

/** The privacy policy's and the terms' metadata, read from the front matter of content/legal/*.md. */
export function readLegalCatalogue(dir = "content/legal"): LegalMeta[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const { data } = readFrontMatter(readFileSync(join(dir, file), "utf8"));
      const text = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
      return {
        slug: (text("slug") || file.replace(/\.md$/, "")) as LegalMeta["slug"],
        title: text("title"),
        description: text("description"),
        order: typeof data["order"] === "number" ? data["order"] : 99,
        published: text("published"),
        updated: text("updated"),
      };
    })
    .sort((a, b) => a.order - b.order);
}
