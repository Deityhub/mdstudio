import { describe, expect, it } from "vitest";
import { contentHash } from "./hash";

describe("contentHash", () => {
  it("is the SHA-256 of the text, in hex, the same as the server computes", async () => {
    expect(await contentHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await contentHash("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("covers unicode and line endings exactly", async () => {
    expect(await contentHash("a\r\nb")).not.toBe(await contentHash("a\nb"));
    expect(await contentHash("日本語 🎉")).toMatch(/^[0-9a-f]{64}$/);
  });
});
