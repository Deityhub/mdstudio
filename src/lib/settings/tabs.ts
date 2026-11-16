// The sections of the Settings page. Account and connections need an account, so they are not
// offered (and not reachable by address) to someone who is signed out.
export const SETTINGS_TABS = ["account", "editor", "ai", "connections"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const SIGNED_IN_ONLY: readonly SettingsTab[] = ["account", "connections"];

export const visibleTabs = (signedIn: boolean) =>
  SETTINGS_TABS.filter((t) => signedIn || !SIGNED_IN_ONLY.includes(t));

export function parseSettingsTab(value: unknown, signedIn: boolean): SettingsTab {
  const tabs = visibleTabs(signedIn);
  return tabs.find((t) => t === value) ?? tabs[0]!;
}
