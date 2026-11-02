import { describe, expect, it } from "vitest";
import { GUIDES } from "./guides";
import {
  formatDate,
  headingId,
  headingIds,
  loadGuideMarkdown,
  relatedGuides,
  withHeadingIds,
} from "./guides-content";

describe("headingId / headingIds", () => {
  it("makes lowercase, hyphenated anchors", () => {
    expect(headingId("Wiki-links & embeds!")).toBe("wiki-links-embeds");
    expect(headingId("???")).toBe("section");
  });
  it("keeps duplicates unique", () =>
    expect(headingIds(["Notes", "Notes", "Other", "Notes"])).toEqual([
      "notes",
      "notes-2",
      "other",
      "notes-3",
    ]));
});

describe("withHeadingIds", () => {
  it("adds ids to h2 tags in order and leaves other headings alone", () => {
    const html = "<h2>One</h2><p>x</p><h3>Sub</h3><h2>Two</h2>";
    expect(withHeadingIds(html, ["one", "two"])).toBe(
      '<h2 id="one">One</h2><p>x</p><h3>Sub</h3><h2 id="two">Two</h2>',
    );
  });
  it("tolerates more headings than ids", () =>
    expect(withHeadingIds("<h2>A</h2><h2>B</h2>", ["a"])).toBe('<h2 id="a">A</h2><h2>B</h2>'));
});

describe("loadGuideMarkdown", () => {
  it("loads a guide's text and returns null for an unknown slug", async () => {
    expect(await loadGuideMarkdown(GUIDES[0]!.slug)).toContain("mdstudio");
    expect(await loadGuideMarkdown("nope")).toBeNull();
  });
});

describe("helpers", () => {
  it("formats dates the same on server and client", () =>
    expect(formatDate("2026-11-02")).toBe("November 2, 2026"));
  it("lists related guides without the current one", () => {
    const related = relatedGuides(GUIDES, GUIDES[0]!.slug);
    expect(related).toHaveLength(3);
    expect(related.map((g) => g.slug)).not.toContain(GUIDES[0]!.slug);
  });
});
