// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUIDES } from "./guides";
import { llmsTxt } from "./llms";
import { FAQ, FEATURE_LIST } from "./seo-content";

describe("llms.txt", () => {
  const text = llmsTxt(GUIDES);

  it("is the file in public/, so the copy cannot drift (run `bun run llms` to update it)", () =>
    expect(readFileSync("public/llms.txt", "utf8")).toBe(text));

  it("follows the copy: every feature, every question and every guide", () => {
    for (const f of FEATURE_LIST) expect(text).toContain(`- ${f}`);
    for (const q of FAQ) expect(text).toContain(q.question);
    for (const g of GUIDES) expect(text).toContain(`/guides/${g.slug}`);
  });
});
