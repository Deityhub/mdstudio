// The entries every page can search: pages, guides, settings rows, theme, and the drafts in this
// browser. The editor adds its own commands through registry.ts.
import { GUIDES, guidePath } from "@/lib/site/guides";
import { SETTING_ROWS } from "@/lib/settings/catalog";
import { visibleTabs } from "@/lib/settings/tabs";
import type { Theme } from "@/lib/ui/theme";
import { type SearchEntry, matchLine, rankEntries, termsOf } from "./rank";

export type SearchNav = {
  go: (to: string) => void;
  openDraft: (id: string, line?: number) => void;
  setTheme: (theme: Theme) => void;
};

export function siteEntries(
  nav: SearchNav,
  who: { signedIn: boolean; isAdmin: boolean },
): SearchEntry[] {
  const tabs = visibleTabs(who.signedIn);
  const page = (title: string, to: string, keywords = ""): SearchEntry => ({
    id: `page:${to}`,
    group: "Pages",
    title,
    keywords,
    run: () => nav.go(to),
  });
  return [
    page("Editor", "/editor", "drafts write library"),
    page("Settings", "/settings", "preferences options"),
    ...(who.isAdmin ? [page("Admin dashboard", "/admin", "accounts plans server")] : []),
    page("Guides", "/guides", "help docs learn"),
    ...GUIDES.map((g) => ({ ...page(g.title, guidePath(g.slug), "guide"), hint: "Guide" })),
    page("Privacy", "/privacy", "policy data"),
    page("Terms", "/terms", "terms of use"),
    ...SETTING_ROWS.filter((r) => tabs.includes(r.tab)).map((r): SearchEntry => ({
      id: `setting:${r.title}`,
      group: "Settings",
      title: r.title,
      hint: `Settings, ${r.tab[0]!.toUpperCase()}${r.tab.slice(1)}`,
      keywords: r.keywords,
      run: () => nav.go(`/settings?tab=${r.tab}`),
    })),
    ...(["light", "dark", "system"] as const).map((t): SearchEntry => ({
      id: `theme:${t}`,
      group: "Commands",
      title: `Theme: ${t[0]!.toUpperCase()}${t.slice(1)}`,
      keywords: "appearance mode",
      run: () => nav.setTheme(t),
    })),
  ];
}

type Draft = {
  id: string;
  title: string;
  name?: string | undefined;
  content: string;
  folder?: string | undefined;
};

/**
 * Drafts whose name, title or folder match ("Drafts"), then drafts whose text holds every word
 * ("In drafts", with the line). With no words: every draft, in the order given.
 */
export function draftEntries(docs: Draft[], query: string, nav: SearchNav): SearchEntry[] {
  const label = (d: Draft) => d.name?.trim() || d.title || "Untitled";
  const byTitle = docs.map((d): SearchEntry => ({
    id: `draft:${d.id}`,
    group: "Drafts",
    title: label(d),
    ...(d.folder && { hint: d.folder }),
    keywords: `${d.title} ${d.folder ?? ""}`,
    run: () => nav.openDraft(d.id),
  }));
  const terms = termsOf(query);
  if (!terms.length) return byTitle;
  const titled = rankEntries(query, byTitle);
  const seen = new Set(titled.map((e) => e.id));
  const inText: SearchEntry[] = [];
  for (const d of docs) {
    if (seen.has(`draft:${d.id}`)) continue;
    const lower = d.content.toLowerCase();
    if (!terms.every((t) => lower.includes(t))) continue;
    const m = matchLine(d.content, terms);
    if (!m) continue;
    inText.push({
      id: `text:${d.id}`,
      group: "In drafts",
      title: label(d),
      hint: m.text,
      run: () => nav.openDraft(d.id, m.line),
    });
  }
  return [...titled, ...inText];
}
