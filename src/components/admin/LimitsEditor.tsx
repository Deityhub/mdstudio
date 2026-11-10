import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { LimitCatalog, LimitRow, LimitValue } from "@/lib/admin/api";
import { GROUPS, LIMIT_INFO, bytes } from "@/lib/admin/limits";
import { Badge } from "./bits";

const SOURCE: Record<string, string> = {
  override: "this account",
  plan: "its plan",
  server: "server default",
  env: "server setting",
  default: "built in",
};

/**
 * The limits an admin may set at one level (an account, a plan or the whole server). `values` holds
 * only the ones set here; a limit not set here shows what applies instead (`inherited`, or the
 * catalog's base). Changes go to `onChange`, and Reset removes the one set here.
 */
export function LimitsEditor({
  catalog,
  values,
  inherited,
  onChange,
  disabled,
}: {
  catalog: LimitCatalog;
  values: Record<string, LimitValue>;
  inherited?: Record<string, LimitRow>;
  onChange: (next: Record<string, LimitValue>) => void;
  disabled?: boolean;
}) {
  const set = (key: string, value: LimitValue | null) => {
    const next = { ...values };
    if (value === null) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  return (
    <div className="space-y-5">
      {GROUPS.map((group) => (
        <section key={group} aria-label={group} className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group}
          </h4>
          <ul className="divide-y divide-border rounded-md border border-border">
            {Object.entries(LIMIT_INFO)
              .filter(([k, info]) => info.group === group && catalog[k])
              .map(([key, info]) => {
                const entry = catalog[key]!;
                const own = values[key];
                const effective: LimitRow =
                  own !== undefined
                    ? { value: own, source: "override" }
                    : (inherited?.[key] ?? { value: entry.base, source: entry.baseSource });
                return (
                  <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{info.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {own !== undefined ? "Set here" : `From ${SOURCE[effective.source]}`}
                        {entry.type === "number" && info.unit === "bytes"
                          ? ` · ${bytes(Number(effective.value))}`
                          : ""}
                      </div>
                    </div>
                    {entry.type === "boolean" ? (
                      <Switch
                        aria-label={info.label}
                        checked={Boolean(effective.value)}
                        disabled={disabled}
                        onCheckedChange={(on) => set(key, on)}
                      />
                    ) : (
                      <Input
                        aria-label={info.label}
                        type="number"
                        min={0}
                        className="h-8 w-32"
                        value={own === undefined ? "" : String(own)}
                        placeholder={String(effective.value)}
                        disabled={disabled}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") return set(key, null);
                          const n = Number(raw);
                          if (Number.isFinite(n)) set(key, Math.trunc(n));
                        }}
                      />
                    )}
                    {own !== undefined ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={disabled}
                        onClick={() => set(key, null)}
                      >
                        Reset
                      </Button>
                    ) : (
                      <Badge>{SOURCE[effective.source]}</Badge>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
