import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PROFILES, type Profile } from "@/lib/markdown/profiles";
import { DEFAULT_CONFIG } from "@/lib/checker/config";
import { loadConfig, saveConfig } from "@/lib/checker/storage";
import { type Theme, setTheme } from "@/lib/ui/theme";
import { useThemeChoice } from "@/lib/ui/useThemeChoice";
import { loadPrefs, savePrefs } from "@/lib/settings/prefs";
import { RulesDialog } from "@/components/studio/RulesDialog";
import { ShortcutsDialog } from "@/components/studio/ShortcutsDialog";
import { SettingsRow } from "./SettingsRow";

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** Looks and writing choices. All of it is kept on this device, so it works without an account. */
export function EditorSection() {
  const theme = useThemeChoice();
  const [prefs, setPrefs] = useState(() => ({
    profile: "gfm-extended" as Profile,
    normalize: false,
  }));
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [rules, setRules] = useState(false);
  const [keys, setKeys] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  // read after mount: the server render has no localStorage
  useEffect(() => {
    setPrefs(loadPrefs());
    setConfig(loadConfig());
  }, []);
  const change = (next: Partial<typeof prefs>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    savePrefs(merged);
  };

  return (
    <section aria-label="Editor" className="max-w-2xl">
      <SettingsRow title="Theme" description="Follows your system unless you pick one.">
        <div role="group" aria-label="Theme" className="flex gap-1">
          {THEMES.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={theme === t.id ? "secondary" : "ghost"}
              aria-pressed={theme === t.id}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </SettingsRow>
      <SettingsRow
        title="Target platform"
        description={PROFILES.find((p) => p.id === prefs.profile)?.hint}
      >
        <select
          aria-label="Target platform"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={prefs.profile}
          onChange={(e) => change({ profile: e.target.value as Profile })}
        >
          {PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </SettingsRow>
      <SettingsRow
        title="Normalize on export"
        description="Consistent bullets, fences and emphasis in exported Markdown. Your draft is not changed."
      >
        <Switch
          aria-label="Normalize on export"
          checked={prefs.normalize}
          onCheckedChange={(on) => change({ normalize: on })}
        />
      </SettingsRow>
      <SettingsRow
        title="Writing checks"
        description="Turn built-in checks on or off, set publication standards and add your own rules."
      >
        <Button variant="outline" size="sm" onClick={() => setRules(true)}>
          Edit rules…
        </Button>
      </SettingsRow>
      <SettingsRow title="Keyboard shortcuts">
        <Button ref={back} variant="outline" size="sm" onClick={() => setKeys(true)}>
          Show shortcuts
        </Button>
      </SettingsRow>
      <RulesDialog
        open={rules}
        onOpenChange={setRules}
        config={config}
        onChange={(next) => {
          setConfig(next);
          saveConfig(next);
        }}
      />
      <ShortcutsDialog
        open={keys}
        onOpenChange={setKeys}
        returnFocus={() => back.current?.focus()}
      />
    </section>
  );
}
