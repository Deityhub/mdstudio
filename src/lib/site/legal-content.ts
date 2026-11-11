// Loading the legal text. The Markdown is imported lazily, one file at a time, and the details that
// belong to the site (who runs it, how to reach them) are filled in from SITE.
import { SITE } from "./seo";

const files = import.meta.glob("../../../content/legal/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

const details: Record<string, string> = {
  site: SITE.url,
  contact: SITE.contactEmail,
  author: SITE.author,
  authorUrl: SITE.authorUrl,
  repo: SITE.repo,
};

export async function loadLegalMarkdown(slug: string): Promise<string | null> {
  const load = files[`../../../content/legal/${slug}.md`];
  return load ? (await load()).replace(/\{\{(\w+)\}\}/g, (m, key) => details[key] ?? m) : null;
}
