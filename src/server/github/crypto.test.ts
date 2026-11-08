// @vitest-environment node
import { describe, expect, it } from "vitest";
import { importTokenKey, openToken, sealToken } from "./crypto";

const raw = (fill: number, length = 32) =>
  btoa(String.fromCharCode(...new Uint8Array(length).fill(fill)));

describe("importTokenKey", () => {
  it("accepts a 32-byte base64 key and nothing else", async () => {
    expect(await importTokenKey(raw(1))).not.toBeNull();
    expect(await importTokenKey(undefined)).toBeNull();
    expect(await importTokenKey("")).toBeNull();
    expect(await importTokenKey(raw(1, 16))).toBeNull(); // too short
    expect(await importTokenKey("not base64 !!")).toBeNull();
  });
});

describe("sealToken and openToken", () => {
  it("round-trips, and never contains the token", async () => {
    const key = (await importTokenKey(raw(7)))!;
    const sealed = await sealToken(key, "gho_secret", "user-1");
    expect(sealed).not.toContain("gho_secret");
    expect(await openToken(key, sealed, "user-1")).toBe("gho_secret");
  });

  it("seals differently each time", async () => {
    const key = (await importTokenKey(raw(7)))!;
    expect(await sealToken(key, "t", "u")).not.toBe(await sealToken(key, "t", "u"));
  });

  it("does not open with another key, another user, or after tampering", async () => {
    const key = (await importTokenKey(raw(7)))!;
    const other = (await importTokenKey(raw(8)))!;
    const sealed = await sealToken(key, "gho_secret", "user-1");
    expect(await openToken(other, sealed, "user-1")).toBeNull();
    expect(await openToken(key, sealed, "user-2")).toBeNull(); // a row moved to another account
    const parts = sealed.split(".");
    parts[2] = parts[2]!.slice(0, -4) + "AAAA";
    expect(await openToken(key, parts.join("."), "user-1")).toBeNull();
    expect(await openToken(key, "garbage", "user-1")).toBeNull();
    expect(await openToken(key, "", "user-1")).toBeNull();
  });
});
