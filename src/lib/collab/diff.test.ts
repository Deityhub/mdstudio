import { describe, expect, it } from "vitest";
import { minimalChange } from "./diff";

const apply = (a: string, c: ReturnType<typeof minimalChange>) =>
  c ? a.slice(0, c.from) + c.insert + a.slice(c.to) : a;

describe("minimalChange", () => {
  it("says nothing for equal text", () => {
    expect(minimalChange("same", "same")).toBeNull();
  });

  it("finds one insertion, deletion and replacement", () => {
    expect(minimalChange("# Title\n\nbody", "# Title\n\nnew body")).toEqual({
      from: 9,
      to: 9,
      insert: "new ",
    });
    expect(minimalChange("a b c", "a c")).toEqual({ from: 2, to: 4, insert: "" });
    expect(minimalChange("one two three", "one 2 three")).toEqual({ from: 4, to: 7, insert: "2" });
  });

  it("handles the ends and empty text", () => {
    expect(minimalChange("", "hi")).toEqual({ from: 0, to: 0, insert: "hi" });
    expect(minimalChange("hi", "")).toEqual({ from: 0, to: 2, insert: "" });
    expect(minimalChange("ab", "aab")).toEqual({ from: 1, to: 1, insert: "a" });
  });

  it("does not cut an emoji in half", () => {
    // 😀 and 😁 share their first UTF-16 unit
    const c = minimalChange("a😀b", "a😁b")!;
    expect(c).toEqual({ from: 1, to: 3, insert: "😁" });
    const d = minimalChange("x😀", "x😀😀")!;
    expect(apply("x😀", d)).toBe("x😀😀");
    expect([...d.insert].length).toBe(1);
  });

  it("always rebuilds the new text (seeded random edits)", () => {
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    const alphabet = ["a", "b", " ", "\n", "😀", "é"];
    const text = () =>
      Array.from({ length: rnd(12) }, () => alphabet[rnd(alphabet.length)]!).join("");
    for (let i = 0; i < 500; i++) {
      const a = text();
      const b = text();
      expect(apply(a, minimalChange(a, b))).toBe(b);
    }
  });
});
