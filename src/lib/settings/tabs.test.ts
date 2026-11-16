import { describe, expect, it } from "vitest";
import { SETTINGS_TABS, parseSettingsTab, visibleTabs } from "./tabs";

describe("settings tabs", () => {
  it("shows only the on-device sections to someone who is signed out", () => {
    expect(visibleTabs(false)).toEqual(["editor", "ai"]);
  });
  it("adds account and connections once signed in, account first", () => {
    expect(visibleTabs(true)).toEqual(["account", "editor", "ai", "connections"]);
  });
  it("parses a tab from the address and falls back to the first one allowed", () => {
    expect(parseSettingsTab("ai", true)).toBe("ai");
    expect(parseSettingsTab("nope", true)).toBe("account");
    expect(parseSettingsTab(undefined, false)).toBe("editor");
    // a signed-out visitor cannot land on a signed-in section
    expect(parseSettingsTab("account", false)).toBe("editor");
  });
  it("lists every tab once", () => expect(new Set(SETTINGS_TABS).size).toBe(SETTINGS_TABS.length));
});
