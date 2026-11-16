// What AI assistants read about the site (public/llms.txt), made from the same copy the home page
// uses, so the two cannot drift. `bun run llms` writes the file; a test keeps it in step.
import { AUDIENCES, BRAND, FAQ, FEATURE_LIST, LONG_DESCRIPTION } from "./seo-content";
import { SITE } from "./site";

type GuideLine = { slug: string; title: string; description: string };

export function llmsTxt(guides: GuideLine[]): string {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${LONG_DESCRIPTION} Formerly called ${BRAND.alternateName}.`,
    "",
    "## What it does",
    "",
    ...FEATURE_LIST.map((f) => `- ${f}`),
    "",
    "## Who it is for",
    "",
    ...AUDIENCES.map((a) => `- ${a}`),
    "",
    "## Common questions",
    "",
    ...FAQ.map((f) => `- ${f.question} ${f.answer}`),
    "",
    "## Guides",
    "",
    ...guides.map((g) => `- [${g.title}](${SITE.url}/guides/${g.slug}): ${g.description}`),
    "",
    "## Links",
    "",
    `- [Home](${SITE.url}/): overview, features and FAQ`,
    `- [All guides](${SITE.url}/guides): index of the Markdown guides`,
    `- [Editor](${SITE.url}/editor): open the editor`,
    `- [Source code](${SITE.repo}): README and specification`,
    `- [Changelog](${SITE.repo}/blob/main/CHANGELOG.md)`,
    "",
    "## Author",
    "",
    `[${SITE.author}](${SITE.authorUrl})`,
    "",
  ];
  return lines.join("\n");
}
