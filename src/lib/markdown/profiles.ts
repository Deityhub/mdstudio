// Target platforms. Kept apart from markdown.ts so pages can list them without loading unified.
export type Profile = "commonmark" | "github" | "devto" | "obsidian";

export const PROFILES: { id: Profile; label: string; hint: string }[] = [
  { id: "github", label: "GitHub (GFM)", hint: "Tables, task lists, footnotes" },
  { id: "commonmark", label: "Strict CommonMark", hint: "Works everywhere" },
  { id: "devto", label: "dev.to / Hashnode", hint: "GFM, no raw HTML" },
  { id: "obsidian", label: "Obsidian", hint: "GFM + highlights, wiki-links" },
];
