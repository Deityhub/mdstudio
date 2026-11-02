// The guide catalogue: metadata only, so lists, the sitemap and structured data can use it without
// loading the Markdown engine. The article text lives in content/guides/<slug>.md and is rendered
// with mdstudio's own pipeline.

export type Guide = {
  slug: string;
  /** Page title and H1, at most 60 characters. */
  title: string;
  /** Meta description, 110 to 160 characters. */
  description: string;
  /** ISO dates (YYYY-MM-DD). */
  published: string;
  updated: string;
};

export const GUIDES: Guide[] = [
  {
    slug: "markdown-portability",
    title: "Portable Markdown: Why It Renders Differently Everywhere",
    description:
      "Why the same Markdown looks different on GitHub, dev.to and Obsidian, and a checklist for making your writing render the same on every platform.",
    published: "2026-11-02",
    updated: "2026-11-02",
  },
  {
    slug: "commonmark-vs-github-flavored-markdown",
    title: "CommonMark vs GitHub Flavored Markdown: What Differs",
    description:
      "A clear comparison of CommonMark and GitHub Flavored Markdown: tables, task lists, strikethrough, footnotes, autolinks and alerts, and when each one matters.",
    published: "2026-11-02",
    updated: "2026-11-02",
  },
  {
    slug: "obsidian-to-github-markdown",
    title: "Obsidian to GitHub Markdown: Wiki-links, Callouts & More",
    description:
      "How to share Obsidian notes outside Obsidian: convert wiki-links, highlights, callouts and embeds so they render on GitHub, dev.to and static sites.",
    published: "2026-11-02",
    updated: "2026-11-02",
  },
  {
    slug: "markdown-for-devto-and-hashnode",
    title: "Writing Markdown for dev.to and Hashnode",
    description:
      "Tips for writing blog posts in Markdown that publish cleanly to dev.to and Hashnode: front matter, images, code blocks, raw HTML and what to check first.",
    published: "2026-11-02",
    updated: "2026-11-02",
  },
  {
    slug: "markdown-line-breaks",
    title: "Markdown Line Breaks and Paragraphs Explained",
    description:
      "How line breaks work in Markdown: paragraphs, soft breaks and hard breaks, why trailing spaces are fragile, and which method renders the same everywhere.",
    published: "2026-11-02",
    updated: "2026-11-02",
  },
  {
    slug: "markdown-images",
    title: "Markdown Images: Paths, Alt Text and Portability",
    description:
      "How to add images in Markdown so they show up everywhere: relative paths, hosted URLs, base64 data URIs, alt text and the mistakes that break previews.",
    published: "2026-11-02",
    updated: "2026-11-02",
  },
  {
    slug: "markdown-math-and-diagrams",
    title: "Math and Mermaid Diagrams in Markdown: Where They Work",
    description:
      "Where LaTeX math and Mermaid diagrams render in Markdown: GitHub and Obsidian support them, other platforms do not. How to write them and what to do instead.",
    published: "2026-11-02",
    updated: "2026-11-02",
  },
];

export const guidePath = (slug: string) => `/guides/${slug}`;

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);

/** About 200 words a minute, never less than a minute. */
export const readingMinutes = (md: string) =>
  Math.max(1, Math.ceil(md.split(/\s+/).filter(Boolean).length / 200));
