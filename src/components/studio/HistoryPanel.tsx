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
import { diffLines, diffStats } from "@/lib/editor/diff";
import { getStats } from "@/lib/markdown/markdown";
import type { Revision } from "@/lib/storage/history";
import type { CloudRevision } from "@/lib/sync/revisions";
import { DiffTable } from "./DiffTable";

const KIND_LABEL: Record<Revision["kind"], string | null> = {
  auto: null,
  manual: "Saved by you",
  restore: "Before a restore",
  replaced: "Replaced by a newer edit elsewhere",
  cloud: "From your cloud",
};

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function HistoryPanel({
  revisions,
  content,
  onSave,
  onRestore,
  cloud,
}: {
  revisions: Revision[];
  /** The versions the account's cloud keeps for this draft, when it is stored there. */
  cloud?: {
    items: CloudRevision[];
    max: number;
    /** Fetches one version's text so it can be compared and restored. */
    onOpen: (r: CloudRevision) => Promise<Revision | null>;
  };
  /** The draft as it is now, the right-hand side of every comparison. */
  content: string;
  onSave: () => void;
  onRestore: (rev: Revision) => void;
}) {
  const [open, setOpen] = useState<Revision | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => (open ? diffLines(open.content, content) : []), [open, content]);
  const stats = useMemo(() => diffStats(rows), [rows]);
  const identical = stats.added === 0 && stats.removed === 0;

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" className="w-full" onClick={onSave}>
        <Save className="size-4" /> Save a version now
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
          <HistoryIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No versions yet</p>
          <p className="text-xs text-muted-foreground">
            A version is kept automatically every few minutes while you write. They stay in this
            browser.
          </p>
        </div>
      )}

      {cloud && (
        <section
          aria-label="Versions in your cloud"
          className="space-y-1 border-t border-border pt-3"
        >
          <h3 className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In your cloud
          </h3>
          {cloud.items.length ? (
            <ul className="space-y-1">
              {cloud.items.map((r) => (
                <li key={r.id}>
                  <button
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={async () => {
                      const rev = await cloud.onOpen(r);
                      if (!rev) return;
                      setShowAll(false);
                      setOpen(rev);
                    }}
                  >
                    <div className="text-sm font-medium">{when(r.createdAt)}</div>
                    <div className="text-xs text-muted-foreground">
                      {Math.max(1, Math.round(r.size / 1024))} KB
                      {r.reason === "replaced" ? " · Replaced by a newer edit elsewhere" : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 text-xs text-muted-foreground">
              No versions in the cloud yet. It keeps the last {cloud.max} while you write, and they
              follow you to every device.
            </p>
          )}
        </section>
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
          <DiffTable rows={rows} showAll={showAll} left="This version" right="Current draft" />
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
