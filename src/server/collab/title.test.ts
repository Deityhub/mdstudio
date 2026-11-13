import { describe, expect, it } from "vitest";
import { quickTitle } from "./title";

describe("quickTitle", () => {
  it("takes the title from front matter first, then the first heading", () => {
    expect(quickTitle("---\ntitle: From front matter\n---\n\n# Heading\n", "x")).toBe(
      "From front matter",
    );
    expect(quickTitle("Intro line\n\n# The heading\n\nBody", "x")).toBe("The heading");
    expect(quickTitle("## Second level counts too\n", "x")).toBe("Second level counts too");
  });

  it("keeps the title it had when the text has none", () => {
    expect(quickTitle("just a paragraph", "Kept")).toBe("Kept");
    expect(quickTitle("", "Kept")).toBe("Kept");
    expect(quickTitle("#    \n", "Kept")).toBe("Kept");
  });

  it("is short enough to show, and one line", () => {
    expect(quickTitle(`# ${"word ".repeat(200)}`, "x").length).toBeLessThanOrEqual(120);
    expect(quickTitle("---\ntitle: 'Quoted title'\n---\n", "x")).toBe("Quoted title");
  });
});
