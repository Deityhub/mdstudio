import { useRef, useState } from "react";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BUILTIN_RULES,
  CUSTOM_LIMITS,
  DEFAULT_CONFIG,
  SEVERITIES,
  exportConfig,
  importConfig,
  type BuiltinId,
  type CheckConfig,
  type CustomRule,
  type Severity,
  type StandardId,
  type Standards,
} from "@/lib/checker/config";
import { validateCustomRule } from "@/lib/checker/custom";

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

function SeveritySelect({
  value,
  label,
  onChange,
}: {
  value: Severity;
  label: string;
  onChange: (s: Severity) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as Severity)}
      className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {SEVERITIES.map((s) => (
        <option key={s} value={s}>
          {SEVERITY_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

/** A number field where empty means "no limit". */
function Limit({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        className="h-8 w-20"
        value={value ?? ""}
        placeholder="none"
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))
        }
      />
    </label>
  );
}

const STANDARD_INFO: Record<StandardId, { title: string; help: string }> = {
  "title-length": {
    title: "Title length",
    help: "From the front matter title, or the first heading. Counted in characters.",
  },
  "description-length": {
    title: "Description length",
    help: "The front matter description, in characters. A missing one is for “Required fields”.",
  },
  "required-fields": {
    title: "Required front matter fields",
    help: "Fields every post must have filled in before you publish.",
  },
  "heading-structure": {
    title: "Heading structure",
    help: "One top-level heading, and no skipped levels (a # followed by a ###).",
  },
  "word-count": {
    title: "Word count",
    help: "Counted the way the status bar counts, without front matter and code.",
  },
  "tag-count": {
    title: "Number of tags",
    help: "Some platforms cap how many tags a post can have.",
  },
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "rule";

const BLANK: CustomRule = {
  id: "",
  name: "",
  pattern: "",
  regex: false,
  caseSensitive: false,
  wholeWord: false,
  message: "",
  severity: "warning",
  enabled: true,
};

export function RulesDialog({
  open,
  onOpenChange,
  config,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: CheckConfig;
  onChange: (config: CheckConfig) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<CustomRule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const setBuiltin = (id: BuiltinId, patch: { enabled?: boolean; severity?: Severity }) => {
    const def = BUILTIN_RULES.find((r) => r.id === id)!.severity;
    const next = { ...config.builtin[id], ...patch };
    // keep the saved settings to what differs from the defaults
    if (next.enabled !== false) delete next.enabled;
    if (next.severity === def) delete next.severity;
    const builtin = { ...config.builtin };
    if (Object.keys(next).length) builtin[id] = next;
    else delete builtin[id];
    onChange({ ...config, builtin });
  };
  const setStandard = <K extends StandardId>(id: K, patch: Partial<Standards[K]>) =>
    onChange({
      ...config,
      standards: { ...config.standards, [id]: { ...config.standards[id], ...patch } },
    });

  const startEdit = (rule: CustomRule | null) => {
    setProblem(null);
    setIsNew(!rule);
    setEditing(rule ? { ...rule } : { ...BLANK });
  };
  const saveRule = () => {
    if (!editing) return;
    const used = new Set(config.custom.filter((r) => r.id !== editing.id).map((r) => r.id));
    let id = editing.id || slug(editing.name);
    for (let n = 2; used.has(id); n++) id = `${slug(editing.name).slice(0, 26)}-${n}`;
    const rule = { ...editing, id, name: editing.name.trim(), message: editing.message.trim() };
    const error = validateCustomRule(rule);
    if (error) {
      setProblem(error);
      return;
    }
    onChange({
      ...config,
      custom: isNew
        ? [...config.custom, rule]
        : config.custom.map((r) => (r.id === editing.id ? rule : r)),
    });
    setEditing(null);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportConfig(config)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "mdstudio-check-rules.json",
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const result = importConfig(await file.text());
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onChange(result.config);
    toast.success("Rules imported");
  };

  const customised =
    Object.keys(config.builtin).length +
    Object.values(config.standards).filter((s) => s.enabled).length +
    config.custom.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] max-w-2xl flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Checker rules</DialogTitle>
          <DialogDescription>
            Choose what the Checks panel reports. These settings apply to every draft in this
            browser, and a draft can change them in its front matter.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="portability" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="self-start">
            <TabsTrigger value="portability">Portability</TabsTrigger>
            <TabsTrigger value="standards">Standards</TabsTrigger>
            <TabsTrigger value="custom">Your rules</TabsTrigger>
          </TabsList>

          <TabsContent value="portability" className="min-h-0 overflow-y-auto">
            <p className="mb-2 text-sm text-muted-foreground">
              Which built-in portability rules to report, and how seriously. Rules for features your
              target platform renders stay quiet on their own.
            </p>
            <ul className="divide-y divide-border">
              {BUILTIN_RULES.map((r) => {
                const s = config.builtin[r.id];
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <Switch
                      aria-label={`Report ${r.label}`}
                      checked={s?.enabled !== false}
                      onCheckedChange={(enabled) => setBuiltin(r.id, { enabled })}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.label}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.id}</div>
                    </div>
                    <SeveritySelect
                      label={`Severity of ${r.label}`}
                      value={s?.severity ?? r.severity}
                      onChange={(severity) => setBuiltin(r.id, { severity })}
                    />
                  </li>
                );
              })}
            </ul>
          </TabsContent>

          <TabsContent value="standards" className="min-h-0 space-y-3 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Publication standards for your posts. They are off until you turn them on.
            </p>
            {(Object.keys(STANDARD_INFO) as StandardId[]).map((id) => {
              const s = config.standards[id];
              const info = STANDARD_INFO[id];
              return (
                <section key={id} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      aria-label={`Check ${info.title.toLowerCase()}`}
                      checked={s.enabled}
                      onCheckedChange={(enabled) =>
                        setStandard(id, { enabled } as Partial<Standards[typeof id]>)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{info.title}</div>
                      <div className="text-xs text-muted-foreground">{info.help}</div>
                    </div>
                    <SeveritySelect
                      label={`Severity of ${info.title.toLowerCase()}`}
                      value={s.severity}
                      onChange={(severity) =>
                        setStandard(id, { severity } as Partial<Standards[typeof id]>)
                      }
                    />
                  </div>
                  {s.enabled && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-12">
                      {"min" in s && (
                        <Limit
                          label="At least"
                          value={s.min}
                          onChange={(min) =>
                            setStandard(id, { min } as Partial<Standards[typeof id]>)
                          }
                        />
                      )}
                      {"max" in s && (
                        <Limit
                          label="At most"
                          value={s.max}
                          onChange={(max) =>
                            setStandard(id, { max } as Partial<Standards[typeof id]>)
                          }
                        />
                      )}
                      {id === "required-fields" && (
                        <label className="flex items-center gap-1.5 text-sm">
                          <span className="text-muted-foreground">Fields</span>
                          <Input
                            aria-label="Required fields"
                            className="h-8 w-64"
                            defaultValue={config.standards["required-fields"].fields.join(", ")}
                            onBlur={(e) =>
                              setStandard("required-fields", {
                                fields: e.target.value
                                  .split(",")
                                  .map((f) => f.trim())
                                  .filter(Boolean)
                                  .slice(0, 20),
                              })
                            }
                          />
                        </label>
                      )}
                      {id === "heading-structure" && (
                        <>
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              aria-label="Only one top-level heading"
                              checked={config.standards["heading-structure"].singleH1}
                              onCheckedChange={(singleH1) =>
                                setStandard("heading-structure", { singleH1 })
                              }
                            />
                            Only one # heading
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              aria-label="No skipped heading levels"
                              checked={config.standards["heading-structure"].noSkips}
                              onCheckedChange={(noSkips) =>
                                setStandard("heading-structure", { noSkips })
                              }
                            />
                            No skipped levels
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </TabsContent>

          <TabsContent value="custom" className="min-h-0 space-y-3 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Your own rules: text or a pattern to look for in the writing, with the message to
              show. Code blocks and front matter are skipped.
            </p>
            {config.custom.length === 0 && !editing && (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No rules yet. Good first ones: “TODO” markers, “click here” links, a banned phrase.
              </p>
            )}
            <ul className="space-y-2">
              {config.custom.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-md border border-border p-2.5"
                >
                  <Switch
                    aria-label={`Use ${r.name}`}
                    checked={r.enabled}
                    onCheckedChange={(enabled) =>
                      onChange({
                        ...config,
                        custom: config.custom.map((c) => (c.id === r.id ? { ...c, enabled } : c)),
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {r.regex ? `/${r.pattern}/` : r.pattern} · {r.id}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {SEVERITY_LABEL[r.severity]}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Edit ${r.name}`}
                    onClick={() => startEdit(r)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    aria-label={`Delete ${r.name}`}
                    onClick={() =>
                      onChange({ ...config, custom: config.custom.filter((c) => c.id !== r.id) })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>

            {editing ? (
              <form
                className="space-y-3 rounded-md border border-border bg-muted/40 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveRule();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="rule-name">Name</Label>
                    <Input
                      id="rule-name"
                      maxLength={CUSTOM_LIMITS.name}
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rule-pattern">
                      {editing.regex ? "Pattern (regular expression)" : "Text to find"}
                    </Label>
                    <Input
                      id="rule-pattern"
                      className="font-mono"
                      maxLength={CUSTOM_LIMITS.pattern}
                      value={editing.pattern}
                      onChange={(e) => setEditing({ ...editing, pattern: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rule-message">Message</Label>
                  <Input
                    id="rule-message"
                    maxLength={CUSTOM_LIMITS.message}
                    placeholder="Shown in the Checks panel. {match} is the text that was found."
                    value={editing.message}
                    onChange={(e) => setEditing({ ...editing, message: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Switch
                      aria-label="Regular expression"
                      checked={editing.regex}
                      onCheckedChange={(regex) => setEditing({ ...editing, regex })}
                    />
                    Regular expression
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      aria-label="Match case"
                      checked={editing.caseSensitive}
                      onCheckedChange={(caseSensitive) => setEditing({ ...editing, caseSensitive })}
                    />
                    Match case
                  </label>
                  {!editing.regex && (
                    <label className="flex items-center gap-2">
                      <Switch
                        aria-label="Whole words only"
                        checked={editing.wholeWord}
                        onCheckedChange={(wholeWord) => setEditing({ ...editing, wholeWord })}
                      />
                      Whole words only
                    </label>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    Severity
                    <SeveritySelect
                      label="Severity of this rule"
                      value={editing.severity}
                      onChange={(severity) => setEditing({ ...editing, severity })}
                    />
                  </span>
                </div>
                {problem && (
                  <p role="alert" className="text-sm text-destructive">
                    {problem}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    {isNew ? "Add rule" : "Save rule"}
                  </Button>
                </div>
              </form>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={config.custom.length >= CUSTOM_LIMITS.rules}
                onClick={() => startEdit(null)}
              >
                <Plus className="size-4" /> Add a rule
              </Button>
            )}
          </TabsContent>
        </Tabs>

        <details className="rounded-md bg-muted/40 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Change rules for one draft
          </summary>
          <p className="mt-2 text-muted-foreground">
            Add a <code>checks</code> block to the draft's front matter. <code>false</code> turns a
            rule off, <code>true</code> on, a severity (<code>error</code>, <code>warning</code>,{" "}
            <code>info</code>) changes it, and a standard takes limits.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-background p-2 font-mono text-xs">{`checks:
  wiki-link: false
  todo: error
  title-length: { max: 80 }`}</pre>
        </details>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {customised
              ? `${customised} setting${customised === 1 ? "" : "s"} changed from the defaults`
              : "Using the defaults"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="size-4" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload className="size-4" /> Import
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              aria-label="Import rules file"
              hidden
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              variant={confirmReset ? "destructive" : "outline"}
              size="sm"
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  setTimeout(() => setConfirmReset(false), 4000);
                  return;
                }
                setConfirmReset(false);
                onChange(structuredClone(DEFAULT_CONFIG));
              }}
            >
              {confirmReset ? "Click again to reset" : "Reset to defaults"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
