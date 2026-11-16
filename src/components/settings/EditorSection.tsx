import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PROFILES, type Profile } from "@/lib/markdown/profiles";
import { DEFAULT_CONFIG } from "@/lib/checker/config";
import { loadConfig, saveConfig } from "@/lib/checker/storage";
import { type Theme, setTheme } from "@/lib/ui/theme";
import { useThemeChoice } from "@/lib/ui/useThemeChoice";
import { loadPrefs, savePrefs } from "@/lib/settings/prefs";
import { RulesDialog } from "@/components/studio/RulesDialog";
import { ShortcutsDialog } from "@/components/studio/ShortcutsDialog";
import { Card, CardHeading } from "@/components/site/AppShell";
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
    <section aria-label="Editor">
      <Card>
        <SettingsRow title="Theme" description="Follows your system unless you pick one.">
          <div
            role="group"
            aria-label="Theme"
            className="flex gap-0.5 rounded-md border border-border bg-background p-0.5"
          >
            {THEMES.map((t) => (
              <Button
                key={t.id}
                size="sm"
                className="h-9 sm:h-7"
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
          <Select value={prefs.profile} onValueChange={(v) => change({ profile: v as Profile })}>
            <SelectTrigger aria-label="Target platform" className="w-52 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROFILES.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </Card>
      <CardHeading>Writing checks</CardHeading>
      <Card>
        <SettingsRow
          title="Built-in and your own rules"
          description="Turn built-in checks on or off, set publication standards and add your own rules."
        >
          <Button variant="outline" size="sm" onClick={() => setRules(true)}>
            Edit rules
          </Button>
        </SettingsRow>
        <SettingsRow title="Keyboard shortcuts">
          <Button ref={back} variant="outline" size="sm" onClick={() => setKeys(true)}>
            Show shortcuts
          </Button>
        </SettingsRow>
      </Card>
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
