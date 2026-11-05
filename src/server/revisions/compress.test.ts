// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pack, unpack } from "./compress";

const prose = (n: number) => "# Notes\n\nSome ordinary paragraph of writing, repeated. ".repeat(n);

describe("pack and unpack", () => {
  it("compresses prose to well under half its size, and round-trips it", async () => {
    const text = prose(400);
    const packed = await pack(text);
    expect(packed.encoding).toBe("gzip-b64");
    expect(packed.content.length).toBeLessThan(text.length / 2);
    expect(await unpack(packed.encoding, packed.content)).toBe(text);
  });

  it("keeps short text as it is, where compressing would only add bytes", async () => {
    expect(await pack("# Hi")).toEqual({ encoding: "plain", content: "# Hi" });
    expect(await unpack("plain", "# Hi")).toBe("# Hi");
  });

  it("keeps text that does not compress as it is", async () => {
    // printable characters picked at random: about 6.6 bits each, so gzip + base64 would grow it
    const noise = Array.from({ length: 4000 }, () =>
      String.fromCharCode(32 + Math.floor(Math.random() * 95)),
    ).join("");
    const packed = await pack(noise);
    expect(packed.encoding).toBe("plain");
    expect(packed.content).toBe(noise);
  });

  it("round-trips unicode, emoji and line endings exactly", async () => {
    const text = "Zażółć gęślą jaźń — 日本語 🎉\r\nsecond line\n".repeat(200);
    const packed = await pack(text);
    expect(packed.encoding).toBe("gzip-b64");
    expect(await unpack(packed.encoding, packed.content)).toBe(text);
  });

  it("handles the largest document the sync accepts", async () => {
    const text = prose(15_000).slice(0, 1_000_000);
    const packed = await pack(text);
    expect(await unpack(packed.encoding, packed.content)).toBe(text);
  });

  it("refuses an unknown encoding instead of guessing", async () => {
    await expect(unpack("rot13", "x")).rejects.toThrow(/encoding/i);
  });
});
