import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEasedValue } from "./useEasedValue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A component that draws each value and says so, taking `cost` ms to do it. */
function setup(cost: number) {
  const hook = renderHook(({ v, key }) => useEasedValue(v, key), {
    initialProps: { v: "a", key: "doc1" },
  });
  /** What the page does after a value is let through: the work, then `done()`. */
  const draw = () => {
    act(() => void vi.advanceTimersByTime(cost));
    act(() => hook.result.current[1]());
  };
  return { hook, draw };
}
const shown = (h: ReturnType<typeof setup>["hook"]) => h.result.current[0];

describe("a value that follows as fast as the work it causes allows", () => {
  it("follows at once when the work is cheap", () => {
    const { hook, draw } = setup(0);
    hook.rerender({ v: "b", key: "doc1" });
    draw();
    expect(shown(hook)).toBe("b");
    hook.rerender({ v: "c", key: "doc1" });
    expect(shown(hook)).toBe("c");
  });

  it("waits about three times what an update cost, then shows the latest value", () => {
    const { hook, draw } = setup(100);
    hook.rerender({ v: "b", key: "doc1" }); // the first change is let through at once
    expect(shown(hook)).toBe("b");
    draw(); // it took 100 ms
    for (const v of ["c", "d", "e"]) hook.rerender({ v, key: "doc1" }); // a burst of changes
    expect(shown(hook)).toBe("b");
    act(() => void vi.advanceTimersByTime(190)); // 100 ms were spent drawing, 200 more to wait
    expect(shown(hook)).toBe("b");
    act(() => void vi.advanceTimersByTime(20));
    expect(shown(hook)).toBe("e"); // the burst's last value, not each one
  });

  it("keeps updating while changes never stop (it does not wait for quiet)", () => {
    const { hook, draw } = setup(100);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      hook.rerender({ v: `v${i}`, key: "doc1" });
      seen.add(shown(hook));
      draw();
      act(() => void vi.advanceTimersByTime(20));
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(seen.size).toBeLessThan(40); // well under the 60 changes
  });

  it("never waits longer than a second", () => {
    const { hook, draw } = setup(10_000);
    hook.rerender({ v: "b", key: "doc1" });
    draw();
    hook.rerender({ v: "c", key: "doc1" });
    act(() => void vi.advanceTimersByTime(1001));
    expect(shown(hook)).toBe("c");
  });

  it("shows a different draft at once", () => {
    const { hook, draw } = setup(500);
    hook.rerender({ v: "b", key: "doc1" });
    draw();
    hook.rerender({ v: "other draft", key: "doc2" });
    expect(shown(hook)).toBe("other draft");
  });
});
