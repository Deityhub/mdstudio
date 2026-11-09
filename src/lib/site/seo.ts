// Single source for everything search engines and AI assistants read: page meta, structured data,
// the sitemap and the IndexNow payload. No Node APIs, so it runs on Workers, Node and the browser.

import { GUIDES, guidePath, type Guide } from "./guides";
import { BRAND, FAQ, FEATURE_LIST, LONG_DESCRIPTION, type Faq } from "./seo-content";

export const SITE = {
  url: "https://mdstudio.deityhub.com",
  name: BRAND.name,
  alternateName: BRAND.alternateName,
  tagline: BRAND.tagline,
  description: BRAND.description,
  author: "Chizoba Jude Ojini",
  repo: "https://github.com/Deityhub/mdstudio",
  image: "/og.png",
  imageAlt: BRAND.imageAlt,
} as const;

export const absoluteUrl = (path: string) => `${SITE.url}${path}`;

export type SitemapEntry = { path: string; lastmod?: string };

/** Pages worth indexing. Editor drafts are private and the API is not content. */
export const SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/" },
  { path: "/guides" },
  ...GUIDES.map((g) => ({ path: guidePath(g.slug), lastmod: g.updated })),
];
export const INDEXABLE_PATHS: string[] = SITEMAP_ENTRIES.map((e) => e.path);

type PageInput = { title: string; description: string; path: string; noindex?: boolean };

export function pageHead({ title, description, path, noindex = false }: PageInput) {
  const url = absoluteUrl(path);
  const image = absoluteUrl(SITE.image);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: SITE.imageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      ...(noindex ? [{ name: "robots", content: "noindex" }] : []),
    ],
    links: noindex ? [] : [{ rel: "canonical", href: url }],
  };
}

/** Site-wide structured data: the app itself and the site it lives on. */
export const jsonLd = () => [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${SITE.url}/#app`,
    name: SITE.name,
    alternateName: SITE.alternateName,
    url: absoluteUrl("/"),
    description: LONG_DESCRIPTION,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Markdown editor",
    operatingSystem: "Any (runs in the browser)",
    browserRequirements: "Requires a modern browser with IndexedDB",
    inLanguage: "en",
    featureList: FEATURE_LIST,
    keywords:
      "markdown editor, markdown preview, markdown linter, portable markdown, GitHub Flavored Markdown, CommonMark, dev.to, Obsidian, KaTeX, Mermaid",
    license: "https://opensource.org/license/mit",
    author: { "@type": "Person", name: SITE.author },
    codeRepository: SITE.repo,
    sameAs: [SITE.repo],
    image: absoluteUrl(SITE.image),
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#site`,
    name: SITE.name,
    alternateName: SITE.alternateName,
    url: absoluteUrl("/"),
    description: SITE.description,
    inLanguage: "en",
    publisher: { "@type": "Person", name: SITE.author },
  },
];

/** FAQPage data for pages that show the same questions on screen (Google requires that). */
export const faqJsonLd = (faq: Faq[] = FAQ) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: { "@type": "Answer", text: f.answer },
  })),
});

/** Serializes JSON-LD for an inline script: `<` is escaped so content can never close the tag. */
export const jsonLdScript = (data: unknown) => ({
  type: "application/ld+json",
  children: JSON.stringify(data).replace(/</g, "\\u003c"),
});

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const sitemapXml = (entries: SitemapEntry[] = SITEMAP_ENTRIES) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(
      (e) =>
        `  <url><loc>${xmlEscape(absoluteUrl(e.path))}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`,
    )
    .join("\n")}\n</urlset>\n`;

/** Structured data for a guide: a technical article by the site author. */
export const articleJsonLd = (guide: Guide) => ({
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: guide.title,
  description: guide.description,
  datePublished: guide.published,
  dateModified: guide.updated,
  inLanguage: "en",
  author: { "@type": "Person", name: SITE.author },
  publisher: { "@type": "Person", name: SITE.author },
  mainEntityOfPage: absoluteUrl(guidePath(guide.slug)),
  image: absoluteUrl(SITE.image),
});

export const breadcrumbJsonLd = (trail: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((t, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: t.name,
    item: absoluteUrl(t.path),
  })),
});

/** Body for https://api.indexnow.org/indexnow (Bing, Yandex, Seznam and others). */
export const indexNowPayload = (key: string, paths: string[] = INDEXABLE_PATHS) => ({
  host: new URL(SITE.url).host,
  key,
  keyLocation: absoluteUrl(`/${key}.txt`),
  urlList: paths.map(absoluteUrl),
});
