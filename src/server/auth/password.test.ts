// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed hashes instead of throwing", async () => {
    for (const bad of ["", "x", "pbkdf2$sha256$abc$AA$AA", "scrypt$1$2$3$4"])
      expect(await verifyPassword("p", bad)).toBe(false);
  });

  it("flags hashes made with fewer iterations", async () => {
    const hash = await hashPassword("pw", 1000);
    expect(needsRehash(hash)).toBe(true);
    expect(needsRehash(await hashPassword("pw"))).toBe(false);
  });
});
