import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { checkPortability, type Issue, type Severity } from "@/lib/markdown/markdown";
import { PROFILES, type Profile } from "@/lib/markdown/profiles";
import { cn } from "@/lib/utils";

export const DEMO_SAMPLE = `# Release notes

<div align="center">Centered title</div>

Inline math like $E = mc^2$ and ==highlighted== text.

![Architecture](./diagram.png)

See [[Project plan]] for the details.

| Feature | Status |
| ------- | ------ |
| Export  | Done   |

- [x] Ship it

\`\`\`mermaid
graph TD; A-->B
\`\`\`
`;

const ICONS: Record<Severity, typeof Info> = { error: XCircle, warning: AlertTriangle, info: Info };
const TONES: Record<Severity, string> = {
  error: "text-destructive",
  warning: "text-primary",
  info: "text-muted-foreground",
};

/** Interactive sample of the portability checker; the real engine, running in the page. */
export default function CheckerDemo() {
  const [md, setMd] = useState(DEMO_SAMPLE);
  const [profile, setProfile] = useState<Profile>("github");
  const field = useRef<HTMLTextAreaElement>(null);

  const results = useMemo(
    () => Object.fromEntries(PROFILES.map((p) => [p.id, checkPortability(md, p.id)])),
    [md],
  ) as Record<Profile, Issue[]>;
  const issues = results[profile];

  const jumpTo = (line: number) => {
    const el = field.current;
    if (!el) return;
    const lines = md.split("\n");
    const from = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);
    el.focus();
    el.setSelectionRange(from, from + (lines[line - 1]?.length ?? 0));
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex min-w-0 flex-col">
        <label htmlFor="demo-md" className="mb-2 text-sm font-medium">
          Edit this Markdown
        </label>
        <textarea
          id="demo-md"
          ref={field}
          value={md}
          onChange={(e) => setMd(e.target.value)}
          spellCheck={false}
          className="min-h-96 flex-1 resize-y rounded-lg border border-border bg-card p-4 font-mono text-[13px] leading-relaxed text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <p className="mb-2 text-sm font-medium" id="demo-target">
          Check it against
        </p>
        <div role="radiogroup" aria-labelledby="demo-target" className="flex flex-wrap gap-2">
          {PROFILES.map((p) => {
            const active = p.id === profile;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setProfile(p.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent",
                )}
              >
                {p.label}
                <span className="ml-1.5 tabular-nums opacity-80">{results[p.id].length}</span>
              </button>
            );
          })}
        </div>
        <ul
          aria-live="polite"
          aria-label="Portability report"
          className="mt-3 flex-1 space-y-1 rounded-lg border border-border bg-card p-2"
        >
          {issues.length === 0 && (
            <li className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-primary" />
              Nothing to flag. This renders the same on{" "}
              {PROFILES.find((p) => p.id === profile)?.label}.
            </li>
          )}
          {issues.map((i, n) => {
            const Icon = ICONS[i.severity];
            return (
              <li key={`${i.line}-${i.rule}-${n}`}>
                <button
                  type="button"
                  onClick={() => jumpTo(i.line)}
                  className="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-accent"
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", TONES[i.severity])} />
                  <span>
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      Line {i.line}
                    </span>
                    {i.message}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
