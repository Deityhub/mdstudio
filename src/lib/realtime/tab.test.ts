import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("tab id", () => {
  it("is made on first use, never when the module loads (Workers forbid random values at load, and the server bundle imports this)", async () => {
    const random = vi.spyOn(crypto, "randomUUID");
    const { getTabId } = await import("./tab");
    expect(random).not.toHaveBeenCalled();
    const id = getTabId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/); // what the server accepts as a tab name
    expect(getTabId()).toBe(id);
    expect(random).toHaveBeenCalledTimes(1);
  });
});
