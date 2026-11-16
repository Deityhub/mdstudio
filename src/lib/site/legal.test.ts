import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLegalCatalogue } from "../../../infra/legal-catalogue";
import { renderMarkdown, splitFrontMatter } from "@/lib/markdown/markdown";
import { LEGAL_PAGES, legalPath } from "./legal";
import { loadLegalMarkdown } from "./legal-content";
import { INDEXABLE_PATHS, SITE } from "./seo";

describe("legal pages", () => {
  it("are the privacy policy and the terms, each described by its own front matter", () => {
    expect(LEGAL_PAGES.map((p) => p.slug)).toEqual(["privacy", "terms"]);
    for (const page of LEGAL_PAGES) {
      const { data } = splitFrontMatter(readFileSync(`content/legal/${page.slug}.md`, "utf8"));
      expect(data?.["slug"], page.slug).toBe(page.slug);
      expect(data?.["title"], page.slug).toBe(page.title);
      expect(data?.["description"], page.slug).toBe(page.description);
      expect(String(data?.["published"]), page.slug).toBe(page.published);
      expect(String(data?.["updated"]), page.slug).toBe(page.updated);
      // UTC moments with their time, so two changes on one day can be told apart
      for (const at of [page.published, page.updated])
        expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(page.updated >= page.published, page.slug).toBe(true);
      expect(page.description.length).toBeGreaterThan(40);
      expect(legalPath(page.slug)).toBe(`/${page.slug}`);
    }
    expect(readLegalCatalogue().map((p) => p.slug)).toEqual(["privacy", "terms"]);
  });

  it("are in the sitemap", () => {
    for (const page of LEGAL_PAGES) expect(INDEXABLE_PATHS).toContain(legalPath(page.slug));
  });

  it("load with the site details filled in, and return null for an unknown page", async () => {
    expect(await loadLegalMarkdown("nope")).toBeNull();
    for (const page of LEGAL_PAGES) {
      const md = (await loadLegalMarkdown(page.slug))!;
      expect(md).not.toMatch(/^---/);
      expect(md).toContain(SITE.contactEmail);
      // the maintainer is named once, as the maintainer; the text speaks as "we"
      expect(md.split(SITE.author)).toHaveLength(2);
      expect(md).toContain(`maintained by [${SITE.author}](${SITE.authorUrl})`);
      expect(md).not.toMatch(/\b(I|me|my)\b/);
      expect(md).not.toMatch(/\{\{/);
    }
  });

  it("say what Google asked for, and what the product really does", async () => {
    const privacy = (await loadLegalMarkdown("privacy"))!;
    // what Google checks for on the consent screen
    expect(privacy).toContain("Google API Services User Data Policy");
    expect(privacy).toContain("Limited Use");
    expect(privacy).toMatch(/email address, your name and your profile picture/);
    // the promises that are true of this app
    expect(privacy).toMatch(/never saved or sent to mdstudio/);
    expect(privacy).toMatch(/do not use analytics/);
    expect(privacy).toMatch(/not end-to-end encrypted/);
  });

  it("cover editing together, the live connection and changing the email address", async () => {
    const privacy = (await loadLegalMarkdown("privacy"))!;
    const terms = (await loadLegalMarkdown("terms"))!;
    // who sees what, what is stored, and what a removed person keeps
    expect(privacy).toMatch(/## Editing together/);
    expect(privacy).toMatch(/invite/i);
    expect(privacy).toMatch(/copy .* on their device/);
    expect(privacy).toMatch(/Durable Objects/);
    expect(privacy).toMatch(/new address/);
    expect(terms).toMatch(/## Editing together/);
    expect(terms).toMatch(/invite/i);
  });

  it("render to safe HTML with working mailto links", async () => {
    for (const page of LEGAL_PAGES) {
      const html = renderMarkdown((await loadLegalMarkdown(page.slug))!, "gfm-extended");
      expect(html).toContain(`href="mailto:${SITE.contactEmail}"`);
      expect(html).not.toContain("<script");
    }
  });

  it("set no age limit", async () => {
    for (const page of LEGAL_PAGES)
      expect(await loadLegalMarkdown(page.slug)).not.toMatch(/\b(16|children|aged)\b/i);
  });

  it("link to each other", async () => {
    expect(await loadLegalMarkdown("terms")).toContain("](/privacy)");
  });
});
