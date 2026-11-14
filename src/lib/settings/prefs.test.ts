import { beforeEach, describe, expect, it } from "vitest";
import { loadPrefs, savePrefs } from "./prefs";

const mem = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("editor preferences", () => {
  let storage: ReturnType<typeof mem>;
  beforeEach(() => (storage = mem()));

  it("defaults to the first profile and no normalizing", () => {
    expect(loadPrefs(storage)).toEqual({ profile: "gfm-extended", normalize: false });
  });
  it("round-trips a choice under the keys the editor reads", () => {
    savePrefs({ profile: "commonmark", normalize: true }, storage);
    expect(storage.getItem("md:profile")).toBe("commonmark");
    expect(storage.getItem("md:normalize")).toBe("1");
    expect(loadPrefs(storage)).toEqual({ profile: "commonmark", normalize: true });
  });
  it("ignores a stored profile that no longer exists", () => {
    storage.setItem("md:profile", "gone");
    expect(loadPrefs(storage).profile).toBe("gfm-extended");
  });
});
