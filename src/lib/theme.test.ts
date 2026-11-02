import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  parseTheme,
  resolveTheme,
  storedTheme,
  THEME_KEY,
  themeInitScript,
  toggleTheme,
} from "./theme";

const mockPrefersDark = (dark: boolean) =>
  vi
    .spyOn(window, "matchMedia")
    .mockImplementation(
      (query) => ({ matches: dark && query.includes("dark"), media: query }) as MediaQueryList,
    );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});
afterEach(() => vi.restoreAllMocks());

describe("resolveTheme / parseTheme", () => {
  it("follows the system only for 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("treats anything unknown as 'system'", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("purple")).toBe("system");
    expect(parseTheme(null)).toBe("system");
  });
});

describe("applyTheme", () => {
  it("sets the dark class and color-scheme", () => {
    mockPrefersDark(false);
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
  it("uses the OS preference for 'system'", () => {
    mockPrefersDark(true);
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("toggleTheme", () => {
  it("flips the visible theme and remembers the explicit choice", () => {
    mockPrefersDark(true); // system is dark, so the first toggle goes light
    applyTheme("system");
    expect(toggleTheme()).toBe("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(toggleTheme()).toBe("dark");
    expect(storedTheme()).toBe("dark");
  });
  it("survives unavailable storage", () => {
    mockPrefersDark(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => toggleTheme()).not.toThrow();
    expect(storedTheme()).toBe("system");
  });
});

describe("themeInitScript (runs before first paint)", () => {
  const run = () => new Function(themeInitScript)();
  it("applies a stored choice", () => {
    mockPrefersDark(false);
    localStorage.setItem(THEME_KEY, "dark");
    run();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
  it("falls back to the OS preference", () => {
    mockPrefersDark(true);
    run();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
  it("never throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockPrefersDark(false);
    expect(run).not.toThrow();
  });
});
