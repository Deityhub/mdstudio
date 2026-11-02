// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildArchive,
  dataUriToBytes,
  mapImageSrc,
  parseArchive,
  type ArchiveDoc,
} from "./archive";

const t = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);
const PNG = "data:image/png;base64,iVBORw0KGgo="; // 8 bytes
const doc = (title: string, content: string, extra: Partial<ArchiveDoc> = {}): ArchiveDoc => ({
  title,
  content,
  images: {},
  ...extra,
});
const paths = (e: { path: string }[]) => e.map((x) => x.path);

describe("mapImageSrc", () => {
  it("rewrites markdown images and <img> tags, and leaves other links alone", () => {
    const md = '![a](x.png "t")\n<img alt="b" src=\'y.png\'>\n[link](z.png)';
    expect(mapImageSrc(md, (s) => `./images/${s}`)).toBe(
      '![a](./images/x.png "t")\n<img alt="b" src=\'./images/y.png\'>\n[link](z.png)',
    );
  });
  it("keeps a source when the callback returns undefined", () =>
    expect(mapImageSrc("![a](x.png)", () => undefined)).toBe("![a](x.png)"));
});

describe("dataUriToBytes", () => {
  it("decodes base64 data URIs and rejects anything else", () => {
    expect(dataUriToBytes(PNG)?.bytes).toHaveLength(8);
    expect(dataUriToBytes("https://a.dev/x.png")).toBeNull();
    expect(dataUriToBytes("data:text/plain,hello")).toBeNull();
  });
});

describe("buildArchive", () => {
  it("writes each draft as a Markdown file, in its folder", () => {
    const e = buildArchive([
      doc("My first post", "# a", { folder: "Blog" }),
      doc("Loose note", "# b"),
    ]);
    expect(paths(e)).toEqual(["Blog/my-first-post.md", "loose-note.md"]);
    expect(str(e[0]!.data)).toBe("# a");
  });

  it("keeps duplicate titles apart and makes folder names safe for paths", () => {
    const e = buildArchive([
      doc("Same", "1", { folder: "a/b:c" }),
      doc("Same", "2", { folder: "a/b:c" }),
      doc("SAME", "3"),
    ]);
    expect(paths(e)).toEqual(["a-b-c/same.md", "a-b-c/same-2.md", "same.md"]);
  });

  it("writes images next to the draft under images/ and points references there", () => {
    const e = buildArchive([
      doc("Pic", "![x](./images/a.png)\n![y](elsewhere/b.png)\n![z](https://a.dev/c.png)", {
        images: { "a.png": PNG, "b.png": PNG },
      }),
    ]);
    expect(paths(e)).toEqual(["pic.md", "images/a.png", "images/b.png"]);
    expect(str(e[0]!.data)).toBe(
      "![x](./images/a.png)\n![y](./images/b.png)\n![z](https://a.dev/c.png)",
    );
    expect(e[1]!.data).toHaveLength(8);
  });

  it("renames an image when another draft in the same place has a different one with that name", () => {
    const other = "data:image/png;base64,AAECAwQFBgc=";
    const e = buildArchive([
      doc("One", "![](images/p.png)", { images: { "p.png": PNG } }),
      doc("Two", "![](images/p.png)", { images: { "p.png": other } }),
      doc("Three", "![](images/p.png)", { images: { "p.png": PNG } }),
    ]);
    expect(paths(e)).toEqual(["one.md", "images/p.png", "two.md", "images/p-2.png", "three.md"]);
    expect(str(e[2]!.data)).toBe("![](./images/p-2.png)");
    expect(str(e[4]!.data)).toBe("![](images/p.png)");
  });

  it("does not touch the text otherwise", () =>
    expect(str(buildArchive([doc("T", "a\r\n\r\n  b  \r\n")])[0]!.data)).toBe(
      "a\r\n\r\n  b  \r\n",
    ));
});

describe("parseArchive", () => {
  it("imports Markdown and text files, with the folder they sit in", () => {
    const { docs, skipped } = parseArchive([
      { path: "root.md", data: t("# Root") },
      { path: "Blog/post.markdown", data: t("---\ntitle: From front matter\n---\nbody") },
      { path: "a/b/deep.txt", data: t("plain words") },
      { path: "notes.pdf", data: t("x") },
    ]);
    expect(docs.map((d) => [d.title, d.folder])).toEqual([
      ["Root", undefined],
      ["From front matter", "Blog"],
      ["deep", "a / b"],
    ]);
    expect(skipped).toBe(1);
  });

  it("ignores hidden files, macOS metadata and paths that climb out", () => {
    const { docs } = parseArchive([
      { path: "__MACOSX/._a.md", data: t("junk") },
      { path: ".hidden/a.md", data: t("junk") },
      { path: "../escape.md", data: t("junk") },
      { path: "ok.md", data: t("# ok") },
    ]);
    expect(docs.map((d) => d.title)).toEqual(["ok"]);
  });

  it("strips a byte order mark and reads backslash paths", () => {
    const { docs } = parseArchive([{ path: "Win\\file.md", data: t("﻿# Hi") }]);
    expect(docs[0]).toMatchObject({ title: "Hi", content: "# Hi", folder: "Win" });
  });

  it("attaches images the text refers to, relative to the file", () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const { docs } = parseArchive([
      {
        path: "Blog/post.md",
        data: t(
          "![a](images/a.png)\n![b](./images/a.png)\n![c](../shared/Pic%201.PNG)\n![d](missing.png)\n![e](https://a.dev/e.png)",
        ),
      },
      { path: "Blog/images/a.png", data: png },
      { path: "shared/Pic 1.PNG", data: png },
    ]);
    const d = docs[0]!;
    expect(Object.keys(d.images).sort()).toEqual(["a.png", "pic-1.png"]);
    expect(d.images["a.png"]).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(d.content).toBe(
      "![a](images/a.png)\n![b](./images/a.png)\n![c](./images/pic-1.png)\n![d](missing.png)\n![e](https://a.dev/e.png)",
    );
  });

  it("keeps two different images with the same file name apart", () => {
    const { docs } = parseArchive([
      { path: "p.md", data: t("![](one/x.png) ![](two/x.png)") },
      { path: "one/x.png", data: Uint8Array.from([1, 2, 3]) },
      { path: "two/x.png", data: Uint8Array.from([4, 5, 6]) },
    ]);
    expect(Object.keys(docs[0]!.images).sort()).toEqual(["x-1.png", "x.png"]);
    expect(docs[0]!.content).toBe("![](./images/x.png) ![](./images/x-1.png)");
  });

  it("returns nothing for an archive with no Markdown", () =>
    expect(parseArchive([{ path: "a.png", data: t("x") }]).docs).toEqual([]));
});

describe("export then import", () => {
  it("brings back the same drafts, folders and images", () => {
    const docs = [
      doc("One", "# One\n\n![p](./images/p.png)", { folder: "Blog", images: { "p.png": PNG } }),
      doc("Two", "# Two\n\nplain"),
    ];
    const back = parseArchive(buildArchive(docs)).docs;
    expect(back.map((d) => [d.title, d.folder, d.content])).toEqual([
      ["One", "Blog", "# One\n\n![p](./images/p.png)"],
      ["Two", undefined, "# Two\n\nplain"],
    ]);
    expect(back[0]!.images).toEqual({ "p.png": PNG });
  });
});
