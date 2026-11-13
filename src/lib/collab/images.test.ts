import { describe, expect, it } from "vitest";
import { sortLocalImages, warnLocalImages } from "./images";

const text = [
  "# Notes",
  "![one](./images/one.png)",
  "![two](images/two.png) and ![alt with \\] bracket](./images/three%20x.png)",
  "![hosted](https://example.com/a.png)",
  '![titled](./images/four.png "a title")',
  "```",
  "![in code](./images/code.png)",
  "```",
  "![one again](./images/one.png)",
].join("\n");

describe("images a draft points at on this device only", () => {
  it("finds each local image once, by the name it is stored under", () => {
    const { mine, missing } = sortLocalImages(text, {
      "one.png": "data:x",
      "two.png": "data:x",
      "three x.png": "data:x",
      "four.png": "data:x",
    });
    expect(mine.sort()).toEqual(["four.png", "one.png", "three x.png", "two.png"]);
    expect(missing).toEqual([]);
  });

  it("separates the ones this browser has from the ones it does not", () => {
    const { mine, missing } = sortLocalImages(text, { "one.png": "data:x" });
    expect(mine).toEqual(["one.png"]);
    expect(missing.sort()).toEqual(["four.png", "three x.png", "two.png"]);
  });

  it("ignores hosted addresses, code blocks and text with no images", () => {
    expect(sortLocalImages("![a](https://x.co/a.png)\n\nplain", {})).toEqual({
      mine: [],
      missing: [],
    });
    expect(sortLocalImages("```\n![a](./images/a.png)\n```", {}).missing).toEqual([]);
    expect(sortLocalImages("", {})).toEqual({ mine: [], missing: [] });
  });

  it("does not count an image in the images map that the text never points at", () => {
    expect(sortLocalImages("plain", { "unused.png": "data:x" })).toEqual({ mine: [], missing: [] });
  });
});

describe("what a draft that is edited together says about them", () => {
  it("says nothing when there are none", () => {
    expect(warnLocalImages({ mine: [], missing: [] }, true)).toEqual({ mine: null, missing: null });
  });

  it("tells the person who has them that others cannot see them, and offers hosting when it can", () => {
    const w = warnLocalImages({ mine: ["a.png", "b.png"], missing: [] }, true);
    expect(w.mine).toMatchObject({ label: "2 images only you can see", canHost: true });
    expect(w.mine?.advice).toMatch(/image address/i);
    expect(warnLocalImages({ mine: ["a.png"], missing: [] }, false).mine).toMatchObject({
      label: "1 image only you can see",
      canHost: false,
    });
  });

  it("tells the others that images are not shared with them", () => {
    const w = warnLocalImages({ mine: [], missing: ["a.png"] }, true);
    expect(w.missing).toMatchObject({ label: "1 image isn't shared with you" });
    expect(w.missing?.advice).toMatch(/host/i);
  });
});
