import { describe, expect, it } from "vitest";
import { canonicalEmail } from "./email";

describe("canonicalEmail", () => {
  it("lowercases and trims", () =>
    expect(canonicalEmail("  Ada@Example.COM ")).toBe("ada@example.com"));

  it("drops a +tag, so every tag lands on the same account", () => {
    for (const e of ["test+test1@gmail.com", "test+a+b@gmail.com", "Test+x@gmail.com"])
      expect(canonicalEmail(e)).toBe("test@gmail.com");
    expect(canonicalEmail("ada+news@example.org")).toBe("ada@example.org");
  });

  it("ignores dots in Gmail addresses, and treats googlemail.com as gmail.com", () => {
    expect(canonicalEmail("t.e.s.t@gmail.com")).toBe("test@gmail.com");
    expect(canonicalEmail("te.st+x@googlemail.com")).toBe("test@gmail.com");
    // dots matter elsewhere
    expect(canonicalEmail("a.da@example.com")).toBe("a.da@example.com");
  });

  it("is null for something that is not an address", () => {
    for (const bad of ["", "nope", "@x.co", "+tag@gmail.com", "a@", "a b"])
      expect(canonicalEmail(bad), bad).toBeNull();
  });
});
