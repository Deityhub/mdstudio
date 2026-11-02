import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useResolvedTheme } from "./useResolvedTheme";

afterEach(() => document.documentElement.classList.remove("dark"));

describe("useResolvedTheme", () => {
  it("reports the page theme and follows changes to the html class", async () => {
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe("light");
    await act(async () => {
      document.documentElement.classList.add("dark");
      await Promise.resolve();
    });
    expect(result.current).toBe("dark");
    await act(async () => {
      document.documentElement.classList.remove("dark");
      await Promise.resolve();
    });
    expect(result.current).toBe("light");
  });
});
