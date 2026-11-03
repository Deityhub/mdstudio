import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hasMathSyntax, inlineKatexCss } from "./math";

describe("hasMathSyntax", () => {
  it("is cheap and errs on the side of loading KaTeX", () => {
    expect(hasMathSyntax("price is $5")).toBe(true);
    expect(hasMathSyntax("$$\nx\n$$")).toBe(true);
    expect(hasMathSyntax("```math\nx\n```")).toBe(true);
    expect(hasMathSyntax("no dollars here")).toBe(false);
  });
});

describe("vendored KaTeX assets", () => {
  const dir = "public/katex";
  it("match the installed katex version", () => {
    const installed = JSON.parse(readFileSync("node_modules/katex/package.json", "utf8")).version;
    expect(readFileSync(`${dir}/VERSION`, "utf8").trim()).toBe(installed);
  });
  it("include every font the stylesheet asks for, and both license notices", () => {
    const css = readFileSync(`${dir}/katex.min.css`, "utf8");
    const wanted = [...css.matchAll(/url\(fonts\/([^)]+\.woff2)\)/g)].map((m) => m[1]!);
    const have = new Set(readdirSync(`${dir}/fonts`));
    expect(wanted.length).toBeGreaterThan(10);
    expect(wanted.filter((f) => !have.has(f))).toEqual([]);
    expect(existsSync(`${dir}/LICENSE-katex.txt`)).toBe(true);
    expect(existsSync(`${dir}/LICENSE-katex-fonts.txt`)).toBe(true);
  });
});

describe("inlineKatexCss", () => {
  const css =
    '@font-face{font-family:KaTeX_Main;src:url(fonts/A.woff2) format("woff2"),url(fonts/A.woff) format("woff"),url(fonts/A.ttf) format("truetype")}' +
    '@font-face{font-family:KaTeX_Math;src:url(fonts/B.woff2) format("woff2"),url(fonts/B.woff) format("woff"),url(fonts/B.ttf) format("truetype")}' +
    ".katex{font:1.21em KaTeX_Main}";
  it("embeds woff2 fonts as data URIs and drops the woff/ttf fallbacks", async () => {
    const readFont = vi.fn(async (name: string) => `BASE64-${name}`);
    const out = await inlineKatexCss(css, readFont);
    expect(out).toContain("data:font/woff2;base64,BASE64-A.woff2");
    expect(out).toContain("data:font/woff2;base64,BASE64-B.woff2");
    expect(out).not.toMatch(/\.woff\)|\.ttf\)/);
    expect(out).toContain(".katex{font:1.21em KaTeX_Main}");
    expect(readFont).toHaveBeenCalledTimes(2);
  });
});
