import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "good" | "warn" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "good" && "bg-primary/10 text-primary",
        tone === "warn" && "bg-warning/15 text-warning",
        tone === "bad" && "bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

/**
 * A button that must be pressed twice, so a slip does not delete anything. When `onConfirm` returns
 * a promise, the button shows it loading until it settles.
 */
export function ConfirmButton({
  children,
  confirm = "Press again to confirm",
  onConfirm,
  disabled,
}: {
  children: ReactNode;
  confirm?: string;
  onConfirm: () => unknown;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      variant={armed ? "destructive" : "outline"}
      size="sm"
      loading={running}
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        setRunning(true);
        // a work that settles after this button is gone has no one left to tell
        void Promise.resolve(onConfirm()).finally(() => setRunning(false));
      }}
    >
      {armed ? confirm : children}
    </Button>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
      <span>
        {total.toLocaleString()} in all · page {page + 1} of {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
