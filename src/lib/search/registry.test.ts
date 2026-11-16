import { describe, expect, it, vi } from "vitest";
import { onJump, registerSearchSource, registeredEntries, requestJump, takeJump } from "./registry";

const entry = (title: string) => ({ id: title, group: "Commands" as const, title, run: () => {} });

describe("search sources", () => {
  it("reads every registered source at search time, and forgets one when removed", () => {
    let n = 1;
    const off = registerSearchSource("a", () => [entry(`a${n}`)]);
    const offB = registerSearchSource("b", () => [entry("b")]);
    n = 2;
    expect(registeredEntries().map((e) => e.title)).toEqual(["a2", "b"]);
    off();
    expect(registeredEntries().map((e) => e.title)).toEqual(["b"]);
    offB();
  });
  it("a stale removal does not drop a newer source under the same key", () => {
    const old = registerSearchSource("k", () => [entry("old")]);
    const off = registerSearchSource("k", () => [entry("new")]);
    old();
    expect(registeredEntries().map((e) => e.title)).toEqual(["new"]);
    off();
  });
});

describe("jumping to a line", () => {
  it("is taken once, and only by the draft it was for", () => {
    const heard = vi.fn();
    const off = onJump(heard);
    requestJump("d1", 12);
    expect(heard).toHaveBeenCalledOnce();
    expect(takeJump("d2")).toBeNull();
    expect(takeJump("d1")).toBe(12);
    expect(takeJump("d1")).toBeNull();
    off();
  });
});
