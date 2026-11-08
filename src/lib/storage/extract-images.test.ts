import { describe, expect, it } from "vitest";
import { dataUriParts, extractDataImages, imageExt, pointImagesAt, usedImages } from "./archive";

const png = "data:image/png;base64,iVBORw0KGgo=";
const jpg = "data:image/jpeg;base64,/9j/4AAQ";

describe("dataUriParts and imageExt", () => {
  it("split a data URI into its type and base64 text", () => {
    expect(dataUriParts(png)).toEqual({ mime: "image/png", base64: "iVBORw0KGgo=" });
    expect(imageExt("image/jpeg")).toBe("jpg");
    expect(imageExt("image/svg+xml")).toBe("svg");
    expect(imageExt("text/html")).toBeUndefined();
  });
  it("refuse anything else", () => {
    for (const bad of [
      "data:image/png,notbase64",
      "data:image/png;base64,***",
      "https://x/y.png",
      "",
    ])
      expect(dataUriParts(bad)).toBeNull();
  });
});

describe("extractDataImages", () => {
  it("turns inline images into files beside the text and points the text at them", () => {
    const md = `# T\n\n![one](${png})\n\ntext ![two](${jpg} "Title") end\n`;
    const out = extractDataImages(md);
    expect(out.md).toBe(
      `# T\n\n![one](images/inline-1.png)\n\ntext ![two](images/inline-2.jpg "Title") end\n`,
    );
    expect(out.files).toEqual([
      { name: "inline-1.png", dataUri: png },
      { name: "inline-2.jpg", dataUri: jpg },
    ]);
    expect(out.md).not.toContain("base64");
  });

  it("gives the same image one file", () => {
    const out = extractDataImages(`![a](${png})\n![b](${png})`);
    expect(out.files).toHaveLength(1);
    expect(out.md).toBe("![a](images/inline-1.png)\n![b](images/inline-1.png)");
  });

  it("also takes them out of <img> tags", () => {
    const out = extractDataImages(`<img src="${png}" alt="x">`);
    expect(out.md).toBe('<img src="images/inline-1.png" alt="x">');
  });

  it("leaves other images, links and code alone", () => {
    const md =
      "![x](https://a/b.png)\n![y](images/local.png)\n[link](data:text/html;base64,AAAA)\n";
    expect(extractDataImages(md)).toEqual({ md, files: [] });
  });
});

describe("pointImagesAt", () => {
  const store = { "pic.png": png, "two.jpg": jpg };
  it("says which of the draft's images the text uses, and spells their paths one way", () => {
    const md =
      "![a](images/pic.png) ![b](./images/pic.png) ![c](../up/two.jpg) ![d](https://x/y.png) ![e](gone.png)";
    const out = pointImagesAt(md, store);
    expect(out.used.sort()).toEqual(["pic.png", "two.jpg"]);
    expect(out.content).toBe(
      "![a](images/pic.png) ![b](images/pic.png) ![c](images/two.jpg) ![d](https://x/y.png) ![e](gone.png)",
    );
  });
});

describe("usedImages", () => {
  it("is the part of the draft's image store that the text uses", () => {
    const store = { "pic.png": png, "two.jpg": jpg, "unused.png": png };
    expect(usedImages("![a](images/pic.png) ![b](../x/two.jpg)", store)).toEqual({
      "pic.png": png,
      "two.jpg": jpg,
    });
    expect(usedImages("no images", store)).toEqual({});
  });
});
