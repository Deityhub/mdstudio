import { describe, expect, it } from "vitest";
import { MAX_HOSTED_BYTES, TARGET_BYTES, fitBudget, rewriteImageRefs } from "./shrink";

// A stand-in encoder: bytes grow with the pixel count and the quality, like real image encoders.
const fake =
  (log: number[][] = []) =>
  async (w: number, h: number, q: number) => {
    log.push([w, h, q]);
    return new Blob([new Uint8Array(Math.round(w * h * q * 0.3))]);
  };

describe("fitBudget", () => {
  it("keeps a small picture at full size and quality", async () => {
    const log: number[][] = [];
    const blob = await fitBudget({ width: 400, height: 300 }, fake(log));
    expect(blob?.size).toBeLessThanOrEqual(TARGET_BYTES);
    expect(log).toEqual([[400, 300, 0.85]]);
  });

  it("caps the long edge at 1600 and shrinks a multi-megabyte picture down to the budget", async () => {
    const log: number[][] = [];
    const blob = await fitBudget({ width: 6000, height: 4000 }, fake(log));
    expect(log[0]![0]).toBeLessThanOrEqual(1600);
    expect(blob).not.toBeNull();
    expect(blob!.size).toBeLessThanOrEqual(TARGET_BYTES);
  });

  it("gives up with null when nothing fits under the hard limit", async () => {
    const heavy = async () => new Blob([new Uint8Array(MAX_HOSTED_BYTES + 1)]);
    expect(await fitBudget({ width: 3000, height: 3000 }, heavy)).toBeNull();
  });

  it("settles for the smallest result that is under the hard limit", async () => {
    // never reaches the 300 KB budget, but 700 KB is still acceptable
    const stubborn = async (w: number) => new Blob([new Uint8Array(w < 800 ? 700_000 : 900_000)]);
    const blob = await fitBudget({ width: 2000, height: 2000 }, stubborn);
    expect(blob?.size).toBe(700_000);
  });
});

describe("rewriteImageRefs", () => {
  const url = "https://x.test/a/abc.webp";
  it("points local image paths at the hosted URL, in every spelling", () => {
    const md = [
      "![a](images/pic.png)",
      "![b](./images/pic.png)",
      '![c](images/pic.png "Title")',
      "![d](<images/pic.png>)",
      '<img src="images/pic.png" alt="e">',
    ].join("\n");
    expect(rewriteImageRefs(md, { "pic.png": url }).split("\n")).toEqual([
      `![a](${url})`,
      `![b](${url})`,
      `![c](${url} "Title")`,
      `![d](<${url}>)`,
      `<img src="${url}" alt="e">`,
    ]);
  });

  it("leaves other images, similar names and plain text alone", () => {
    const md =
      "![a](images/pic.png.bak) ![b](images/other.png) ![c](myimages/pic.png)\nimages/pic.png";
    expect(rewriteImageRefs(md, { "pic.png": url })).toBe(md);
  });

  it("handles names with regex characters", () => {
    expect(rewriteImageRefs("![a](images/a+b(1).png)", { "a+b(1).png": url })).toBe(`![a](${url})`);
  });
});
