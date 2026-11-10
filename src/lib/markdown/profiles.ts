// The rule sets the checker and preview follow. Named by what they allow, not by a platform, so a
// profile stays true however a platform changes. Kept apart from markdown.ts so pages can list
// them without loading unified.
export type Profile = "commonmark" | "gfm-extended" | "gfm-no-html" | "wiki-notes";

export const PROFILES: { id: Profile; label: string; hint: string }[] = [
  {
    id: "gfm-extended",
    label: "GFM extended",
    hint: "Tables, task lists, footnotes, alerts, math, Mermaid",
  },
  { id: "commonmark", label: "Strict CommonMark", hint: "Works everywhere" },
  {
    id: "gfm-no-html",
    label: "GFM without HTML",
    hint: "Tables, task lists, footnotes; raw HTML is an error",
  },
  { id: "wiki-notes", label: "Wiki notes", hint: "GFM extended + wiki-links, highlights" },
];

/** Ids saved on a device before the profiles were renamed. */
const LEGACY: Record<string, Profile> = {
  github: "gfm-extended",
  devto: "gfm-no-html",
  obsidian: "wiki-notes",
};

/** A saved profile id (current or from before the rename) as a profile, or null. */
export function parseProfile(value: string | null): Profile | null {
  if (!value) return null;
  return PROFILES.find((p) => p.id === value)?.id ?? LEGACY[value] ?? null;
}
