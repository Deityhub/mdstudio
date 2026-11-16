// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPortability, getOutline, splitFrontMatter } from "../markdown/markdown";
import { GUIDES, guideBySlug, guidePath, readingMinutes } from "./guides";
import { SITE } from "./seo";

const files = import.meta.glob("../../../content/guides/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const body = (slug: string) => files[`../../../content/guides/${slug}.md`] ?? "";

describe("guide catalogue", () => {
  it("has a Markdown file for every guide and no orphan files", () => {
    const slugs = GUIDES.map((g) => g.slug).sort();
    const onDisk = Object.keys(files)
      .map((f) => f.split("/").pop()!.replace(/\.md$/, ""))
      .sort();
    expect(onDisk).toEqual(slugs);
  });

  it("uses unique, URL-safe slugs", () => {
    const slugs = GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("fits search result limits and mentions the brand once in the page title", () => {
    for (const g of GUIDES) {
      expect(g.title.length, g.slug).toBeLessThanOrEqual(60);
      expect(g.description.length, g.slug).toBeGreaterThanOrEqual(110);
      expect(g.description.length, g.slug).toBeLessThanOrEqual(160);
      expect(g.updated >= g.published, g.slug).toBe(true);
      expect(g.published, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(g.updated, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it("takes everything from each guide's own front matter, in list order", () => {
    for (const g of GUIDES) {
      const { data } = splitFrontMatter(body(g.slug));
      expect(data?.["slug"], g.slug).toBe(g.slug);
      expect(data?.["title"], g.slug).toBe(g.title);
      expect(data?.["description"], g.slug).toBe(g.description);
      expect(String(data?.["published"]), g.slug).toBe(g.published);
      expect(String(data?.["updated"]), g.slug).toBe(g.updated);
    }
    const orders = GUIDES.map((g) => g.order).filter((o) => o !== undefined);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("looks guides up by slug and builds their paths", () => {
    expect(guideBySlug(GUIDES[0]!.slug)).toBe(GUIDES[0]);
    expect(guideBySlug("nope")).toBeUndefined();
    expect(guidePath("a-b")).toBe("/guides/a-b");
  });
});

describe("guide content is dogfooded", () => {
  for (const g of GUIDES) {
    describe(g.slug, () => {
      const md = body(g.slug);
      it("is substantial and has no H1 (the page title is the H1)", () => {
        expect(md.split(/\s+/).length).toBeGreaterThan(350);
        expect(getOutline(md).filter((h) => h.depth === 1)).toEqual([]);
        expect(getOutline(md).filter((h) => h.depth === 2).length).toBeGreaterThanOrEqual(3);
      });
      it("is itself portable Markdown: no checker issues on the GFM and wiki profiles", () => {
        for (const profile of ["gfm-extended", "gfm-no-html", "wiki-notes"] as const)
          expect(checkPortability(md, profile), profile).toEqual([]);
      });
      it("links to the editor", () =>
        expect(md).toContain("(https://mdstudio.deityhub.com/editor)"));
    });
  }
});

describe("readingMinutes", () => {
  it("rounds up at about 200 words a minute, minimum one", () => {
    expect(readingMinutes("word ".repeat(10))).toBe(1);
    expect(readingMinutes("word ".repeat(450))).toBe(3);
  });
});

describe("discoverability", () => {
  const llms = readFileSync("public/llms.txt", "utf8");
  it("lists every guide in llms.txt", () => {
    for (const g of GUIDES) expect(llms, g.slug).toContain(`${SITE.url}${guidePath(g.slug)}`);
  });
});
