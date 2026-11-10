import { describe, expect, it } from "vitest";
import { LIMITS } from "../../server/limits/catalog";
import { GROUPS, LIMIT_INFO, bytes, limitDiff } from "./limits";

describe("the dashboard's names for limits", () => {
  it("cover every limit the server has, and only those", () => {
    expect(Object.keys(LIMIT_INFO).sort()).toEqual(Object.keys(LIMITS).sort());
    for (const info of Object.values(LIMIT_INFO)) expect(GROUPS).toContain(info.group);
  });
  it("write byte counts for people", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(999)).toBe("999 B");
    expect(bytes(10_000_000)).toBe("10 MB");
    expect(bytes(1_500_000_000)).toBe("1.5 GB");
  });
});

describe("limitDiff", () => {
  it("sets what changed or is new and removes what is gone", () => {
    expect(limitDiff({ a: 1, b: 2, c: true }, { a: 1, b: 3, d: false })).toEqual({
      b: 3,
      d: false,
      c: null,
    });
    expect(limitDiff({ a: 1 }, { a: 1 })).toEqual({});
  });
});
