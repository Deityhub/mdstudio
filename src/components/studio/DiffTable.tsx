import { useMemo } from "react";
import type { DiffRow } from "@/lib/editor/diff";
import { cn } from "@/lib/utils";
import { useStickToBottom } from "./useStickToBottom";

/** Unchanged runs longer than this are folded into one row unless "Show all" is on. */
const CONTEXT = 3;

type Shown = DiffRow | { type: "fold"; count: number };

function fold(rows: DiffRow[]): Shown[] {
  const out: Shown[] = [];
  for (let i = 0; i < rows.length;) {
    if (rows[i]!.type !== "same") {
      out.push(rows[i++]!);
      continue;
    }
    let end = i;
    while (end < rows.length && rows[end]!.type === "same") end++;
    const run = rows.slice(i, end);
    const head = i === 0 ? 0 : CONTEXT;
    const tail = end === rows.length ? 0 : CONTEXT;
    if (run.length > head + tail + 1) {
      out.push(...run.slice(0, head), { type: "fold", count: run.length - head - tail });
      out.push(...run.slice(run.length - tail));
    } else out.push(...run);
    i = end;
  }
  return out;
}

const CELL = "min-w-0 whitespace-pre-wrap wrap-break-word px-2 py-0.5 font-mono text-xs";

function Cell({
  side,
  tone,
}: {
  side: { n: number; text: string } | undefined;
  tone: "del" | "add" | "none";
}) {
  return (
    <div
      className={cn(
        "flex gap-2",
        tone === "del" && "bg-destructive/10",
        tone === "add" && "bg-primary/10",
      )}
    >
      <span className="w-8 shrink-0 select-none px-1 text-right font-mono text-xs text-muted-foreground">
        {side?.n}
      </span>
      <span className={CELL}>{side?.text}</span>
    </div>
  );
}

/** Two columns of changed lines, with long unchanged runs folded away unless `showAll`. */
export function DiffTable({
  rows,
  showAll,
  left,
  right,
  follow = false,
}: {
  rows: DiffRow[];
  showAll: boolean;
  left: string;
  right: string;
  /** Keep the newest rows in view while the text is still arriving. */
  follow?: boolean;
}) {
  const shown = useMemo(() => (showAll ? rows : fold(rows)), [rows, showAll]);
  const stick = useStickToBottom<HTMLDivElement>(follow, rows);
  return (
    <>
      <div className="grid grid-cols-2 gap-px border-b border-border pb-1 text-xs font-medium text-muted-foreground">
        <span className="px-2">{left}</span>
        <span className="px-2">{right}</span>
      </div>
      <div
        ref={stick.ref}
        onScroll={stick.onScroll}
        className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border"
        aria-label="Line differences"
      >
        {shown.map((r, i) =>
          r.type === "fold" ? (
            <div key={i} className="bg-muted px-3 py-1 text-center text-xs text-muted-foreground">
              {r.count} unchanged lines
            </div>
          ) : (
            <div key={i} className="grid grid-cols-2 gap-px bg-border">
              <div className="bg-background">
                {r.type === "add" ? (
                  <Cell side={undefined} tone="none" />
                ) : (
                  <Cell side={r.left} tone={r.type === "same" ? "none" : "del"} />
                )}
              </div>
              <div className="bg-background">
                {r.type === "del" ? (
                  <Cell side={undefined} tone="none" />
                ) : (
                  <Cell side={r.right} tone={r.type === "same" ? "none" : "add"} />
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </>
  );
}
