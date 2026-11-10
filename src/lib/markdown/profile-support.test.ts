import { describe, expect, it } from "vitest";
import { checkPortability, PROFILES, supportHint, supports, type Feature } from "./markdown";

/** One sample per feature and the checker rule that flags it where the profile can't render it. */
const SAMPLES: Record<Exclude<Feature, "html">, { md: string; rule: string }> = {
  table: { md: "| a | b |\n| - | - |\n| 1 | 2 |", rule: "gfm-table" },
  task: { md: "- [ ] todo", rule: "gfm-task" },
  strike: { md: "~~gone~~", rule: "gfm-strike" },
  footnote: { md: "text[^1]\n\n[^1]: note", rule: "gfm-footnote" },
  alert: { md: "> [!NOTE]\n> hi", rule: "alert" },
  math: { md: "$$\nx\n$$", rule: "math" },
  mermaid: { md: "```mermaid\ngraph TD\n```", rule: "mermaid" },
  highlight: { md: "a ==b== c", rule: "highlight" },
  wikilink: { md: "see [[Page]]", rule: "wiki-link" },
};

describe("feature support table", () => {
  for (const [feature, { md, rule }] of Object.entries(SAMPLES) as [
    keyof typeof SAMPLES,
    (typeof SAMPLES)[keyof typeof SAMPLES],
  ][]) {
    for (const { id: profile } of PROFILES) {
      it(`${feature} on ${profile}: the checker flags it exactly when the toolbar table says unsupported`, () => {
        const flagged = checkPortability(md, profile).some((i) => i.rule === rule);
        expect(flagged).toBe(!supports(feature, profile));
      });
    }
  }

  it("treats raw HTML as unsupported everywhere, like the raw-html rule", () => {
    for (const { id: profile } of PROFILES) {
      expect(supports("html", profile)).toBe(false);
      expect(checkPortability("<kbd>x</kbd>", profile).some((i) => i.rule === "raw-html")).toBe(
        true,
      );
    }
  });
});

describe("supportHint", () => {
  it("names the profiles that render the feature", () => {
    expect(supportHint("alert", "commonmark")).toBe(
      "Supported in GFM extended and Wiki notes only",
    );
    expect(supportHint("highlight", "gfm-extended")).toBe("Supported in Wiki notes only");
    expect(supportHint("table", "commonmark")).toBe(
      "Supported in GFM extended, GFM without HTML and Wiki notes only",
    );
  });
  it("is null where the feature is supported", () => {
    expect(supportHint("alert", "gfm-extended")).toBeNull();
    expect(supportHint("table", "gfm-no-html")).toBeNull();
  });
  it("explains raw HTML separately", () =>
    expect(supportHint("html", "gfm-extended")).toBe(
      "Raw HTML may be removed or shown differently on other platforms",
    ));
});
