import { describe, expect, it } from "vitest";
import { isAllowed, verdict } from "./license-policy";

describe("isAllowed", () => {
  it("accepts permissive licenses", () => {
    for (const l of ["MIT", "ISC", "BSD-3-Clause", "Apache-2.0", "0BSD"])
      expect(isAllowed(l)).toBe(true);
  });
  it("rejects copyleft and unknown licenses", () => {
    for (const l of ["GPL-3.0", "AGPL-3.0-only", "EPL-2.0", "SEE LICENSE IN x", ""])
      expect(isAllowed(l)).toBe(false);
  });
  it("needs one allowed side of OR and every side of AND", () => {
    expect(isAllowed("(MIT OR GPL-3.0)")).toBe(true);
    expect(isAllowed("(GPL-3.0 OR AGPL-3.0)")).toBe(false);
    expect(isAllowed("(MIT AND BSD-3-Clause)")).toBe(true);
    expect(isAllowed("(MIT AND GPL-3.0)")).toBe(false);
  });
});

describe("verdict", () => {
  it("passes reviewed exceptions, including prefixes, with a note", () => {
    expect(verdict("elkjs", "EPL-2.0")).toMatchObject({ ok: true });
    expect(verdict("lightningcss-darwin-arm64", "MPL-2.0")).toMatchObject({ ok: true });
    expect(verdict("khroma", undefined)).toMatchObject({ ok: true });
  });
  it("fails missing or disallowed licenses", () => {
    expect(verdict("left-pad", undefined)).toMatchObject({ ok: false });
    expect(verdict("evil", "GPL-3.0")).toMatchObject({ ok: false });
  });
});
