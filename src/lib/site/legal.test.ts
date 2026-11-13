import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown/markdown";
import { LEGAL_PAGES, legalPath } from "./legal";
import { loadLegalMarkdown } from "./legal-content";
import { INDEXABLE_PATHS, SITE } from "./seo";

describe("legal pages", () => {
  it("are the privacy policy and the terms, each with a dated entry", () => {
    expect(LEGAL_PAGES.map((p) => p.slug)).toEqual(["privacy", "terms"]);
    for (const page of LEGAL_PAGES) {
      expect(page.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(page.description.length).toBeGreaterThan(40);
      expect(legalPath(page.slug)).toBe(`/${page.slug}`);
    }
  });

  it("are in the sitemap", () => {
    for (const page of LEGAL_PAGES) expect(INDEXABLE_PATHS).toContain(legalPath(page.slug));
  });

  it("load with the site details filled in, and return null for an unknown page", async () => {
    expect(await loadLegalMarkdown("nope")).toBeNull();
    for (const page of LEGAL_PAGES) {
      const md = (await loadLegalMarkdown(page.slug))!;
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
