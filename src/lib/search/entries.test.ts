import { describe, expect, it, vi } from "vitest";
import { SETTINGS_TABS } from "@/lib/settings/tabs";
import { SETTING_ROWS } from "@/lib/settings/catalog";
import { draftEntries, siteEntries } from "./entries";
import { rankEntries } from "./rank";

const nav = () => ({ go: vi.fn(), openDraft: vi.fn(), setTheme: vi.fn() });

describe("siteEntries", () => {
  it("offers only the settings and pages a visitor can reach", () => {
    const out = siteEntries(nav(), { signedIn: false, isAdmin: false });
    const titles = out.map((e) => e.title);
    expect(titles).toContain("Target platform");
    expect(titles).not.toContain("Password");
    expect(titles).not.toContain("Admin dashboard");
    const admin = siteEntries(nav(), { signedIn: true, isAdmin: true }).map((e) => e.title);
    expect(admin).toEqual(expect.arrayContaining(["Password", "Admin dashboard"]));
  });
  it("a setting goes to its tab, and a theme is applied at once", () => {
    const n = nav();
    const out = siteEntries(n, { signedIn: true, isAdmin: false });
    rankEntries("password", out)[0]!.run();
    expect(n.go).toHaveBeenCalledWith("/settings?tab=account");
    rankEntries("theme dark", out)[0]!.run();
    expect(n.setTheme).toHaveBeenCalledWith("dark");
  });
  it("finds a guide by its title", () => {
    const out = siteEntries(nav(), { signedIn: false, isAdmin: false });
    expect(rankEntries("portable markdown", out)[0]).toMatchObject({ group: "Pages" });
  });
  it("names a real tab in every settings row", () => {
    for (const row of SETTING_ROWS) expect(SETTINGS_TABS).toContain(row.tab);
  });
});

describe("draftEntries", () => {
  const docs = [
    {
      id: "a",
      title: "Launch plan",
      content: "# Launch plan\n\nThe rocket goes up.",
      folder: "Work",
    },
    { id: "b", title: "Notes", name: "Groceries", content: "eggs\nmilk and rocket salad" },
    { id: "c", title: "Empty", content: "" },
  ];
  it("matches drafts by name, title or folder, and by words in the text with the line", () => {
    const n = nav();
    const out = draftEntries(docs, "rocket", n);
    expect(out.map((e) => [e.group, e.title])).toEqual([
      ["In drafts", "Launch plan"],
      ["In drafts", "Groceries"],
    ]);
    expect(out[1]!.hint).toBe("milk and rocket salad");
    out[1]!.run();
    expect(n.openDraft).toHaveBeenCalledWith("b", 2);
    expect(draftEntries(docs, "work", n).map((e) => [e.group, e.title])).toEqual([
      ["Drafts", "Launch plan"],
    ]);
  });
  it("lists a draft once: a title match is not repeated as a text match", () => {
    const out = draftEntries(docs, "launch", nav());
    expect(out.map((e) => e.group)).toEqual(["Drafts"]);
  });
  it("with no words, lists the drafts as given (most recent first)", () => {
    expect(draftEntries(docs, "", nav()).map((e) => e.title)).toEqual([
      "Launch plan",
      "Groceries",
      "Empty",
    ]);
  });
});
