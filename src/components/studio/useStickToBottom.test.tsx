import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStickToBottom } from "./useStickToBottom";

afterEach(() => vi.unstubAllGlobals());

function setup() {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (cb(0), 1));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const el = { scrollHeight: 1000, scrollTop: 0, clientHeight: 200, scrollTo: vi.fn() };
  const hook = renderHook(({ active, dep }) => useStickToBottom<HTMLDivElement>(active, dep), {
    initialProps: { active: true, dep: "a" },
  });
  (hook.result.current.ref as { current: unknown }).current = el;
  return { el, hook };
}

describe("following streamed text", () => {
  it("scrolls to the newest text each time more arrives", () => {
    const { el, hook } = setup();
    hook.rerender({ active: true, dep: "ab" });
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 1000 });
  });
  it("stops following once the reader scrolls up, and resumes at the bottom", () => {
    const { el, hook } = setup();
    el.scrollTop = 100;
    hook.result.current.onScroll();
    hook.rerender({ active: true, dep: "ab" });
    expect(el.scrollTo).not.toHaveBeenCalled();
    el.scrollTop = 790;
    hook.result.current.onScroll();
    hook.rerender({ active: true, dep: "abc" });
    expect(el.scrollTo).toHaveBeenCalledTimes(1);
  });
  it("does nothing when nothing is streaming", () => {
    const { el, hook } = setup();
    hook.rerender({ active: false, dep: "ab" });
    expect(el.scrollTo).not.toHaveBeenCalled();
  });
});
