import { describe, expect, it } from "vitest";
import { BRAND, FAQ, FEATURE_LIST } from "./seo-content";
import { GUIDES } from "./guides";
import {
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScript,
  INDEXABLE_PATHS,
  indexNowPayload,
  jsonLd,
  pageHead,
  sitemapXml,
  SITE,
} from "./seo";

const meta = (head: ReturnType<typeof pageHead>, key: string) =>
  head.meta.find((m) => ("name" in m && m.name === key) || ("property" in m && m.property === key));

describe("absoluteUrl", () => {
  it("joins the site origin with a path", () => {
    expect(absoluteUrl("/")).toBe(`${SITE.url}/`);
    expect(absoluteUrl("/editor")).toBe(`${SITE.url}/editor`);
  });
});

describe("pageHead", () => {
  const head = pageHead({ title: "Hello", description: "A page.", path: "/x" });

  it("sets title, description and a canonical link", () => {
    expect(head.meta).toContainEqual({ title: "Hello" });
    expect(meta(head, "description")).toMatchObject({ content: "A page." });
    expect(head.links).toEqual([{ rel: "canonical", href: `${SITE.url}/x` }]);
  });
  it("mirrors the title, description, url and image into Open Graph and Twitter", () => {
    expect(meta(head, "og:title")).toMatchObject({ content: "Hello" });
    expect(meta(head, "og:description")).toMatchObject({ content: "A page." });
    expect(meta(head, "og:url")).toMatchObject({ content: `${SITE.url}/x` });
    expect(meta(head, "og:image")).toMatchObject({ content: `${SITE.url}/og.png` });
    expect(meta(head, "twitter:card")).toMatchObject({ content: "summary_large_image" });
    expect(meta(head, "twitter:image")).toMatchObject({ content: `${SITE.url}/og.png` });
  });
  it("only adds robots when the page must not be indexed", () => {
    expect(meta(head, "robots")).toBeUndefined();
    const hidden = pageHead({ title: "t", description: "d", path: "/p", noindex: true });
    expect(meta(hidden, "robots")).toMatchObject({ content: "noindex" });
    expect(hidden.links).toEqual([]); // no canonical for pages we ask engines to drop
  });
});

describe("brand copy", () => {
  it("fits search result limits", () => {
    expect(BRAND.homeTitle.length).toBeLessThanOrEqual(60);
    expect(BRAND.description.length).toBeLessThanOrEqual(160);
    expect(BRAND.description.length).toBeGreaterThan(110);
  });
  it("leads with the product name and keeps the old name as an alternate", () => {
    expect(BRAND.homeTitle.startsWith("mdstudio")).toBe(true);
    expect(SITE.alternateName).toBe("Markdown Studio");
  });
  it("makes no claims the product cannot back up yet", () => {
    const text = [BRAND.description, ...FEATURE_LIST, ...FAQ.map((f) => f.answer)].join(" ");
    // offline use is real (service worker, tested), cloud sync and collaboration are not built yet
    expect(text).not.toMatch(/cloud sync|sync across|collaborat|real-time/i);
  });
});

describe("jsonLd", () => {
  const [app, site] = jsonLd() as unknown as [Record<string, unknown>, Record<string, unknown>];
  it("describes a free web application with an author, license and features", () => {
    expect(app).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "mdstudio",
      alternateName: "Markdown Studio",
      url: `${SITE.url}/`,
      applicationCategory: "DeveloperApplication",
      offers: { "@type": "Offer", price: "0" },
      author: { "@type": "Person", name: SITE.author },
    });
    expect(app["featureList"]).toEqual(FEATURE_LIST);
  });
  it("describes the website", () =>
    expect(site).toMatchObject({ "@type": "WebSite", name: "mdstudio" }));
  it("builds FAQPage data from the same questions shown on the page", () => {
    const faq = faqJsonLd() as { mainEntity: { name: string }[] };
    expect(faq.mainEntity.map((q) => q.name)).toEqual(FAQ.map((f) => f.question));
  });
  it("escapes angle brackets so JSON-LD can never close its script tag", () => {
    expect(jsonLdScript({ x: "</script><b>" }).children).not.toContain("<");
  });
});

describe("sitemapXml", () => {
  it("lists every entry as an absolute URL, escaped", () => {
    const xml = sitemapXml([{ path: "/" }, { path: "/a&b", lastmod: "2026-11-02" }]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain(`<loc>${SITE.url}/</loc>`);
    expect(xml).toContain(`<loc>${SITE.url}/a&amp;b</loc><lastmod>2026-11-02</lastmod>`);
  });
  it("includes the home page, the guides index and every guide with its update date", () => {
    const xml = sitemapXml();
    expect(xml).toContain(`<loc>${SITE.url}/</loc>`);
    expect(xml).toContain(`<loc>${SITE.url}/guides</loc>`);
    for (const g of GUIDES)
      expect(xml).toContain(
        `<loc>${SITE.url}/guides/${g.slug}</loc><lastmod>${g.updated}</lastmod>`,
      );
  });
  it("never lists the editor drafts or API", () => {
    for (const p of INDEXABLE_PATHS) expect(p).not.toMatch(/^\/(api|editor)/);
  });
});

describe("articleJsonLd", () => {
  const g = GUIDES[0]!;
  const ld = articleJsonLd(g) as Record<string, unknown>;
  it("describes the guide as an article with author, dates and canonical page", () => {
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: g.title,
      description: g.description,
      datePublished: g.published,
      dateModified: g.updated,
      author: { "@type": "Person", name: SITE.author },
      mainEntityOfPage: `${SITE.url}/guides/${g.slug}`,
      image: `${SITE.url}/og.png`,
    });
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers the trail and makes every item an absolute URL", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
    ]) as { itemListElement: { position: number; item: string; name: string }[] };
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(ld.itemListElement[1]).toMatchObject({ name: "Guides", item: `${SITE.url}/guides` });
  });
});

describe("indexNowPayload", () => {
  it("submits absolute URLs with the key and its public location", () => {
    expect(indexNowPayload("abc123", ["/", "/x"])).toEqual({
      host: new URL(SITE.url).host,
      key: "abc123",
      keyLocation: `${SITE.url}/abc123.txt`,
      urlList: [`${SITE.url}/`, `${SITE.url}/x`],
    });
  });
});
