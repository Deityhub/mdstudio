// Every row of the Settings page, for search: where it is and the words it is found by. Kept next
// to tabs.ts; the test checks each row names a real tab.
import type { SettingsTab } from "./tabs";

export type SettingRow = { tab: SettingsTab; title: string; keywords: string };

export const SETTING_ROWS: SettingRow[] = [
  { tab: "account", title: "Display name", keywords: "profile name account" },
  { tab: "account", title: "Email", keywords: "address change account" },
  { tab: "account", title: "Password", keywords: "change set security account" },
  { tab: "account", title: "Sign in with GitHub", keywords: "link unlink connected accounts" },
  { tab: "account", title: "Sign in with Google", keywords: "link unlink connected accounts" },
  { tab: "editor", title: "Theme", keywords: "appearance dark light system mode" },
  { tab: "editor", title: "Target platform", keywords: "profile commonmark gfm wiki" },
  { tab: "editor", title: "Normalize on export", keywords: "bullets fences emphasis" },
  { tab: "editor", title: "Writing checks", keywords: "rules checker lint standards" },
  { tab: "editor", title: "Keyboard shortcuts", keywords: "keys hotkeys" },
  { tab: "ai", title: "AI integrations", keywords: "provider model key openai anthropic ollama" },
  { tab: "connections", title: "Cloud drafts", keywords: "sync account storage" },
  { tab: "connections", title: "Hosted images", keywords: "uploads files" },
  { tab: "connections", title: "GitHub publishing", keywords: "connect disconnect repository" },
];
