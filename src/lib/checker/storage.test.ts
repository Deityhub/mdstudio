import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config";
import { loadConfig, saveConfig } from "./storage";

beforeEach(() => localStorage.clear());

describe("check rule storage", () => {
  it("starts with the defaults", () => expect(loadConfig()).toEqual(DEFAULT_CONFIG));
  it("keeps what was saved", () => {
    const c = structuredClone(DEFAULT_CONFIG);
    c.builtin["wiki-link"] = { enabled: false };
    saveConfig(c);
    expect(loadConfig()).toEqual(c);
  });
  it("falls back to the defaults for corrupt or invalid data", () => {
    localStorage.setItem("md:check-rules", "{not json");
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
    localStorage.setItem("md:check-rules", JSON.stringify({ version: 9 }));
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });
});
