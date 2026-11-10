import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  parseTheme,
  resolveTheme,
  storedTheme,
  THEME_KEY,
  themeInitScript,
  nextTheme,
  setTheme,
  subscribeTheme,
  watchSystemTheme,
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

describe("nextTheme", () => {
  it("cycles light, dark, system and round again", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });
});

describe("setTheme", () => {
  it("applies and remembers an explicit choice", () => {
    mockPrefersDark(true);
    setTheme("light");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    setTheme("dark");
    expect(storedTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
  it("goes back to following the system by forgetting the choice", () => {
    mockPrefersDark(true);
    setTheme("light");
    setTheme("system");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(storedTheme()).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
  it("tells listeners about a change", () => {
    mockPrefersDark(false);
    const seen = vi.fn();
    const off = subscribeTheme(seen);
    setTheme("dark");
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    setTheme("light");
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it("survives unavailable storage", () => {
    mockPrefersDark(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setTheme("dark")).not.toThrow();
    expect(() => setTheme("system")).not.toThrow();
    expect(storedTheme()).toBe("system");
  });
});

describe("watchSystemTheme", () => {
  function osPreference(initial: boolean) {
    const query = { matches: initial, handler: null as null | (() => void) };
    vi.spyOn(window, "matchMedia").mockImplementation(
      () =>
        ({
          get matches() {
            return query.matches;
          },
          addEventListener: (_: string, h: () => void) => (query.handler = h),
          removeEventListener: () => (query.handler = null),
        }) as unknown as MediaQueryList,
    );
    return {
      change(dark: boolean) {
        query.matches = dark;
        query.handler?.();
      },
    };
  }
  it("follows the OS while the choice is 'system'", () => {
    const os = osPreference(false);
    const stop = watchSystemTheme();
    os.change(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    os.change(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    stop();
  });
  it("ignores the OS once the writer chose light or dark", () => {
    const os = osPreference(false);
    localStorage.setItem(THEME_KEY, "light");
    const stop = watchSystemTheme();
    os.change(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    stop();
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
