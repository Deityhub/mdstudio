// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createZip, readZip, ZIP_LIMITS, type ZipEntry } from "./zip";

const text = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);
const entry = (path: string, s: string): ZipEntry => ({ path, data: text(s) });

describe("zip round trip", () => {
  it("writes and reads files with folders, bytes and non-ASCII names intact", async () => {
    const binary = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) % 256);
    const zip = await createZip([
      entry("a.md", "# Hello\n\nworld"),
      entry("Blog/Über café.md", "unicode ✓"),
      { path: "Blog/images/x.png", data: binary },
      entry("empty.md", ""),
    ]);
    const back = await readZip(zip);
    expect(back.map((e) => e.path)).toEqual([
      "a.md",
      "Blog/Über café.md",
      "Blog/images/x.png",
      "empty.md",
    ]);
    expect(str(back[0]!.data)).toBe("# Hello\n\nworld");
    expect(str(back[1]!.data)).toBe("unicode ✓");
    expect(Array.from(back[2]!.data)).toEqual(Array.from(binary));
    expect(back[3]!.data).toHaveLength(0);
  });

  it("compresses repetitive text", async () => {
    const big = "the same line again\n".repeat(2000);
    const zip = await createZip([entry("big.md", big)]);
    expect(zip.length).toBeLessThan(big.length / 5);
    expect(str((await readZip(zip))[0]!.data)).toBe(big);
  });

  it("makes an empty archive that reads back empty", async () =>
    expect(await readZip(await createZip([]))).toEqual([]));

  // made with `zip -r`: a deflated file, a stored one and a directory entry
  it("reads an archive produced by another tool", async () => {
    const b64 =
      "UEsDBBQAAAAIAHePYl2lJb74HwAAABcDAAAEABwAYS5tZFVUCQADks/oao3P6Gp1eAsAAQT1AQAABAAAAABTVkgrys9VqMos4MrJzEtVyE9TKEmtKBnljHJGMgcAUEsDBAoAAAAAAHWPYl0AAAAAAAAAAAAAAAAEABwAZGlyL1VUCQADjc/oao3P6Gp1eAsAAQT1AQAABAAAAABQSwMECgAAAAAAdY9iXY2Vq+sHAAAABwAAAAgAHABkaXIvYi5tZFVUCQADjc/oao3P6Gp1eAsAAQT1AQAABAAAAABuZXN0ZWQKUEsBAh4DFAAAAAgAd49iXaUlvvgfAAAAFwMAAAQAGAAAAAAAAQAAAKSBAAAAAGEubWRVVAUAA5LP6Gp1eAsAAQT1AQAABAAAAABQSwECHgMKAAAAAAB1j2JdAAAAAAAAAAAAAAAABAAYAAAAAAAAABAA7UFdAAAAZGlyL1VUBQADjc/oanV4CwABBPUBAAAEAAAAAFBLAQIeAwoAAAAAAHWPYl2NlavrBwAAAAcAAAAIABgAAAAAAAEAAACkgZsAAABkaXIvYi5tZFVUBQADjc/oanV4CwABBPUBAAAEAAAAAFBLBQYAAAAAAwADAOIAAADkAAAAAAA=";
    const back = await readZip(Uint8Array.from(Buffer.from(b64, "base64")));
    expect(back.map((e) => [e.path, str(e.data)])).toEqual([
      ["a.md", "# from zip\n" + "line of text\n".repeat(60)],
      ["dir/b.md", "nested\n"],
    ]);
  });
});

describe("zip safety", () => {
  it("rejects something that is not a zip", async () =>
    await expect(readZip(text("not a zip at all, just text"))).rejects.toThrow(/zip/i));

  it("rejects an archive with too many entries", async () => {
    const files = Array.from({ length: ZIP_LIMITS.entries + 1 }, (_, i) => entry(`${i}.md`, "x"));
    await expect(readZip(await createZip(files))).rejects.toThrow(/too many/i);
  });

  it("stops a file that expands past the size limit", async () => {
    const zip = await createZip([{ path: "bomb.md", data: new Uint8Array(3_000_000) }]);
    await expect(readZip(zip, { totalBytes: 1_000_000 })).rejects.toThrow(/too large/i);
  });
});
