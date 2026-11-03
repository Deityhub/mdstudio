import { useMemo, useState } from "react";
import { History as HistoryIcon, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { diffLines, diffStats, type DiffRow } from "@/lib/editor/diff";
import { getStats } from "@/lib/markdown/markdown";
import type { Revision } from "@/lib/storage/history";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<Revision["kind"], string | null> = {
  auto: null,
  manual: "Saved by you",
  restore: "Before a restore",
};

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

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

const CELL = "min-w-0 whitespace-pre-wrap break-words px-2 py-0.5 font-mono text-xs";

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

export function HistoryPanel({
  revisions,
  content,
  onSave,
  onRestore,
}: {
  revisions: Revision[];
  /** The draft as it is now, the right-hand side of every comparison. */
  content: string;
  onSave: () => void;
  onRestore: (rev: Revision) => void;
}) {
  const [open, setOpen] = useState<Revision | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => (open ? diffLines(open.content, content) : []), [open, content]);
  const stats = useMemo(() => diffStats(rows), [rows]);
  const shown = useMemo(() => (showAll ? rows : fold(rows)), [rows, showAll]);
  const identical = stats.added === 0 && stats.removed === 0;

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" className="w-full" onClick={onSave}>
        <Save className="h-4 w-4" /> Save a version now
      </Button>
      {revisions.length ? (
        <ul className="space-y-1">
          {revisions.map((r) => (
            <li key={r.id}>
              <button
                className="w-full rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => {
                  setShowAll(false);
                  setOpen(r);
                }}
              >
                <div className="text-sm font-medium">{when(r.at)}</div>
                <div className="text-xs text-muted-foreground">
                  {getStats(r.content).words.toLocaleString()} words
                  {KIND_LABEL[r.kind] ? ` · ${KIND_LABEL[r.kind]}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <HistoryIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No versions yet</p>
          <p className="text-xs text-muted-foreground">
            A version is kept automatically every few minutes while you write. They stay in this
            browser.
          </p>
        </div>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="flex max-h-[90dvh] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>Compare with the current draft</DialogTitle>
            <DialogDescription>
              {open ? when(open.at) : ""}
              {" · "}
              {identical
                ? "Same as the current text"
                : `${stats.removed} line${stats.removed === 1 ? "" : "s"} removed, ${stats.added} added since`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-px border-b border-border pb-1 text-xs font-medium text-muted-foreground">
            <span className="px-2">This version</span>
            <span className="px-2">Current draft</span>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border"
            aria-label="Line differences"
          >
            {shown.map((r, i) =>
              r.type === "fold" ? (
                <div
                  key={i}
                  className="bg-muted px-3 py-1 text-center text-xs text-muted-foreground"
                >
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
          <DialogFooter className="items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Switch id="history-show-all" checked={showAll} onCheckedChange={setShowAll} />
              <Label htmlFor="history-show-all" className="text-sm">
                Show unchanged lines
              </Label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(null)}>
                Close
              </Button>
              <Button
                disabled={identical}
                onClick={() => {
                  if (open) onRestore(open);
                  setOpen(null);
                }}
              >
                Restore this version
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
